// commands/litany.ts -- +litany browse/charge/uphold/dismiss/withdraw.
//
// The Litany of the Garou is the thirteen-law social contract of the
// People (W20 pp.25-26). Garou file charges against one another for
// breaches; staff judges. Upheld charges cost the accused permanent
// renown on the relevant track; dismissed charges cost the accuser a
// small Honor penalty (anti-frivolous-charge tax).

import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { findById, findByPlayer, saveChar } from "../db/charDb.ts";
import {
  createCharge,
  findAllCharges,
  findCharge,
  findChargesByTarget,
  findOpenChargesByAccuser,
  saveCharge,
  withdrawCharge,
  type ILitanyCharge,
} from "../db/litanyDb.ts";
import {
  allLaws,
  getLaw,
  type ILitanyLaw,
} from "../splats/wta/data/litany.ts";
import { isFrenzied } from "../core/frenzy.ts";
import { divider, footer, header } from "../core/format.ts";
import type { IWoDChar } from "../core/types.ts";
import { loseRenown, maybeAdvanceRank } from "../core/renown.ts";

const MIN_REASON_LEN = 10;
/** Anti-frivolous tax for dismissed accusations -- 0.5 temp Honor. */
const DISMISS_HONOR_COST = 0.5;

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

function shortName(c: IWoDChar | null, fallback: string): string {
  if (!c) return fallback;
  return c.moniker || c.fullName || c.deedName || fallback;
}

function statusBadge(s: ILitanyCharge["status"]): string {
  switch (s) {
    case "pending":   return "%cypending%cn";
    case "upheld":    return "%crupheld%cn";
    case "dismissed": return "%cgdismissed%cn";
    case "withdrawn": return "%cwwithdrawn%cn";
  }
}

async function renderList(): Promise<string> {
  const lines: string[] = [
    header("The Litany of the Garou"),
    "  Thirteen laws bind the People. Use +litany/info <slug> for detail.",
    "",
  ];
  for (const law of allLaws()) {
    const sev = law.severity.padEnd(5);
    lines.push(`  %ch${law.slug.padEnd(7)}%cn ${sev}  ${law.name}`);
  }
  lines.push(footer());
  return lines.join("%r");
}

async function renderLaw(law: ILitanyLaw): Promise<string> {
  const lines: string[] = [
    header(`${law.slug} -- ${law.name}`),
    `  Severity: %ch${law.severity}%cn`,
    `  Penalty (on uphold): -${law.penalty.amount} ${law.penalty.track} renown`,
    divider("Text"),
  ];
  // Wrap text crudely at ~74 cols.
  const words = law.text.split(/\s+/);
  let cur = "  ";
  for (const w of words) {
    if (cur.length + w.length + 1 > 74) {
      lines.push(cur);
      cur = "  " + w;
    } else {
      cur = cur === "  " ? cur + w : cur + " " + w;
    }
  }
  if (cur.trim()) lines.push(cur);
  lines.push(footer());
  return lines.join("%r");
}

async function renderPending(rows: ILitanyCharge[], title: string): Promise<string> {
  const lines: string[] = [header(title)];
  if (rows.length === 0) {
    lines.push("  (No charges on record.)");
    lines.push(footer());
    return lines.join("%r");
  }
  for (const c of rows) {
    const accuser = await findById(c.accuserCharId);
    const target = await findById(c.targetCharId);
    const law = getLaw(c.lawSlug);
    lines.push(
      `  %ch${c.id.slice(0, 8)}%cn  ${statusBadge(c.status)}  ` +
      `${law ? law.name : c.lawSlug}`,
    );
    lines.push(
      `    accuser: ${shortName(accuser, c.accuserCharId)}` +
      `   target: ${shortName(target, c.targetCharId)}`,
    );
    lines.push(`    reason: ${c.reason}`);
  }
  lines.push(footer());
  return lines.join("%r");
}

/**
 * Apply renown penalty for an upheld charge. Drains temp first (down to 0),
 * then bites into permanent renown -- canon "Loss of Renown" is permanent
 * (W20 p.135). Writes a statLog entry per touched field.
 */
function applyUpholdPenalty(
  char: IWoDChar,
  track: "glory" | "honor" | "wisdom",
  amount: number,
  staffId: string,
): { tempBefore: number; tempAfter: number; permBefore: number; permAfter: number } {
  const temp = (char.renownTemp ??= { glory: 0, honor: 0, wisdom: 0 });
  const perm = (char.renown ??= { glory: 0, honor: 0, wisdom: 0 });
  const tempBefore = temp[track];
  const permBefore = perm[track];

  let remaining = amount;
  // loseRenown only reduces temp (and floors at 0). Use it for the temp leg
  // so we share the canonical path, then drain permanent ourselves.
  if (Number.isInteger(remaining) && remaining > 0 && temp[track] > 0) {
    const drainFromTemp = Math.min(remaining, temp[track]);
    loseRenown(char, track, drainFromTemp);
    remaining -= drainFromTemp;
  }
  if (remaining > 0) {
    perm[track] = Math.max(0, perm[track] - remaining);
  }

  (char.statLog ??= []).push({
    staffId,
    trait: `renown.${track}`,
    old: { temp: tempBefore, perm: permBefore },
    new: { temp: temp[track], perm: perm[track] },
    ts: Date.now(),
  });
  return {
    tempBefore, tempAfter: temp[track],
    permBefore, permAfter: perm[track],
  };
}

