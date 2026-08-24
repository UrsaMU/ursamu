/**
 * Channel delivery helpers.
 */
import { assertEquals } from "@std/assert";
import {
  channelTagFromHeader,
  plainChannelTag,
} from "../src/chan-deliver.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("channelTagFromHeader: keeps color codes", OPTS, () => {
  assertEquals(
    channelTagFromHeader("%ch%cc[PUBLIC]%cn", "Public"),
    "%ch%cc[PUBLIC]%cn",
  );
  assertEquals(
    channelTagFromHeader("[PUBLIC]", "Public"),
    "[PUBLIC]",
  );
});

Deno.test("channelTagFromHeader: fallback", OPTS, () => {
  assertEquals(channelTagFromHeader("", "Staff"), "Staff");
});

Deno.test("plainChannelTag: strips codes", OPTS, () => {
  assertEquals(
    plainChannelTag("%ch%cc[PUBLIC]%cn", "Public"),
    "[PUBLIC]",
  );
});
