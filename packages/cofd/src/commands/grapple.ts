// +grapple command -- CoFD 2e grapple initiation and move resolution.
//
// Syntax:
//   +grapple <target>          -- initiate grab: Str+Brawl vs Defense
//   +grapple/<move>            -- execute a grapple move on current grapple target
//
// Moves:
//   /break-free     -- Str+Brawl; break the grapple if successes >= holder's
//   /control-weapon -- control a weapon in the grapple
//   /damage         -- Str+Brawl; deal bashing (no weapon)
//   /disarm         -- disarm the opponent
//   /drop-prone     -- knock both to the ground
//   /hold           -- maintain the grapple without a move
//   /restrain       -- fully restrain; opponent may not move or attack
//   /take-cover     -- use opponent as cover

import type { IUrsamuSDK } from "@ursamu/ursamu";
import { type CofdSheet, defaultSheet } from "../stats/index.ts";
import { computeDefense } from "../combat/pools.ts";
import { applyAttackDamage } from "../combat/damage.ts";
import {
  getEncounterForRoom,
  applyDefense,
  setActionUsed,
  setParticipantGrappleState,
  clearParticipantGrappleState,
} from "../combat/encounter.ts";
import {
  autoJoinTarget,
  endTurnAndWalk,
  ensureEncounter,
  resolveOrSpawnTarget,
} from "../combat/auto.ts";
import { handleTargetIncapacitated } from "../combat/resolution.ts";
import { executeRoll } from "../roller/index.ts";
import { unequipItem, equippedWeaponEntry } from "../equipment/index.ts";
import { addTilt, removeTilt } from "../subsystems/tilts.ts";

/** Grapple state stored on participant sheet under state.cofd_grapple. */
export interface GrappleState {
  /** The id of the character currently grappled with (or null). */
  grappleWith: string | null;
  /** True when this character is the one who initiated / holds the grapple. */
  isHolder: boolean;
  hasHold?: boolean;
  hasControl?: boolean;
  isRestrained?: boolean;
  isUsingAsCover?: boolean;
}

const VALID_MOVES = [
  "break-free",
  "control-weapon",
  "damage",
  "disarm",
  "drop-prone",
  "hold",
  "restrain",
  "take-cover",
] as const;
type GrappleMove = typeof VALID_MOVES[number];

function attr(sheet: CofdSheet, name: string): number {
  return (sheet.attributes as Record<string, number>)[name] ?? 1;
}

function skill(sheet: CofdSheet, name: string): number {
  return (sheet.skills as Record<string, number>)[name] ?? 0;
}

