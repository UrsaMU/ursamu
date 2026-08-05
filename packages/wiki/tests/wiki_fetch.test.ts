/**
 * Smoke test for @wiki/fetch — remote wiki asset fetching.
 */
import { assertEquals, assertMatch } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import type { IUrsamuSDK } from "@ursamu/mush";
import { isPrivateIp, chooseFetchTarget } from "../src/url-safety.ts";

function mockU(sw: string, arg: string, flags: string[] = ["player", "admin"]): { u: IUrsamuSDK; sent: string[] } {
  const sent: string[] = [];
  const u = {
    me: {
      id: "admin1",
      name: "AdminPlayer",
      flags: new Set(flags),
      state: {},
      location: "1",
      contents: [],
    },
    cmd: { name: "@wiki", original: `@wiki/${sw} ${arg}`, args: [sw, arg], switches: [sw] },
    send: (msg: string) => { sent.push(msg); },
    util: {
      stripSubs: (s: string) => s,
      displayName: (o: { name?: string }) => o.name ?? "",
    },
  } as unknown as IUrsamuSDK;
  return { u, sent };
}

describe("remote wiki asset fetching — smoke tests", () => {
  it("chooseFetchTarget preserves https URL for remote wiki assets", () => {
    const remoteUrl = "https://raw.githubusercontent.com/UrsaMU/wiki-plugin/main/README.md";
    const target = chooseFetchTarget(new URL(remoteUrl), ["185.199.108.133"]);
    assertEquals(target.fetchUrl, remoteUrl);
    assertEquals(target.hostHeader, undefined);
  });

  it("isPrivateIp blocks loopback and RFC1918 addresses", () => {
    assertEquals(isPrivateIp("127.0.0.1"), true);
    assertEquals(isPrivateIp("10.0.0.1"), true);
    assertEquals(isPrivateIp("192.168.1.100"), true);
    assertEquals(isPrivateIp("8.8.8.8"), false);
  });

  it("live fetch smoke test for public HTTPS asset succeeds", async () => {
    const remoteUrl = "https://raw.githubusercontent.com/UrsaMU/wiki-plugin/main/README.md";
    const parsed = new URL(remoteUrl);
    const addrs = await Deno.resolveDns(parsed.hostname, "A").catch(() => []);
    assertEquals(addrs.length > 0, true);
    assertEquals(addrs.some(isPrivateIp), false);

    const { fetchUrl } = chooseFetchTarget(parsed, addrs);
    const resp = await fetch(fetchUrl, { signal: AbortSignal.timeout(10_000) });
    assertEquals(resp.ok, true);
    const content = await resp.text();
    assertMatch(content, /File-based markdown wiki/i);
  });
});
