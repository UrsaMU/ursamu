/**
 * +jobs list switches (Anomaly +jobs/* filters).
 */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { jobs } from "./db.ts";
import {
  isStaffFlags,
  formatJobList,
} from "./format.ts";
import { canStaffSeeBucket } from "./job-utils.ts";
import { filterJobs } from "./filter.ts";
import {
  getJobsPrefs,
  setJobsPrefs,
  toggleNum,
} from "./prefs.ts";
import type { IJob } from "./types.ts";

async function visibleOpenJobs(u: IUrsamuSDK): Promise<IJob[]> {
  const all = await jobs.find({});
  const isSU = u.me.flags.has("superuser");
  const out: IJob[] = [];
  for (const j of all) {
    if (j.status === "closed" || j.status === "cancelled") continue;
    if (
      await canStaffSeeBucket(
        u.me.id,
        j.bucket ?? j.category ?? "",
        isSU,
      )
    ) {
      out.push(j);
    }
  }
  return out;
}

async function sendFiltered(
  u: IUrsamuSDK,
  kind: string,
  arg: string,
  title: string,
): Promise<void> {
  const base = await visibleOpenJobs(u);
  const list = filterJobs(base, kind, arg, u.me.id);
  list.sort((a, b) => a.number - b.number);
  if (!list.length) {
    u.send(">JOBS: No matching jobs.");
    return;
  }
  u.send(formatJobList(list, title).join("\n"));
}

addCmd({
  name: "+jobs",
  pattern: /^\+jobs(?:\/(\S+))?\s*(.*)/i,
  lock: "connected builder+",
  category: "Jobs",
  help: `+jobs[/<filter>] [<arg>]  — Staff job lists (Anomaly-style).

Filters: all, mine, new, overdue, from, who, list, pri, due,
date, sort, search, catchup, silence, nospam, credits.

Examples:
  +jobs
  +jobs/mine
  +jobs/from Alice
  +jobs/search dragon
  +jobs/catchup`,
  exec: async (u: IUrsamuSDK) => {
    if (!isStaffFlags(u.me.flags)) {
      u.send(">JOBS: Staff only.");
      return;
    }
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = (u.cmd.args[1] ?? "").trim();

    if (sw === "credits") {
      u.send(
        "%ch>JOBS:%cn UrsaMU jobs — Anomaly-style task " +
          "tracker. See +help jobs and docs/ANOMALY.md.",
      );
      return;
    }

    if (sw === "catchup") {
      // Mark all visible jobs as "seen" via updatedAt touch on prefs
      const p = getJobsPrefs(u);
      await setJobsPrefs(u, {
        ...p,
        // store last catchup time
      });
      await u.db.modify(u.me.id, "$set", {
        "state.jobs.lastCatchup": Date.now(),
      });
      u.send(">JOBS: Caught up — new markers cleared.");
      return;
    }

    if (sw === "silence") {
      await toggleSilence(u, arg);
      return;
    }
    if (sw === "nospam") {
      await toggleNospam(u, arg);
      return;
    }

    const titles: Record<string, string> = {
      "": "Jobs",
      all: "All Jobs",
      mine: "My Jobs",
      new: "New Jobs",
      overdue: "Overdue Jobs",
      pri: "Jobs by Priority",
      esc: "Jobs by Priority",
      due: "Jobs by Due",
      date: "Jobs by Date",
      sort: "Jobs by Bucket",
      search: "Search Results",
      from: "Jobs From",
      who: "Jobs Assigned",
      list: "Bucket Jobs",
    };
    const kind = sw || "all";
    await sendFiltered(
      u,
      kind,
      arg,
      titles[kind] ?? `Jobs / ${kind}`,
    );
  },
});

async function toggleSilence(
  u: IUrsamuSDK,
  arg: string,
): Promise<void> {
  const p = getJobsPrefs(u);
  if (!arg) {
    await setJobsPrefs(u, { silence: !p.silence });
    u.send(
      `>JOBS: Global silence ${!p.silence ? "ON" : "OFF"}.`,
    );
    return;
  }
  const n = parseInt(arg, 10);
  if (!isNaN(n)) {
    await setJobsPrefs(u, {
      silenceJobs: toggleNum(p.silenceJobs, n),
    });
    u.send(`>JOBS: Toggled silence on job #${n}.`);
    return;
  }
  const b = arg.toUpperCase();
  const list = new Set(p.silenceBuckets ?? []);
  if (list.has(b)) list.delete(b);
  else list.add(b);
  await setJobsPrefs(u, { silenceBuckets: [...list] });
  u.send(`>JOBS: Toggled silence on bucket ${b}.`);
}

async function toggleNospam(
  u: IUrsamuSDK,
  arg: string,
): Promise<void> {
  const p = getJobsPrefs(u);
  if (!arg) {
    await setJobsPrefs(u, { nospam: !p.nospam });
    u.send(
      `>JOBS: Global nospam ${!p.nospam ? "ON" : "OFF"}.`,
    );
    return;
  }
  const n = parseInt(arg, 10);
  if (isNaN(n)) {
    u.send("Usage: +jobs/nospam [<job #>]");
    return;
  }
  await setJobsPrefs(u, {
    nospamJobs: toggleNum(p.nospamJobs, n),
  });
  u.send(`>JOBS: Toggled nospam on job #${n}.`);
}
