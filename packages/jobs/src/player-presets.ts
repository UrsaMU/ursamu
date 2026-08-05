/**
 * Player shortcuts: +bug, +typo, +pitch, +myjobs/nospam.
 */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { jobs, getNextJobNumber, isValidBucket } from "./db.ts";
import { jobHooks } from "./hooks.ts";
import type { IJob } from "./types.ts";
import {
  getJobsPrefs,
  setJobsPrefs,
  toggleNum,
} from "./prefs.ts";

function callerName(u: IUrsamuSDK): string {
  return (u.me.state?.moniker as string) ||
    (u.me.state?.name as string) ||
    u.me.name ||
    "Unknown";
}

async function quickRequest(
  u: IUrsamuSDK,
  bucket: string,
  titlePrefix: string,
  arg: string,
): Promise<void> {
  const text = u.util.stripSubs(arg).trim();
  if (!text) {
    u.send(`Usage: +${bucket.toLowerCase()} <text>`);
    return;
  }
  const b = bucket.toUpperCase();
  if (!isValidBucket(b)) {
    // Allow even if not in list — register on fly for TYPO/BUG
    // fall through with SPHERE if invalid
  }
  const bucketUse = isValidBucket(b) ? b : "SPHERE";
  const title = text.length > 40
    ? `${titlePrefix}: ${text.slice(0, 37)}...`
    : `${titlePrefix}: ${text}`;
  const num = await getNextJobNumber();
  const now = Date.now();
  const job: IJob = {
    id: `job-${num}`,
    number: num,
    title,
    bucket: bucketUse,
    status: "open",
    progress: "new",
    submittedBy: u.me.id,
    submitterName: callerName(u),
    description: text,
    comments: [],
    additionalPlayers: [],
    tags: [],
    published: true,
    createdAt: now,
    updatedAt: now,
  };
  await jobs.create(job);
  await jobHooks.emit("job:created", job);
  u.send(
    `>JOBS: ${titlePrefix} #${num} filed to ${bucketUse}.`,
  );
}

addCmd({
  name: "+bug",
  pattern: /^\+bug\s+(.*)/i,
  lock: "connected",
  category: "Jobs",
  help: `+bug <text>  — File a bug report (BUG bucket).

Examples:
  +bug Crash when opening +sheet.`,
  exec: async (u) => {
    await quickRequest(u, "BUG", "Bug", u.cmd.args[0] ?? "");
  },
});

addCmd({
  name: "+typo",
  pattern: /^\+typo\s+(.*)/i,
  lock: "connected",
  category: "Jobs",
  help: `+typo <text>  — File a typo report (TYPO bucket).

Examples:
  +typo Room 12 desc has 'teh'.`,
  exec: async (u) => {
    await quickRequest(u, "TYPO", "Typo", u.cmd.args[0] ?? "");
  },
});

addCmd({
  name: "+pitch",
  pattern: /^\+pitch\s+(.*)/i,
  lock: "connected",
  category: "Jobs",
  help: `+pitch <text>  — Pitch an idea (SUGGESTION bucket).

Examples:
  +pitch Monthly salon night.`,
  exec: async (u) => {
    await quickRequest(
      u,
      "SUGGESTION",
      "Pitch",
      u.cmd.args[0] ?? "",
    );
  },
});

