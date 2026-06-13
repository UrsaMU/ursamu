/**
 * E2E tests for the lockfunc registry through the full command pipeline.
 *
 * Flow: registerLockFunc → addCmd(lock) → matchNativeCmd → evaluateLock → handler
 *
 * These tests use real DB objects (dbojs.create) and call matchNativeCmd
 * directly, which is the same gate the WebSocket layer hits for every command.
 */
import { assertEquals } from "jsr:@std/assert@^1";
import { dbojs } from "@ursamu/mush";
import { DBO } from "@ursamu/core";
import { Obj } from "@ursamu/mush";
import { matchNativeCmd } from "../packages/mush/src/commands/pipeline-stages.ts";
import { registerLockFunc } from "@ursamu/mush";
import type { ICmd, IUrsamuSDK } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ── Test command builder ───────────────────────────────────────────────────

function makeCmd(lock: string, received: string[]): ICmd {
  return {
    name: "+e2e-tribe",
    pattern: /^\+e2e-tribe$/i,
    lock,
    category: "Test",
    exec: (u: IUrsamuSDK) => { received.push(u.me.id); },
  };
}

// ── DB player helpers ──────────────────────────────────────────────────────

async function createTestPlayer(
  id: string,
  extraData: Record<string, unknown> = {},
): Promise<Obj> {
  await dbojs.create({
    id,
    flags: "player connected",
    data: { name: `E2EPlayer_${id}`, ...extraData },
  });
  const raw = await dbojs.queryOne({ id });
  if (!raw) throw new Error(`Failed to create test player ${id}`);
  return new Obj(raw);
}

async function destroyTestPlayer(id: string): Promise<void> {
  await dbojs.delete({ id });
}

// ── Tests ──────────────────────────────────────────────────────────────────

Deno.test(
  "e2e: custom tribe() lockfunc — player WITH tribe passes, player WITHOUT is denied",
  OPTS,
  async () => {
    // Register the game-specific lockfunc (simulates a WoD plugin doing this)
    registerLockFunc("tribe", (enactor, _target, args) => {
      const expected = (args[0] ?? "").trim().toLowerCase();
      const actual = String(enactor.state.tribe ?? "").toLowerCase();
      return actual === expected;
    });

    const withTribe = await createTestPlayer("e2e_p1", { tribe: "glasswaler" });
    const noTribe = await createTestPlayer("e2e_p2");

    const received: string[] = [];
    const cmds: ICmd[] = [makeCmd("tribe(glasswaler)", received)];

    // Player with matching tribe — command should execute
    const hitWith = await matchNativeCmd(
      "e2e_p1",
      withTribe.id,
      "+e2e-tribe",
      cmds,
    );
    assertEquals(hitWith, true, "matchNativeCmd should return true for allowed player");
    assertEquals(received.includes("e2e_p1"), true, "exec should have fired for e2e_p1");

    // Player without tribe — command should be denied by lock
    const hitWithout = await matchNativeCmd(
      "e2e_p2",
      noTribe.id,
      "+e2e-tribe",
      cmds,
    );
    assertEquals(hitWithout, false, "matchNativeCmd should return false for denied player");
    assertEquals(received.includes("e2e_p2"), false, "exec must NOT fire for e2e_p2");

    await destroyTestPlayer("e2e_p1");
    await destroyTestPlayer("e2e_p2");
  },
);

Deno.test(
  "e2e: built-in attr() lockfunc — allows player with matching state attr",
  OPTS,
  async () => {
    const withSphere = await createTestPlayer("e2e_p3", { sphere: "vampire" });
    const wrongSphere = await createTestPlayer("e2e_p4", { sphere: "mage" });

    const received: string[] = [];
    const cmds: ICmd[] = [makeCmd("attr(sphere, vampire)", received)];

    const hitMatch = await matchNativeCmd(
      "e2e_p3",
      withSphere.id,
      "+e2e-tribe",
      cmds,
    );
    assertEquals(hitMatch, true);
    assertEquals(received.includes("e2e_p3"), true);

    const hitWrong = await matchNativeCmd(
      "e2e_p4",
      wrongSphere.id,
      "+e2e-tribe",
      cmds,
    );
    assertEquals(hitWrong, false);
    assertEquals(received.includes("e2e_p4"), false);

    await destroyTestPlayer("e2e_p3");
    await destroyTestPlayer("e2e_p4");
  },
);

Deno.test(
  "e2e: compound lockfunc expression — mortal || !tribe(glasswaler)",
  OPTS,
  async () => {
    const mortal = await createTestPlayer("e2e_p5", { mortal: true });
    const glasswaler = await createTestPlayer("e2e_p6", { tribe: "glasswaler" });
    const plain = await createTestPlayer("e2e_p7");

    const received: string[] = [];
    // mortal attr present OR not a glasswaler
    const cmds: ICmd[] = [makeCmd("attr(mortal) || !tribe(glasswaler)", received)];

    // mortal → passes via attr(mortal)
    await matchNativeCmd("e2e_p5", mortal.id, "+e2e-tribe", cmds);
    assertEquals(received.includes("e2e_p5"), true, "mortal player should pass");

    // glasswaler + no mortal → fails (!tribe(glasswaler) is false, attr(mortal) is false)
    await matchNativeCmd("e2e_p6", glasswaler.id, "+e2e-tribe", cmds);
    assertEquals(received.includes("e2e_p6"), false, "glasswaler-only player should be denied");

    // plain player (no tribe, no mortal) → passes via !tribe(glasswaler)
    await matchNativeCmd("e2e_p7", plain.id, "+e2e-tribe", cmds);
    assertEquals(received.includes("e2e_p7"), true, "plain player passes via !tribe(glasswaler)");

    await destroyTestPlayer("e2e_p5");
    await destroyTestPlayer("e2e_p6");
    await destroyTestPlayer("e2e_p7");
  },
);

Deno.test("e2e: cleanup DB", OPTS, async () => {
  await DBO.close();
});
