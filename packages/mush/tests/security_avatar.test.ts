import { assertEquals } from "@std/assert";
import {
  isPrivateHost,
  execAvatar,
  chooseFetchTarget,
  buildPinnedFetchUrl,
} from "../src/verbs/avatar.ts";
import type { IUrsamuSDK } from "../src/commands/types.ts";
import { dbojs, DBO } from "../mod.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("isPrivateHost detects IPv4-mapped IPv6 bypasses", OPTS, () => {
  assertEquals(isPrivateHost("::ffff:127.0.0.1"), true);
});

Deno.test("chooseFetchTarget pins HTTP but not HTTPS", OPTS, () => {
  const http = chooseFetchTarget(
    new URL("http://attacker.com/pic.png"),
    ["8.8.8.8"],
  );
  assertEquals(new URL(http.fetchUrl).hostname, "8.8.8.8");
  assertEquals(http.hostHeader, "attacker.com");

  const https = chooseFetchTarget(
    new URL("https://cdn.example/pic.jpg"),
    ["8.8.8.8"],
  );
  // HTTPS must keep hostname so TLS cert validation works.
  assertEquals(new URL(https.fetchUrl).hostname, "cdn.example");
  assertEquals(https.hostHeader, undefined);
});

Deno.test("buildPinnedFetchUrl swaps host for IP", OPTS, () => {
  const u = buildPinnedFetchUrl(
    "http://attacker.com/a.png",
    "1.2.3.4",
  );
  assertEquals(new URL(u).hostname, "1.2.3.4");
  assertEquals(new URL(u).pathname, "/a.png");
});

Deno.test("execAvatar pins resolved IP for HTTP fetch", OPTS, async () => {
  const sentMessages: string[] = [];
  const fetchedUrls: string[] = [];

  const player = {
    id: "avatar_test_player_001",
    flags: "player connected",
    state: {},
    contents: [],
    data: {},
  };
  await dbojs.create(player);

  const mockU: IUrsamuSDK = {
    me: {
      id: player.id,
      name: "TestPlayer",
      flags: new Set(["player", "connected"]),
      state: player.state,
      contents: player.contents,
    },
    here: {
      id: "room1",
      name: "Room",
      flags: new Set(["room"]),
      state: {},
      contents: [],
    },
    socketId: "socket1",
    cmd: {
      name: "@avatar",
      original: "@avatar http://attacker.com/pic.png",
      args: ["http://attacker.com/pic.png"],
      switches: [],
    },
    send: (msg: string) => {
      sentMessages.push(msg);
    },
    broadcast: () => {},
    eval: () => Promise.resolve(""),
    attr: {
      get: () => Promise.resolve(null),
      set: () => Promise.resolve(),
    },
    db: {
      modify: () => Promise.resolve(),
      search: () => Promise.resolve([]),
      create: (d: Record<string, unknown>) =>
        Promise.resolve({
          ...d,
          id: "99",
          flags: new Set(),
          contents: [],
        }),
      destroy: () => Promise.resolve(),
    },
    util: {
      target: () => Promise.resolve(null),
      displayName: (o: Record<string, unknown>) =>
        String(o.name ?? "Unknown"),
      stripSubs: (s: string) => s,
      parseDesc: (s: string) => s,
      center: (s: string) => s,
      ljust: (s: string, _w: number) => s,
      rjust: (s: string, _w: number) => s,
    },
    canEdit: () => Promise.resolve(true),
  } as unknown as IUrsamuSDK;

  const originalResolveDns = Deno.resolveDns;
  const originalFetch = globalThis.fetch;

  // deno-lint-ignore no-explicit-any
  (Deno as any).resolveDns = (
    hostname: string,
    recordType: string,
  ): Promise<string[]> => {
    if (hostname === "attacker.com") {
      return Promise.resolve(["8.8.8.8"]);
    }
    return originalResolveDns(
      hostname,
      recordType as "A",
    ) as Promise<string[]>;
  };

  globalThis.fetch = (
    input: string | Request | URL,
    _init?: RequestInit,
  ): Promise<Response> => {
    fetchedUrls.push(input.toString());
    return Promise.resolve(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
  };

  try {
    await execAvatar(mockU);
    assertEquals(fetchedUrls.length, 1);
    const u = new URL(fetchedUrls[0]);
    assertEquals(u.hostname, "8.8.8.8");
    assertEquals(sentMessages.at(-1), "Avatar saved.");
  } finally {
    Deno.resolveDns = originalResolveDns;
    globalThis.fetch = originalFetch;
    await dbojs.delete({ id: player.id });
    await DBO.close();
  }
});
