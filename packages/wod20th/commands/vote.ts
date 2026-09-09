// commands/vote.ts -- +vote <target>=<reason>
//
// Players award nominal XP to other players for great RP. Caps prevent
// circle-jerking:
//   - VOTE_XP_AMOUNT per vote (default 1)
//   - DAILY_VOTE_CAP votes per voter per day
//   - PAIR_COOLDOWN_MS between voting the same person (anti circle-jerk)
//   - MIN_REASON_LEN chars on the reason
//
// Switches:
//   +vote <target>=<reason>   Cast a vote.
//   +vote/log                 Show your recent votes.
//   +vote/status              Show daily cap and per-pair cooldowns.

import { addCmd, gameHooks } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import {
  DAILY_VOTE_CAP,
  DAILY_WINDOW_MS,
  MIN_POSES_FOR_VOTE,
  PER_PAIR_WEEKLY_LIMIT,
  VOTE_XP_AMOUNT,
  WEEKLY_WINDOW_MS,
  canVote,
  recordVote,
  votesForTargetThisWeek,
  votesToday,
} from "../core/vote.ts";
import { getPoseCount } from "../core/poseTracker.ts";
import { awardXp } from "../core/xp.ts";
import { header, divider, footer } from "../core/format.ts";

function relTime(ms: number): string {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

addCmd({
  name: "+vote",
  pattern: /^\+vote(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Roleplay",
  help: `+vote <target>=<reason>  -- Reward another character for great RP.

  Full help: +help vote

Examples:
  +help vote`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const rest = (u.cmd.args[1] ?? "").trim();

    const voter = await findByPlayer(u.me.id);
    if (!voter) { u.send("You have no character on file."); return; }
    if (voter.status !== "approved") {
      u.send("Your character must be approved before you can vote.");
      return;
    }

    const now = Date.now();

    // -- /log ----------------------------------------------------------------
    if (sw === "log") {
      const history = (voter.voteHistory ?? []).slice(-10).reverse();
      const lines: string[] = [header("Recent Votes Cast")];
      if (history.length === 0) {
        lines.push("  (none)");
      } else {
        for (const v of history) {
          const ago = relTime(now - v.ts);
          lines.push(`  %cy${ago} ago%cn -> %ch${v.targetCharId}%cn: ${v.reason}`);
        }
      }
      lines.push(footer());
      u.send(lines.join("%r"));
      return;
    }

    // -- /status -------------------------------------------------------------
    if (sw === "status") {
      const today = votesToday(voter, now);
      const remaining = Math.max(0, DAILY_VOTE_CAP - today.length);
      const lines: string[] = [header("Vote Status")];
      lines.push(`%chDaily cap:%cn  %cy${today.length}/${DAILY_VOTE_CAP}%cn  (${remaining} left today)`);
      if (today.length > 0) {
        const oldest = [...today].sort((a, b) => a.ts - b.ts)[0];
        const reset = oldest.ts + DAILY_WINDOW_MS - now;
        lines.push(`%chNext slot:%cn  in ${relTime(reset)}`);
      }
      // Per-target weekly counts (max PER_PAIR_WEEKLY_LIMIT each).
      const weekCutoff = now - WEEKLY_WINDOW_MS;
      const perTarget = new Map<string, number>();
      for (const v of voter.voteHistory ?? []) {
        if (v.ts < weekCutoff) continue;
        perTarget.set(v.targetCharId, (perTarget.get(v.targetCharId) ?? 0) + 1);
      }
      if (perTarget.size > 0) {
        lines.push(divider("Per-Target (this week)"));
        for (const [targetId, count] of perTarget) {
          const remaining = PER_PAIR_WEEKLY_LIMIT - count;
          const color = remaining <= 0 ? "%cr" : "%cy";
          lines.push(`  ${color}${targetId}%cn: ${count}/${PER_PAIR_WEEKLY_LIMIT} used (${remaining} left this week)`);
        }
      }
      lines.push(footer());
      u.send(lines.join("%r"));
      return;
    }

    // -- /all --------------------------------------------------------------
    if (sw === "all") {
      const reasonAll = rest.length > 0
        ? rest
        : "Great scene -- thanks for the RP.";
      if (reasonAll.length < 10) {
        u.send("Default reason is short -- pass your own as: +vote/all <reason>");
        return;
      }
      // Collect eligible targets from the current room.
      const poseCounts = (u.here?.state?.poseCounts as Record<string, number> | undefined) ?? {};
      const occupants  = (u.here?.contents ?? []) as Array<{ id: string; flags?: { has?: (f: string) => boolean }; name?: string }>;
      const cast: string[] = [];
      const skipped: string[] = [];

      for (const obj of occupants) {
        if (!obj?.id || obj.id === u.me.id) continue;
        if (!obj.flags?.has?.("player") || !obj.flags?.has?.("connected")) continue;
        const votee = await findByPlayer(obj.id);
        if (!votee || votee.status !== "approved") {
          skipped.push(`${obj.name ?? obj.id} (not approved)`);
          continue;
        }
        const poses = getPoseCount(poseCounts, obj.id);
        if (poses < MIN_POSES_FOR_VOTE) {
          skipped.push(`${obj.name ?? obj.id} (only ${poses}/${MIN_POSES_FOR_VOTE} poses)`);
          continue;
        }
        const c = canVote(voter, votee.id, reasonAll, now);
        if (!c.ok) {
          skipped.push(`${obj.name ?? obj.id} (${c.message})`);
          continue;
        }
        const result = await castOneVote(u, voter, votee, obj, reasonAll, now);
        if (result.ok) cast.push(obj.name ?? obj.id);
        else skipped.push(`${obj.name ?? obj.id} (${result.message})`);
      }

      const lines: string[] = [header("+vote/all")];
      if (cast.length > 0) {
        lines.push(`%cgVoted for ${cast.length}:%cn ${cast.join(", ")}`);
      } else {
        lines.push("%cyNo one eligible. Anyone notable in the scene must have at least " +
          `${MIN_POSES_FOR_VOTE} poses.%cn`);
      }
      if (skipped.length > 0) {
        lines.push(divider("Skipped"));
        for (const s of skipped) lines.push(`  %cx${s}%cn`);
      }
      lines.push(footer());
      u.send(lines.join("%r"));
      return;
    }

    if (sw && sw !== "") {
      u.send(`Unknown switch: /${sw}. See +help vote.`);
      return;
    }

    // -- cast a vote ---------------------------------------------------------
    const eq = rest.indexOf("=");
    if (eq < 0) { u.send("Usage: +vote <target>=<reason>"); return; }
    const targetArg = u.util.stripSubs(rest.slice(0, eq)).trim();
    const reason    = rest.slice(eq + 1).trim();

    if (!targetArg) { u.send("Usage: +vote <target>=<reason>"); return; }

    const targetObj = await u.util.target(u.me, targetArg, true);
    if (!targetObj) { u.send(`Target not found: ${targetArg}`); return; }

    const votee = await findByPlayer(targetObj.id);
    if (!votee) { u.send(`${u.util.displayName(targetObj, u.me)} has no character on file.`); return; }
    if (votee.status !== "approved") {
      u.send(`${u.util.displayName(targetObj, u.me)}'s character is not approved.`);
      return;
    }

    // Pose-count gate: target must have actually posed in the scene.
    const poseCounts = (u.here?.state?.poseCounts as Record<string, number> | undefined) ?? {};
    const poses = getPoseCount(poseCounts, targetObj.id);
    if (poses < MIN_POSES_FOR_VOTE) {
      u.send(`%cy${u.util.displayName(targetObj, u.me)} has only posed ${poses} time(s) here. ` +
        `Need ${MIN_POSES_FOR_VOTE} before you can vote for them.%cn`);
      return;
    }

    const check = canVote(voter, votee.id, reason, now);
    if (!check.ok) { u.send(`%cy${check.message}%cn`); return; }

    const result = await castOneVote(u, voter, votee, targetObj, reason, now);
    if (!result.ok) { u.send(`%cr${result.message}%cn`); return; }
    u.send(`%cgYou voted for ${u.util.displayName(targetObj, u.me)}.%cn (+${VOTE_XP_AMOUNT} XP to them)`);
    u.send(`%ch%cy${u.me.name} voted for you:%cn ${reason}  (+${VOTE_XP_AMOUNT} XP)`, targetObj.id);
  },
});

// Internal: cast a single vote (assumes all gates already passed).
// deno-lint-ignore no-explicit-any
async function castOneVote(u: any, voter: any, votee: any, voteeObj: any, reason: string, now: number) {
  try {
    const xpEntry = awardXp(votee, VOTE_XP_AMOUNT, `+vote from ${u.me.name}: ${reason}`, u.me.id);
    voter.statLog.push({
      staffId: u.me.id, trait: "vote.cast",
      old: null,
      new: { targetCharId: votee.id, reason, amount: VOTE_XP_AMOUNT },
      ts: now,
    });
    votee.statLog.push({
      staffId: u.me.id, trait: "vote.received",
      old: votee.xpTotal - VOTE_XP_AMOUNT, new: votee.xpTotal, ts: now,
    });
    const updatedVoter = recordVote(voter, votee.id, reason, now);
    Object.assign(voter, updatedVoter);
    await saveChar(voter);
    await saveChar(votee);
    gameHooks.emit("wod20th:vote-cast", {
      voterId: u.me.id, voterCharId: voter.id,
      voteeId: voteeObj.id, voteeCharId: votee.id,
      amount: VOTE_XP_AMOUNT, reason, ts: now,
      xpEntryId: xpEntry.id,
    });
    return { ok: true, message: "" };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
