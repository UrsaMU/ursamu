import type { IDatabase, Query, DottedSetData } from "./types.ts";
import { TypeGraphAdapter } from "./typegraph.ts";
import { DenoKvAdapter } from "./denokv.ts";

interface WithId {
  id: string;
}

export type AdapterFactory = <T extends WithId>(namespace: string) => IDatabase<T>;

function checkIsTest(): boolean {
  if (typeof Deno === "undefined") return false;
  if (typeof Deno.test !== "function") return false;
  const main = Deno.mainModule;
  if (!main) return false;
  return (
    main.includes(".test.") ||
    main.includes("_test.") ||
    main.includes("/tests/") ||
    main.includes("/test/")
  );
}

// Override Deno.test to disable sanitizers for PGlite WASM resource/timer leaks.
if (checkIsTest()) {
  const originalTest = Deno.test;
  // deno-lint-ignore no-explicit-any
  const customTest = function (nameOrOptions: any, optionsOrFn?: any, maybeFn?: any) {
    if (typeof nameOrOptions === "object") {
      nameOrOptions.sanitizeOps = false;
      nameOrOptions.sanitizeResources = false;
    } else if (typeof optionsOrFn === "object") {
      optionsOrFn.sanitizeOps = false;
      optionsOrFn.sanitizeResources = false;
    } else if (typeof optionsOrFn === "function") {
      return originalTest(nameOrOptions, { sanitizeOps: false, sanitizeResources: false }, optionsOrFn);
    }
    return originalTest(nameOrOptions, optionsOrFn, maybeFn);
  };
  Object.defineProperty(Deno, "test", { value: customTest, configurable: true, writable: true });
}

let _adapterFactory: AdapterFactory = <T extends WithId>(namespace: string) => {
  return new TypeGraphAdapter<T>(namespace) as unknown as IDatabase<T>;
};

export class DBO<T extends WithId> implements IDatabase<T> {
  private readonly namespace: string;
  private readonly adapter: IDatabase<T>;

  constructor(namespace: string) {
    this.namespace = namespace;
    this.adapter = DBO.getAdapterFactory()<T>(namespace);
  }

  static getAdapterFactory(): AdapterFactory {
    return _adapterFactory;
  }

  static setAdapterFactory(factory: AdapterFactory): void {
    _adapterFactory = factory;
  }

  create(data: T): Promise<T> {
    return this.adapter.create(data);
  }

  query(query?: Query<T>): Promise<T[]> {
    return this.adapter.query(query);
  }

  queryOne(query?: Query<T>): Promise<T | undefined> {
    return this.adapter.queryOne(query);
  }

  all(): Promise<T[]> {
    return this.adapter.all();
  }

  modify(query: Query<T>, operator: string, data: DottedSetData<T>): Promise<T[]> {
    return this.adapter.modify(query, operator, data);
  }

  delete(query: Query<T>): Promise<T[]> {
    return this.adapter.delete(query);
  }

  clear(): Promise<void> {
    return this.adapter.clear();
  }

  atomicModify(id: string, transform: (current: T) => T, retries?: number): Promise<T> {
    return this.adapter.atomicModify(id, transform, retries);
  }

  atomicIncrement(id: string): Promise<number> {
    return this.adapter.atomicIncrement(id);
  }

  // ── Backwards-compat aliases ─────────────────────────────────────────────────
  find(q?: Query<T>): Promise<T[]> { return this.query(q); }
  findOne(q?: Query<T>): Promise<T | undefined> { return this.queryOne(q); }
  async update(q: Query<T>, opOrData: string | DottedSetData<T>, data?: DottedSetData<T>): Promise<T[]> {
    let results: T[];
    if (typeof opOrData === "string") {
      results = await this.modify(q, opOrData, data ?? {} as DottedSetData<T>);
    } else {
      results = await this.modify(q, "$set", opOrData);
    }
    if (results.length === 0 && q && "id" in q && typeof q.id === "string") {
      const payload = typeof opOrData === "string"
        ? (opOrData === "$set" ? data : {})
        : opOrData;
      const record = { id: q.id, ...(payload as Record<string, unknown>) } as unknown as T;
      await this.create(record);
      return [record];
    }
    return results;
  }

  static async close(): Promise<void> {
    await TypeGraphAdapter.close();
    await DenoKvAdapter.close();
  }
}