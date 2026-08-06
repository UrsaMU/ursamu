/**
 * Full character wipe — live sheet, chargen draft, approval,
 * and splat sight flags. Used by staff +cg/wipe and self +cg/reset.
 */

import { dbojs, send, sessions } from "@ursamu/mush";
import { initCgState } from "./state.ts";
import { SIGHT_FLAGS } from "../support/sight.ts";
import {
  commentCgenJob,
  type JobTouchResult,
} from "../commands/approve_job.ts";
import { sendCofdMail } from "../integrations/mail.ts";

export type WipeOpts = {
  playerId: string;
  staffId?: string;
  staffName?: string;
  reason?: string;
  /** Leave a fresh +cg draft (default true). */
  startDraft?: boolean;
  /** Notify target (default true). */
  notify?: boolean;
};

export type WipeResult =
  | {
    ok: true;
    name: string;
    hadLive: boolean;
    hadDraft: boolean;
    wasApproved: boolean;
    job: JobTouchResult | null;
  }
  | { ok: false; error: string };

function bareId(id: string): string {
  return String(id ?? "").replace(/^#/, "").trim();
}

function flagsOf(raw: unknown): Set<string> {
  if (raw instanceof Set) {
    return new Set(
      [...raw].map((s) => String(s).toLowerCase()),
    );
  }
  if (Array.isArray(raw)) {
    return new Set(raw.map(String).map((s) => s.toLowerCase()));
  }
  return new Set(
    String(raw ?? "")
      .split(/[,\s]+/)
      .filter(Boolean)
      .map((s) => s.toLowerCase()),
  );
}

function flagsToStr(flags: Set<string>): string {
  return [...flags].join(" ");
}

function playerName(row: {
  data?: Record<string, unknown>;
  name?: string;
}): string {
  const d = row.data || {};
  return String(d.name ?? row.name ?? "Unknown").trim() ||
    "Unknown";
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
    console.error("[cofd] wipe notify failed:", e);
  }
}

/**
 * Wipe live sheet + chargen + approved + sight flags.
 * Optionally seeds a fresh +cg draft.
 */
export async function wipeCharacter(
  opts: WipeOpts,
): Promise<WipeResult> {
  const playerId = bareId(opts.playerId);
  if (!playerId) {
    return { ok: false, error: "playerId required" };
  }

  const row = await dbojs.queryOne({ id: playerId });
  if (!row) {
    return { ok: false, error: "Player not found." };
  }

  const name = playerName(
    row as { data?: Record<string, unknown>; name?: string },
  );
  const dataBag = (row.data && typeof row.data === "object")
    ? row.data as Record<string, unknown>
    : {};
  const stateBag = (row as { state?: Record<string, unknown> })
    .state;
  const cgRaw = dataBag.cofd_cg ?? stateBag?.cofd_cg;
  const hadLive = !!(dataBag.cofd || stateBag?.cofd);
  const hadDraft = !!(
    cgRaw && typeof cgRaw === "object" &&
    (cgRaw as { sheet?: unknown }).sheet
  );
  const flags = flagsOf(row.flags);
  const wasApproved = flags.has("approved");

  if (!hadLive && !hadDraft && !wasApproved) {
    return {
      ok: false,
      error:
        `${name} has no live sheet, chargen draft, ` +
        `or approved flag to wipe.`,
    };
  }

  const jobNum = cgRaw && typeof cgRaw === "object"
    ? (cgRaw as { submittedJob?: number }).submittedJob
    : undefined;

  const startDraft = opts.startDraft !== false;
  const nextData = { ...dataBag };
  delete nextData.cofd;
  if (startDraft) {
    nextData.cofd_cg = initCgState();
  } else {
    delete nextData.cofd_cg;
  }

  await dbojs.modify({ id: playerId }, "$set", {
    data: nextData,
  });
  try {
    await dbojs.modify({ id: playerId }, "$unset", {
      "data.cofd": "",
      ...(startDraft ? {} : { "data.cofd_cg": "" }),
    });
  } catch {
    /* adapters may ignore path unset */
  }

  flags.delete("approved");
  for (const f of SIGHT_FLAGS) flags.delete(f);
  await dbojs.modify({ id: playerId }, "$set", {
    flags: flagsToStr(flags),
  });

  const staffName = (opts.staffName || "Staff").trim() ||
    "Staff";
  const staffId = bareId(opts.staffId || "0") || "0";
  const reason = (opts.reason || "").trim();

  let job: JobTouchResult | null = null;
  if (jobNum != null) {
    job = await commentCgenJob(
      jobNum,
      playerId,
      staffId,
      staffName,
      reason
        ? `Character wiped by staff. ${reason}`
        : "Character wiped by staff — full reset.",
    );
  }

  if (opts.notify !== false) {
    const why = reason ? ` Reason: ${reason}` : "";
    await notifyPlayer(
      playerId,
      `%chYour Chronicles of Darkness character was ` +
        `fully reset by ${staffName}.%cn${why}\n` +
        `Live sheet and approval cleared. ` +
        `Start again with %ch+cg%cn.`,
    );
    await sendCofdMail({
      to: playerId,
      subject: `Character wiped: ${name}`,
      body: [
        `Your Chronicles of Darkness character was ` +
          `fully reset by ${staffName}.`,
        reason ? `\nReason:\n${reason}` : "",
        ``,
        `Removed: live sheet, chargen draft, approved flag,`,
        `and splat sight flags (fae / forsaken).`,
        ``,
        `Start over in-game with: +cg`,
        `Or open the Character tab on the web.`,
      ].filter(Boolean).join("\n"),
    });
  }

  return {
    ok: true,
    name,
    hadLive,
    hadDraft,
    wasApproved,
    job,
  };
}
