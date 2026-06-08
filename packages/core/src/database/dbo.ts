import type { IDatabase, Query } from "./types.ts";
import {
  applyInc,
  applyPush,
  applySet,
  applyUnset,
  matchesQuery,
} from "./operators.ts";

interface WithId {
  id: string;
}

interface CacheEntry<T> {
  data: T[];
  expiresAt: number;
}

const CACHE_TTL_MS = 500;

export class DBO<T extends WithId> implements IDatabase<T> {
  private static kv: Deno.Kv | null = null;
  private readonly namespace: string;
  private queryCache = new Map<string, CacheEntry<T>>();

  constructor(namespace: string) {
    this.namespace = namespace;
  }

  private async getKv(): Promise<Deno.Kv> {
    if (!DBO.kv) {
      const dbPath = Deno.env.get("URSAMU_DB") ??
        `${Deno.cwd()}/data/ursamu.db`;
      await Deno.mkdir(dbPath.replace(/\/[^/]+$/, ""), { recursive: true }).catch(
        (e: unknown) => {
          if (!(e instanceof Deno.errors.AlreadyExists)) throw e;
        },
      );
      DBO.kv = await Deno.openKv(dbPath);
    }
    return DBO.kv;
  }

  private key(id: string): Deno.KvKey {
    return [this.namespace, id];
  }

  private cacheKey(query?: Query<T>): string {
    if (!query) return "__all__";
    try {
      return JSON.stringify(query, (_k, v) => {
        if (v instanceof RegExp) return `__re__${v.source}__${v.flags}`;
        if (v instanceof Set) return `__set__${[...v].join(",")}`;
        return v;
      });
    } catch {
      return `__nocache__${Math.random()}`;
    }
  }

  private clearCache(): void {
    this.queryCache.clear();
  }

  async create(data: T): Promise<T> {
    const kv = await this.getKv();
    await kv.set(this.key(data.id), { ...data });
    this.clearCache();
    return data;
  }

  async query(query?: Query<T>): Promise<T[]> {
    const ck = this.cacheKey(query);
    const now = Date.now();
    const cached = this.queryCache.get(ck);
    if (cached && now < cached.expiresAt) return cached.data;

    const kv = await this.getKv();
    const results: T[] = [];

    // Optimization: if querying by a specific ID string, use kv.get() O(1)
    if (query && "id" in query && typeof query.id === "string") {
      const entry = await kv.get<T>(this.key(query.id));
      if (entry.value && matchesQuery(entry.value, query)) {
        results.push(entry.value);
      }
    } // Optimization: if querying by an $or list of specific ID strings, use kv.getMany()
    else if (
      query &&
      "$or" in query &&
      Array.isArray(query.$or) &&
      query.$or.every((q) => typeof q.id === "string")
    ) {
      const ids = (query.$or as { id: string }[]).map((q) => q.id);
      const entries = await kv.getMany<T[]>(ids.map((id) => this.key(id)));
      // Note: kv.getMany<T[]> returns a list of entries where each entry.value is T.
      // The type parameter T[] to getMany refers to the return array shape in some KV implementations,
      // but here we want to ensure we treat the results correctly.
      for (const entry of entries) {
        // deno-lint-ignore no-explicit-any
        const val = entry.value as any;
        if (val && matchesQuery(val, query)) {
          results.push(val);
        }
      }
    } else {
      // Fallback to full namespace scan O(N)
      for await (const entry of kv.list<T>({ prefix: [this.namespace] })) {
        if (entry.value && matchesQuery(entry.value, query)) {
          results.push(entry.value);
        }
      }
    }

    this.queryCache.set(ck, { data: results, expiresAt: now + CACHE_TTL_MS });
    return results;
  }

  async queryOne(query?: Query<T>): Promise<T | undefined> {
    const results = await this.query(query);
    return results[0];
  }

  async all(): Promise<T[]> {
    const kv = await this.getKv();
    const results: T[] = [];
    for await (const entry of kv.list<T>({ prefix: [this.namespace] })) {
      if (entry.value) results.push(entry.value);
    }
    return results;
  }

  async modify(query: Query<T>, operator: string, data: Partial<T>): Promise<T[]> {
    const items = await this.query(query);
    const kv = await this.getKv();
    for (const item of items) {
      if (operator === "$push") {
        await this.atomicModify(item.id, (cur) => applyPush(cur, data), 20);
        continue;
      }
      let updated: T;
      if (operator === "$set") updated = applySet(item, data);
      else if (operator === "$unset") updated = applyUnset(item, data);
      else if (operator === "$inc") updated = applyInc(item, data);
      else updated = item;
      await kv.set(this.key(item.id), { ...updated });
    }
    this.clearCache();
    return this.query(query);
  }

  async delete(query: Query<T>): Promise<T[]> {
    const items = await this.query(query);
    const kv = await this.getKv();
    for (const item of items) await kv.delete(this.key(item.id));
    this.clearCache();
    return items;
  }

  async clear(): Promise<void> {
    const kv = await this.getKv();
    for await (const entry of kv.list({ prefix: [this.namespace] })) {
      await kv.delete(entry.key);
    }
    this.clearCache();
  }

  async atomicModify(id: string, transform: (current: T) => T, retries = 3): Promise<T> {
    const kv = await this.getKv();
    const k = this.key(id);
    for (let attempt = 0; attempt <= retries; attempt++) {
      const entry = await kv.get<T>(k);
      if (entry.value === null) throw new Error(`[DBO] Record not found: ${id}`);
      const updated = transform({ ...entry.value });
      const result = await kv.atomic().check(entry).set(k, updated).commit();
      if (result.ok) {
        this.clearCache();
        return updated;
      }
    }
    throw new Error(`[DBO] atomicModify failed after ${retries + 1} attempts on "${id}"`);
  }

  async atomicIncrement(id: string): Promise<number> {
    const kv = await this.getKv();
    const k = this.key(id);
    for (let attempt = 0; attempt < 10; attempt++) {
      const entry = await kv.get<{ id: string; seq: number }>(k);
      const next = (entry.value?.seq ?? 0) + 1;
      const updated = { ...(entry.value ?? { id }), seq: next };
      const result = await kv.atomic().check(entry).set(k, updated).commit();
      if (result.ok) return next;
    }
    throw new Error(`[DBO] atomicIncrement failed after 10 attempts on "${id}"`);
  }

  // ── Backwards-compat aliases ─────────────────────────────────────────────────
  // The old engine used find/findOne/delete; keep them so src/ code keeps compiling.

  find(q?: Query<T>): Promise<T[]> { return this.query(q); }
  findOne(q?: Query<T>): Promise<T | undefined> { return this.queryOne(q); }
  update(q: Query<T>, opOrData: string | Partial<T>, data?: Partial<T>): Promise<T[]> {
    if (typeof opOrData === "string") return this.modify(q, opOrData, data ?? {} as Partial<T>);
    // deno-lint-ignore no-explicit-any
    return this.modify(q, "$set", opOrData as any);
  }

  static async close(): Promise<void> {
    if (DBO.kv) {
      await DBO.kv.close();
      DBO.kv = null;
    }
  }
}
