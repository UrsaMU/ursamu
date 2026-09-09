// commands/challenge.ts -- Formal Garou challenges (W20 Ch.2).
//
// Two Garou enter a structured contest. Non-combat types resolve by an
// opposed pool roll on +challenge/resolve; combat types (single-combat,
// klaive-duel, death-duel) arm a `pendingChallengeDuel` flag and resolve
// on the next landed +attack -- first blood ends it. Death-duels require
// sept-leader consent (+challenge/consent) before /resolve will fire.

import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { findById, findByPlayer, saveChar } from "../db/charDb.ts";
import {
  CHALLENGE_TYPES,
  getChallengeType,
  type IChallengeType,
} from "../splats/wta/data/challenges.ts";
import {
  createChallenge,
  findChallenge,
  findOpenByChar,
  findOpenByPair,
  saveChallenge,
  type IChallenge,
} from "../db/challengeDb.ts";
import { findPackById } from "../db/packDb.ts";
import { findSeptByPack } from "../db/septDb.ts";
import { isFrenzied } from "../core/frenzy.ts";
import { resolvePoolExpr, rollDice } from "../core/dice.ts";
import { appliedPool } from "../core/wounds.ts";
import { awardRenown, loseRenown } from "../core/renown.ts";
import { divider, footer, frame, header } from "../core/format.ts";
import { wieldedWeapons, getEqMeta } from "../core/eq.ts";
import { normaliseAuspice } from "../core/renownThresholds.ts";
import type { IWoDChar } from "../core/types.ts";

// deno-lint-ignore no-explicit-any
type AnyObj = any;

const MIN_REASON_LEN = 10;

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

