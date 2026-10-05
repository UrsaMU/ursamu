import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";

export function mockPlayer(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "1",
    name: "Mira",
    flags: new Set(["player", "connected"]),
    state: { name: "Mira" },
    location: "room1",
    contents: [],
    ...overrides,
  } as IDBObj;
}

export function mockU(opts: {
  me?: Partial<IDBObj>;
  args?: string[];
  web?: boolean;
} = {}) {
  const sent: string[] = [];
  const layouts: unknown[] = [];
  const u = {
    me: mockPlayer(opts.me ?? {}),
    here: {
      ...mockPlayer({
        id: "room1",
        name: "Room",
        flags: new Set(["room"]),
      }),
      broadcast: () => {},
    },
    cmd: {
      name: "",
      original: "",
      args: opts.args ?? [],
      switches: [],
    },
    clientType: opts.web ? "web" : "telnet",
    send: (m: string) => {
      sent.push(m);
    },
    ui: {
      layout: (bag: unknown) => {
        layouts.push(bag);
      },
    },
    util: {
      stripSubs: (s: string) =>
        s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
      displayName: (o: IDBObj) => o.name ?? "Unknown",
    },
  } as unknown as IUrsamuSDK;
  return Object.assign(u, { _sent: sent, _layouts: layouts });
}
