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
  // ID -> current location (for efficient removal without scanning all locations)
  private idToLocation = new Map<string, string>();
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
    this.idToLocation.clear();
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
    // Remove from old location (O(1) via reverse map instead of scanning all locations)
    const oldLoc = this.idToLocation.get(rec.id);
    if (oldLoc) {
      const oldSet = this.byLocation.get(oldLoc);
      if (oldSet) oldSet.delete(rec.id);
    }
    // Add to new location
    if (rec.location) {
      let locSet = this.byLocation.get(rec.location);
      if (!locSet) { locSet = new Set(); this.byLocation.set(rec.location, locSet); }
      locSet.add(rec.id);
      this.idToLocation.set(rec.id, rec.location);
    } else {
      this.idToLocation.delete(rec.id);
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
    const oldLoc = this.idToLocation.get(id);
    if (oldLoc) {
      const oldSet = this.byLocation.get(oldLoc);
      if (oldSet) oldSet.delete(id);
    }
    this.idToLocation.delete(id);
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

  // Query result cache — cleared on every write, 500ms TTL.
  // Static-by-prefix: ALL DBO handles to the same collection share one cache,
  // so a write through one `new DBO(prefix)` invalidates reads through any
  // other handle on the same prefix (otherwise two handles serve each other
  // stale reads within the TTL window).
  private static CACHE_TTL_MS = 500;
  private static _queryCaches = new Map<string, Map<string, { results: unknown[]; expiresAt: number }>>();
  private get queryCache(): Map<string, { results: unknown[]; expiresAt: number }> {
    let cache = DBO._queryCaches.get(this.prefix);
    if (!cache) { cache = new Map(); DBO._queryCaches.set(this.prefix, cache); }
    return cache;
  }

  // Shadow index — only active when useIndex is true (dbojs)
  private shadowIndex: ShadowIndex | null = null;

  private _cachedPrefix: string | null = null;

  constructor(pathOrKey: string, useIndex = false) {
    this.pathOrKey = pathOrKey;
    if (useIndex) this.shadowIndex = new ShadowIndex();
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
    if (!query || typeof query !== "object" || !this.shadowIndex?.isBuilt) return null;
    // deno-lint-ignore no-explicit-any
    const q = query as any;

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
    else if (q.flags instanceof RegExp && (q.flags as RegExp).source.includes("connected")) {
      needsConnected = true;
    }
    // Pattern: { location: X }
    else if (typeof q.location === "string") {
      location = q.location as string;
    }

    if (!location && !needsConnected) return null;
    return this.shadowIndex?.getCandidateIds(location, needsConnected);
  }

  private get prefix(): string {
    if (this._cachedPrefix) return this._cachedPrefix;
    const configValue = getConfig<string>(this.pathOrKey);
    if (configValue && typeof configValue === 'string') {
      this._cachedPrefix = configValue.replace('.', '_');
    } else {
      this._cachedPrefix = this.pathOrKey.replace('.', '_');
    }
    return this._cachedPrefix;
  }

  private async getKv(): Promise<Deno.Kv> {
    if (!DBO.kv) DBO.kv = await DBO.openSharedKv();
    return DBO.kv;
  }

  /**
   * Open (or return) the engine's shared KV handle. Other modules that
   * previously called `Deno.openKv` directly (Queue, etc.) should call this
   * helper instead — Deno KV holds an exclusive file lock per process, so
   * opening the same file twice can throw or produce inconsistent reads.
   */
  public static async getSharedKv(): Promise<Deno.Kv> {
    if (!DBO.kv) DBO.kv = await DBO.openSharedKv();
    return DBO.kv;
  }

  private static async openSharedKv(): Promise<Deno.Kv> {
    // URSAMU_DB env var overrides everything. Otherwise, always place the
    // database in the game project's own data/ folder (relative to
    // Deno.cwd()), never inside the engine package. The server.db config key
    // is a KV namespace prefix, not a path.
    const dbPath = Deno.env.get("URSAMU_DB") || dpath.join(Deno.cwd(), "data", "ursamu.db");
    const dbDir = dpath.dirname(dbPath);

    try {
      await Deno.mkdir(dbDir, { recursive: true, mode: 0o700 });
    } catch (error) {
      if (!(error instanceof Deno.errors.AlreadyExists)) throw error;
    }

    console.log(`Opening KV database at: ${dbPath}`);
    return await Deno.openKv(dbPath);
  }

  async clear() {
    const kv = await this.getKv();
    const entries = kv.list({ prefix: [this.prefix] });
    for await (const entry of entries) {
      await kv.delete(entry.key);
    }
    this.clearCache();
    this.shadowIndex?.build([]);
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
    this.shadowIndex?.onWrite(plainData as unknown as { id: string; flags?: string; location?: string });
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
        this.cacheSet(key, results);
        return results;
      }

      // Index pointed to nonexistent records — rebuild from full scan
      console.warn(`[DBO] Shadow index stale record, rebuilding (rebuild #${(this.shadowIndex?.rebuilds ?? 0) + 1})`);
      this.shadowIndex?.incrementRebuilds();
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
    this.shadowIndex?.build(allRecords);

    // Store in cache
    this.cacheSet(key, results);
    return results;
  }

  /**
   * Insert into the query cache with FIFO eviction. The previous behaviour
   * was to wipe the entire 500-entry cache on overflow, which under heavy
   * distinct-query load (every 501st query is a new key) drops cache hit
   * rate to ~0% in a thundering-herd pattern. Maps preserve insertion
   * order, so deleting the first key evicts the oldest entry.
   */
  private cacheSet(key: string, results: T[]): void {
    if (this.queryCache.size >= 500) {
      const firstKey = this.queryCache.keys().next().value;
      if (firstKey !== undefined) this.queryCache.delete(firstKey);
    }
    this.queryCache.set(key, { results: [...results], expiresAt: Date.now() + DBO.CACHE_TTL_MS });
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
  private static readonly _dangerousKeys = new Set(["__proto__", "constructor", "prototype"]);
  private static isDangerousKey(key: string): boolean {
    if (DBO._dangerousKeys.has(key)) return true;
    if (key.includes(".")) {
      return key.split(".").some(seg => DBO._dangerousKeys.has(seg));
    }
    return false;
  }

  /**
   * $pull match predicate. Returns true if `el` should be removed.
   *   - Primitive criteria (string/number/boolean/null): strict equality.
   *   - Object criteria: el must be an object and every (k,v) in criteria
   *     must match el[k] by strict equality. Extra keys on el are fine.
   *
   * Object-criteria values match RECURSIVELY by value (not object identity),
   * so `$pull: { arr: { meta: { x: 1 } } }` matches an element whose
   * `meta.x === 1`. Primitive leaves compare with strict `===`.
   */
  private static pullMatches(el: unknown, criteria: unknown): boolean {
    if (criteria === null || typeof criteria !== "object") {
      return el === criteria;
    }
    if (el === null || typeof el !== "object") return false;
    const elObj = el as Record<string, unknown>;
    const critObj = criteria as Record<string, unknown>;
    for (const [k, v] of Object.entries(critObj)) {
      // Recurse so nested-object criteria match by value, not identity.
      if (!DBO.pullMatches(elObj[k], v)) return false;
    }
    return true;
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
   * | `$pull`  | Atomically remove array elements matching a criteria.       |
   * |          | Criteria is a primitive (strict equality) or an object      |
   * |          | (every key in criteria must match the element); dot-path ok |
   *
   * @example
   * // Atomic append — safe under concurrent writes
   * await col.modify({ id: roundId }, "$push", { "data.poses": poseText });
   * // Atomic remove — drop note with id===5 from the notes array
   * await col.modify({ id: playerId }, "$pull", { "data.notes": { id: 5 } });
   */
  async modify(query: Query<T>, operator: string, data: Partial<T>): Promise<T[]> {
    const items = await this.query(query);
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // Every operator runs through atomicModify (CAS-backed). Without this,
      // two concurrent writers to the same row both read the same version,
      // both apply their change, and the second commit silently overwrites
      // the first — even when they're touching different dot-paths. Retry
      // budget is generous (20) because hot rows like player records get
      // hit by many concurrent writers (commands, hooks, scripts).
      const updated = await this.atomicModify(item.id, (current) =>
        DBO.applyOperator(operator, current, data) as T, 20);
      items[i] = updated;
    }
    return items;
  }

  /**
   * Pure transform that applies one of the modify() operators to a record.
   * Lives outside `modify()` so it can be plugged into `atomicModify()`'s
   * retry loop without re-reading the row each time.
   */
  private static applyOperator(
    operator: string,
    current:  unknown,
    data:     unknown,
  ): unknown {
    const dataRec = data as Record<string, unknown>;

    if (operator === "$push") {
      const rec = { ...(current as Record<string, unknown>) };
      for (const [key, value] of Object.entries(dataRec)) {
        if (DBO.isDangerousKey(key)) continue;
        if (key.includes(".")) {
          const arr = (get(rec, key) ?? []) as unknown[];
          lodashSet(rec, key, [...arr, value]);
        } else {
          const arr = (rec[key] ?? []) as unknown[];
          rec[key] = [...arr, value];
        }
      }
      return rec;
    }

    if (operator === "$pull") {
      const rec = { ...(current as Record<string, unknown>) };
      for (const [key, criteria] of Object.entries(dataRec)) {
        if (DBO.isDangerousKey(key)) continue;
        const arr = (key.includes(".") ? get(rec, key) : rec[key]) as unknown;
        if (!Array.isArray(arr)) continue;
        const filtered = arr.filter((el) => !DBO.pullMatches(el, criteria));
        if (key.includes(".")) {
          lodashSet(rec, key, filtered);
        } else {
          rec[key] = filtered;
        }
      }
      return rec;
    }

    const updated = { ...(current as Record<string, unknown>) };

    if (operator === "$set") {
      for (const [key, value] of Object.entries(dataRec)) {
        if (DBO.isDangerousKey(key)) continue;
        if (key.includes(".")) {
          lodashSet(updated, key, value);
        } else {
          updated[key] = value;
        }
      }
    } else if (operator === "$unset") {
      for (const key of Object.keys(dataRec)) {
        if (DBO.isDangerousKey(key)) continue;
        if (key.includes(".")) {
          const parts = key.split(".");
          const last  = parts.pop()!;
          let obj: Record<string, unknown> | null = updated;
          for (const part of parts) {
            if (obj && obj[part] && typeof obj[part] === "object") {
              obj = obj[part] as Record<string, unknown>;
            } else {
              obj = null;
              break;
            }
          }
          if (obj != null) delete obj[last];
        } else {
          delete updated[key];
        }
      }
    } else if (operator === "$inc") {
      for (const [key, value] of Object.entries(dataRec)) {
        if (DBO.isDangerousKey(key)) continue;
        if (typeof value !== "number" || isNaN(value)) {
          console.warn(`[Database] $inc: skipping key "${key}" — value is not a valid number:`, value);
          continue;
        }
        // Coerce the CURRENT stored value to a number. Without this, a field
        // that is accidentally a string ("5") makes `cur + value` concatenate
        // ("5" + 1 = "51") and silently corrupt the record.
        if (key.includes(".")) {
          const raw = get(updated, key, 0);
          const cur = typeof raw === "number" ? raw : (Number(raw) || 0);
          lodashSet(updated, key, cur + value);
        } else {
          const raw = updated[key];
          const cur = typeof raw === "number" ? raw : (Number(raw) || 0);
          updated[key] = cur + value;
        }
      }
    }

    return updated;
  }

  async delete(query: Query<T>): Promise<T[]> {
    const items = await this.query(query);
    const kv = await this.getKv();
    for (const item of items) {
      await kv.delete(this.getKey(item.id));
      this.shadowIndex?.onDelete(item.id);
    }
    this.clearCache();
    return items;
  }

  private matchesQuery(value: T, query?: Query<T>): boolean {
    if (!query) return true;
    if (typeof query !== "object") return value === query;

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
        // A missing/null field never matches a regex — don't test the literal
        // string "undefined"/"null", which can cause spurious matches.
        if (val == null || !condition.test(String(val))) {
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
        this.shadowIndex?.onWrite(updated as unknown as { id: string; flags?: string; location?: string });
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
    this.shadowIndex?.onWrite(plainData as unknown as { id: string; flags?: string; location?: string });
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
/** Primary game-object store (rooms, players, exits, items). Index enabled for location/connected queries. */
export const dbojs: DBO<IDBOBJ> = new DBO<IDBOBJ>("server.db", true);
/** Channel definitions store. */
export const chans: DBO<IChannel> = new DBO<IChannel>("server.chans");
/** Server text entries (welcome screen, MOTD, etc.). */
export const texts: DBO<ITextEntry> = new DBO<ITextEntry>("server.texts");
/** Scene (scene-logger) store. */
export const scenes: DBO<IScene> = new DBO<IScene>("server.scenes");

/** Channel message history (opt-in per channel). */
export const chanHistory: DBO<IChanMessage> = new DBO<IChanMessage>("server.chan_history");
