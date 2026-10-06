import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";

export function mockPlayer(
  overrides: Partial<IDBObj> = {},
): IDBObj {
  return {
    id: "test_actor1",
    name: "Tester",
    flags: new Set(["player", "connected"]),
    state: { name: "Tester" },
    location: "test_room1",
    contents: [],
    ...overrides,
  } as IDBObj;
}

export function mockU(opts: {
  me?: Partial<IDBObj>;
  args?: string[];
  targetResult?: IDBObj | null;
  canEditResult?: boolean;
} = {}) {
  const sent: string[] = [];
  const dbCalls: unknown[][] = [];
  const me = mockPlayer(opts.me ?? {});
  const u = {
    me,
    here: {
      id: "test_room1",
      name: "Room",
      flags: new Set(["room"]),
      state: {},
      location: "",
      contents: [],
      broadcast: () => {},
    },
    cmd: {
      name: "",
      original: "",
      args: opts.args ?? [],
      switches: [],
    },
    send: (m: string) => {
      sent.push(m);
    },
    broadcast: () => {},
    canEdit: () => Promise.resolve(opts.canEditResult ?? true),
    setFlags: () => Promise.resolve(),
    db: {
      modify: (...a: unknown[]) => {
        dbCalls.push(a);
        const [id, op, data] = a as [
          string,
          string,
          Record<string, unknown>,
        ];
        if (
          id === me.id && op === "$set" && data["state.cinematic"]
        ) {
          me.state.cinematic = data["state.cinematic"];
        }
        return Promise.resolve();
      },
      search: () => Promise.resolve([]),
      create: (d: unknown) =>
        Promise.resolve({
          ...(d as object),
          id: "99",
          flags: new Set(),
          contents: [],
        }),
      destroy: () => Promise.resolve(),
    },
    util: {
      target: () => Promise.resolve(opts.targetResult ?? null),
      displayName: (o: IDBObj) => o.name ?? "Unknown",
      stripSubs: (s: string) =>
        s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
    },
  } as unknown as IUrsamuSDK;
  return Object.assign(u, {
    _sent: sent,
    _dbCalls: dbCalls,
    _me: me,
  });
}
