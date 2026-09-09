// commands/combo.ts -- +combo for WtA combo gifts: list, info, eligible,
// learn, use, forget. Mirrors the +gift command structure (frenzy gate,
// fail-closed pool spend, hook AFTER persist).
import { addCmd, gameHooks } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import "../hooks.ts";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import { createXpEntry } from "../db/xpDb.ts";
import {
  activateCombo,
  canLearnCombo,
  comboXpCost,
  eligibleCombos,
  forgetCombo,
  getComboGift,
  knowsCombo,
  learnCombo,
} from "../core/comboGifts.ts";
import { spendPool } from "../core/pools.ts";
import { WTA_COMBO_GIFTS } from "../splats/wta/data/comboGifts.ts";
import { lookupGift } from "../core/giftAction.ts";
import { frenzyBlockMessage } from "../core/frenzyGate.ts";
import { poseRoom } from "../core/poseRoom.ts";
import { shiftedDisplayName } from "../core/displayName.ts";
import { header, footer } from "../core/format.ts";
import type { IComboGiftDef, IWoDChar } from "../core/types.ts";
import { emitXpSpent } from "../hooks.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") || u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

function fmtComboRow(def: IComboGiftDef): string {
  const restr = def.restrictions.length
    ? ` %cw(${def.restrictions.join(",")})%cn`
    : "";
  return `  L${def.level} %ch${def.name}%cn  %cw[${def.slug}]%cn${restr}`;
}

async function renderCatalog(): Promise<string> {
  const lines: string[] = [header("Combo Gifts -- Catalog")];
  const all = Object.values(WTA_COMBO_GIFTS).sort((a, b) =>
    a.level - b.level || a.name.localeCompare(b.name)
  );
  if (all.length === 0) lines.push("  (No combo gifts defined.)");
  else for (const def of all) lines.push(fmtComboRow(def));
  lines.push(footer());
  return lines.join("%r");
}

async function renderKnown(char: IWoDChar): Promise<string> {
  const lines: string[] = [header("Combo Gifts Known")];
  const known = char.comboGifts ?? [];
  if (known.length === 0) {
    lines.push("  (You know no combo gifts.)");
  } else {
    const defs = known
      .map((s) => getComboGift(s))
      .filter((d): d is IComboGiftDef => !!d)
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    for (const def of defs) lines.push(fmtComboRow(def));
  }
  lines.push(footer());
  return lines.join("%r");
}

async function renderEligible(char: IWoDChar): Promise<string> {
  const lines: string[] = [header("Combo Gifts -- Eligible to Learn")];
  const elig = eligibleCombos(char);
  if (elig.length === 0) {
    lines.push("  (No combo gifts currently eligible.)");
  } else {
    for (const def of elig) {
      lines.push(`${fmtComboRow(def)}  %cy(${comboXpCost(def)} XP)%cn`);
    }
  }
  lines.push(footer());
  return lines.join("%r");
}

async function renderInfo(
  char: IWoDChar | null,
  def: IComboGiftDef,
): Promise<string> {
  const lines: string[] = [
    header(def.name),
    `  Slug:         ${def.slug}`,
    `  Level:        ${def.level}`,
    `  Restrictions: ${def.restrictions.length ? def.restrictions.join(", ") : "(open)"}`,
    `  XP cost:      ${comboXpCost(def)}`,
    "  Prereqs:",
  ];
  for (const p of def.prereqs) {
    const hit = lookupGift(p);
    const known = char && hit
      ? (char.gifts ?? []).some((g) =>
          g.toLowerCase() === hit.def.name.toLowerCase()
        )
      : false;
    const mark = known ? "%cgY%cn" : "%cr.%cn";
    const name = hit ? hit.def.name : p;
    lines.push(`    [${mark}] ${name}  %cw[${p}]%cn`);
  }
  if (def.action.roll) {
    lines.push(
      `  Roll:         ${def.action.roll.pool} (diff ${def.action.roll.difficulty ?? 6})`,
    );
  }
  const c = def.action.cost;
  if (c) {
    const parts: string[] = [];
    if (c.gnosis)    parts.push(`${c.gnosis} Gnosis`);
    if (c.willpower) parts.push(`${c.willpower} Willpower`);
    if (c.rage)      parts.push(`${c.rage} Rage`);
    lines.push(`  Cost:         ${parts.join(", ") || "(none)"}`);
  } else {
    lines.push(`  Cost:         ${def.level} Gnosis (default)`);
  }
  if (def.action.duration) lines.push(`  Duration:     ${def.action.duration}`);
  lines.push(`  Effect:       ${def.action.description}`);
  lines.push(footer());
  return lines.join("%r");
}

