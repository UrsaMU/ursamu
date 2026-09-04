/**
 * +approve / +deny / +unapprove — staff CGEN review.
 */
import { addCmd, type IUrsamuSDK } from "@ursamu/mush";
import {
  approvePlayer,
  unapprovePlayer,
} from "../chargen/approve_core.ts";
import {
  commentCgenJob,
  parseTargetAndNotes,
} from "../chargen/job_helpers.ts";
import { readCg } from "../chargen/state.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

addCmd({
  name: "+approve",
  pattern: /^\+approve(?:\/(\S+))?\s*(.*)/i,
  lock: "connected admin+",
  category: "Dnd",
  help: `+approve <player>[=notes]  -- Approve a submitted sheet.

Examples:
  +approve Alice
  +approve Bob=Looks great

See: +help approve`,
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) {
      u.send("Permission denied.");
      return;
    }
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const { who, notes } = parseTargetAndNotes(arg);
    if (!who) {
      u.send("Usage: +approve <player>[=notes]");
      return;
    }
    const target = await u.util.target(u.me, who, true);
    if (!target) {
      u.send(`No player matches '${who}'.`);
      return;
    }

    const result = await approvePlayer({
      playerId: target.id,
      staffId: u.me.id,
      staffName: u.util.displayName(u.me, u.me),
      notes,
      completeJob: true,
      u,
      target,
    });

    if (!result.ok) {
      u.send(`%cr${result.error}%cn`);
      return;
    }
    if (result.already) {
      u.send(`${result.name} is already approved.`);
      return;
    }

    const jobNote = result.job?.completed
      ? ` CGEN #${result.job.number} closed.`
      : result.job?.error
      ? ` %cyJob: ${result.job.error}%cn`
      : "";
    u.send(
      `%ch%cgAPPROVE>>%cn ${result.name}'s sheet is live.` +
        jobNote,
    );
  },
});

addCmd({
  name: "+deny",
  pattern: /^\+deny(?:\/(\S+))?\s*(.*)/i,
  lock: "connected admin+",
  category: "Dnd",
  help: `+deny <player>=<reason>  -- Return a CGEN draft.

Examples:
  +deny Alice=Fix ability scores
  +deny Bob=Missing background feat

See: +help approve`,
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) {
      u.send("Permission denied.");
      return;
    }
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const { who, notes } = parseTargetAndNotes(arg);
    if (!who || !notes) {
      u.send("Usage: +deny <player>=<reason>");
      return;
    }
    const target = await u.util.target(u.me, who, true);
    if (!target) {
      u.send(`No player matches '${who}'.`);
      return;
    }

    const cg = readCg(target);
    if (!cg) {
      u.send("No chargen draft to deny.");
      return;
    }

    const staffName = u.util.displayName(u.me, u.me);
    const job = await commentCgenJob(
      cg.submittedJob,
      target.id,
      u.me.id,
      staffName,
      notes,
    );

    const cleared = {
      ...cg,
      isSubmitted: false,
      submittedAt: undefined,
    };
    if (job.number != null) cleared.submittedJob = job.number;
    await u.db.modify(target.id, "$set", {
      "data.dnd_cg": cleared,
    });

    u.send(
      `%ch%cyDENY>>%cn ${u.util.displayName(target, u.me)} ` +
        `returned for revision.` +
        (job.number != null ? ` (CGEN #${job.number})` : ""),
    );
    u.send(
      `%ch%cyCG>>%cn Your sheet was returned by ${staffName}.\n` +
        `Reason: ${notes}\n` +
        `Fix with %ch+cg%cn, then %ch+cg/submit%cn again.`,
      target.id,
    );
  },
});

addCmd({
  name: "+unapprove",
  pattern: /^\+unapprove\s+(.*)/i,
  lock: "connected admin+",
  category: "Dnd",
  help: `+unapprove <player>  -- Remove approved flag.

Examples:
  +unapprove Alice

See: +help approve`,
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) {
      u.send("Permission denied.");
      return;
    }
    const who = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    if (!who) {
      u.send("Usage: +unapprove <player>");
      return;
    }
    const target = await u.util.target(u.me, who, true);
    if (!target) {
      u.send(`No player matches '${who}'.`);
      return;
    }
    const r = await unapprovePlayer(target.id, u);
    if (!r.ok) {
      u.send(`%cr${r.error}%cn`);
      return;
    }
    u.send(
      `%ch%cyUNAPPROVE>>%cn Removed approved from ${r.name}.`,
    );
  },
});
