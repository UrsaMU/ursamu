// commands/beast.ts -- +beast Kindred frenzy / Rötschreck.

import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import {
  FRENZY_BEAST,
  ROTSCHRECK,
  applyBeastOutcome,
  clearFrenzy,
  isFrenzied,
  isKindred,
  resistBeast,
} from "../core/kindred.ts";
import { frenzyRemaining } from "../core/frenzy.ts";
import { emitFrenzyCleared, emitFrenzyEntered } from "../hooks.ts";
import { header, footer, frame } from "../core/format.ts";
import { poseRoom } from "../core/poseRoom.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

function listTable(
  title: string,
  table: Record<string, { difficulty: number; label: string }>,
): string[] {
  const lines = [`  %ch${title}%cn`];
  for (const [key, t] of Object.entries(table)) {
    lines.push(
      `  ${key.padEnd(14)}  diff ${String(t.difficulty).padStart(2)}  ${t.label}`,
    );
  }
  return lines;
}

addCmd({
  name: "+beast",
  pattern: /^\+beast(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Vampire",
  help: `+beast[/switch] [<arg>]  -- Kindred Beast / Rötschreck.

SYNTAX
  +beast                      Show Beast state.
  +beast/list                 Frenzy + fear triggers.
  +beast/frenzy <trigger>     Self-Control vs frenzy.
  +beast/fear <trigger>       Courage vs Rötschreck.
  +beast/calm <target>        (Staff) End frenzy/fear.

EXAMPLES
  +beast/list
  +beast/frenzy hunger
  +beast/fear fire

SEE ALSO: +help blood, +help torpor, +help discipline`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (sw === "list") {
      const lines = [
        header("The Beast"),
        ...listTable("Frenzy (Self-Control)", FRENZY_BEAST),
        "",
        ...listTable("Rötschreck (Courage)", ROTSCHRECK),
        footer(),
      ];
      u.send(lines.join("%r"));
      return;
    }

    if (sw === "calm") {
      if (!isStaff(u)) {
        u.send("%crPermission denied.%cn");
        return;
      }
      if (!arg) {
        u.send("Usage: +beast/calm <target>");
        return;
      }
      const target = await u.util.target(u.me, arg, true);
      if (!target) {
        u.send("Target not found.");
        return;
      }
      if (!(await u.canEdit(u.me, target))) {
        u.send("%crPermission denied.%cn");
        return;
      }
      const char = await findByPlayer(target.id);
      if (!char) {
        u.send("No character on file.");
        return;
      }
      if (!isFrenzied(char)) {
        u.send("They are not in the Beast's grip.");
        return;
      }
      const cleared = clearFrenzy(char);
      Object.assign(char, cleared);
      char.frenzyState = null;
      char.frenzyUntil = 0;
      await saveChar(char);
      emitFrenzyCleared({
        actorId: u.me.id,
        targetId: target.id,
        charId: char.id,
        state: null,
        until: 0,
      });
      u.send(`%cgBeast cleared on ${u.util.displayName(target, u.me)}.%cn`);
      return;
    }

    const char = await findByPlayer(u.me.id);
    if (!char) {
      u.send("No character on file.");
      return;
    }
    if (!isKindred(char)) {
      u.send("Only Kindred face the Beast this way. Garou: +frenzy.");
      return;
    }

    if (!sw || sw === "show") {
      if (!isFrenzied(char)) {
        u.send(frame("The Beast", [
          "  You hold the Beast in check.",
          `  Blood: ${char.bloodPool ?? char.bloodMax}/${char.bloodMax}`,
        ]));
        return;
      }
      const kind = char.frenzyState === "fox"
        ? "Rötschreck (flight)"
        : "Frenzy (rage)";
      u.send(frame("The Beast", [
        `  State:  %cr${kind}%cn`,
        `  Until:  ${frenzyRemaining(char)}`,
      ]));
      return;
    }

    if (sw === "frenzy" || sw === "fear") {
      const kind = sw === "fear" ? "rotschreck" : "frenzy";
      if (!arg) {
        u.send(`Usage: +beast/${sw} <trigger>  (+beast/list)`);
        return;
      }
      const key = arg.toLowerCase().trim();
      const table = kind === "frenzy" ? FRENZY_BEAST : ROTSCHRECK;
      if (!table[key]) {
        u.send(`Unknown trigger "${key}". See +beast/list.`);
        return;
      }
      if (isFrenzied(char)) {
        u.send("You are already lost to the Beast.");
        return;
      }

      let result;
      try {
        result = resistBeast(char, kind, key);
      } catch (e: unknown) {
        u.send(String(e));
        return;
      }

      const pool = kind === "frenzy" ? "Self-Control" : "Courage";
      const dice = result.roll.dice.join(" ");
      u.send(
        `%cy${pool} (${result.roll.pool}d vs ${result.trigger.difficulty}): ` +
          `[${dice}] = ${result.roll.netSuccesses}` +
          `${result.roll.botch ? " BOTCH" : ""}%cn`,
      );

      if (result.ok) {
        u.send(`%cgYou master the Beast (${result.trigger.label}).%cn`);
        return;
      }

      const next = applyBeastOutcome(char, result);
      Object.assign(char, next);
      await saveChar(char);
      const label = kind === "rotschreck" ? "Rötschreck" : "frenzy";
      u.send(`%crYou succumb to ${label}!%cn`);
      const who = u.util.displayName(u.me, u.me);
      poseRoom(
        u,
        kind === "rotschreck"
          ? `%cr${who}%cn flees in Rötschreck!`
          : `%cr${who}%cn erupts in frenzy!`,
      );
      emitFrenzyEntered({
        actorId: u.me.id,
        targetId: u.me.id,
        charId: char.id,
        state: (char.frenzyState ?? "berserk") as "berserk" | "fox",
        trigger: key,
        until: char.frenzyUntil ?? 0,
      });
      return;
    }

    u.send(`Unknown switch /${sw}. Try +help beast.`);
  },
});
