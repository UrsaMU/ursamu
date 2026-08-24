/**
 * Test helpers — Mock UrsaMU SDK context
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

export function mockPlayer(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "1",
    name: "TestPlayer",
    flags: new Set(["player", "connected"]),
    state: {},
    location: "room1",
    contents: [],
    ...overrides,
  } as IDBObj;
}

export function mockU(opts: {
  me?: Partial<IDBObj>;
  args?: string[];
  targetResult?: IDBObj | null;
  canEditResult?: boolean;
  dbModify?: (...a: unknown[]) => Promise<void>;
} = {}) {
  const sent: string[] = [];
  const sentTo: Array<{ msg: string; to: string }> = [];
  const dbCalls: unknown[][] = [];

  const u = {
    me: mockPlayer(opts.me ?? {}),
    here: {
      ...mockPlayer({ id: "room1", name: "Room", flags: new Set(["room"]) }),
      broadcast: (_msg: string, _except?: string) => {},
    },
    cmd: {
      name: "",
      original: "",
      args: opts.args ?? [],
      switches: [],
    },
    send: (m: string, targetId?: string) => {
      if (targetId) {
        sentTo.push({ msg: m, to: targetId });
      } else {
        sent.push(m);
      }
    },
    broadcast: () => {},
    canEdit: async () => opts.canEditResult ?? true,
    db: {
      modify: async (...a: unknown[]) => {
        dbCalls.push(a);
        await opts.dbModify?.(...a);
      },
      search: async () => [],
      create: async (d: unknown) => ({ ...(d as object), id: "new-id", flags: new Set(), contents: [] }),
      destroy: async () => {},
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
  } as unknown as IUrsamuSDK;

  return Object.assign(u, { _sent: sent, _sentTo: sentTo, _dbCalls: dbCalls });
}
