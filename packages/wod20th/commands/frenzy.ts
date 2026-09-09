// commands/frenzy.ts -- +frenzy command for WtA frenzy / berserk.
//
// Syntax:
//   +frenzy                       Show your current frenzy state.
//   +frenzy/check <trigger>       Roll Willpower vs trigger difficulty.
//   +frenzy/list                  List known triggers and difficulties.
//   +frenzy/calm <target>         (Staff) Force-end a frenzy.
//   +frenzy/force <tgt>=<state>   (Staff) Force-set frenzy state, no roll.

import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import {
  FRENZY_TRIGGERS,
  type FrenzyState,
  clearFrenzy,
  enterFrenzy,
  frenzyRemaining,
  isFrenzied,
  resistFrenzy,
} from "../core/frenzy.ts";
import { emitFrenzyCleared, emitFrenzyEntered } from "../hooks.ts";
import { header, footer } from "../core/format.ts";
import { woundPenalty } from "../core/wounds.ts";
import { rollDice } from "../core/dice.ts";
import { poseRoom } from "../core/poseRoom.ts";
import { shiftedDisplayName } from "../core/displayName.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

function listTriggers(): string[] {
  const lines: string[] = [];
  lines.push("  %chTrigger%cn".padEnd(24) + "%chDiff%cn  %chDescription%cn");
  for (const [key, t] of Object.entries(FRENZY_TRIGGERS)) {
    lines.push(`  ${key.padEnd(14)}        ${String(t.difficulty).padStart(2)}    ${t.label}`);
  }
  return lines;
}

