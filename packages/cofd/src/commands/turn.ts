// +turn command -- reaction postures and staff auto-pump helpers.
//
// NPC AI runs automatically on +combat/next and after PC attacks; these
// switches are convenience aliases, not a separate turn system.
//
// Subcommands:
//   /done                       Alias for +combat/next (AI on by default).
//   /auto [<max>]               Builder+: pump until a PC turn, all NPCs
//                               down, or <max> rounds (cap 50).
//   /reaction <posture> [target=<name>]
//                               Set the actor's reaction posture for the
//                               coming round. Postures: ambush | overwatch |
//                               guard | first-fire-on-adjacent.

import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import {
  advanceTurn,
  getEncounterForRoom,
  patchEncounter,
  setReactionPosture,
} from "../combat/encounter.ts";
import { advanceTurnSmart } from "../combat/walker.ts";
import type { ReactionPosture } from "../combat/types.ts";

const VALID_POSTURES: Set<ReactionPosture["type"]> = new Set([
  "ambush",
  "overwatch",
  "guard",
  "first-fire-on-adjacent",
]);

function isStaff(actor: IDBObj): boolean {
  const f = actor.flags as Set<string> | undefined;
  if (!f) return false;
  return f.has?.("admin") || f.has?.("builder") || f.has?.("wizard");
}

async function turnDone(u: IUrsamuSDK): Promise<void> {
  // Same path as +combat/next: end current turn, auto-run NPC AI.
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }
  const enc = await getEncounterForRoom(roomId);
  if (!enc || enc.status !== "active") {
    u.send("No active encounter here.");
    return;
  }
  const cur0 = enc.participants[enc.turnIdx];
  const startIdx = enc.turnIdx;
  let after;
  if (cur0?.kind === "npc" && !cur0.isOut) {
    after = await advanceTurnSmart(enc.id, u);
    // Manual/unknown AI halts without advancing -- step once so /done
    // is never a no-op on an ST-controlled slot.
    if (
      after &&
      after.status === "active" &&
      after.turnIdx === startIdx
    ) {
      after = await advanceTurn(enc.id, u);
      if (after) after = await advanceTurnSmart(enc.id, u);
    }
  } else {
    const stepped = await advanceTurn(enc.id, u);
    if (!stepped) { u.send("Failed to advance."); return; }
    after = await advanceTurnSmart(enc.id, u);
  }
  if (!after || after.status !== "active") return;
  const cur = after.participants[after.turnIdx];
  if (cur) {
    const msg =
      `%cyTURN>>%cn Round ${after.round} -- It is now ${cur.name}'s turn ` +
      `(Initiative ${cur.initiative}).`;
    u.broadcast(msg);
  }
}

async function turnAuto(u: IUrsamuSDK, rest: string): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Permission denied. Builder or higher required.");
    return;
  }
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }
  const enc = await getEncounterForRoom(roomId);
  if (!enc || enc.status !== "active") {
    u.send("No active encounter here.");
    return;
  }
  // Parse max rounds; default 10, hard cap 50.
  let maxRounds = 10;
  const n = parseInt(rest.trim(), 10);
  if (!isNaN(n) && n > 0) maxRounds = Math.min(50, n);

  // Patch maxRounds onto the encounter for the walker's safety check.
  await patchEncounter(enc.id, { maxRounds });

  await advanceTurnSmart(enc.id, u);
  u.send(`%cyTURN>>%cn Auto-pump complete (max ${maxRounds} rounds).`);
}

async function turnReaction(u: IUrsamuSDK, rest: string): Promise<void> {
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }
  const enc = await getEncounterForRoom(roomId);
  if (!enc || enc.status !== "active") {
    u.send("No active encounter here.");
    return;
  }
  // Parse "<posture> [target=<name>]".
  const trimmed = u.util.stripSubs(rest).trim();
  if (!trimmed) {
    u.send("Usage: +turn/reaction <posture> [target=<name>]");
    u.send("  Postures: ambush, overwatch, guard, first-fire-on-adjacent.");
    return;
  }
  // Split on first whitespace.
  const wsIdx = trimmed.search(/\s+/);
  const postureRaw = wsIdx < 0 ? trimmed : trimmed.slice(0, wsIdx);
  const tail = wsIdx < 0 ? "" : trimmed.slice(wsIdx).trim();
  const posture = postureRaw.toLowerCase() as ReactionPosture["type"];
  if (!VALID_POSTURES.has(posture)) {
    u.send(`Unknown posture '${postureRaw}'. Valid: ambush, overwatch, guard, first-fire-on-adjacent.`);
    return;
  }

  let targetId: string | undefined;
  const m = tail.match(/^target\s*=\s*(.+)$/i);
  if (m) {
    const tname = m[1].trim();
    const t = await u.util.target(u.me, tname, true);
    if (!t) { u.send(`No target matches '${tname}'.`); return; }
    targetId = t.id;
  }

  // Check participant.
  const myP = enc.participants.find((p) => p.actorId === u.me.id);
  if (!myP) { u.send("You are not in this encounter."); return; }

  await setReactionPosture(enc.id, u.me.id, {
    type: posture,
    ...(targetId ? { targetId } : {}),
  });

  const tgtPart = targetId ? ` (target: ${targetId})` : "";
  const msg =
    `%cyREACTION>>%cn ${myP.name} takes the ${posture} posture${tgtPart}.`;
  u.broadcast(msg);
}

export async function turnExec(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.cmd.args[1] ?? "";
  switch (sw) {
    case "":
    case "done":
      await turnDone(u);
      return;
    case "auto":
      await turnAuto(u, rest);
      return;
    case "reaction":
      await turnReaction(u, rest);
      return;
    default:
      u.send(`Unknown +turn switch '/${sw}'. Try /done, /auto, /reaction.`);
  }
}
