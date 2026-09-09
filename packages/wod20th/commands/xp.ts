// commands/xp.ts -- +xp command for XP award and spending.
import { addCmd } from "@ursamu/ursamu";
import { divider, footer, header } from "../core/format.ts";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import { createXpEntry, findXpByChar, xpSummary } from "../db/xpDb.ts";
import { spendXp, spendXpOnGift, spendXpOnRite, awardXp, xpCost, isAffinityGift, giftXpCost, riteXpCost } from "../core/xp.ts";
import { resolveTrait } from "../core/resolver.ts";
import { WTA_GIFTS } from "../splats/wta/data/gifts.ts";
import { WTA_RITES } from "../splats/wta/data/rites.ts";
import { emitXpSpent } from "../hooks.ts";

addCmd({
  name: "+xp",
  pattern: /^\+xp(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Character",
  help: `+xp[/<switch>] [<args>]  -- XP management (approved characters only).

  Full help: +help xp

Examples:
  +help xp`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = (u.cmd.args[1] ?? "").trim();

    const isStaff = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");

    // -- Staff: /award ---------------------------------------------------------
    if (sw === "award") {
      if (!isStaff) { u.send("Permission denied."); return; }
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) { u.send("Usage: +xp/award <target>=<amount> <reason>"); return; }
      const targetName = u.util.stripSubs(arg.slice(0, eqIdx)).trim();
      const rest       = arg.slice(eqIdx + 1).trim();
      const spaceIdx   = rest.indexOf(" ");
      if (spaceIdx === -1) { u.send("Usage: +xp/award <target>=<amount> <reason>"); return; }
      const amount = parseInt(rest.slice(0, spaceIdx), 10);
      const reason = u.util.stripSubs(rest.slice(spaceIdx + 1)).trim();
      if (isNaN(amount) || amount < 1) { u.send("Amount must be a positive integer."); return; }
      if (!reason) { u.send("Reason is required."); return; }
      const target = await u.util.target(u.me, targetName, true);
      if (!target) { u.send("Target not found."); return; }
      const targetChar = await findByPlayer(target.id);
      if (!targetChar) { u.send(`${u.util.displayName(target, u.me)} has no character.`); return; }
      const entry = awardXp(targetChar, amount, reason, u.me.id);
      await saveChar(targetChar);
      await createXpEntry(entry);
      u.send(`%cg${u.util.displayName(target, u.me)} awarded ${amount} XP.%cn (${reason}) Balance: ${targetChar.xpTotal - targetChar.xpSpent} remaining.`);
      u.send(`%cgYou've been awarded %ch${amount} XP%cn%cg by staff. Reason: ${reason}. Balance: ${targetChar.xpTotal - targetChar.xpSpent} XP.%cn`, target.id);
      return;
    }

    // -- Staff: /set (correction) -----------------------------------------------
    if (sw === "set") {
      if (!isStaff) { u.send("Permission denied."); return; }
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) { u.send("Usage: +xp/set <target>=<total> <reason>"); return; }
      const targetName = u.util.stripSubs(arg.slice(0, eqIdx)).trim();
      const rest       = arg.slice(eqIdx + 1).trim();
      const spaceIdx   = rest.indexOf(" ");
      if (spaceIdx === -1) { u.send("Usage: +xp/set <target>=<total> <reason>"); return; }
      const newTotal = parseInt(rest.slice(0, spaceIdx), 10);
      const reason   = u.util.stripSubs(rest.slice(spaceIdx + 1)).trim();
      if (isNaN(newTotal) || newTotal < 0 || newTotal > 9999) { u.send("Total must be between 0 and 9999."); return; }
      const target = await u.util.target(u.me, targetName, true);
      if (!target) { u.send("Target not found."); return; }
      const targetChar = await findByPlayer(target.id);
      if (!targetChar) { u.send(`${u.util.displayName(target, u.me)} has no character.`); return; }
      const diff = newTotal - targetChar.xpTotal;
      targetChar.xpTotal = newTotal;
      await saveChar(targetChar);
      await createXpEntry({
        id: crypto.randomUUID(),
        charId: targetChar.id,
        playerId: target.id,
        type: "award",
        amount: diff,
        reason: `[Staff correction] ${reason}`,
        staffId: u.me.id,
        ts: Date.now(),
      });
      u.send(`XP total for ${u.util.displayName(target, u.me)} set to ${newTotal} (${diff >= 0 ? "+" : ""}${diff}). Reason: ${reason}`);
      return;
    }

    // Remaining switches require the player's own character
    const char = await findByPlayer(u.me.id);
    if (!char) {
      u.send("No character found. Use +chargen/start to begin.");
      return;
    }

    // -- /spend ----------------------------------------------------------------
    if (sw === "spend") {
      if (!arg) { u.send("Usage: +xp/spend <trait>"); return; }
      const trait = u.util.stripSubs(arg).trim();
      const result = spendXp(char, trait);
      if (!result.ok) { u.send(`%cr${result.message}%cn`); return; }
      await saveChar(char);
      if (result.entry) await createXpEntry(result.entry);
      emitXpSpent({
        playerId: u.me.id, charId: char.id,
        trait: result.entry?.trait ?? trait,
        cost: result.cost ?? 0,
        newRating: result.newValue,
      });
      u.send(result.message);
      return;
    }

    // -- /gift -----------------------------------------------------------------
    if (sw === "gift") {
      if (!arg) { u.send("Usage: +xp/gift <name>"); return; }
      const name = u.util.stripSubs(arg).trim();
      const result = spendXpOnGift(char, name);
      if (!result.ok) { u.send(`%cr${result.message}%cn`); return; }
      await saveChar(char);
      if (result.entry) await createXpEntry(result.entry);
      emitXpSpent({
        playerId: u.me.id, charId: char.id,
        trait: result.entry?.trait ?? `gifts.${name}`,
        cost: result.cost ?? 0,
      });
      u.send(result.message);
      return;
    }

    // -- /rite -----------------------------------------------------------------
    if (sw === "rite") {
      if (!arg) { u.send("Usage: +xp/rite <slug>"); return; }
      const slug = u.util.stripSubs(arg).trim();
      const result = spendXpOnRite(char, slug);
      if (!result.ok) { u.send(`%cr${result.message}%cn`); return; }
      await saveChar(char);
      if (result.entry) await createXpEntry(result.entry);
      emitXpSpent({
        playerId: u.me.id, charId: char.id,
        trait: result.entry?.trait ?? `rites.${slug}`,
        cost: result.cost ?? 0,
      });
      u.send(result.message);
      return;
    }

    // -- /cost or /preview -----------------------------------------------------
    if (sw === "cost" || sw === "preview") {
      if (!arg) { u.send(`Usage: +xp/${sw} <trait>`); return; }
      const trait = u.util.stripSubs(arg).trim();

      // Try gift first
      const giftKey = trait.toLowerCase();
      const giftDef = WTA_GIFTS[giftKey]
        ?? Object.values(WTA_GIFTS).find((g) => g.name.toLowerCase() === giftKey);
      if (giftDef) {
        const aff = isAffinityGift(char, giftDef);
        const cost = giftXpCost(giftDef.level, aff);
        u.send(`Learning %ch${giftDef.name}%cn (L${giftDef.level}, ${aff ? "affinity" : "out-of-pool"}) costs %ch${cost} XP%cn. You have ${char.xpTotal - char.xpSpent} XP.`);
        return;
      }

      // Try rite
      const riteDef = WTA_RITES[giftKey];
      if (riteDef) {
        const cost = riteXpCost(riteDef.level);
        u.send(`Learning %ch${riteDef.name}%cn (L${riteDef.level}) costs %ch${cost} XP%cn. You have ${char.xpTotal - char.xpSpent} XP.`);
        return;
      }

      const res = resolveTrait(char, trait);
      if (!res.found) { u.send(`Unknown trait "${trait}".`); return; }
      const cost = xpCost(char, res.field);
      if (cost === 0) { u.send(`"${trait}" cannot be raised with XP.`); return; }
      const current = (() => {
        const v = res.field.split(".").reduce<unknown>((acc, k) =>
          acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined, char);
        return res.field.startsWith("attributes.") ? `${1 + ((v as number) ?? 0)}` : String((v as number) ?? 0);
      })();
      u.send(`Raising %ch${trait}%cn from ${current} costs %ch${cost} XP%cn. You have ${char.xpTotal - char.xpSpent} XP.`);
      return;
    }

    // -- /log ------------------------------------------------------------------
    if (sw === "log") {
      const entries = await findXpByChar(char.id);
      if (entries.length === 0) { u.send("No XP history."); return; }
      const lines: string[] = [header(" XP Log ")];
      for (const e of entries) {
        const date = new Date(e.ts).toISOString().slice(0, 10);
        const sign = e.amount >= 0 ? `%cg+${e.amount}%cn` : `%cr${e.amount}%cn`;
        const detail = e.trait ? ` (${e.trait})` : "";
        lines.push(`  ${date}  ${sign.padEnd(8)}  ${e.reason}${detail}`);
      }
      const sum = await xpSummary(char.id);
      lines.push(divider("Totals"));
      lines.push(`  Total awarded: %ch${sum.total}%cn  Spent: %ch${sum.spent}%cn  Remaining: %ch%cg${sum.remaining}%cn`);
      lines.push(footer());
      u.send(lines.join("%r"));
      return;
    }

    // -- No switch: balance + recent -------------------------------------------
    const sum = await xpSummary(char.id);
    const recent = (await findXpByChar(char.id)).slice(-5);
    const lines: string[] = [
      header(" XP Balance "),
      `  Total: %ch${sum.total}%cn  Spent: %ch${sum.spent}%cn  Remaining: %ch%cg${sum.remaining}%cn`,
    ];
    if (recent.length > 0) {
      lines.push(divider("Recent"));
      for (const e of recent) {
        const date = new Date(e.ts).toISOString().slice(0, 10);
        const sign = e.amount >= 0 ? `%cg+${e.amount}%cn` : `%cr${e.amount}%cn`;
        lines.push(`  ${date}  ${sign}  ${e.reason}`);
      }
    }
    lines.push(footer());
    u.send(lines.join("%r"));
  },
});
