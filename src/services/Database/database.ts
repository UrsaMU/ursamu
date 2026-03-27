import type { IDBOBJ } from "../../@types/IDBObj.ts";
import { getConfig } from "../Config/mod.ts";
import type { IChannel, IChanMessage } from "../../@types/Channels.ts";
import type { ITextEntry } from "../../@types/ITextEntry.ts";
import type { IScene } from "../../@types/IScene.ts";
import { dpath, get, set as lodashSet } from "../../../deps.ts";
import type { IDatabase, Query, QueryCondition } from "../../interfaces/IDatabase.ts";
// @ts-ignore: Deno namespace is available at runtime

interface WithId {
  id: string;
}

/**
 * Generic key-value database backed by Deno KV.
 *
 * Each `DBO` instance operates on an isolated namespace derived from its
 * config key (e.g. `"server.db"`). Supports CRUD, arbitrary queries,
 * and atomic read-modify-write operations.
 *
 * @template T - The record type stored in this collection. Must have an `id: string` field.
 */
// ============================================================================
// SHADOW INDEX — verified lookup for location and flags
// ============================================================================

class ShadowIndex {
  // location -> Set of object IDs at that location
  private byLocation = new Map<string, Set<string>>();
  // Set of object IDs that have "connected" in their flags
  private connected = new Set<string>();
  // All indexed object IDs (for quick "is this ID indexed?" check)
  private allIds = new Set<string>();
  // Whether the index has been built at least once
  private built = false;
  // Fallback counter — logs how often we rebuild
  private rebuildCount = 0;

  /** Build the index from a full scan result. */
  build(records: Array<{ id: string; flags?: string; location?: string }>) {
    this.byLocation.clear();
    this.connected.clear();
    this.allIds.clear();
    for (const rec of records) {
      this.allIds.add(rec.id);
      this._indexRecord(rec);
    }
    this.built = true;
  }

  /** Index a single record (add or update). */
  private _indexRecord(rec: { id: string; flags?: string; location?: string }) {
    const flags = typeof rec.flags === "string" ? rec.flags : "";
    if (/\bconnected\b/i.test(flags)) {
      this.connected.add(rec.id);
    } else {
      this.connected.delete(rec.id);
    }
    // Remove from old location
    for (const [, idSet] of this.byLocation) {
      idSet.delete(rec.id);
    }
    // Add to new location
    if (rec.location) {
      let locSet = this.byLocation.get(rec.location);
      if (!locSet) { locSet = new Set(); this.byLocation.set(rec.location, locSet); }
      locSet.add(rec.id);
    }
  }

  /** Update index for a single record after a write. */
  onWrite(rec: { id: string; flags?: string; location?: string }) {
    if (!this.built) return;
    this.allIds.add(rec.id);
    this._indexRecord(rec);
  }

  /** Remove a record from the index. */
  onDelete(id: string) {
    if (!this.built) return;
    this.allIds.delete(id);
    this.connected.delete(id);
    for (const [, idSet] of this.byLocation) {
      idSet.delete(id);
    }
  }

  /** Get candidate IDs for connected objects at a location. Returns null if index not built. */
  getCandidateIds(location?: string, requireConnected?: boolean): Set<string> | null {
    if (!this.built) return null;

    if (location && requireConnected) {
      const locIds = this.byLocation.get(location);
      if (!locIds) return new Set();
      const result = new Set<string>();
      for (const id of locIds) {
        if (this.connected.has(id)) result.add(id);
      }
      return result;
    }
    if (location) {
      return this.byLocation.get(location) || new Set();
    }
    if (requireConnected) {
      return new Set(this.connected);
    }
    return null; // can't help with this query
  }

  get isBuilt() { return this.built; }
  get rebuilds() { return this.rebuildCount; }
  incrementRebuilds() { this.rebuildCount++; }
}

// ============================================================================
// DBO CLASS
// ============================================================================

export class DBO<T extends WithId> implements IDatabase<T> {
  private static kv: Deno.Kv | null = null;
  private pathOrKey: string;

