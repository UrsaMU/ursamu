import { assertEquals } from "@std/assert";
import {
  formatDiscordChannelBody,
  onGameChannelMessage,
} from "../src/channel-bridge.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test(
  "onGameChannelMessage skips outbound for source discord",
  OPTS,
  async () => {
    // Must return without throwing even if no webhooks/DB wired
    await onGameChannelMessage({
      channelName: "ooc",
      senderId: "discord:1",
      senderName: "Alice",
      message: "hello",
      source: "discord",
    });
  },
);

Deno.test("formatDiscordChannelBody say style", OPTS, () => {
  assertEquals(
    formatDiscordChannelBody("Alice", "hi there"),
    `[Discord] Alice says, "hi there"`,
  );
});

Deno.test("formatDiscordChannelBody pose with :", OPTS, () => {
  assertEquals(
    formatDiscordChannelBody("Alice", ":waves"),
    "[Discord] Alice waves",
  );
});

Deno.test("formatDiscordChannelBody pose with ;", OPTS, () => {
  assertEquals(
    formatDiscordChannelBody("Alice", ";'s hat falls"),
    "[Discord] Alice's hat falls",
  );
});

Deno.test("formatDiscordChannelBody strips MUSH in name", OPTS, () => {
  assertEquals(
    formatDiscordChannelBody("%chBob%cn", "yo"),
    `[Discord] Bob says, "yo"`,
  );
});

Deno.test("formatDiscordChannelBody rejects empty", OPTS, () => {
  assertEquals(formatDiscordChannelBody("Alice", "   "), null);
});

Deno.test("formatDiscordChannelBody collapses newlines", OPTS, () => {
  assertEquals(
    formatDiscordChannelBody("Alice", "line1\n\nline2"),
    `[Discord] Alice says, "line1 line2"`,
  );
});
