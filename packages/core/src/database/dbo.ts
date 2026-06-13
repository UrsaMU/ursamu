import type { IDatabase, Query } from "./types.ts";
import { TypeGraphAdapter } from "./typegraph.ts";
import { DenoKvAdapter } from "./denokv.ts";

interface WithId {
  id: string;
}

export type AdapterFactory = <T extends WithId>(namespace: string) => IDatabase<T>;

let _adapterFactory: AdapterFactory = <T extends WithId>(namespace: string) => {
  return new TypeGraphAdapter<T>(namespace) as unknown as IDatabase<T>;
};

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
  // Copy static methods
  // deno-lint-ignore no-explicit-any
  (customTest as any).only = originalTest.only;
  // deno-lint-ignore no-explicit-any
  (customTest as any).ignore = originalTest.ignore;
  // deno-lint-ignore no-explicit-any
  Deno.test = customTest as any;
}

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

  modify(query: Query<T>, operator: string, data: Partial<T>): Promise<T[]> {
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
  find(q?: Query<T>): Promise<T[]> {
    return this.query(q);
  }

  findOne(q?: Query<T>): Promise<T | undefined> {
    return this.queryOne(q);
  }

  update(q: Query<T>, opOrData: string | Partial<T>, data?: Partial<T>): Promise<T[]> {
    if (typeof opOrData === "string") {
      return this.modify(q, opOrData, data ?? {} as Partial<T>);
    }
    // deno-lint-ignore no-explicit-any
    return this.modify(q, "$set", opOrData as any);
  }

  static async close(): Promise<void> {
    await DenoKvAdapter.close();
    await TypeGraphAdapter.close();
  }
}