export async function grappleExec(u: IUrsamuSDK) {
  const rawArgs = u.cmd.args[0] ?? "";
  const rest = u.util.stripSubs(rawArgs).trim();

  if (!rest) {
    u.send(
      "Usage: +grapple <target>  or  +grapple/<move>" +
        "\nMoves: break-free, control-weapon, damage, disarm, drop-prone, hold, restrain, take-cover",
    );
    return;
  }

  // Parse "<target>[/<move>]" or just "/<move>" (no target = use current grapple).
  const slashIdx = rest.indexOf("/");
  const maybeTarget = slashIdx >= 0 ? rest.slice(0, slashIdx).trim() : rest;
  const maybeMove = slashIdx >= 0 ? rest.slice(slashIdx + 1).trim().toLowerCase() : "";

  // ---- Encounter check -----------------------------------------------
  const roomId = u.here?.id ?? "";
  let encounter = roomId ? await getEncounterForRoom(roomId) : null;
  if (!encounter || encounter.status !== "active") {
    encounter = await ensureEncounter(u, u.me);
  }
  if (!encounter || encounter.status !== "active") {
    u.send("There is no active combat encounter in this room.");
    return;
  }
  const currentActor = encounter.participants[encounter.turnIdx];
  if (!currentActor || currentActor.actorId !== u.me.id) {
    u.send("It is not your turn.");
    return;
  }

  const mySheet: CofdSheet = (u.me.state?.cofd as CofdSheet) ?? defaultSheet();
  const grappleState = (u.me.state?.cofd_grapple as GrappleState | undefined) ?? {
    grappleWith: null,
    isHolder: false,
  };

  // ---- Move on existing grapple --------------------------------------
  if (maybeMove) {
    if (!(VALID_MOVES as readonly string[]).includes(maybeMove)) {
      u.send(
        `Unknown grapple move: /${maybeMove}\n` +
          `Valid: ${VALID_MOVES.join(", ")}`,
      );
      return;
    }
    const move = maybeMove as GrappleMove;

    // Resolve target: prefer current grapple partner, or use the arg.
    let opponentId = grappleState.grappleWith ?? null;
    if (!opponentId && maybeTarget) {
      const tgt = await u.util.target(u.me, maybeTarget, true);
      if (!tgt) {
        u.send(`Target '${maybeTarget}' not found.`);
        return;
      }
      opponentId = tgt.id;
    }
    if (!opponentId) {
      u.send("You are not currently in a grapple. Use +grapple <target> to initiate one.");
      return;
    }

    const opponent = await u.util.target(u.me, opponentId, true);
    if (!opponent) {
      u.send("Your grapple opponent is no longer here.");
      await u.db.modify(u.me.id, "$set", { "data.cofd_grapple": { grappleWith: null, isHolder: false } });
      return;
    }

    const canEdit = await u.canEdit(u.me, opponent);
    if (!canEdit) {
      u.send("You do not have permission to affect that target.");
      return;
    }

    const oppSheet: CofdSheet =
      (opponent.state?.cofd as CofdSheet) ?? defaultSheet();

    const myParticipant = encounter.participants.find(
      (p) => p.actorId === u.me.id,
    );

    // Prerequisite checks before roll:
    if (move === "restrain") {
      if (!myParticipant?.hasHold) {
        u.send("You must establish a Hold before you can Restrain.");
        return;
      }
    }
    if (move === "disarm") {
      if (!myParticipant?.hasControl) {
        u.send("You must control the opponent's weapon before you can Disarm.");
        return;
      }
    }

    // Contested Strength + Brawl vs Strength + Brawl roll
    const myPool = attr(mySheet, "strength") + skill(mySheet, "brawl");
    const oppPool = attr(oppSheet, "strength") + skill(oppSheet, "brawl");
    const myRoll = executeRoll(myPool);
    const oppRoll = executeRoll(oppPool);
    const successes = myRoll.successes;
    const oppSuccesses = oppRoll.successes;
    const netSuccesses = successes - oppSuccesses;
    const moveSucceeds = netSuccesses > 0;

    if (!moveSucceeds) {
      u.broadcast(
        `%cyGRAPPLE>>%cn ${u.me.name ?? "?"} attempts /${move} on ${opponent.name ?? "?"} but fails (${successes} vs ${oppSuccesses}).`
      );
      await applyDefense(encounter.id, opponent.id);
      await setActionUsed(encounter.id, u.me.id, true);
      await endTurnAndWalk(u, encounter.id);
      return;
    }

    switch (move) {
      case "hold": {
        await setParticipantGrappleState(encounter.id, u.me.id, { hasHold: true });
        await setParticipantGrappleState(encounter.id, opponent.id, { hasHold: true });
        await u.db.modify(u.me.id, "$set", { "data.cofd_grapple": { ...grappleState, hasHold: true } });
        const oppGrapple = (opponent.state?.cofd_grapple as GrappleState | undefined) ?? { grappleWith: u.me.id, isHolder: false };
        await u.db.modify(opponent.id, "$set", { "data.cofd_grapple": { ...oppGrapple, hasHold: true } });

        u.broadcast(
          `%cyGRAPPLE>>%cn ${u.me.name ?? "Unknown"} holds ${opponent.name ?? "Unknown"} in a grapple! (${successes} vs ${oppSuccesses})`
        );
        break;
      }

      case "damage": {
        let wpnMod = 0;
        if (myParticipant?.hasControl) {
          const myWpnId = mySheet.equipment?.equippedWeapon ?? null;
          const oppWpnId = oppSheet.equipment?.equippedWeapon ?? null;
          const myWpn = await equippedWeaponEntry(u, myWpnId);
          const oppWpn = await equippedWeaponEntry(u, oppWpnId);
          wpnMod = Math.max(
            myWpn?.entry?.damage ?? 0,
            oppWpn?.entry?.damage ?? 0,
          );
        }
        const netDmgAmount = netSuccesses + wpnMod;
        const dmg = applyAttackDamage(oppSheet, netDmgAmount, "bashing", 0, 0, false);
        if (dmg.netDamage > 0) {
          await u.db.modify(opponent.id, "$set", { "data.cofd": dmg.sheet });
          await handleTargetIncapacitated(u, encounter.id, opponent.id);
        }
        u.broadcast(
          `%cyGRAPPLE>>%cn ${u.me.name ?? "?"} damages ${opponent.name ?? "?"}: ` +
            `${netSuccesses} net success${netSuccesses === 1 ? "" : "es"} (wpn +${wpnMod}), ${dmg.netDamage} bashing.`
        );
        if (dmg.beatenDown) u.broadcast(`%cr${opponent.name ?? "?"} is Beaten Down!%cn`);
        break;
      }

      case "break-free": {
        await clearParticipantGrappleState(encounter.id, u.me.id);
        await clearParticipantGrappleState(encounter.id, opponent.id);
        await u.db.modify(u.me.id, "$set", { "data.cofd_grapple": { grappleWith: null, isHolder: false } });
        await u.db.modify(opponent.id, "$set", { "data.cofd_grapple": { grappleWith: null, isHolder: false } });

        if (oppSheet.tilts?.some((t) => t.key === "immobilized")) {
          const nextOppSheet = removeTilt(oppSheet, "immobilized");
          await u.db.modify(opponent.id, "$set", { "data.cofd": nextOppSheet });
        }
        if (mySheet.tilts?.some((t) => t.key === "immobilized")) {
          const nextMySheet = removeTilt(mySheet, "immobilized");
          await u.db.modify(u.me.id, "$set", { "data.cofd": nextMySheet });
        }

        u.broadcast(`%cyGRAPPLE>>%cn ${u.me.name ?? "?"} breaks free from ${opponent.name ?? "?"}! (${successes} vs ${oppSuccesses})`);
        break;
      }

      case "restrain": {
        await setParticipantGrappleState(encounter.id, opponent.id, { isRestrained: true });
        const oppGrapple = (opponent.state?.cofd_grapple as GrappleState | undefined) ?? { grappleWith: u.me.id, isHolder: false };
        await u.db.modify(opponent.id, "$set", { "data.cofd_grapple": { ...oppGrapple, isRestrained: true } });

        const oppSheetWithTilt = addTilt(oppSheet, "immobilized");
        await u.db.modify(opponent.id, "$set", { "data.cofd": oppSheetWithTilt });

        u.broadcast(`%cyGRAPPLE>>%cn ${u.me.name ?? "?"} fully restrains ${opponent.name ?? "?"}! (${successes} vs ${oppSuccesses})`);
        break;
      }

      case "disarm": {
        const oppWeaponId = oppSheet.equipment?.equippedWeapon;
        if (oppWeaponId) {
          await unequipItem(u, oppWeaponId);
          const nextOppSheet = {
            ...oppSheet,
            equipment: {
              ...oppSheet.equipment,
              equippedWeapon: null,
            },
          };
          await u.db.modify(opponent.id, "$set", { "data.cofd": nextOppSheet });
        }
        u.broadcast(`%cyGRAPPLE>>%cn ${u.me.name ?? "?"} disarms ${opponent.name ?? "?"}! (${successes} vs ${oppSuccesses})`);
        break;
      }

      case "drop-prone": {
        u.broadcast(`%cyGRAPPLE>>%cn ${u.me.name ?? "?"} drags ${opponent.name ?? "?"} to the ground! Both are now prone. (${successes} vs ${oppSuccesses})`);
        break;
      }

      case "control-weapon": {
        await setParticipantGrappleState(encounter.id, u.me.id, { hasControl: true });
        await u.db.modify(u.me.id, "$set", { "data.cofd_grapple": { ...grappleState, hasControl: true } });

        u.broadcast(`%cyGRAPPLE>>%cn ${u.me.name ?? "?"} controls ${opponent.name ?? "?"}'s weapon! (${successes} vs ${oppSuccesses})`);
        break;
      }

      case "take-cover": {
        await setParticipantGrappleState(encounter.id, u.me.id, { isUsingAsCover: true });
        await u.db.modify(u.me.id, "$set", { "data.cofd_grapple": { ...grappleState, isUsingAsCover: true } });

        u.broadcast(`%cyGRAPPLE>>%cn ${u.me.name ?? "?"} uses ${opponent.name ?? "?"} as cover! (${successes} vs ${oppSuccesses})`);
        break;
      }
    }

    await applyDefense(encounter.id, opponent.id);
    await setActionUsed(encounter.id, u.me.id, true);
    await endTurnAndWalk(u, encounter.id);
    return;
  }

  // ---- Initiate grapple ----------------------------------------------
  const target = await resolveOrSpawnTarget(u, u.me, maybeTarget);
  if (!target) {
    u.send(`Target '${maybeTarget}' not found.`);
    return;
  }

  const canEdit = await u.canEdit(u.me, target);
  if (!canEdit) {
    u.send("You do not have permission to affect that target.");
    return;
  }

  // Auto-join NPC targets on first involvement.
  await autoJoinTarget(u, encounter, target);

  const targetSheet: CofdSheet = (target.state?.cofd as CofdSheet) ?? defaultSheet();
  const targetParticipant = encounter.participants.find((p) => p.actorId === target.id);
  let targetDefense = computeDefense(targetSheet);
  if (targetParticipant) {
    targetDefense = Math.max(0, targetDefense - targetParticipant.appliedDefense);
  }

  const pool = Math.max(0,
    attr(mySheet, "strength") + skill(mySheet, "brawl") - targetDefense,
  );
  const result = executeRoll(pool);
  const success = result.successes > 0;

  const attackerName = u.me.name ?? "Unknown";
  const tgtName = target.name ?? "Unknown";
  u.broadcast(
    `%cyGRAPPLE>>%cn ${attackerName} attempts to grapple ${tgtName}: ` +
      `${result.successes} success${result.successes === 1 ? "" : "es"} -- ` +
      (success ? "%cgGrab succeeds!%cn" : "%crFails.%cn"),
  );

  if (success) {
    // Mark both participants as grappling each other.
    await u.db.modify(u.me.id, "$set", {
      "data.cofd_grapple": { grappleWith: target.id, isHolder: true },
    });
    await u.db.modify(target.id, "$set", {
      "data.cofd_grapple": { grappleWith: u.me.id, isHolder: false },
    });
  }

  await applyDefense(encounter.id, target.id);
  await setActionUsed(encounter.id, u.me.id, true);
  await endTurnAndWalk(u, encounter.id);
}
