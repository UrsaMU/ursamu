// commands/hazard.ts -- +hazard fire|sun environmental damage.

import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import {
  applyHazard,
  parseHazardKind,
  HAZARDS,
} from "../core/hazard.ts";
import { hazardFearCheck } from "../core/kindred.ts";
import { resolveBeastCheck } from "../core/beastApply.ts";
import { emitHealthChanged, emitFrenzyEntered } from "../hooks.ts";
import { frame } from "../core/format.ts";
import { poseRoom } from "../core/poseRoom.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

function parsePositiveInt(s: string): number | null {
  if (!/^\d+$/.test(s.trim())) return null;
  const n = parseInt(s, 10);
  return n > 0 ? n : null;
}

addCmd({
  name: "+hazard",
  pattern: /^\+hazard(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Vampire",
  help: `+hazard[/kind] <target> [=n]  -- Fire or sun aggravated.

SYNTAX
  +hazard                     List kinds.
  +hazard/fire <target> [=n]  Open flame (default 1A).
  +hazard/sun <target> [=n]   Sunlight (default 2A).

NOTES
  Players may only target me. Staff may name anyone.
  Kindred should +beast/fear fire|sunlight after.

EXAMPLES
  +hazard/fire me
  +hazard/sun me=3
  +hazard/fire Alice=2

SEE ALSO: +help beast, +help blood, +help hurt`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (!sw || sw === "list") {
      const lines = ["  Kind  Boxes  Fear trigger  Book"];
      for (const h of Object.values(HAZARDS)) {
        lines.push(
          `  ${h.kind.padEnd(5)} ${String(h.defaultBoxes).padStart(5)}  ` +
            `${h.fearTrigger.padEnd(12)}  ${h.book}`,
        );
      }
      u.send(frame("Hazards", lines));
      return;
    }

    const kind = parseHazardKind(sw);
    if (!kind) {
      u.send(`Unknown hazard /${sw}. Try fire or sun.`);
      return;
    }

    if (!rest) {
      u.send(`Usage: +hazard/${kind} <target> [=n]`);
      return;
    }

    let targetStr = rest;
    let amount: number | undefined;
    const eq = rest.match(/^(.+?)\s*=\s*(\d+)\s*$/);
    if (eq) {
      targetStr = eq[1].trim();
      amount = parsePositiveInt(eq[2]) ?? undefined;
      if (amount === undefined) {
        u.send("Amount must be a positive integer.");
        return;
      }
    }

    const selfish =
      targetStr.toLowerCase() === "me" ||
      targetStr.toLowerCase() === "self";
    if (!selfish && !isStaff(u)) {
      u.send("%crPermission denied.%cn Only staff may target others.");
      return;
    }

    let targetId = u.me.id;
    let targetName = u.util.displayName(u.me, u.me);
    if (!selfish) {
      const obj = await u.util.target(u.me, targetStr, true);
      if (!obj) {
        u.send("Target not found.");
        return;
      }
      if (!(await u.canEdit(u.me, obj)) && !isStaff(u)) {
        u.send("%crPermission denied.%cn");
        return;
      }
      targetId = obj.id;
      targetName = u.util.displayName(obj, u.me);
    }

    const char = await findByPlayer(targetId);
    if (!char) {
      u.send(`${targetName} has no character on file.`);
      return;
    }

    const result = applyHazard(char, kind, amount);
    if (!result.ok) {
      u.send(`%cr${result.message}%cn`);
      return;
    }
    await saveChar(char);

    const def = HAZARDS[kind];
    u.send(frame("Hazard", [
      `  ${def.label} hits %ch${targetName}%cn`,
      `  ${result.message}`,
    ]));
    if (targetId !== u.me.id) {
      u.send(
        frame("Hazard", [
          `  You take ${result.applied} aggravated (${def.label}).`,
          `  ${result.fearHint}`,
        ]),
        targetId,
      );
    }
    poseRoom(
      u,
      `%cr${targetName}%cn is caught by ${def.label.toLowerCase()}!`,
    );
    emitHealthChanged({
      actorId: u.me.id,
      targetId,
      charId: char.id,
      action: "hurt",
      damageType: "A",
      amount: result.applied ?? 0,
      track: char.healthTrack ?? [],
    });

    // Auto Rötschreck check for Kindred.
    const fearKey = kind === "sun" ? "sunlight" : "fire";
    const fear = hazardFearCheck(char, fearKey);
    if (fear) {
      const { lines, entered } = resolveBeastCheck(char, fear);
      for (const line of lines) {
        u.send(line, targetId);
        if (targetId !== u.me.id) u.send(line);
      }
      if (entered) {
        await saveChar(char);
        poseRoom(
          u,
          `%cr${targetName}%cn flees in Rötschreck!`,
        );
        emitFrenzyEntered({
          actorId: u.me.id,
          targetId,
          charId: char.id,
          state: "fox",
          trigger: fearKey,
          until: char.frenzyUntil ?? 0,
        });
      }
    }
  },
});
