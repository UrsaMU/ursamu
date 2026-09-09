// commands/blood.ts -- +blood for VtM Blood Pool (vitae).
//
// Max = generation bloodMax. Current = bloodPool.
import "./help.ts"; // +help (commands.ts may be uneditable)
// /spend is capped by bloodPerTurn (V20 generation chart).
// /set sets current BP only (staff); bloodMax comes from generation.

import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { findByPlayer, saveChar, unsetCharFields } from "../db/charDb.ts";
import {
  bloodPerTurnLimit,
  clampBloodCurrent,
  spendPool,
} from "../core/pools.ts";
import {
  emitPoolRegained,
  emitPoolSpent,
  emitStatChanged,
  emitFrenzyEntered,
} from "../hooks.ts";
import { frame } from "../core/format.ts";
import type { IWoDChar } from "../core/types.ts";
import {
  bloodFeed,
  bloodHeal,
  bloodHealAgg,
  hungerFrenzyCheck,
} from "../core/kindred.ts";
import {
  bloodBuffAttr,
  clearBloodBuff,
  formatBloodBuff,
  parsePhysicalAttr,
} from "../core/bloodBuff.ts";
import { resolveBeastCheck } from "../core/beastApply.ts";
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

function parseNonNegInt(s: string): number | null {
  if (!/^\d+$/.test(s.trim())) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function hasBlood(char: IWoDChar): boolean {
  return char.splat === "vtm" &&
    typeof char.bloodMax === "number" &&
    char.bloodMax > 0;
}

addCmd({
  name: "+blood",
  pattern: /^\+blood(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Vampire",
  help: `+blood[/switch] [<args>]  -- View or change your Blood Pool.

  Full help: +help blood

Examples:
  +help blood`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    // -- /set (staff): current blood on a target ---------------------------
    if (sw === "set") {
      if (!isStaff(u)) {
        u.send("%crPermission denied.%cn");
        return;
      }
      const parts = rest.split(/\s+/).filter(Boolean);
      if (parts.length < 2) {
        u.send("Usage: +blood/set <n> <target>");
        return;
      }
      const n = parseNonNegInt(parts[0]);
      if (n === null) {
        u.send("Blood must be a non-negative integer.");
        return;
      }
      const targetName = parts.slice(1).join(" ");
      const target = await u.util.target(u.me, targetName, true);
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
        u.send(
          `${u.util.displayName(target, u.me)} has no character on file.`,
        );
        return;
      }
      if (!hasBlood(char)) {
        u.send(
          `${u.util.displayName(target, u.me)} has no Blood pool ` +
            `(VtM only).`,
        );
        return;
      }

      const clamped = clampBloodCurrent(char, n);
      if (!clamped.ok || clamped.current === undefined) {
        u.send(`%cr${clamped.message}%cn`);
        return;
      }
      const oldValue = char.bloodPool ?? char.bloodMax;
      char.bloodPool = clamped.current;
      (char.statLog ??= []).push({
        staffId: u.me.id,
        trait: "blood",
        old: oldValue,
        new: clamped.current,
        ts: Date.now(),
      });
      await saveChar(char);
      emitStatChanged({
        staffId: u.me.id,
        targetId: target.id,
        charId: char.id,
        trait: "blood",
        old: oldValue,
        newVal: clamped.current,
      });
      u.send(
        `%chStat set:%cn ${u.util.displayName(target, u.me)} / blood = ` +
          `${clamped.current} (was: ${oldValue ?? "unset"})`,
      );
      return;
    }

    // -- Own character ----------------------------------------------------
    const char = await findByPlayer(u.me.id);
    if (!char) {
      u.send("No character on file.");
      return;
    }
    if (!hasBlood(char)) {
      u.send("You have no Blood pool (Kindred only).");
      return;
    }

    const max = char.bloodMax!;
    const cur = char.bloodPool ?? max;
    const perTurn = bloodPerTurnLimit(char);

    // -- show -------------------------------------------------------------
    if (!sw || sw === "show") {
      u.send(frame("Blood", [
        `  %chBlood:%cn ${cur}/${max}`,
        `  %chPer turn:%cn ${perTurn}  %cw(gen ${char.generation ?? 13})%cn`,
        `  %chBuffs:%cn ${formatBloodBuff(char)}`,
      ]));
      return;
    }

    // -- /buff ------------------------------------------------------------
    if (sw === "buff" || sw === "buff/clear") {
      if (sw === "buff/clear" || /^clear$/i.test(rest)) {
        const r = clearBloodBuff(char);
        if (!r.ok) {
          u.send(`%cr${r.message}%cn`);
          return;
        }
        char.bloodBuff = undefined;
        await saveChar(char);
        await unsetCharFields(char.id, ["bloodBuff"]);
        u.send(`%cg${r.message}%cn`);
        return;
      }
      const attr = parsePhysicalAttr(rest);
      if (!attr) {
        u.send("Usage: +blood/buff <strength|dexterity|stamina>");
        return;
      }
      const r = bloodBuffAttr(char, attr);
      if (!r.ok) {
        u.send(`%cr${r.message}%cn`);
        return;
      }
      await saveChar(char);
      u.send(`%cg${r.message}%cn`);
      emitPoolSpent({
        playerId: u.me.id,
        charId: char.id,
        pool: "blood",
        amount: 1,
        remaining: r.bloodLeft ?? 0,
        permanent: max,
      });
      await maybeHunger(u, char);
      return;
    }

    // -- /spend -----------------------------------------------------------
    if (sw === "spend") {
      const amount = parsePositiveInt(rest);
      if (amount === null) {
        u.send("Usage: +blood/spend <positive integer>");
        return;
      }
      if (amount > perTurn) {
        u.send(
          `%crYou can spend at most ${perTurn} Blood per turn ` +
            `(generation ${char.generation ?? 13}).%cn`,
        );
        return;
      }
      const result = spendPool(char, "blood", amount);
      if (!result.ok || result.remaining === undefined) {
        u.send(`%cr${result.message}%cn`);
        return;
      }
      char.bloodPool = result.remaining;
      await saveChar(char);
      u.send(result.message);
      emitPoolSpent({
        playerId: u.me.id,
        charId: char.id,
        pool: "blood",
        amount,
        remaining: result.remaining,
        permanent: max,
      });
      await maybeHunger(u, char);
      return;
    }

    // -- /heal and /heal/agg ----------------------------------------------
    if (sw === "heal" || sw === "heal/agg") {
      const agg =
        sw === "heal/agg" ||
        /^agg(?:ravated)?$/i.test(rest.split(/\s+/)[0] ?? "");
      const restAmt = agg && sw === "heal"
        ? rest.replace(/^agg(?:ravated)?\s*/i, "").trim()
        : rest;
      const amount = restAmt ? parsePositiveInt(restAmt) : 1;
      if (amount === null) {
        u.send(
          agg
            ? "Usage: +blood/heal/agg [<positive integer>]"
            : "Usage: +blood/heal [<positive integer>]",
        );
        return;
      }
      const result = agg
        ? bloodHealAgg(char, amount)
        : bloodHeal(char, amount);
      if (!result.ok) {
        u.send(`%cr${result.message}%cn`);
        return;
      }
      const spent = Math.max(0, cur - (result.bloodLeft ?? cur));
      await saveChar(char);
      u.send(`%cg${result.message}%cn`);
      emitPoolSpent({
        playerId: u.me.id,
        charId: char.id,
        pool: "blood",
        amount: spent,
        remaining: result.bloodLeft ?? 0,
        permanent: max,
      });
      await maybeHunger(u, char);
      return;
    }

    // -- /feed or /regain -------------------------------------------------
    if (sw === "feed" || sw === "regain") {
      const amount = rest ? parsePositiveInt(rest) : 1;
      if (amount === null) {
        u.send(`Usage: +blood/${sw} [<positive integer>]`);
        return;
      }
      const result = bloodFeed(char, amount);
      if (!result.ok || result.current === undefined) {
        u.send(`%cr${result.message}%cn`);
        return;
      }
      await saveChar(char);
      u.send(`%cg${result.message}%cn`);
      if (sw === "feed") {
        const who = u.util.displayName(u.me, u.me);
        poseRoom(
          u,
          `%cy${who}%cn feeds, color returning to cold flesh.`,
        );
      }
      emitPoolRegained({
        playerId: u.me.id,
        charId: char.id,
        pool: "blood",
        amount,
        remaining: result.current,
        permanent: max,
      });
      return;
    }

    u.send(`Unknown switch /${sw}. Try +help blood.`);
  },
});

/** Auto hunger frenzy when Blood hits 0. */
async function maybeHunger(u: IUrsamuSDK, char: IWoDChar): Promise<void> {
  const check = hungerFrenzyCheck(char);
  if (!check) return;
  u.send("%cyEmpty veins -- the Beast stirs (hunger).%cn");
  const { lines, entered } = resolveBeastCheck(char, check);
  for (const line of lines) u.send(line);
  if (!entered) return;
  await saveChar(char);
  const who = u.util.displayName(u.me, u.me);
  poseRoom(u, `%cr${who}%cn erupts in hunger frenzy!`);
  emitFrenzyEntered({
    actorId: u.me.id,
    targetId: u.me.id,
    charId: char.id,
    state: (char.frenzyState ?? "berserk") as "berserk" | "fox",
    trigger: "hunger",
    until: char.frenzyUntil ?? 0,
  });
}
