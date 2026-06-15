import { assertEquals } from "@std/assert";
import { isPrivateHost, execAvatar } from "../src/verbs/avatar.ts";
import type { IUrsamuSDK } from "../src/commands/types.ts";
import { dbojs, DBO } from "../mod.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("isPrivateHost detects IPv4-mapped IPv6 bypasses", OPTS, () => {
  // EXPLOIT: IPv4-mapped IPv6 address is currently not blocked by isPrivateHost
  assertEquals(isPrivateHost("::ffff:127.0.0.1"), true);
});

Deno.test("execAvatar pins resolved IP to prevent DNS Rebinding", OPTS, async () => {
  const sentMessages: string[] = [];
  const fetchedUrls: string[] = [];

  // Mock player
  const player = {
    id: "avatar_test_player_001",
    flags: "player connected",
    state: {},
    contents: [],
    data: {},
  };
  await dbojs.create(player);

  const mockU: IUrsamuSDK = {
    me: { id: player.id, name: "TestPlayer", flags: new Set(["player", "connected"]), state: player.state, contents: player.contents },
    here: { id: "room1", name: "Room", flags: new Set(["room"]), state: {}, contents: [] },
    socketId: "socket1",
    cmd: { name: "@avatar", original: "@avatar http://attacker.com/pic.png", args: ["http://attacker.com/pic.png"], switches: [] },
    send: (msg: string) => { sentMessages.push(msg); },
    broadcast: () => {},
    eval: async () => "",
    attr: { get: async () => null, set: async () => {} },
    db: {
      modify: async () => {},
      search: async () => [],
      create: async (d: any) => ({ ...d, id: "99", flags: new Set(), contents: [] }),
      destroy: async () => {},
    },
    util: {
      target: async () => null,
      displayName: (o: any) => o.name ?? "Unknown",
      stripSubs: (s: string) => s,
      parseDesc: (s: string) => s,
      center: (s: string) => s,
      ljust: (s: string, _w: number) => s,
      rjust: (s: string, _w: number) => s,
    },
    canEdit: async () => true,
  } as unknown as IUrsamuSDK;

  // Mock resolveDns and fetch
  const originalResolveDns = Deno.resolveDns;
  const originalFetch = globalThis.fetch;

  Deno.resolveDns = (hostname: string, recordType: string): Promise<any[]> => {
    if (hostname === "attacker.com") {
      return Promise.resolve(["8.8.8.8"]); // return safe public IP
    }
    return originalResolveDns(hostname, recordType as any);
  };

  globalThis.fetch = (input: string | Request | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = input.toString();
    fetchedUrls.push(urlStr);
    return Promise.resolve(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "Content-Type": "image/png" },
    }));
  };

  try {
    await execAvatar(mockU);
    // EXPLOIT: In the vulnerable version, the fetched URL contains "attacker.com"
    // instead of the pinned resolved IP "8.8.8.8".
    // This assertion should fail in the Red phase because it fetch()es "attacker.com" directly.
    assertEquals(fetchedUrls.length, 1);
    const u = new URL(fetchedUrls[0]);
    assertEquals(u.hostname, "8.8.8.8");
  } finally {
    Deno.resolveDns = originalResolveDns;
    globalThis.fetch = originalFetch;
    await dbojs.delete({ id: player.id });
    await DBO.close();
  }
});