  // Query result cache — cleared on every write, 500ms TTL
  private static CACHE_TTL_MS = 500;
  private queryCache = new Map<string, { results: unknown[]; expiresAt: number }>();

  // Shadow index — only used by dbojs (game objects)
  private shadowIndex = new ShadowIndex();

  constructor(pathOrKey: string) {
    this.pathOrKey = pathOrKey;
  }

  /** Serialize a query to a stable cache key. */
  private cacheKey(query?: Query<T>): string {
    if (!query) return "__all__";
    try {
      return JSON.stringify(query, (_key, val) => {
        if (val instanceof RegExp) return `__re__${val.source}__${val.flags}`;
        if (val instanceof Set) return `__set__${[...val].join(",")}`;
        return val;
      });
    } catch {
      return "__nocache__" + Math.random();
    }
  }

  /** Clear the query cache. Called on every write. */
  clearCache(): void {
    this.queryCache.clear();
  }

  /**
   * Try to use the shadow index to answer a query.
   * Returns candidate IDs or null if the index can't help.
   */
  private tryIndexLookup(query?: Query<T>): Set<string> | null {
    if (!query || !this.shadowIndex.isBuilt) return null;

    // Detect common query patterns
    let location: string | undefined;
    let needsConnected = false;

    // Pattern: { $and: [{ location: X }, { flags: /connected/i }, ...] }
    if ("$and" in query && Array.isArray(query.$and)) {
      for (const cond of query.$and as Record<string, unknown>[]) {
        if (typeof cond.location === "string") location = cond.location;
        if (cond.flags instanceof RegExp && cond.flags.source.includes("connected")) needsConnected = true;
      }
    }
    // Pattern: { flags: /connected/i }
    else if (query.flags instanceof RegExp && (query.flags as RegExp).source.includes("connected")) {
      needsConnected = true;
    }
    // Pattern: { location: X }
    else if (typeof query.location === "string") {
      location = query.location as string;
    }

    if (!location && !needsConnected) return null;
    return this.shadowIndex.getCandidateIds(location, needsConnected);
  }

  private get prefix(): string {
    // overload: if the path contains dots and doesn't look like a file path, try to get it from config
    // Actually, we passed the config key directly in the exports below. 
    // So we should try to get the config value. If that fails or returns the same key, assume it's a path.
    // Ideally, we check if it is a known config key.
    
    const configValue = getConfig<string>(this.pathOrKey);
    // If getConfig returns the key itself (default behavior if missing?) or undefined, we might fall back.
    // But getConfig usually returns the value.
    if (configValue && typeof configValue === 'string') {
        return configValue.replace('.', '_');
    }
    return this.pathOrKey.replace('.', '_');
  }

  private async getKv(): Promise<Deno.Kv> {
    if (!DBO.kv) {
      // Resolve the KV store file path.
      // URSAMU_DB env var overrides everything. Otherwise, always place the database
      // in the game project's own data/ folder (relative to Deno.cwd()), never inside
      // the engine package. The server.db config key is a KV namespace prefix, not a path.
      const dbPath = Deno.env.get("URSAMU_DB") || dpath.join(Deno.cwd(), "data", "ursamu.db");
      const dbDir = dpath.dirname(dbPath);

      // Create the data directory if it doesn't exist
      try {
        await Deno.mkdir(dbDir, { recursive: true, mode: 0o700 });
      } catch (error) {
        if (!(error instanceof Deno.errors.AlreadyExists)) {
          throw error;
        }
      }

      console.log(`Opening KV database at: ${dbPath}`);
      DBO.kv = await Deno.openKv(dbPath);
    }
    return DBO.kv;
  }

  async clear() {
    const kv = await this.getKv();
    const entries = kv.list({ prefix: [this.prefix] });
    for await (const entry of entries) {
      await kv.delete(entry.key);
    }
    this.clearCache();
    this.shadowIndex.build([]);
  }

  public static async close() {
    if (DBO.kv) {
      await DBO.kv.close();
      DBO.kv = null;
    }
  }

  private getKey(id: string): Deno.KvKey {
    return [this.prefix, id];
  }

