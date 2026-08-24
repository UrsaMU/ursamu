/**
 * In-memory DBO + dbojs stubs for service/router integration tests.
 */
import { DBO, dbojs } from "@ursamu/mush";
import { counters, eventRsvps, gameEvents } from "../src/db.ts";

type Row = { id: string } & Record<string, unknown>;

class MemAdapter {
  store = new Map<string, Row>();
  counter = 0;

  async create(data: Row): Promise<Row> {
    await Promise.resolve();
    const copy = structuredClone(data);
    this.store.set(copy.id, copy);
    return structuredClone(copy);
  }

  async query(query?: Record<string, unknown>): Promise<Row[]> {
    await Promise.resolve();
    const all = [...this.store.values()].map((v) => structuredClone(v));
    if (!query || Object.keys(query).length === 0) return all;
    return all.filter((row) => matches(row, query));
  }

  async queryOne(query?: Record<string, unknown>): Promise<Row | undefined> {
    const rows = await this.query(query);
    return rows[0];
  }

  async all(): Promise<Row[]> {
    return this.query();
  }

  async modify(
    query: Record<string, unknown>,
    _operator: string,
    data: Record<string, unknown>,
  ): Promise<Row[]> {
    const hits = await this.query(query);
    for (const h of hits) {
      const next = { ...h, ...data };
      this.store.set(h.id, next);
    }
    return this.query(query);
  }

  async delete(query: Record<string, unknown>): Promise<Row[]> {
    const hits = await this.query(query);
    for (const h of hits) this.store.delete(h.id);
    return hits;
  }

  async clear(): Promise<void> {
    await Promise.resolve();
    this.store.clear();
  }

  async atomicModify(
    id: string,
    transform: (current: Row) => Row,
  ): Promise<Row> {
    await Promise.resolve();
    const cur = this.store.get(id);
    if (!cur) throw new Error("Not found");
    const next = transform(cur);
    this.store.set(id, next);
    return structuredClone(next);
  }

  async atomicIncrement(_id: string): Promise<number> {
    await Promise.resolve();
    this.counter += 1;
    return this.counter;
  }
}

function matches(
  row: Record<string, unknown>,
  query: Record<string, unknown>,
): boolean {
  for (const [k, v] of Object.entries(query)) {
    if (
      v && typeof v === "object" && !Array.isArray(v) &&
      "$in" in (v as object)
    ) {
      const list = (v as { $in: unknown[] }).$in;
      if (!list.includes(row[k])) return false;
      continue;
    }
    if (row[k] !== v) return false;
  }
  return true;
}

const adapters = new Map<string, MemAdapter>();
let originalFactory: ReturnType<typeof DBO.getAdapterFactory> | null = null;

// deno-lint-ignore no-explicit-any
const players = new Map<string, any>();
// deno-lint-ignore no-explicit-any
let origDbojs: Record<string, any> = {};

export function installMemoryDb(): () => void {
  originalFactory = DBO.getAdapterFactory();
  adapters.clear();
  // deno-lint-ignore no-explicit-any
  DBO.setAdapterFactory((ns: string) => {
    let a = adapters.get(ns);
    if (!a) {
      a = new MemAdapter();
      adapters.set(ns, a);
    }
    return a as any;
  });

  // deno-lint-ignore no-explicit-any
  const d = dbojs as any;
  origDbojs = {
    queryOne: d.queryOne?.bind(d),
    create: d.create?.bind(d),
    find: d.find?.bind(d),
    query: d.query?.bind(d),
  };
  d.queryOne = async (q: { id?: string }) => {
    if (q?.id && players.has(q.id)) return players.get(q.id);
    return undefined;
  };
  d.query = async () => [...players.values()];
  d.find = d.query;
  d.create = async (p: { id: string }) => {
    players.set(p.id, p);
    return p;
  };

  return () => {
    if (originalFactory) DBO.setAdapterFactory(originalFactory);
    for (const [k, v] of Object.entries(origDbojs)) {
      if (v) d[k] = v;
    }
    players.clear();
    adapters.clear();
  };
}

export async function resetCollections(): Promise<void> {
  await gameEvents.clear();
  await eventRsvps.clear();
  await counters.clear();
  for (const a of adapters.values()) a.counter = 0;
}

export function seedPlayer(
  id: string,
  opts: { name?: string; staff?: boolean } = {},
): void {
  const flags = new Set<string>(["player", "connected"]);
  if (opts.staff) {
    flags.add("admin");
    flags.add("wizard");
  }
  players.set(id, {
    id,
    flags,
    data: { name: opts.name ?? id },
  });
}

export const OPTS = { sanitizeResources: false, sanitizeOps: false };
