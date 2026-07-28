/**
 * Minimal IUrsamuSDK mock for channels command tests.
 */
import type { IUrsamuSDK } from "@ursamu/mush";
import type { IChanEntry } from "../../src/types.ts";

export type MockPlayer = {
  id: string;
  name: string;
  flags: Set<string>;
  state: Record<string, unknown>;
  location?: string;
  contents?: unknown[];
};

export function mockPlayer(
  overrides: Partial<MockPlayer> = {},
): MockPlayer {
  return {
    id: "p1",
    name: "Tester",
    flags: new Set(["player", "connected"]),
    state: { name: "Tester", channels: [] as IChanEntry[] },
    location: "1",
    contents: [],
    ...overrides,
  };
}

export type ChanRow = {
  name: string;
  header?: string;
  alias?: string;
  hidden?: boolean;
  owner?: string;
  lock?: string;
  masking?: boolean;
  logHistory?: boolean;
  announce?: boolean;
  historyLimit?: number;
};

export function mockU(opts: {
  me?: Partial<MockPlayer>;
  args?: string[];
  cmdName?: string;
  original?: string;
  channels?: ChanRow[];
  history?: Array<{ timestamp: number; message: string }>;
} = {}) {
  const sent: string[] = [];
  const dbCalls: unknown[][] = [];
  const joinCalls: string[][] = [];
  const leaveCalls: string[] = [];
  const setCalls: unknown[][] = [];
  const createCalls: unknown[][] = [];
  const destroyCalls: string[] = [];

  const me = mockPlayer(opts.me ?? {});
  const catalog = [...(opts.channels ?? [])];

  const u = {
    me: me as unknown as IUrsamuSDK["me"],
    here: {
      id: "1",
      name: "Room",
      flags: new Set(["room"]),
      state: {},
      location: "",
      contents: [],
      broadcast: () => {},
    },
    cmd: {
      name: opts.cmdName ?? "addcom",
      original: opts.original ?? opts.cmdName ?? "addcom",
      args: opts.args ?? [],
      switches: [],
    },
    socketId: "sock1",
    send: (m: string) => {
      sent.push(m);
    },
    broadcast: () => {},
    canEdit: async () => true,
    db: {
      modify: async (...a: unknown[]) => {
        dbCalls.push(a);
        const data = a[2] as Record<string, unknown> | undefined;
        if (data && "data.channels" in data) {
          me.state.channels = data["data.channels"];
        }
      },
      search: async () => [],
      create: async () => ({}),
      destroy: async () => {},
    },
    util: {
      displayName: (o: { name?: string; state?: { name?: string } }) =>
        String(o.state?.name || o.name || "Someone"),
      stripSubs: (s: string) => s,
      target: async () => null,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
      center: (s: string) => s,
    },
    chan: {
      list: async () => catalog,
      join: async (channel: string, alias: string) => {
        joinCalls.push([channel, alias]);
        const entries = (me.state.channels as IChanEntry[]) ?? [];
        entries.push({
          id: alias,
          channel,
          alias,
          active: true,
        });
        me.state.channels = entries;
      },
      leave: async (alias: string) => {
        leaveCalls.push(alias);
        const entries = (me.state.channels as IChanEntry[]) ?? [];
        me.state.channels = entries.filter((e) => e.alias !== alias);
      },
      set: async (name: string, options: Record<string, unknown>) => {
        setCalls.push([name, options]);
        const row = catalog.find(
          (c) => c.name.toLowerCase() === name.toLowerCase(),
        );
        if (row) Object.assign(row, options);
        return {};
      },
      create: async (name: string, options: Record<string, unknown>) => {
        createCalls.push([name, options]);
        catalog.push({
          name,
          header: String(options.header ?? `[${name}]`),
          hidden: Boolean(options.hidden),
          lock: String(options.lock ?? ""),
          owner: me.id,
        });
        return {};
      },
      destroy: async (name: string) => {
        destroyCalls.push(name);
        const i = catalog.findIndex(
          (c) => c.name.toLowerCase() === name.toLowerCase(),
        );
        if (i >= 0) catalog.splice(i, 1);
        return {};
      },
      history: async () => opts.history ?? [],
    },
  } as unknown as IUrsamuSDK;

  return Object.assign(u, {
    _sent: sent,
    _dbCalls: dbCalls,
    _joinCalls: joinCalls,
    _leaveCalls: leaveCalls,
    _setCalls: setCalls,
    _createCalls: createCalls,
    _destroyCalls: destroyCalls,
    _me: me,
    _catalog: catalog,
  });
}
