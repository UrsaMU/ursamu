// commands/renown.ts -- +renown command: award/lose renown and rank advancement.
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { divider, footer, header } from "../core/format.ts";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import {
  awardRenown,
  loseRenown,
  maybeAdvanceRank,
  nextRankRequirement,
  normaliseAuspice,
  RANK_NAMES,
  thresholdFor,
  type Auspice,
  type RenownTrack,
} from "../core/renown.ts";
import {
  emitRankAdvanced,
  emitRenownAwarded,
  emitRenownLost,
} from "../hooks.ts";

const TRACKS: RenownTrack[] = ["glory", "honor", "wisdom"];

function fmtReq(r: { glory: number; honor: number; wisdom: number }): string {
  return `${r.glory}/${r.honor}/${r.wisdom}`;
}

function isStaffUser(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

function parseTrackSpec(spec: string): { track: RenownTrack; amount: number } | string {
  const m = spec.match(/^(\w+)\s*:\s*(-?\d+)$/);
  if (!m) return "Expected <track>:<N>";
  const track = m[1].toLowerCase() as RenownTrack;
  if (!TRACKS.includes(track)) return `Unknown track "${m[1]}". Use glory, honor, or wisdom.`;
  const n = parseInt(m[2], 10);
  if (!Number.isInteger(n) || n < 1) return "Amount must be a positive integer.";
  return { track, amount: n };
}

async function renderRenown(_u: IUrsamuSDK, name: string, char: import("../core/types.ts").IWoDChar): Promise<string> {
  const perm = char.renown ?? { glory: 0, honor: 0, wisdom: 0 };
  const temp = char.renownTemp ?? { glory: 0, honor: 0, wisdom: 0 };
  const rank = char.rank ?? 1;
  const aus  = normaliseAuspice(char.auspice);
  const req  = nextRankRequirement(char);

  const lines: string[] = [
    header(`Renown -- ${name}`),
    `%chRank:%cn ${rank} (${RANK_NAMES[rank] ?? ""})` +
      (aus ? `   %chAuspice:%cn ${aus}` : "   %cy(auspice unset)%cn"),
    divider("Tracks"),
    `  %chGlory:%cn  temp ${temp.glory}  permanent ${perm.glory}`,
    `  %chHonor:%cn  temp ${temp.honor}  permanent ${perm.honor}`,
    `  %chWisdom:%cn temp ${temp.wisdom}  permanent ${perm.wisdom}`,
  ];
  if (rank < 5 && aus) {
    lines.push(divider("Next Rank"));
    lines.push(`  Rank ${req.rank} (${RANK_NAMES[req.rank]}) needs (cumulative perm):`);
    lines.push(`    Glory  ${req.have.glory}/${req.needed.glory}` +
               `   Honor ${req.have.honor}/${req.needed.honor}` +
               `   Wisdom ${req.have.wisdom}/${req.needed.wisdom}`);
  } else if (rank < 5) {
    lines.push(divider("Next Rank"));
    lines.push("  %cyAuspice not set -- rank cannot auto-advance.%cn");
  } else {
    lines.push(divider("Rank"));
    lines.push("  Elder (rank 5) -- maximum rank reached.");
  }
  lines.push(footer());
  return lines.join("%r");
}

addCmd({
  name: "+renown",
  pattern: /^\+renown(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Character",
  help: `+renown[/switch] [<args>]  -- Werewolf renown and rank.

Switches:
  (none)                          Show your renown, or another's (staff).
  /award <target>=<track>:<N> [reason]   (Staff) Award renown.
  /lose  <target>=<track>:<N> [reason]   (Staff) Remove renown.
  /list                            Show the rank threshold table.

Examples:
  +renown                          Show your own renown.
  +renown Alice                    (Staff) Show Alice's renown.
  +renown/award Alice=glory:2 brave deed
  +renown/lose  Bob=honor:1 oathbreaker

SEE ALSO: +help renown`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    // -- /list ---------------------------------------------------------------
    if (sw === "list") {
      const lines: string[] = [
        header("Rank Thresholds (per auspice)"),
        "  Cumulative PERMANENT renown required: Glory / Honor / Wisdom.",
        "",
      ];
      const auspices: Auspice[] = ["ragabash", "theurge", "philodox", "galliard", "ahroun"];
      for (const a of auspices) {
        lines.push(`  %ch${a.padEnd(9)}%cn` +
          `  R2 ${fmtReq(thresholdFor(a, 2))}` +
          `  R3 ${fmtReq(thresholdFor(a, 3))}` +
          `  R4 ${fmtReq(thresholdFor(a, 4))}` +
          `  R5 ${fmtReq(thresholdFor(a, 5))}`);
      }
      lines.push(footer());
      u.send(lines.join("%r"));
      return;
    }

    // -- /award and /lose (staff) -------------------------------------------
    if (sw === "award" || sw === "lose") {
      if (!isStaffUser(u)) { u.send("%crPermission denied.%cn"); return; }
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) {
        u.send(`Usage: +renown/${sw} <target>=<track>:<N> [reason]`);
        return;
      }
      const targetName = arg.slice(0, eqIdx).trim();
      const rest = arg.slice(eqIdx + 1).trim();
      // Split the spec from the (optional) reason at the first whitespace.
      const m = rest.match(/^(\S+)(?:\s+(.*))?$/);
      if (!m) { u.send(`Usage: +renown/${sw} <target>=<track>:<N> [reason]`); return; }
      const spec = m[1];
      const reason = (m[2] ?? "").trim();

      const target = await u.util.target(u.me, targetName, true);
      if (!target) { u.send("Target not found."); return; }
      if (!(await u.canEdit(u.me, target))) { u.send("%crPermission denied.%cn"); return; }

      const char = await findByPlayer(target.id);
      if (!char) { u.send(`${u.util.displayName(target, u.me)} has no character on file.`); return; }
      if (char.splat !== "wta") { u.send("Renown applies to Werewolf characters only."); return; }

      const parsed = parseTrackSpec(spec);
      if (typeof parsed === "string") { u.send(`%cr${parsed}%cn`); return; }
      const { track, amount } = parsed;

      const oldTemp = { ...(char.renownTemp ?? { glory: 0, honor: 0, wisdom: 0 }) };

      const result = sw === "award"
        ? awardRenown(char, track, amount)
        : loseRenown(char, track, amount);
      if (!result.ok) { u.send(`%cr${result.message}%cn`); return; }

      let rankUp: number | undefined;
      if (sw === "award") {
        const oldRank = char.rank ?? 1;
        const adv = maybeAdvanceRank(char);
        if (adv.advanced && adv.newRank) {
          rankUp = adv.newRank;
          emitRankAdvanced({
            charId: char.id,
            playerId: target.id,
            oldRank,
            newRank: adv.newRank,
          });
        }
      }

      (char.statLog ??= []).push({
        staffId: u.me.id,
        trait: `renown.${track}`,
        old: oldTemp[track],
        new: (char.renownTemp ?? oldTemp)[track],
        ts: Date.now(),
      });

      await saveChar(char);

      const targetDisplay = u.util.displayName(target, u.me);
      if (sw === "award") {
        emitRenownAwarded({
          staffId: u.me.id, targetId: target.id, charId: char.id,
          track, amount, reason, rankUp,
        });
        let msg = `%cg${targetDisplay} awarded ${amount} ${track} renown.%cn`;
        if (reason) msg += ` (${reason})`;
        if (rankUp) msg += ` %ch%cyRank advanced to ${rankUp} (${RANK_NAMES[rankUp]})!%cn`;
        u.send(msg);
        let pmsg = `%cgYou've been awarded %ch${amount} ${track} renown%cn%cg by staff.%cn`;
        if (reason) pmsg += ` Reason: ${reason}.`;
        if (rankUp) pmsg += ` %ch%cyYou advance to Rank ${rankUp} (${RANK_NAMES[rankUp]})!%cn`;
        u.send(pmsg, target.id);
      } else {
        emitRenownLost({
          staffId: u.me.id, targetId: target.id, charId: char.id,
          track, amount, reason,
        });
        let msg = `%cy${targetDisplay} loses ${amount} ${track} renown.%cn`;
        if (reason) msg += ` (${reason})`;
        u.send(msg);
        let pmsg = `%cyYou've lost %ch${amount} ${track} renown%cn%cy.%cn`;
        if (reason) pmsg += ` Reason: ${reason}.`;
        u.send(pmsg, target.id);
      }
      return;
    }

    // -- show (own or target) -----------------------------------------------
    if (sw && sw !== "show") {
      u.send(`Unknown switch: /${sw}.`);
      return;
    }

    // +renown <target>  -- staff inspection
    if (arg) {
      if (!isStaffUser(u)) { u.send("%crPermission denied.%cn"); return; }
      const target = await u.util.target(u.me, arg, true);
      if (!target) { u.send("Target not found."); return; }
      const char = await findByPlayer(target.id);
      if (!char) { u.send(`${u.util.displayName(target, u.me)} has no character on file.`); return; }
      if (char.splat !== "wta") { u.send("Renown applies to Werewolf characters only."); return; }
      u.send(await renderRenown(u, u.util.displayName(target, u.me), char));
      return;
    }

    // +renown -- own
    const char = await findByPlayer(u.me.id);
    if (!char) { u.send("No character found. Use +chargen/start to begin."); return; }
    if (char.splat !== "wta") { u.send("Renown applies to Werewolf characters only."); return; }
    u.send(await renderRenown(u, char.moniker || char.fullName || u.util.displayName(u.me, u.me), char));
  },
});