  async create(data: T): Promise<T> {
    const kv = await this.getKv();
    const plainData = { ...data };
    await kv.set(this.getKey(data.id), plainData);
    this.clearCache();
    this.shadowIndex.onWrite(plainData as unknown as { id: string; flags?: string; location?: string });
    return data;
  }

  async query(query?: Query<T>): Promise<T[]> {
    // Check cache first
    const key = this.cacheKey(query);
    const cached = this.queryCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return [...cached.results] as T[];
    }

    // Try shadow index for fast lookup
    const candidateIds = this.tryIndexLookup(query);
    if (candidateIds !== null && candidateIds.size < 200) {
      // Fetch only the candidate records, then filter by full query
      const kv = await this.getKv();
      const results: T[] = [];
      let indexValid = true;

      for (const id of candidateIds) {
        const entry = await kv.get<T>(this.getKey(id));
        if (!entry.value) {
          // Index pointed to a nonexistent record — stale index
          indexValid = false;
          break;
        }
        // Apply the full query filter — candidates are a superset, not exact
        if (this.matchesQuery(entry.value, query)) {
          results.push(entry.value);
        }
        // NOT a mismatch if the record exists but doesn't match the full query —
        // the index only narrows by location/connected, other conditions (player flag,
        // $ne, etc.) are applied as a post-filter. That's expected.
      }

      if (indexValid) {
        // Index was correct — cache and return
        if (this.queryCache.size >= 500) this.queryCache.clear();
        this.queryCache.set(key, { results: [...results], expiresAt: Date.now() + DBO.CACHE_TTL_MS });
        return results;
      }

      // Index pointed to nonexistent records — rebuild from full scan
      console.warn(`[DBO] Shadow index stale record, rebuilding (rebuild #${this.shadowIndex.rebuilds + 1})`);
      this.shadowIndex.incrementRebuilds();
    }

    // Full scan (original behavior)
    const kv = await this.getKv();
    const entries = kv.list({ prefix: [this.prefix] });
    const results: T[] = [];
    const allRecords: Array<{ id: string; flags?: string; location?: string }> = [];
    for await (const entry of entries) {
      const value = entry.value as T;
      // Collect data for index rebuild
      const rec = value as unknown as { id: string; flags?: string; location?: string };
      allRecords.push(rec);
      if (this.matchesQuery(value, query)) {
        results.push(value);
      }
    }

    // Rebuild shadow index from the full scan
    this.shadowIndex.build(allRecords);