function charLabel(c: IWoDChar | null): string {
  if (!c) return "(missing)";
  return c.moniker || c.fullName || c.deedName || c.id;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

/**
 * Resolve a challenge by its (possibly short) id. Falls back to a
 * prefix match if the short form is unique among the caller's open
 * challenges.
 */
async function resolveChallengeArg(
  charId: string,
  arg: string,
): Promise<IChallenge | null> {
  const trimmed = arg.trim();
  if (!trimmed) return null;
  const direct = await findChallenge(trimmed);
  if (direct) return direct;
  // Prefix match against the caller's open challenges.
  const open = await findOpenByChar(charId);
  const matches = open.filter((c) => c.id.startsWith(trimmed));
  if (matches.length === 1) return matches[0];
  return null;
}

/** Combat-typed flag the next +attack should consume. Reported to parent. */
interface IPendingChallengeDuel {
  challengeId: string;
  opponentCharId: string;
  setAt: number;
}

/**
 * Returns true when the caller is a recognised sept leader for the sept
 * whose pack the challenge participants belong to: either the sept's
 * named leader, or the alpha of any pack in the sept.
 */
async function isSeptLeaderFor(
  callerChar: IWoDChar,
  challenge: IChallenge,
): Promise<boolean> {
  const init = await findById(challenge.initiatorCharId);
  const tgt  = await findById(challenge.targetCharId);
  const packIds = [init?.packId, tgt?.packId].filter((x): x is string => !!x);
  if (packIds.length === 0) return false;
  for (const pid of packIds) {
    const sept = await findSeptByPack(pid);
    if (!sept) continue;
    if (sept.leader && sept.leader === callerChar.id) return true;
    for (const sPid of sept.packIds) {
      const pack = await findPackById(sPid);
      if (pack?.alpha === callerChar.id) return true;
    }
  }
  return false;
}

async function renderCatalog(): Promise<string> {
  const lines: string[] = [header("Formal Challenges")];
  for (const def of Object.values(CHALLENGE_TYPES)) {
    const tag = def.isCombat ? "combat" : "social";
    lines.push(
      `  %ch${def.name.padEnd(20)}%cn  %cw[${def.slug}]%cn  (${tag})  ` +
        `+${def.victoryReward.amount} ${def.victoryReward.track}`,
    );
  }
  lines.push(footer());
  return lines.join("%r");
}

async function renderInfo(def: IChallengeType): Promise<string> {
  const lines: string[] = [
    header(`Challenge: ${def.name}`),
    `  Slug:       ${def.slug}`,
    `  Pool:       ${def.pool || "(combat -- resolves via +attack)"}`,
    `  Difficulty: ${def.difficulty}`,
    `  Victory:    +${def.victoryReward.amount} ${def.victoryReward.track}`,
    `  Decline:    -${def.declineCost.amount} ${def.declineCost.track}`,
  ];
  if (def.requiresKlaive) lines.push("  Requires:   fetish weapon wielded by both");
  if (def.requiresSeptConsent) lines.push("  Requires:   sept-leader consent");
  if (def.bonusAuspice) lines.push(`  Bonus:      +1 die for ${def.bonusAuspice}`);
  lines.push(divider("Description"));
  lines.push(`  ${def.description}`);
  lines.push(footer());
  return lines.join("%r");
}

async function renderList(char: IWoDChar): Promise<string> {
  const open = await findOpenByChar(char.id);
  const lines: string[] = [header(`Your Open Challenges`)];
  if (open.length === 0) {
    lines.push("  (none)");
  } else {
    for (const c of open) {
      const def = getChallengeType(c.typeSlug);
      const init = await findById(c.initiatorCharId);
      const tgt  = await findById(c.targetCharId);
      const arrow = c.initiatorCharId === char.id ? "->" : "<-";
      lines.push(
        `  %cw[${shortId(c.id)}]%cn  ${charLabel(init)} ${arrow} ${charLabel(tgt)}  ` +
          `(${def?.name ?? c.typeSlug}, ${c.status})`,
      );
    }
  }
  lines.push(footer());
  return lines.join("%r");
}

/**
 * Roll a non-combat challenge pool for `char` against the given type.
 * Applies wound penalty and the bonusAuspice +1 die when applicable.
 */
function rollChallenge(char: IWoDChar, def: IChallengeType): {
  pool: number; netSuccesses: number; botch: boolean; dice: number[]; expr: string;
} {
  const r = resolvePoolExpr(char, def.pool);
  if (!r) {
    // Should not happen for canonical types; defensive zero-pool.
    const roll = rollDice(1, def.difficulty);
    return { ...roll, expr: def.pool };
  }
  const aus = normaliseAuspice(char.auspice);
  const bonus = def.bonusAuspice && aus === def.bonusAuspice ? 1 : 0;
  const applied = appliedPool(char, r.pool + bonus);
  const roll = rollDice(Math.max(1, applied.pool), def.difficulty);
  return { ...roll, expr: r.privLabel + (bonus ? ` +${bonus} auspice` : "") };
}

addCmd({
  name: "+challenge",
  pattern: /^\+challenge(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Werewolf",
  help: `+challenge[/switch] [<arg>]  -- Formal Garou contests.

SYNTAX
  +challenge                              List challenge types + your open.
  +challenge/list                         Same as no-switch.
  +challenge/info <type-slug>             Show type details.
  +challenge/issue <target>=<type>/<reason>
  +challenge/accept <id>                  Target accepts.
  +challenge/decline <id>                 Target declines (pays declineCost).
  +challenge/resolve <id>                 Resolve an accepted challenge.
  +challenge/withdraw <id>                Initiator withdraws.
  +challenge/consent <id>                 Sept leader/staff -- death-duel only.

SEE ALSO: +help challenge, +help sept`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    const char = await findByPlayer(u.me.id);

    // ----- catalog / list ----------------------------------------------------
    if (!sw || sw === "list") {
      u.send(await renderCatalog());
      if (char) u.send(await renderList(char));
      return;
    }

    if (sw === "info") {
      const def = getChallengeType(arg);
      if (!def) { u.send(`Unknown challenge type: ${arg}`); return; }
      u.send(await renderInfo(def));
      return;
    }

    // From here every switch needs a char on file.
    if (!char) { u.send("You have no character on file."); return; }

    // ----- issue ------------------------------------------------------------
    if (sw === "issue") {
      if (char.splat !== "wta") { u.send("Only Garou may issue formal challenges."); return; }
      if ((char.rank ?? 0) < 1) { u.send("You must be at least Rank 1 (Cliath) to issue a formal challenge."); return; }
      if (isFrenzied(char)) { u.send("%crYou cannot call a formal challenge while frenzied.%cn"); return; }

      // Parse: <target>=<type>/<reason>
      const eq = arg.indexOf("=");
      if (eq < 0) { u.send("Usage: +challenge/issue <target>=<type>/<reason>"); return; }
      const targetName = arg.slice(0, eq).trim();
      const rhs = arg.slice(eq + 1).trim();
      const slash = rhs.indexOf("/");
      if (slash < 0) { u.send("Usage: +challenge/issue <target>=<type>/<reason>"); return; }
      const typeSlug = rhs.slice(0, slash).trim().toLowerCase();
      const reason   = rhs.slice(slash + 1).trim();
      if (!targetName || !typeSlug || !reason) {
        u.send("Usage: +challenge/issue <target>=<type>/<reason>"); return;
      }
      if (reason.length < MIN_REASON_LEN) {
        u.send(`Reason must be at least ${MIN_REASON_LEN} characters.`); return;
      }
      const def = getChallengeType(typeSlug);
      if (!def) { u.send(`Unknown challenge type: ${typeSlug}`); return; }

      const tgtObj = await u.util.target(u.me, targetName, true);
      if (!tgtObj) { u.send(`Target not found: ${targetName}`); return; }
      if (tgtObj.id === u.me.id) { u.send("You cannot challenge yourself."); return; }

      // SAME-ROOM enforcement.
      const hereId = (u.here as AnyObj)?.id;
      const tgtLoc = (tgtObj as AnyObj)?.location;
      if (!hereId || tgtLoc !== hereId) {
        u.send("You must be in the same room as your challenger.");
        return;
      }

      const tgtChar = await findByPlayer(tgtObj.id);
      if (!tgtChar) { u.send("Target has no character on file."); return; }
      if (tgtChar.splat !== "wta") { u.send("Only Garou may be formally challenged."); return; }

      // No duplicate (initiator, target, type) while still open/accepted.
      const dupes = await findOpenByPair(char.id, tgtChar.id);
      if (dupes.some((c) => c.typeSlug === typeSlug)) {
        u.send("You already have an open challenge of that type against them.");
        return;
      }

      // Klaive duel: both must be wielding a fetish weapon.
      if (def.requiresKlaive) {
        const has = (h: AnyObj) =>
          wieldedWeapons(h).some((w) => getEqMeta(w).fetish === true);
        if (!has(u.me))   { u.send("You must wield a fetish weapon to issue a klaive-duel."); return; }
        if (!has(tgtObj)) { u.send("Your target must wield a fetish weapon for a klaive-duel."); return; }
      }

      const ch = await createChallenge(char.id, tgtChar.id, def.slug, reason);
      u.send(`%cgChallenge issued (${def.name}, id %cw${shortId(ch.id)}%cn%cg).%cn`);
      u.send(
        `%cy${charLabel(char)} formally challenges you to ${def.name}: ${reason} ` +
          `(%cw${shortId(ch.id)}%cn%cy -- /accept or /decline).%cn`,
        tgtObj.id,
      );
      return;
    }

    // ----- accept ------------------------------------------------------------
    if (sw === "accept") {
      const ch = await resolveChallengeArg(char.id, arg);
      if (!ch) { u.send("Challenge not found."); return; }
      if (ch.targetCharId !== char.id) { u.send("Only the target may accept."); return; }
      if (ch.status !== "open") { u.send(`Challenge is ${ch.status}.`); return; }
      ch.status = "accepted";
      ch.acceptedAt = Date.now();
      await saveChallenge(ch);
      const def = getChallengeType(ch.typeSlug);
      u.send(`%cgYou accept the ${def?.name ?? ch.typeSlug} challenge.%cn`);
      return;
    }

    // ----- decline -----------------------------------------------------------
    if (sw === "decline") {
      const ch = await resolveChallengeArg(char.id, arg);
      if (!ch) { u.send("Challenge not found."); return; }
      if (ch.targetCharId !== char.id) { u.send("Only the target may decline."); return; }
      if (ch.status !== "open") { u.send(`Challenge is ${ch.status}.`); return; }
      const def = getChallengeType(ch.typeSlug);
      if (def) {
        loseRenown(char, def.declineCost.track, def.declineCost.amount);
        await saveChar(char);
      }
      ch.status = "declined";
      await saveChallenge(ch);
      u.send(
        `%cyYou decline the challenge.` +
          (def ? ` -${def.declineCost.amount} temp ${def.declineCost.track} renown.` : "") +
          `%cn`,
      );
      return;
    }

    // ----- withdraw ----------------------------------------------------------
    if (sw === "withdraw") {
      const ch = await resolveChallengeArg(char.id, arg);
      if (!ch) { u.send("Challenge not found."); return; }
      if (ch.initiatorCharId !== char.id) { u.send("Only the initiator may withdraw."); return; }
      if (ch.status !== "open" && ch.status !== "accepted") {
        u.send(`Challenge is ${ch.status}.`); return;
      }
      const wasAccepted = ch.status === "accepted";
      ch.status = "withdrawn";
      await saveChallenge(ch);
      if (wasAccepted) {
        // Cowardice: -0.5 Honor. awardRenown/loseRenown only accept positive
        // integers, so apply temp Honor by direct mutation, capped at zero.
        const t = char.renownTemp ?? { glory: 0, honor: 0, wisdom: 0 };
        t.honor = Math.max(0, t.honor - 0.5);
        char.renownTemp = t;
        await saveChar(char);
        u.send("%cyYou withdraw the challenge after it was accepted -- cowardice (-0.5 temp Honor).%cn");
      } else {
        u.send("%cyYou withdraw the challenge.%cn");
      }
      return;
    }

    // ----- consent (death-duel) ---------------------------------------------
    if (sw === "consent") {
      const ch = await resolveChallengeArg(char.id, arg);
      if (!ch) { u.send("Challenge not found."); return; }
      const def = getChallengeType(ch.typeSlug);
      if (!def?.requiresSeptConsent) {
        u.send("Sept consent is only required for death-duels."); return;
      }
      if (ch.status !== "open" && ch.status !== "accepted") {
        u.send(`Challenge is ${ch.status}.`); return;
      }
      const allowed = isStaff(u) || await isSeptLeaderFor(char, ch);
      if (!allowed) { u.send("Only staff or a sept leader may consent."); return; }
      ch.septConsentBy = char.id;
      await saveChallenge(ch);
      u.send(`%cgConsent recorded for challenge %cw${shortId(ch.id)}%cn%cg.%cn`);
      return;
    }

    // ----- resolve -----------------------------------------------------------
    if (sw === "resolve") {
      const ch = await resolveChallengeArg(char.id, arg);
      if (!ch) { u.send("Challenge not found."); return; }
      if (ch.status !== "accepted") { u.send(`Challenge must be accepted first (currently ${ch.status}).`); return; }
      if (ch.initiatorCharId !== char.id && ch.targetCharId !== char.id && !isStaff(u)) {
        u.send("Only a participant or staff may resolve."); return;
      }
      const def = getChallengeType(ch.typeSlug);
      if (!def) { u.send("Unknown challenge type."); return; }
      const initChar = await findById(ch.initiatorCharId);
      const tgtChar  = await findById(ch.targetCharId);
      if (!initChar || !tgtChar) { u.send("Participants missing."); return; }

      // Death-duel sept consent gate.
      if (def.requiresSeptConsent && !ch.septConsentBy) {
        u.send("%crThis death-duel needs sept consent. A sept leader must run +challenge/consent first.%cn");
        return;
      }

      // -- Combat-typed: arm the pendingChallengeDuel flag on both chars ----
      if (def.isCombat) {
        const setAt = Date.now();
        // deno-lint-ignore no-explicit-any
        (initChar as any).pendingChallengeDuel = {
          challengeId: ch.id, opponentCharId: tgtChar.id, setAt,
        } as IPendingChallengeDuel;
        // deno-lint-ignore no-explicit-any
        (tgtChar as any).pendingChallengeDuel = {
          challengeId: ch.id, opponentCharId: initChar.id, setAt,
        } as IPendingChallengeDuel;
        await saveChar(initChar);
        await saveChar(tgtChar);
        u.send(
          `%cyThe duel is armed. The next landed +attack between ` +
            `${charLabel(initChar)} and ${charLabel(tgtChar)} resolves the ${def.name}.%cn`,
        );
        return;
      }

      // -- Non-combat: opposed pool roll ------------------------------------
      const a = rollChallenge(initChar, def);
      const b = rollChallenge(tgtChar, def);
      const aNet = a.netSuccesses;
      const bNet = b.netSuccesses;
      // Defender's burden: ties go to the initiator.
      const winner = aNet >= bNet ? initChar : tgtChar;
      const loser  = winner === initChar ? tgtChar : initChar;

      awardRenown(winner, def.victoryReward.track, def.victoryReward.amount);
      ch.status = "resolved";
      ch.winnerCharId = winner.id;
      ch.resolvedAt = Date.now();
      await saveChar(winner);
      await saveChallenge(ch);

      const summary = frame(`Challenge: ${def.name}`, [
        `  ${charLabel(initChar).padEnd(20)} ${a.pool}d -> ${aNet} net  (${a.expr})`,
        `  ${charLabel(tgtChar).padEnd(20)} ${b.pool}d -> ${bNet} net  (${b.expr})`,
        `  %cgWinner: ${charLabel(winner)}%cn (+${def.victoryReward.amount} ${def.victoryReward.track})`,
      ]);
      u.send(summary);
      // Best-effort notify the other side
      const _loser = loser; void _loser;
      return;
    }

    u.send(`Unknown switch: /${sw}. See +help challenge.`);
  },
});
