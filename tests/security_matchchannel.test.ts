/**
 * tests/security_matchchannel.test.ts
 *
 * matchChannel writes the player object back with $set. It must only update
 * data.channels using a selective $set instead of writing the full hydrated
 * player object, to ensure unrelated fields are not clobbered.
 */
import { assertEquals } from "@std/assert";
import { DBO } from "@ursamu/core";
import { dbojs, chans } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test(
  "security_matchchannel — matchChannel must not clobber unrelated player fields",
  OPTS,
  async () => {
    const playerId = "mc_player9";
    const chanName = "mc_public";

    // Create a channel
    await chans.create({
      id: chanName,
      name: chanName,
      alias: "+mcp",
      lock: "",
      hidden: false,
      owner: "1",
      header: "[MCP]",
    });

    // Player with a sentinel field and pre-joined active channel
    await dbojs.create({
      id: playerId,
      flags: "player connected",
      location: "1",
      data: {
        name: "MCPlayer",
        sentinel: "must-survive",
        channels: [
          {
            id: chanName,
            channel: chanName,
            alias: "+mcp",
            active: true,
          },
        ],
      },
    });

    // Build context to turn channel off
    const ctx = {
      sessionId: playerId,
      socketId: "sock_mc9",
      input: "+mcp off",
    };

    const { matchChannel } = await import(
      "../packages/channels/mod.ts"
    );
    // deno-lint-ignore no-explicit-any
    const matched = await matchChannel(ctx as any);
    assertEquals(matched, true);

    // sentinel field must still be present
    const after = await dbojs.queryOne({ id: playerId });
    assertEquals(
      (after?.data as Record<string, unknown>)?.sentinel,
      "must-survive",
    );

    // cleanup
    await dbojs.delete({ id: playerId }).catch(() => {});
    await chans.delete({ id: chanName }).catch(() => {});
  },
);

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
Deno.test("security_matchchannel cleanup", OPTS, async () => {
  await DBO.close();
});