addCmd({
  name: "+frenzy",
  pattern: /^\+frenzy(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Werewolf",
  help: `+frenzy[/switch] [<arg>]  -- Werewolf frenzy / berserk mechanics.

SYNTAX
  +frenzy                       Show your current frenzy state.
  +frenzy/list                  List frenzy triggers and difficulties.
  +frenzy/check <trigger>       Roll Willpower vs trigger to resist.
  +frenzy/calm <target>         (Staff) Force-end target's frenzy.
  +frenzy/force <tgt>=<state>   (Staff) Set state to berserk|fox|calm.

EXAMPLES
  +frenzy/check taunt           Resist a taunt-induced frenzy.
  +frenzy/list                  See all triggers.

SEE ALSO: +help frenzy, +help rage, +help wod20th`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    // -- /list ----------------------------------------------------------------
    if (sw === "list") {
      const lines: string[] = [
        header("Frenzy Triggers"),
        ...listTriggers(),
        footer(),
      ];
      u.send(lines.join("%r"));
      return;
    }

    // -- /calm (staff) --------------------------------------------------------
    if (sw === "calm") {
      if (!isStaff(u)) { u.send("%crPermission denied.%cn"); return; }
      if (!arg) { u.send("Usage: +frenzy/calm <target>"); return; }
      const target = await u.util.target(u.me, arg, true);
      if (!target) { u.send("Target not found."); return; }
      if (!(await u.canEdit(u.me, target))) {
        u.send("%crPermission denied.%cn"); return;
      }
      const char = await findByPlayer(target.id);
      if (!char) {
        u.send(`${u.util.displayName(target, u.me)} has no character on file.`);
        return;
      }
      if (!char.frenzyState) {
        u.send(`${u.util.displayName(target, u.me)} is not frenzied.`);
        return;
      }
      const cleared = clearFrenzy(char);
      cleared.frenzyState = null;
      cleared.frenzyUntil = 0;
      (cleared.statLog ??= []).push({
        staffId: u.me.id,
        trait: "frenzyState",
        old: char.frenzyState,
        new: null,
        ts: Date.now(),
      });
      Object.assign(char, cleared);
      await saveChar(char);
      emitFrenzyCleared({
        actorId: u.me.id,
        targetId: target.id,
        charId: char.id,
        state: null,
        until: 0,
      });
      u.send(`%cgCalmed ${u.util.displayName(target, u.me)}.%cn`);
      return;
    }

    // -- /force (staff) -------------------------------------------------------
    if (sw === "force") {
      if (!isStaff(u)) { u.send("%crPermission denied.%cn"); return; }
      const [lhs, rhs] = arg.split("=", 2).map((s) => s?.trim() ?? "");
      if (!lhs || !rhs) {
        u.send("Usage: +frenzy/force <target>=<berserk|fox|calm>");
        return;
      }
      const state = rhs.toLowerCase();
      if (!["berserk", "fox", "calm"].includes(state)) {
        u.send("State must be berserk, fox, or calm.");
        return;
      }
      const target = await u.util.target(u.me, lhs, true);
      if (!target) { u.send("Target not found."); return; }
      if (!(await u.canEdit(u.me, target))) {
        u.send("%crPermission denied.%cn"); return;
      }
      const char = await findByPlayer(target.id);
      if (!char) {
        u.send(`${u.util.displayName(target, u.me)} has no character on file.`);
        return;
      }
      const old = char.frenzyState ?? null;
      const updated = state === "calm"
        ? clearFrenzy(char)
        : enterFrenzy(char, state as FrenzyState);
      (updated.statLog ??= []).push({
        staffId: u.me.id,
        trait: "frenzyState",
        old,
        new: updated.frenzyState ?? null,
        ts: Date.now(),
      });
      Object.assign(char, updated);
      await saveChar(char);

      const payload = {
        actorId: u.me.id,
        targetId: target.id,
        charId: char.id,
        state: char.frenzyState ?? null,
        until: char.frenzyUntil ?? 0,
      };
      if (state === "calm") emitFrenzyCleared(payload);
      else emitFrenzyEntered(payload);

      u.send(`%cySet ${u.util.displayName(target, u.me)} frenzy state to ${state}.%cn`);
      return;
    }

    // -- /check ---------------------------------------------------------------
    if (sw === "check") {
      if (!arg) { u.send("Usage: +frenzy/check <trigger>  (see +frenzy/list)"); return; }
      const key = arg.toLowerCase();
      if (!FRENZY_TRIGGERS[key]) {
        u.send(`Unknown trigger "${arg}". See +frenzy/list.`);
        return;
      }
      const char = await findByPlayer(u.me.id);
      if (!char) { u.send("You have no character on file."); return; }
      if (char.splat !== "wta") {
        u.send("Only Garou are subject to frenzy.");
        return;
      }

      // M20 wound penalties cut into the Willpower resist pool. Frenzy can
      // still fire while crippled (pain stokes the Rage), so no incap gate.
      const penalty = woundPenalty(char);
      const reduced = Math.max(1, (char.willpower ?? 1) - penalty);
      const woundRoller = (_p: number, d: number) => rollDice(reduced, d);
      const result = resistFrenzy(char, key, "berserk", woundRoller);
      const trig = result.trigger;
      const diceStr = result.roll.dice.join(" ");
      const penTag  = penalty > 0 ? ` (wound -${penalty})` : "";
      const summary = result.ok
        ? `%cgRESISTED%cn (${result.roll.netSuccesses} successes)`
        : result.roll.botch
          ? `%crBOTCH -- BERSERK FRENZY%cn`
          : `%cr${result.outcome.toUpperCase()} FRENZY%cn (0 successes)`;
      u.send(
        `%chFrenzy check:%cn ${trig.label} (diff ${trig.difficulty})%r` +
        `Willpower pool ${result.roll.pool}${penTag}: [${diceStr}]%r` +
        summary,
      );

      if (!result.ok) {
        const state = result.outcome as FrenzyState;
        const updated = enterFrenzy(char, state);
        Object.assign(char, updated);
        await saveChar(char);
        const loginName = u.util.displayName(u.me, u.me);
        const seenAs = shiftedDisplayName(char, loginName);
        poseRoom(u, state === "fox"
          ? `%cy${seenAs}%cn flinches back in raw terror, eyes white, ready to flee.`
          : `%cr${seenAs}%cn snarls, hackles rising -- the Rage takes them.`);
        emitFrenzyEntered({
          actorId: u.me.id,
          targetId: u.me.id,
          charId: char.id,
          state,
          trigger: key,
          until: char.frenzyUntil ?? 0,
        });
      }
      return;
    }

    // -- default: status ------------------------------------------------------
    if (sw && sw !== "") {
      u.send(`Unknown switch: /${sw}. See +help frenzy.`);
      return;
    }
    const char = await findByPlayer(u.me.id);
    if (!char) { u.send("You have no character on file."); return; }
    if (!isFrenzied(char)) {
      u.send("%cgCalm.%cn");
      return;
    }
    const label = char.frenzyState === "fox" ? "FOX FRENZY" : "BERSERK";
    u.send(`%cr${label}%cn %cy(${frenzyRemaining(char)} remaining)%cn`);
  },
});
