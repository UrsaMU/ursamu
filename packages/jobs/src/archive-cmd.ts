// ─── Staff command: +archive ──────────────────────────────────────────────────

import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { jobArchive } from "./db.ts";
import { isStaffFlags, header, divider, footer, formatTimeShort, formatDate } from "./format.ts";

addCmd({
  name: "+archive",
  pattern: /^\+archive(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  help: `+archive[/<switch>] [<args>]  — View and manage the job archive (staff only).

Switches:
  /purge <#>         Permanently delete one archived job. (superuser)
  /purgeall CONFIRM  Delete all archived jobs. (superuser)

Examples:
  +archive             List all archived jobs.
  +archive 5           View archived job #5.
  +archive/purge 5     Permanently delete archived job #5.`,
  exec: async (u: IUrsamuSDK) => {
    if (!isStaffFlags(u.me.flags)) { u.send(">JOBS: Staff only."); return; }

    const sw  = (u.cmd.args[0] || "").toLowerCase().trim();
    const arg = (u.cmd.args[1] || "").trim();

    if (!sw && !arg) {
      const archived = await jobArchive.find({});
      if (archived.length === 0) { u.send(">JOBS: No archived jobs."); return; }
      archived.sort((a, b) => b.number - a.number);
      const lines = [
        header("Archived Jobs"),
        `${"#".padEnd(5)}${"Bucket".padEnd(12)}${"Title".padEnd(30)}${"Status".padEnd(12)}Date`,
        divider(),
        ...archived.map((j) =>
          `${String(j.number).padEnd(5)}${(j.bucket || j.category || "???").padEnd(12)}${j.title.slice(0, 29).padEnd(30)}${j.status.padEnd(12)}${formatDate(j.updatedAt)}`
        ),
        divider(),
        `${archived.length} archived job${archived.length === 1 ? "" : "s"}.`,
      ];
      u.send(lines.join("\n"));
      return;
    }

    if (!sw && arg || sw === "read") {
      const num = parseInt(sw === "read" ? arg : arg, 10);
      if (isNaN(num)) { u.send("Usage: +archive <#>"); return; }
      const archived = await jobArchive.find({});
      const job = archived.find((j) => j.number === num);
      if (!job) { u.send(`>JOBS: No archived job #${num} found.`); return; }
      const lines = [
        header(`Archived Job #${job.number}`),
        ` Title:     ${job.title}`,
        ` Bucket:    ${job.bucket}`,
        ` Submitted: ${job.submitterName} on ${formatDate(job.createdAt)}`,
        ` Closed by: ${job.closedByName || "Unknown"}`,
        ` Status:    ${job.status}`,
        divider(),
        job.description,
      ];
      if (job.comments.length > 0) {
        lines.push(divider(), header("Comments"));
        for (const c of job.comments) {
          lines.push(`%ch%cy${c.authorName}%cn [${formatTimeShort(c.timestamp)}]: ${c.text}`);
        }
      }
      lines.push(footer());
      u.send(lines.join("\n"));
      return;
    }

    if (sw === "purge") {
      if (!u.me.flags.has("superuser")) { u.send(">JOBS: Superuser only."); return; }
      const num = parseInt(arg, 10);
      if (isNaN(num)) { u.send("Usage: +archive/purge <#>"); return; }
      const archived = await jobArchive.find({});
      const job = archived.find((j) => j.number === num);
      if (!job) { u.send(`>JOBS: No archived job #${num} found.`); return; }
      await jobArchive.delete({ id: job.id });
      u.send(`>JOBS: Archived job #${num} permanently deleted.`);
      return;
    }

    if (sw === "purgeall") {
      if (!u.me.flags.has("superuser")) { u.send(">JOBS: Superuser only."); return; }
      if (arg !== "CONFIRM") { u.send(">JOBS: Type '+archive/purgeall CONFIRM' to delete ALL archived jobs."); return; }
      const archived = await jobArchive.find({});
      for (const j of archived) await jobArchive.delete({ id: j.id });
      u.send(`>JOBS: ${archived.length} archived jobs permanently deleted.`);
      return;
    }

    u.send(">JOBS: Archive commands:");
    u.send("  +archive                  - list archived jobs");
    u.send("  +archive <#>              - view archived job");
    u.send("  +archive/purge <#>        - delete archived job");
    u.send("  +archive/purgeall CONFIRM - delete all archived jobs");
  },
});
