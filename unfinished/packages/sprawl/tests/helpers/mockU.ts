import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";

export function mockPlayer(
  overrides: Partial<IDBObj> = {},
): IDBObj {
  return {
    id: "test_goon1",
    name: "Neon",
    flags: new Set(["player", "connected"]),
    state: { name: "Neon" },
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
  return Object.assign(
    {
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
      canEdit: async () => opts.canEditResult ?? true,
      setFlags: async () => {},
      db: {
        modify: async (...a: unknown[]) => {
          dbCalls.push(a);
        },
        search: async () => [],
        create: async (d: unknown) => ({
          ...(d as object),
          id: "99",
          flags: new Set(),
          contents: [],
        }),
        destroy: async () => {},
      },
      util: {
        target: async () => opts.targetResult ?? null,
        displayName: (o: IDBObj) => o.name ?? "Unknown",
        stripSubs: (s: string) =>
          s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
        center: (s: string) => s,
        ljust: (s: string, w: number) => s.padEnd(w),
        rjust: (s: string, w: number) => s.padStart(w),
      },
    } as unknown as IUrsamuSDK,
    { _sent: sent, _dbCalls: dbCalls },
  );
}
