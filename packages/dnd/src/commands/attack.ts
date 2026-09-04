/**
 * +attack — resolve via CombatPorts, sticky focus, auto-kill.
 * Starts room combat automatically if none is active.
 */
import { addCmd, type IUrsamuSDK } from "@ursamu/mush";
import {
  currentActor,
  runCombatAction,
} from "@ursamu/combat";
import { dndEncounterStore } from "../combat/ports.ts";
import {
  passAndWalk,
  portsOf,
  roomEncounter,
  roomIdOf,
} from "../combat/session.ts";
import { resolveCombatTarget } from "../combat/focus.ts";
import { executeMonsterKill } from "../combat/execute-kill.ts";
import { startRoomFight } from "../combat/start-fight.ts";
import { migrateSheet } from "../stats/dnd_sheet.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

addCmd({
  name: "+attack",
  pattern: /^\+attack(?:\s+(.*))?$/i,
  lock: "connected",
  category: "Dnd",
  help: `+attack [<target>]  — Attack (starts combat if needed).

With no arg, attacks your focus (last target).
If no fight is running, +attack starts one first.

Examples:
  +attack Orc
  +attack
  +attack 2.goblin

See: +help attack, +help focus, +help combat`,
  exec: async (u: IUrsamuSDK) => {
    const roomId = roomIdOf(u);
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }

    const arg = u.cmd.args[0] ?? "";
    const { target: targetObj, error } = await resolveCombatTarget(
      u,
      roomId,
      arg,
    );
    if (!targetObj) {
      u.send(error || "No target.");
      return;
    }
    if (!(targetObj.state as Any)?.dnd) {
      u.send(
        "That target has no character sheet and cannot be attacked.",
      );
      return;
    }

    let enc = await roomEncounter(roomId);
    if (!enc || enc.status !== "active") {
      const fight = await startRoomFight(u, { roomId });
      if (!fight.ok) {
        u.send(
          fight.message ||
            "Could not start combat. Is there a foe here?",
        );
        return;
      }
      enc = await roomEncounter(roomId);
      if (!enc || enc.status !== "active") {
        u.send("Combat ended before you could strike.");
        return;
      }
    }

    const cur = currentActor(enc);
    if (!cur || cur.actorId !== u.me.id) {
      u.send(
        "Combat is underway — wait for your turn " +
          `(now: ${cur?.name ?? "?"}).`,
      );
      return;
    }

    // Target must be in the encounter (joined at start).
    let inFight = enc.participants.some(
      (p) => p.actorId === targetObj.id,
    );
    if (!inFight) {
      // Fresh join if they entered mid-fight
      const { joinActor } = await import("../combat/session.ts");
      enc = (await joinActor(enc.id, targetObj, u)) ?? enc;
      inFight = enc.participants.some(
        (p) => p.actorId === targetObj.id,
      );
    }
    if (!inFight) {
      u.send("That target is not in this encounter.");
      return;
    }

    const ports = portsOf(u);
    const view = await ports.loadActor(u.me.id);
    if (!view) {
      u.send("Could not load your combatant.");
      return;
    }

    // Refresh turn slot after possible join
    const encNow = (await roomEncounter(roomId)) ?? enc;
    const slot = currentActor(encNow);
    if (!slot || slot.actorId !== u.me.id) {
      u.send("It is not your turn.");
      return;
    }

    await runCombatAction(
      ports,
      dndEncounterStore,
      encNow,
      slot,
      view,
      { type: "attack", targetId: targetObj.id },
    );

    // Auto-execute monsters that hit 0 HP (coup de grace).
    // deno-lint-ignore no-explicit-any
    const freshList = await u.db.search({
      id: targetObj.id,
    } as any);
    const fresh = freshList[0];
    let fightEnded = false;
    if (fresh) {
      const sheet = migrateSheet((fresh.state as Any)?.dnd);
      if (
        sheet.class === "Monster" &&
        (sheet.hp?.current ?? 0) <= 0
      ) {
        await executeMonsterKill(u, roomId, fresh, {
          auto: true,
        });
        const left = await roomEncounter(roomId);
        fightEnded = !left || left.status !== "active";
      }
    }

    if (!fightEnded) {
      await passAndWalk(u, encNow.id, u.me.id);
    }
  },
});
