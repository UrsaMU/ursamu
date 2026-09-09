// commands/diablerie.ts -- +diablerie Amaranth.

import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import { attemptDiablerie } from "../core/diablerie.ts";
import { isKindred } from "../core/kindred.ts";
import { poseRoom } from "../core/poseRoom.ts";
import { emitStatChanged } from "../hooks.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

addCmd({
  name: "+diablerie",
  pattern: /^\+diablerie(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Vampire",
  help: `+diablerie[/switch] <victim>  -- Commit Amaranth.

SYNTAX
  +diablerie <victim>          Diablerize Incap/torpor Kindred.
  +diablerie/confirm <victim>  Same (explicit).

Victim must be incapacitated or in torpor. Lowers generation
if victim is lower gen; always stains aura + path check.

SEE ALSO: +help humanity, +help feed, +help beast`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const arg = sw && !["confirm", "do"].includes(sw) && !rest
      ? sw
      : rest;

    if (!arg) {
      u.send("Usage: +diablerie <victim>");
      return;
    }

    const predator = await findByPlayer(u.me.id);
    if (!predator || !isKindred(predator)) {
      u.send("Only Kindred can commit diablerie.");
      return;
    }

    const target = await u.util.target(u.me, arg, true);
    if (!target) {
      u.send("Victim not found.");
      return;
    }
    // Same room preferred unless staff.
    if (
      !isStaff(u) &&
      target.location !== u.me.location
    ) {
      u.send("Victim must be in the same room.");
      return;
    }

    const victim = await findByPlayer(target.id);
    if (!victim || !isKindred(victim)) {
      u.send("Victim must be Kindred.");
      return;
    }

    const oldGen = predator.generation ?? 13;
    const r = attemptDiablerie(predator, victim);
    if (!r.ok) {
      u.send(`%cr${r.message}%cn`);
      return;
    }

    await saveChar(predator);
    await saveChar(victim);

    if (r.generationAfter !== undefined && r.generationAfter !== oldGen) {
      emitStatChanged({
        staffId: u.me.id,
        targetId: u.me.id,
        charId: predator.id,
        trait: "generation",
        old: oldGen,
        newVal: r.generationAfter,
      });
    }

    if (r.addictRoll) {
      u.send(
        `%cySelf-Control (${r.addictRoll.pool}d): ` +
          `[${r.addictRoll.dice.join(" ")}] = ` +
          `${r.addictRoll.netSuccesses}` +
          `${r.addictRoll.botch ? " BOTCH" : ""}%cn`,
      );
    }
    if (r.humanityCheck?.roll) {
      const hr = r.humanityCheck.roll;
      u.send(
        `%cyPath check (${hr.pool}d vs 8): ` +
          `[${hr.dice.join(" ")}] = ${hr.netSuccesses}` +
          `${hr.botch ? " BOTCH" : ""}%cn`,
      );
    }
    u.send(`%cr${r.message}%cn`);
    u.send(
      `%cr${u.util.displayName(u.me, target)} commits diablerie upon you!%cn`,
      target.id,
    );
    await poseRoom(
      u,
      `drains the heart's blood of ${u.util.displayName(target, u.me)} ` +
        `in a forbidden act of Amaranth`,
    );
  },
});
