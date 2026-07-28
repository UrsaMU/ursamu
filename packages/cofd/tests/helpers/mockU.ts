// deno-lint-ignore-file require-await
import type { IUrsamuSDK } from "@ursamu/ursamu";

// IDBObj mirrors the internal shape from @ursamu/ursamu -- not yet in public exports.
type IDBObj = {
  id: string;
  name?: string;
  flags: Set<string>;
  location?: string;
  state: Record<string, unknown>;
  contents: IDBObj[];
};

export function mockPlayer(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "1", name: "TestPlayer",
    flags: new Set(["player", "connected"]),
    state: {}, location: "2", contents: [],
    ...overrides,
  };
}

/** In-memory object store shared across a test's mockU instances. */
export class MockObjectStore {
  private store: Map<string, IDBObj> = new Map();
  private counter = 100;

  create(data: Partial<IDBObj>): IDBObj {
    const id = String(++this.counter);
    const obj: IDBObj = {
      id,
      name: data.name,
      flags: data.flags ?? new Set(["thing"]),
      location: data.location,
      state: data.state ?? {},
      contents: [],
    };
    this.store.set(id, obj);
    return obj;
  }

  get(id: string): IDBObj | undefined {
    return this.store.get(id);
  }

  search(query: Record<string, unknown>): IDBObj[] {
    const all = [...this.store.values()];
    return all.filter((o) => {
      for (const [k, v] of Object.entries(query)) {
        if (k === "id" && o.id !== v) return false;
        if (k === "location" && o.location !== v) return false;
        if (k === "flags" && v instanceof RegExp && !v.test([...o.flags].join(" "))) return false;
      }
      return true;
    });
  }

  modify(id: string, op: string, data: Record<string, unknown>): void {
    const obj = this.store.get(id);
    if (!obj) return;
    if (op === "$set") {
      for (const [k, v] of Object.entries(data)) {
        if (k === "location" || k === "data.location") {
          obj.location = v as string;
        } else if (k.startsWith("data.")) {
          // "data.X" maps to state.X
          obj.state[k.slice(5)] = v;
        } else {
          (obj as Record<string, unknown>)[k] = v;
        }
      }
    }
  }

  /** Upsert by id (tests that need a fixed actor id). */
  put(obj: IDBObj): void {
    this.store.set(obj.id, {
      ...obj,
      flags: obj.flags ?? new Set(),
      state: obj.state ?? {},
      contents: obj.contents ?? [],
    });
  }

  setFlags(id: string, flagStr: string): void {
    const obj = this.store.get(id);
    if (!obj) return;
    for (const part of flagStr.split(/\s+/)) {
      if (part.startsWith("!")) {
        obj.flags.delete(part.slice(1));
      } else {
        obj.flags.add(part);
      }
    }
  }

  destroy(id: string): void {
    this.store.delete(id);
  }
}

export function mockU(opts: {
  me?: Partial<IDBObj>;
  args?: string[];
  targetResult?: IDBObj | null;
  canEditResult?: boolean;
  checkLockResult?: boolean | ((lock: string) => boolean);
  here?: Partial<IDBObj>;
  dbModify?: (...a: unknown[]) => Promise<void>;
  objectStore?: MockObjectStore;
} = {}) {
  const sent: string[] = [];
  const dbCalls: unknown[][] = [];
  const store = opts.objectStore ?? new MockObjectStore();

  const me = mockPlayer(opts.me ?? {});
  store.put(me);

  const applyFlags = (id: string, flagStr: string) => {
    store.setFlags(id, flagStr);
    const obj = store.get(id);
    if (obj && id === me.id) {
      me.flags = obj.flags;
    }
  };

  const hereBase = mockPlayer({
    id: "2",
    name: "Room",
    flags: new Set(["room"]),
    ...opts.here,
  });
  store.put(hereBase);

  return Object.assign({
    me,
    here: {
      ...hereBase,
      broadcast: () => {},
    },
    cmd: { name: "", original: "", args: opts.args ?? [], switches: [] },
    send: (m: string) => sent.push(m),
    broadcast: () => {},
    canEdit: async () => opts.canEditResult ?? true,
    checkLock: async (
      _t: unknown,
      lock: string,
    ) => {
      const r = opts.checkLockResult;
      if (typeof r === "function") return r(lock);
      return r ?? true;
    },
    setFlags: async (target: string | IDBObj, flags: string) => {
      const id = typeof target === "string" ? target : target.id;
      applyFlags(id, flags);
      if (typeof target !== "string" && target.flags) {
        for (const part of flags.split(/\s+/)) {
          if (part.startsWith("!")) target.flags.delete(part.slice(1));
          else target.flags.add(part);
        }
      }
    },
    db: {
      modify: async (...a: unknown[]) => {
        dbCalls.push(a);
        const [id, op, data] = a as [string, string, Record<string, unknown>];
        store.modify(id, op, data);
        await opts.dbModify?.(...a);
      },
      search: async (query: Record<string, unknown>) => store.search(query),
      create: async (d: unknown) => {
        const obj = store.create(d as Partial<IDBObj>);
        return obj;
      },
      destroy: async (id: string) => store.destroy(id),
    },
    util: {
      target: async () => opts.targetResult ?? null,
      displayName: (o: IDBObj) => o.name ?? "Unknown",
      stripSubs: (s: string) => s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
      sprintf: (f: string) => f,
    },
  } as unknown as IUrsamuSDK, { _sent: sent, _dbCalls: dbCalls, _store: store });
}
