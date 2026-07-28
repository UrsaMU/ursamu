/**
 * Channel announce helpers: presence lines stay in-game only.
 */
import { assertEquals } from "@std/assert";
import { channelAnnounces } from "../src/announce.ts";
import type { IChannel } from "../src/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function parseAnnounce(value: string): boolean {
  const v = value.toLowerCase();
  return v === "on" || v === "yes" || v === "1";
}

Deno.test("channelAnnounces: false when unset", OPTS, () => {
  const chan = {
    id: "public",
    name: "Public",
    header: "[PUBLIC]",
  };
  assertEquals(channelAnnounces(chan as IChannel), false);
});

Deno.test("channelAnnounces: true when set", OPTS, () => {
  const chan = {
    id: "public",
    name: "Public",
    header: "[PUBLIC]",
    announce: true,
  };
  assertEquals(channelAnnounces(chan as IChannel), true);
});

Deno.test("channelAnnounces: false when explicitly off", OPTS, () => {
  const chan = {
    id: "admin",
    name: "Admin",
    header: "[ADMIN]",
    announce: false,
  };
  assertEquals(channelAnnounces(chan as IChannel), false);
});

Deno.test("announce property parses on/off", OPTS, () => {
  assertEquals(parseAnnounce("on"), true);
  assertEquals(parseAnnounce("OFF"), false);
  assertEquals(parseAnnounce("1"), true);
  assertEquals(parseAnnounce("yes"), true);
});