addCmd({
  name: "+litany",
  pattern: /^\+litany(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Werewolf",
  help: `+litany[/switch] [<args>]  -- The thirteen laws of the Garou.

  Full help: +help litany

Examples:
  +help litany`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    // -- /list (default) ----------------------------------------------------
    if (!sw || sw === "list") {
      u.send(await renderList());
      return;
    }

    // -- /info <slug> -------------------------------------------------------
    if (sw === "info") {
      if (!arg) { u.send("Usage: +litany/info <law-slug>"); return; }
      const law = getLaw(arg);
      if (!law) { u.send(`No such law: ${arg}. Try +litany/list.`); return; }
      u.send(await renderLaw(law));
      return;
    }

    // -- /pending [<target>] ------------------------------------------------
    if (sw === "pending") {
      let charId: string;
      let label: string;
      if (arg) {
        if (!isStaff(u)) {
          // Allow self by name too, but a non-staff /pending on someone else
          // is fine -- charges are public matters. Keep open.
        }
        const tgt = await u.util.target(u.me, arg, true);
        if (!tgt) { u.send(`Target not found: ${arg}`); return; }
        const tc = await findByPlayer(tgt.id);
        if (!tc) { u.send(`${u.util.displayName(tgt, u.me)} has no character.`); return; }
        charId = tc.id;
        label = `Charges -- ${shortName(tc, tgt.name ?? "?")}`;
      } else {
        const self = await findByPlayer(u.me.id);
        if (!self) { u.send("You have no character on file."); return; }
        charId = self.id;
        label = `Charges -- ${shortName(self, u.me.name ?? "?")}`;
      }
      const rows = await findChargesByTarget(charId);
      u.send(await renderPending(rows, label));
      return;
    }

    // -- /charge <target>=<slug>/<reason> ----------------------------------
    if (sw === "charge") {
      const accuser = await findByPlayer(u.me.id);
      if (!accuser) { u.send("You have no character on file."); return; }
      if (accuser.splat !== "wta") {
        u.send("%crOnly the Garou may invoke the Litany.%cn");
        return;
      }
      if ((accuser.rank ?? 0) < 1) {
        u.send("%crYou lack the standing (Rank 1+) to file Litany charges.%cn");
        return;
      }
      if (isFrenzied(accuser)) {
        u.send("%crYou cannot file charges while frenzied.%cn");
        return;
      }
      const eq = arg.indexOf("=");
      if (eq < 0) {
        u.send("Usage: +litany/charge <target>=<law-slug>/<reason>");
        return;
      }
      const targetName = arg.slice(0, eq).trim();
      const rhs = arg.slice(eq + 1).trim();
      const slash = rhs.indexOf("/");
      if (slash < 0) {
        u.send("Usage: +litany/charge <target>=<law-slug>/<reason>");
        return;
      }
      const slug = rhs.slice(0, slash).trim().toLowerCase();
      const reason = rhs.slice(slash + 1).trim();
      if (!targetName || !slug) {
        u.send("Usage: +litany/charge <target>=<law-slug>/<reason>");
        return;
      }
      if (reason.length < MIN_REASON_LEN) {
        u.send(`%crReason must be at least ${MIN_REASON_LEN} characters.%cn`);
        return;
      }
      const law = getLaw(slug);
      if (!law) { u.send(`No such law: ${slug}. Try +litany/list.`); return; }

      const tgt = await u.util.target(u.me, targetName, true);
      if (!tgt) { u.send(`Target not found: ${targetName}`); return; }
      const tchar = await findByPlayer(tgt.id);
      if (!tchar) { u.send(`${u.util.displayName(tgt, u.me)} has no character.`); return; }
      if (tchar.splat !== "wta") {
        u.send("%crCharges may only be brought against Garou.%cn");
        return;
      }
      if (tchar.id === accuser.id) {
        u.send("%crYou cannot charge yourself.%cn");
        return;
      }

      // Reject duplicate open (accuser, target, law) charge.
      const open = await findOpenChargesByAccuser(accuser.id);
      if (open.some((c) => c.targetCharId === tchar.id && c.lawSlug === law.slug)) {
        u.send(`%crYou already have an open ${law.slug} charge against ${u.util.displayName(tgt, u.me)}.%cn`);
        return;
      }

      const charge = await createCharge(accuser.id, tchar.id, law.slug, reason);
      u.send(
        `%cgCharge filed:%cn ${law.name} against ${u.util.displayName(tgt, u.me)}.` +
        `  id: %ch${charge.id.slice(0, 8)}%cn`,
      );
      u.send(
        `%cyYou have been charged under ${law.slug} (${law.name}) ` +
        `by ${shortName(accuser, u.me.name ?? "?")}.%cn  ` +
        `Reason: ${reason}`,
        tgt.id,
      );
      return;
    }

    // -- /uphold <id>  (staff) ---------------------------------------------
    if (sw === "uphold") {
      if (!isStaff(u)) { u.send("%crPermission denied.%cn"); return; }
      if (!arg) { u.send("Usage: +litany/uphold <id>"); return; }
      const charge = await resolveChargeByPrefix(arg);
      if (!charge) { u.send(`No charge matching "${arg}".`); return; }
      if (charge.status !== "pending") {
        u.send(`%crCharge is already ${charge.status}.%cn`);
        return;
      }
      const law = getLaw(charge.lawSlug);
      if (!law) { u.send(`%crCharge references unknown law "${charge.lawSlug}".%cn`); return; }

      const tchar = await findById(charge.targetCharId);
      if (!tchar) { u.send("Target character missing from DB."); return; }

      const result = applyUpholdPenalty(tchar, law.penalty.track, law.penalty.amount, u.me.id);
      // Permanent loss can drop the char below their current rank threshold,
      // but rank does NOT auto-demote in canon. Still call maybeAdvanceRank()?
      // No -- penalties never advance.  Leave rank untouched; staff may /lose
      // more if dramatic demotion is desired.
      void maybeAdvanceRank; // referenced to keep import honest

      await saveChar(tchar);

      charge.status = "upheld";
      charge.resolvedAt = Date.now();
      charge.resolverCharId = u.me.id;
      await saveCharge(charge);

      u.send(
        `%cgCharge upheld:%cn ${law.name}.  ` +
        `${shortName(tchar, charge.targetCharId)} loses ` +
        `${law.penalty.amount} ${law.penalty.track} renown ` +
        `(temp ${result.tempBefore}->${result.tempAfter}, ` +
        `perm ${result.permBefore}->${result.permAfter}).`,
      );
      return;
    }

    // -- /dismiss <id>  (staff) ---------------------------------------------
    if (sw === "dismiss") {
      if (!isStaff(u)) { u.send("%crPermission denied.%cn"); return; }
      if (!arg) { u.send("Usage: +litany/dismiss <id>"); return; }
      const charge = await resolveChargeByPrefix(arg);
      if (!charge) { u.send(`No charge matching "${arg}".`); return; }
      if (charge.status !== "pending") {
        u.send(`%crCharge is already ${charge.status}.%cn`);
        return;
      }
      // Frivolous-accusation tax: 0.5 temp Honor off the accuser. Fractional
      // loseRenown is rejected by the canonical path; write direct + statLog.
      const accuser = await findById(charge.accuserCharId);
      if (accuser) {
        const temp = (accuser.renownTemp ??= { glory: 0, honor: 0, wisdom: 0 });
        const before = temp.honor;
        temp.honor = Math.max(0, +(temp.honor - DISMISS_HONOR_COST).toFixed(2));
        (accuser.statLog ??= []).push({
          staffId: u.me.id,
          trait: "renown.honor",
          old: before,
          new: temp.honor,
          ts: Date.now(),
        });
        await saveChar(accuser);
      }

      charge.status = "dismissed";
      charge.resolvedAt = Date.now();
      charge.resolverCharId = u.me.id;
      await saveCharge(charge);

      u.send(
        `%cyCharge dismissed.%cn ${accuser ? shortName(accuser, charge.accuserCharId) : "Accuser"} ` +
        `loses ${DISMISS_HONOR_COST} temp Honor (frivolous accusation).`,
      );
      return;
    }

    // -- /withdraw <id>  (accuser only) -------------------------------------
    if (sw === "withdraw") {
      if (!arg) { u.send("Usage: +litany/withdraw <id>"); return; }
      const charge = await resolveChargeByPrefix(arg);
      if (!charge) { u.send(`No charge matching "${arg}".`); return; }
      if (charge.status !== "pending") {
        u.send(`%crCharge is already ${charge.status}.%cn`);
        return;
      }
      const self = await findByPlayer(u.me.id);
      if (!self || self.id !== charge.accuserCharId) {
        u.send("%crOnly the accuser may withdraw a charge.%cn");
        return;
      }
      await withdrawCharge(charge.id, self.id);
      u.send(`%cyCharge withdrawn.%cn (${charge.lawSlug})`);
      return;
    }

    u.send(`Unknown switch /${sw}. See +help litany.`);
  },
});

/**
 * Resolve a charge by full id OR 8-character prefix. Prefix mode is for
 * usability since rendered ids show the first 8 chars.
 */
async function resolveChargeByPrefix(s: string): Promise<ILitanyCharge | null> {
  const direct = await findCharge(s);
  if (direct) return direct;
  const all = await findAllCharges();
  const hits = all.filter((c) => c.id.startsWith(s));
  if (hits.length === 1) return hits[0];
  return null;
}

// Test-only exports.
export const _testing = { isStaff, applyUpholdPenalty, MIN_REASON_LEN, DISMISS_HONOR_COST };