    // Store in cache
    if (this.queryCache.size >= 500) this.queryCache.clear();
    this.queryCache.set(key, { results: [...results], expiresAt: Date.now() + DBO.CACHE_TTL_MS });
    return results;
  }

  async queryOne(query?: Query<T>): Promise<T | undefined> {
    const results = await this.query(query);
    return results.length ? results[0] : undefined;
  }

  async all(): Promise<T[]> {
    const kv = await this.getKv();
    const entries = kv.list({ prefix: [this.prefix] });
    const results: T[] = [];
    for await (const entry of entries) {
      results.push(entry.value as T);
    }
    return results;
  }

  /** Check if a key or any segment of a dot-notation path is a prototype pollution vector. */
  private static isDangerousKey(key: string): boolean {
    const dangerous = new Set(["__proto__", "constructor", "prototype"]);
    if (dangerous.has(key)) return true;
    if (key.includes(".")) {
      return key.split(".").some(seg => dangerous.has(seg));
    }
    return false;
  }

  /**
   * Apply an operator to all records matching `query`.
   *
   * | Operator | Effect                                                      |
   * |----------|-------------------------------------------------------------|
   * | `$set`   | Set field(s) to the supplied value(s); dot-notation ok      |
   * | `$unset` | Delete field(s) from the record; dot-notation ok            |
   * | `$inc`   | Increment numeric field(s) by the supplied amount           |
   * | `$push`  | Atomically append a value to an array field (CAS-backed);   |
   * |          | creates the array if the field is absent; dot-notation ok   |
   *
   * @example
   * // Atomic append — safe under concurrent writes
   * await col.modify({ id: roundId }, "$push", { "data.poses": poseText });
   */
  async modify(query: Query<T>, operator: string, data: Partial<T>): Promise<T[]> {
    const items = await this.query(query);
    const kv = await this.getKv();
    for (const item of items) {
      if (operator === "$push") {
        // Atomic CAS append — prevents TOCTOU races when two callers push
        // to the same array field concurrently.  Each record is committed via
        // atomicModify() so concurrent writers serialize on the version check.
        // Allow up to 20 retries — $push fields are designed for concurrent
        // access (e.g. two players posing simultaneously), so contention is
        // expected and the default 3 retries is insufficient under load.
        await this.atomicModify(item.id, (current) => {
          const rec = { ...current } as Record<string, unknown>;
          for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
            if (DBO.isDangerousKey(key)) continue;
            if (key.includes(".")) {
              const arr = (get(rec, key) ?? []) as unknown[];
              lodashSet(rec, key, [...arr, value]);
            } else {
              const arr = (rec[key] ?? []) as unknown[];
              rec[key] = [...arr, value];
            }
          }
          return rec as T;
        }, 20);
        continue; // skip the plain kv.set() below
      }

      const updated = { ...item };
      if (operator === "$set") {
        for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
          if (DBO.isDangerousKey(key)) continue;
          if (key.includes(".")) {
            // Dot-notation: navigate into nested object (e.g. "data.name" → updated.data.name)
            lodashSet(updated, key, value);
          } else {
            (updated as Record<string, unknown>)[key] = value;
          }
        }
      } else if (operator === "$unset") {
        for (const key of Object.keys(data as Record<string, unknown>)) {
          if (DBO.isDangerousKey(key)) continue;
          if (key.includes(".")) {
            // Dot-notation: navigate to parent and delete the final key
            const parts = key.split(".");
            const last = parts.pop()!;
            let obj: Record<string, unknown> = updated as Record<string, unknown>;
            for (const part of parts) {
              if (obj[part] && typeof obj[part] === "object") {
                obj = obj[part] as Record<string, unknown>;
              } else {
                obj = null as unknown as Record<string, unknown>;
                break;
              }
            }
            if (obj != null) delete obj[last];
          } else {
            delete (updated as Record<string, unknown>)[key];
          }
        }
      } else if (operator === "$inc") {
        for (const [key, value] of Object.entries(data)) {
          if (typeof value !== "number" || isNaN(value)) {
            console.warn(`[Database] $inc: skipping key "${key}" — value is not a valid number:`, value);
            continue;
          }
          if (key.includes(".")) {
            const current = get(updated, key, 0) as number;
            lodashSet(updated, key, current + (value as number));
          } else {
            const currentValue = ((updated as unknown) as Record<string, number>)[key] || 0;
            ((updated as unknown) as Record<string, number>)[key] = currentValue + (value as number);
          }
        }
      }
      const plainData = { ...updated };
      await kv.set(this.getKey(item.id), plainData);
      this.shadowIndex.onWrite(plainData as unknown as { id: string; flags?: string; location?: string });
    }
    this.clearCache();
    return await this.query(query);
  }

  async delete(query: Query<T>): Promise<T[]> {
    const items = await this.query(query);
    const kv = await this.getKv();
    for (const item of items) {
      await kv.delete(this.getKey(item.id));
      this.shadowIndex.onDelete(item.id);
    }
    this.clearCache();
    return items;
  }

  private matchesQuery(value: T, query?: Query<T>): boolean {
    if (!query) return true;

    if ('$or' in query && Array.isArray(query.$or)) {
      return (query.$or as QueryCondition[]).some((cond: QueryCondition) => this.matchesQuery(value, cond));
    }

    if ('$and' in query && Array.isArray(query.$and)) {
      return (query.$and as QueryCondition[]).every((cond: QueryCondition) => this.matchesQuery(value, cond));
    }

    if ('$where' in query && typeof query.$where === 'function') {
      return query.$where.call(value);
    }

    for (const [key, condition] of Object.entries(query)) {
      if (key === "$ne") continue; // handled below
      const val = key.includes('.') ? get(value, key) : value[key as keyof T];

      if (condition instanceof RegExp) {
        if (!condition.test(val as string)) {
          return false;
        }
      } else if (typeof condition === "object" && condition !== null && !Array.isArray(condition)) {
        const condObj = condition as Record<string, unknown>;
        // Handle $in operator: check if val (or val as array) contains any of the $in values
        if ("$in" in condObj) {
          const inValues = condObj.$in as unknown[];
          if (Array.isArray(val)) {
            if (!inValues.some(v => (val as unknown[]).includes(v))) return false;
          } else {
            if (!inValues.includes(val)) return false;
          }
        }
        // Handle $ne operator: check if val does not equal
        else if ("$ne" in condObj) {
          if (val === condObj.$ne) return false;
        }
        // Otherwise recurse
        else if (!this.matchesQuery(val as T, condition as Query<T>)) {
          return false;
        }
      } else if (val !== condition) {
        return false;
      }
    }
    return true;
  }

  /**
   * Atomically read-modify-write a single record using Deno KV compare-and-swap.
   * Retries up to `retries` times on version conflict before throwing.
   */
  async atomicModify(id: string, transform: (current: T) => T, retries = 3): Promise<T> {
    const kv = await this.getKv();
    const key = this.getKey(id);
    for (let attempt = 0; attempt <= retries; attempt++) {
      const entry = await kv.get<T>(key);
      if (entry.value === null) throw new Error(`[DBO] Record not found: ${id}`);
      const updated = transform({ ...entry.value });
      const result = await kv.atomic().check(entry).set(key, updated).commit();
      if (result.ok) {
        this.clearCache();
        this.shadowIndex.onWrite(updated as unknown as { id: string; flags?: string; location?: string });
        return updated;
      }
    }
    throw new Error(`[DBO] atomicModify failed after ${retries + 1} attempts on "${id}"`);
  }

  /**
   * Atomically increment a counter record's `seq` field.
   * Creates the record with seq=1 if it doesn't exist yet.
   * Returns the new value.
   */
  async atomicIncrement(id: string): Promise<number> {
    const kv = await this.getKv();
    const key = this.getKey(id);
    for (let attempt = 0; attempt < 10; attempt++) {
      const entry = await kv.get<{ id: string; seq: number }>(key);
      const next = (entry.value?.seq ?? 0) + 1;
      const updated = { ...(entry.value ?? { id }), seq: next };
      const result = await kv.atomic().check(entry).set(key, updated).commit();
      if (result.ok) return next;
    }
    throw new Error(`[DBO] atomicIncrement failed after 10 attempts on "${id}"`);
  }

  // Note: KV store is keyed by data.id; query parameter is ignored.
  async update(_query: Query<T>, data: T): Promise<T> {
    const cv = await this.getKv();
    const plainData = { ...data };
    await cv.set(this.getKey(data.id), plainData);
    this.clearCache();
    this.shadowIndex.onWrite(plainData as unknown as { id: string; flags?: string; location?: string });
    return data;
  }

  async find(query?: Query<T>): Promise<T[]> {
    return await this.query(query);
  }

  async findOne(query?: Query<T>): Promise<T | undefined> {
    return await this.queryOne(query);
  }
}

/** Internal counter record used by `atomicIncrement` for auto-generated IDs. */
export interface ICounters extends WithId {
  seq: number;
}

/** Shared counter store (job IDs, object IDs, etc.). */
export const counters: DBO<ICounters> = new DBO<ICounters>("server.counters");
/** Primary game-object store (rooms, players, exits, items). */
export const dbojs: DBO<IDBOBJ> = new DBO<IDBOBJ>("server.db");
/** Channel definitions store. */
export const chans: DBO<IChannel> = new DBO<IChannel>("server.chans");
/** Server text entries (welcome screen, MOTD, etc.). */
export const texts: DBO<ITextEntry> = new DBO<ITextEntry>("server.texts");
/** Scene (scene-logger) store. */
export const scenes: DBO<IScene> = new DBO<IScene>("server.scenes");

/** Channel message history (opt-in per channel). */
export const chanHistory: DBO<IChanMessage> = new DBO<IChanMessage>("server.chan_history");