addCmd({
  name: "+combo",
  pattern: /^\+combo(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Werewolf",
  help: `+combo[/switch] [<arg>]  -- Werewolf combo gifts: list, learn, use.

SYNTAX
  +combo                      List combo gifts you know.
  +combo/list                 List the full combo-gift catalog.
  +combo/info <slug>          Details for a single combo gift.
  +combo/eligible             List combos you currently qualify to learn.
  +combo/learn <slug>         Spend XP to learn a combo (prereqs required).
  +combo/use <slug>           Activate a known combo gift.
  +combo/forget <slug>        (Staff) Remove a combo from your known list.

EXAMPLES
  +combo/list
  +combo/info cooking-the-books
  +combo/learn cooking-the-books
  +combo/use cooking-the-books

SEE ALSO: +help combo, +help gift`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    // /list -- catalog (no char required).
    if (sw === "list") {
      u.send(await renderCatalog());
      return;
    }

    // /info -- works without a char (read-only catalog details).
    if (sw === "info" && !arg) {
      u.send("Usage: +combo/info <slug>");
      return;
    }

    // From here, an owned character is required.
    const char = await findByPlayer(u.me.id);
    if (!char) { u.send("You have no character on file."); return; }
    if (char.splat !== "wta") {
      u.send("Only Garou (WtA) characters can use combo gifts.");
      return;
    }

    if (sw === "info") {
      const def = getComboGift(arg);
      if (!def) { u.send(`Unknown combo gift: ${arg}`); return; }
      u.send(await renderInfo(char, def));
      return;
    }

    if (sw === "eligible") {
      u.send(await renderEligible(char));
      return;
    }

    if (sw === "learn") {
      if (!arg) { u.send("Usage: +combo/learn <slug>"); return; }
      if (char.status !== "approved") {
        u.send("XP spending is only available on approved characters.");
        return;
      }
      const check = canLearnCombo(char, arg);
      if (!check.ok || !check.def) { u.send(check.reason); return; }
      const cost = comboXpCost(check.def);
      const remaining = char.xpTotal - char.xpSpent;
      if (cost > remaining) {
        u.send(`${check.def.name} costs ${cost} XP -- you have ${remaining}.`);
        return;
      }
      const res = learnCombo(char, arg);
      if (!res.ok) { u.send(res.message); return; }
      const ts = Date.now();
      char.xpSpent += cost;
      char.statLog.push({
        staffId: char.playerId,
        trait: `comboGifts.${check.def.slug}`,
        old: null,
        new: check.def.name,
        ts,
      });
      // Audit-trail entry in wod20th.xp -- parity with core/xp.ts spendXp().
      await createXpEntry({
        id: crypto.randomUUID(),
        charId: char.id,
        playerId: char.playerId,
        type: "spend",
        trait: `comboGifts.${check.def.slug}`,
        oldValue: 0,
        newValue: 1,
        amount: -cost,
        reason: `Learned combo gift ${check.def.name} (L${check.def.level}).`,
        ts,
      });
      await saveChar(char);
      emitXpSpent({
        playerId: u.me.id,
        charId: char.id,
        trait: `comboGifts.${check.def.slug}`,
        cost,
      });
      u.send(
        `%cgLearned %ch${check.def.name}%cn%cg (L${check.def.level}) for ` +
        `%ch${cost} XP%cn%cg. ${remaining - cost} XP remaining.%cn`,
      );
      return;
    }

    if (sw === "forget") {
      if (!isStaff(u)) { u.send("%crPermission denied.%cn"); return; }
      if (!arg) { u.send("Usage: +combo/forget <slug>"); return; }
      const res = forgetCombo(char, arg);
      if (!res.ok) { u.send(res.message); return; }
      await saveChar(char);
      u.send(`%cy${res.message}%cn`);
      return;
    }

    if (sw === "use") {
      if (!arg) { u.send("Usage: +combo/use <slug>"); return; }

      const block = frenzyBlockMessage(char, "activate a combo gift");
      if (block) { u.send(block); return; }

      const result = activateCombo(char, arg);
      if (!result.ok) { u.send(result.message); return; }

      const breakdown = result.costBreakdown ?? { gnosis: result.level ?? 1 };
      const spends: Array<{ pool: "gnosis" | "willpower" | "rage"; amt: number }> = [];
      if (breakdown.gnosis)    spends.push({ pool: "gnosis",    amt: breakdown.gnosis });
      if (breakdown.willpower) spends.push({ pool: "willpower", amt: breakdown.willpower });
      if (breakdown.rage)      spends.push({ pool: "rage",      amt: breakdown.rage });

      // Pre-flight check across ALL pools BEFORE spending any (fail-closed).
      for (const s of spends) {
        const pre = spendPool(char, s.pool, s.amt);
        if (!pre.ok) { u.send(pre.message); return; }
      }

      const spent: string[] = [];
      for (const s of spends) {
        const spend = spendPool(char, s.pool, s.amt);
        if (!spend.ok) { u.send(spend.message); return; }
        if (s.pool === "gnosis")    char.gnosisCurrent    = spend.remaining;
        if (s.pool === "willpower") char.willpowerCurrent = spend.remaining;
        if (s.pool === "rage")      char.rageCurrent      = spend.remaining;
        spent.push(`-${s.amt} ${s.pool[0].toUpperCase() + s.pool.slice(1)}`);
      }

      await saveChar(char);

      gameHooks.emit("wod20th:gift-used", {
        playerId: u.me.id,
        charId: char.id,
        slug: result.slug,
        cost: result.cost ?? 0,
        costBreakdown: breakdown,
        poolSize: result.poolSize,
        netSuccesses: result.roll?.netSuccesses,
        botch: result.roll?.botch,
      });

      const loginName = u.util.displayName(u.me, u.me);
      const seenAs = shiftedDisplayName(char, loginName);
      const costStr = spent.length ? spent.join(", ") : "no cost";
      u.send(
        `%cgYou unleash combo gift %ch${result.name}%cn%cg ` +
        `(level %cy${result.level}%cn%cg, ${costStr}).%cn`,
      );
      if (result.roll && result.poolLabel) {
        const r = result.roll;
        const outcome = r.botch
          ? "%crBOTCH%cn"
          : r.exceptional
            ? `%cgexceptional (${r.netSuccesses})%cn`
            : r.netSuccesses > 0
              ? `%cg${r.netSuccesses} success${r.netSuccesses === 1 ? "" : "es"}%cn`
              : "%cyfailure%cn";
        u.send(
          `  Roll: %cw${result.poolLabel}%cn (${r.pool}d, diff ${r.difficulty}) ` +
          `[${r.dice.join(",")}] -> ${outcome}`,
        );
      }
      if (result.action?.description) {
        u.send(`  %cwEffect:%cn ${result.action.description}`);
      }
      poseRoom(
        u,
        `%cy${seenAs}%cn weaves the combo gift %ch${result.name}%cn.`,
      );
      return;
    }

    if (sw) { u.send(`Unknown switch: /${sw}. See +help combo.`); return; }

    // No switch -- list known.
    u.send(await renderKnown(char));
    void knowsCombo; // tree-shaking guard for unused export
  },
});
