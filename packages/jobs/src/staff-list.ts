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
import { runSelect } from "./select.ts";
import { listReports, runReport } from "./reports.ts";
import { cleanJobs, compressJobs } from "./staff-hygiene.ts";
import { isOverdue } from "./filter.ts";

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
date, sort, search, select, reports, compress, clean,
summary, catchup, silence, nospam, credits.

Examples:
  +jobs
  +jobs/select (new | overdue) & mine sort=due
  +jobs/reports open
  +jobs/compress`,
  exec: async (u: IUrsamuSDK) => {
    if (!isStaffFlags(u.me.flags)) {
      u.send(">JOBS: Staff only.");
      return;
    }
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = (u.cmd.args[1] ?? "").trim();

    if (sw === "credits") {
      u.send(
        "%ch>JOBS:%cn UrsaMU jobs 1.1 — Anomaly-style. " +
          "+help jobs · docs/ANOMALY.md",
      );
      return;
    }
    if (sw === "catchup") {
      await setJobsPrefs(u, { lastCatchup: Date.now() });
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
    if (sw === "select") {
      await doSelect(u, arg);
      return;
    }
    if (sw === "reports" || sw === "report") {
      if (!arg) {
        u.send(listReports());
        return;
      }
      const eq = arg.indexOf("=");
      const name = eq === -1 ? arg : arg.slice(0, eq).trim();
      const rarg = eq === -1 ? "" : arg.slice(eq + 1).trim();
      const base = await visibleOpenJobs(u);
      const all = await jobs.find({});
      u.send(runReport(
        name === "actby" ? all : base,
        name,
        rarg,
      ));
      return;
    }
    if (sw === "compress") {
      await compressJobs(u);
      return;
    }
    if (sw === "clean") {
      await cleanJobs(u);
      return;
    }
    if (sw === "summary") {
      await doSummary(u, arg);
      return;
    }

    // bare +jobs with saved JOBSELECT
    if (!sw && !arg) {
      const p = getJobsPrefs(u);
      if (p.jobSelect) {
        await doSelect(u, p.jobSelect);
        return;
      }
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

async function doSelect(
  u: IUrsamuSDK,
  arg: string,
): Promise<void> {
  const p = getJobsPrefs(u);
  let expr = arg;
  // select/save name=expr handled when arg starts with save
  if (arg.toLowerCase().startsWith("save ")) {
    const rest = arg.slice(5).trim();
    const eq = rest.indexOf("=");
    if (eq === -1) {
      u.send("Usage: +jobs/select save <name>=<expr>");
      return;
    }
    const name = rest.slice(0, eq).trim().toLowerCase();
    const e = rest.slice(eq + 1).trim();
    const named = { ...(p.jobSelectNamed ?? {}), [name]: e };
    await setJobsPrefs(u, { jobSelectNamed: named });
    u.send(`>JOBS: Saved select '${name}'.`);
    return;
  }
  if (arg.toLowerCase() === "list") {
    const named = p.jobSelectNamed ?? {};
    const keys = Object.keys(named);
    u.send(
      keys.length
        ? ">JOBS: " + keys.join(", ")
        : ">JOBS: No named selects.",
    );
    return;
  }
  if (arg.toLowerCase().startsWith("default ")) {
    const e = arg.slice(8).trim();
    await setJobsPrefs(u, {
      jobSelect: e === "clear" || e === "none" ? "" : e,
    });
    u.send(">JOBS: Default +jobs select updated.");
    return;
  }
  // named shortcut
  if (p.jobSelectNamed?.[arg.toLowerCase()]) {
    expr = p.jobSelectNamed[arg.toLowerCase()];
  }
  const base = await visibleOpenJobs(u);
  const r = runSelect(base, expr, u.me.id);
  if (r.error) {
    u.send(`>JOBS: select error: ${r.error}`);
    return;
  }
  if (!r.jobs.length) {
    u.send(">JOBS: No matching jobs.");
    return;
  }
  u.send(formatJobList(r.jobs, "Select").join("\n"));
}

async function doSummary(
  u: IUrsamuSDK,
  bucket: string,
): Promise<void> {
  const b = bucket.toUpperCase().trim();
  if (!b) {
    u.send("Usage: +jobs/summary <bucket>");
    return;
  }
  const base = await visibleOpenJobs(u);
  const list = base.filter(
    (j) => (j.bucket || j.category || "").toUpperCase() === b,
  );
  const od = list.filter((j) => isOverdue(j)).length;
  const nw = list.filter((j) =>
    j.status === "new" || j.progress === "new"
  ).length;
  u.send(
    `>JOBS: ${b} — open ${list.length}, new ${nw}, ` +
      `overdue ${od}`,
  );
}

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
