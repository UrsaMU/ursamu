/**
 * Promote a chargen draft to a live sheet.
 * Used by +approve, job:closed (CGEN), and staff HTTP.
 */

import { dbojs, send, sessions } from "@ursamu/ursamu";
import type { CofdCgState } from "./state.ts";
import { sendCofdMail } from "../integrations/mail.ts";
import { dormRoomIdForTemplate } from "../support/dorm.ts";
import {
  templateSightFlags,
  type SightFlag,
} from "../support/sight.ts";
import {
  completeCgenJob,
  type JobTouchResult,
} from "../commands/approve_job.ts";

export type ApproveOpts = {
  playerId: string;
  staffId?: string;
  staffName?: string;
  notes?: string;
  /** Complete/archive CGEN job (default true). */
  completeJob?: boolean;
  /** Optional sheet when draft is gone (from job snapshot). */
  sheetOverride?: CofdCgState["sheet"] | null;
};

export type ApproveResult =
  | {
    ok: true;
    name: string;
    dormId: string | null;
    already: boolean;
    job: JobTouchResult | null;
  }
  | { ok: false; error: string };

function bareId(id: string): string {
  return String(id ?? "").replace(/^#/, "").trim();
}

function flagsOf(raw: unknown): Set<string> {
  if (raw instanceof Set) return raw as Set<string>;
  if (Array.isArray(raw)) return new Set(raw.map(String));
  return new Set(
    String(raw ?? "").split(/[,\s]+/).filter(Boolean),
  );
}

function flagsToStr(flags: Set<string>): string {
  return [...flags].join(" ");
}

async function setPlayerFlags(
  playerId: string,
  add: string[],
  remove: string[] = [],
): Promise<Set<string>> {
  const row = await dbojs.queryOne({ id: playerId });
  if (!row) return new Set();
  const flags = flagsOf(row.flags);
  for (const r of remove) flags.delete(r.toLowerCase());
  for (const a of add) flags.add(a.toLowerCase());
  // Preserve original casing loosely — store lowercase set joined
  await dbojs.modify({ id: playerId }, "$set", {
    flags: flagsToStr(flags),
  });
  return flags;
}

function playerName(row: {
  data?: Record<string, unknown>;
  name?: string;
}): string {
  const d = row.data || {};
  return String(d.name ?? row.name ?? "Unknown").trim() ||
    "Unknown";
}

function readCg(row: {
  data?: Record<string, unknown>;
  state?: Record<string, unknown>;
}): CofdCgState | null {
  const bag = (row.data?.cofd_cg != null
    ? row.data
    : row.state?.cofd_cg != null
    ? row.state
    : row.data) || {};
  const raw = (bag as Record<string, unknown>).cofd_cg;
  if (!raw || typeof raw !== "object") return null;
  return raw as CofdCgState;
}

function hasLiveSheet(row: {
  data?: Record<string, unknown>;
  state?: Record<string, unknown>;
}): boolean {
  return !!(row.data?.cofd || row.state?.cofd);
}

async function notifyPlayer(
  playerId: string,
  msg: string,
): Promise<void> {
  try {
    const socks = sessions.list()
      .filter((s) => {
        const a = (s as unknown as { actorId?: string }).actorId;
        return bareId(String(a ?? "")) === bareId(playerId);
      })
      .map((s) => s.socketId)
      .filter(Boolean);
    if (socks.length) send(socks, msg, {});
  } catch (e: unknown) {
    console.error("[cofd] approve notify failed:", e);
  }
}

/**
 * Promote draft → live sheet, set approved, mail + notify.
 */
export async function approvePlayer(
  opts: ApproveOpts,
): Promise<ApproveResult> {
  const playerId = bareId(opts.playerId);
  if (!playerId) {
    return { ok: false, error: "playerId required" };
  }

  const row = await dbojs.queryOne({ id: playerId });
  if (!row) {
    return { ok: false, error: "Player not found." };
  }

  const name = playerName(row as { data?: Record<string, unknown> });
  const flags = flagsOf(row.flags);
  const cg = readCg(row as {
    data?: Record<string, unknown>;
    state?: Record<string, unknown>;
  });

  const flagApproved = [...flags].some(
    (x) => String(x).toLowerCase() === "approved",
  );
  const hasLive = hasLiveSheet(row as {
    data?: Record<string, unknown>;
    state?: Record<string, unknown>;
  });

  // Already live + approved — idempotent success
  if (flagApproved && hasLive && !cg) {
    return {
      ok: true,
      name,
      dormId: null,
      already: true,
      job: null,
    };
  }

  // Draft sheet, or restore from job snapshot override
  let sheetSrc = cg?.sheet ?? opts.sheetOverride ?? null;
  if (!sheetSrc) {
    if (flagApproved && !hasLive) {
      return {
        ok: false,
        error:
          `${name} is flagged approved but has no live sheet ` +
          `and no draft to rebuild. Re-submit chargen.`,
      };
    }
    return {
      ok: false,
      error:
        `${name} has no chargen draft to approve.`,
    };
  }

  const sheet = { ...sheetSrc };
  if (!sheet.specialties) sheet.specialties = {};

  // Write live sheet and clear draft in one $set when possible
  const nextData = {
    ...((row.data && typeof row.data === "object")
      ? row.data as Record<string, unknown>
      : {}),
    cofd: sheet,
  };
  delete nextData.cofd_cg;
  await dbojs.modify({ id: playerId }, "$set", {
    data: nextData,
  });
  // Also unset path for adapters that deep-merge data
  try {
    await dbojs.modify({ id: playerId }, "$unset", {
      "data.cofd_cg": "",
    });
  } catch {
    /* optional */
  }

  // approved + template sight flags
  const sightAdd = templateSightFlags(sheet.template) as SightFlag[];
  await setPlayerFlags(playerId, ["approved", ...sightAdd], []);

  // Verify write landed (helps debug Character tab empties)
  const check = await dbojs.queryOne({ id: playerId });
  const checkData = (check as { data?: Record<string, unknown> })
    ?.data;
  if (!checkData?.cofd) {
    console.error(
      "[cofd] approve: data.cofd missing after write",
      playerId,
    );
    return {
      ok: false,
      error:
        "Approve write failed (sheet not stored). Check server logs.",
    };
  }
  // Dorm home (no teleport without full SDK)
  let dormId: string | null = dormRoomIdForTemplate(
    sheet.template,
  );
  if (dormId) {
    await dbojs.modify({ id: playerId }, "$set", {
      "data.home": dormId,
    });
  }

  const staffName = (opts.staffName || "Staff").trim() ||
    "Staff";
  const staffId = bareId(opts.staffId || "0") || "0";
  const notes = (opts.notes || "").trim();
  const doJob = opts.completeJob !== false;

  let job: JobTouchResult | null = null;
  if (doJob) {
    job = await completeCgenJob(
      cg?.submittedJob,
      playerId,
      staffId,
      staffName,
      notes,
    );
  }

  const dormNote = dormId
    ? `  Your freehold bunk is ready — type %chhome%cn.`
    : "";
  const liveMsg =
    `%chYour Chronicles of Darkness sheet has been ` +
    `approved by ${staffName}.%cn` +
    (notes ? ` Notes: ${notes}` : "") +
    `  Use %ch+sheet%cn or the Character page on the web.` +
    dormNote;
  await notifyPlayer(playerId, liveMsg);

  await sendCofdMail({
    to: playerId,
    subject: `Character approved: ${name}`,
    body: [
      `Your Chronicles of Darkness character sheet ` +
        `was approved by ${staffName}.`,
      job?.number != null
        ? `CGEN job: #${job.number} (completed)`
        : "",
      notes ? `\nStaff notes:\n${notes}` : "",
      dormId
        ? `\nYour home is the freehold dorm. Type: home`
        : "",
      ``,
      `Your live sheet is active.`,
      `In-game: +sheet`,
      `Web: open the Character page while signed in.`,
    ].filter(Boolean).join("\n"),
  });

  return {
    ok: true,
    name,
    dormId,
    already: false,
    job,
  };
}
