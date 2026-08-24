/**
 * Shared approve / reject — +chargen switches, job:closed hook.
 */
import { dbojs, send, sessions } from "@ursamu/ursamu";
import type { ISprawlChar } from "../db/schemas.ts";
import { CHARGEN } from "../engine/catalog.ts";
import { completeCgenJob } from "./complete_cgen_job.ts";
import { sendSprawlMail } from "../integrations/mail.ts";

function bare(id: string): string {
  return String(id ?? "").replace(/^#/, "").trim();
}

function readChar(row: {
  data?: Record<string, unknown>;
  state?: Record<string, unknown>;
}): ISprawlChar | null {
  const raw = row.data?.sprawl ?? row.state?.sprawl;
  if (!raw || typeof raw !== "object") return null;
  return raw as ISprawlChar;
}

function flagsOf(raw: unknown): Set<string> {
  if (raw instanceof Set) return new Set([...raw].map(String));
  if (Array.isArray(raw)) return new Set(raw.map(String));
  return new Set(
    String(raw ?? "").split(/[,\s]+/).filter(Boolean),
  );
}

async function setApprovedFlag(
  playerId: string,
  on: boolean,
): Promise<void> {
  try {
    const row = await dbojs.queryOne({ id: playerId });
    if (!row) return;
    const flags = flagsOf(row.flags);
    if (on) flags.add("approved");
    else flags.delete("approved");
    await dbojs.modify({ id: playerId }, "$set", {
      flags: [...flags].join(" "),
    });
  } catch (e: unknown) {
    console.error("[sprawl] setApprovedFlag:", e);
  }
}

async function notifyPlayer(
  playerId: string,
  msg: string,
): Promise<void> {
  try {
    const socks = sessions.list()
      .filter((s) => {
        const a = (s as unknown as { actorId?: string }).actorId;
        return bare(String(a ?? "")) === bare(playerId);
      })
      .map((s) => s.socketId)
      .filter(Boolean);
    if (socks.length) send(socks, msg, {});
  } catch (e: unknown) {
    console.error("[sprawl] notify failed:", e);
  }
}

export async function approvePlayer(opts: {
  playerId: string;
  staffId?: string;
  staffName?: string;
  notes?: string;
  completeJob?: boolean;
}): Promise<
  | { ok: true; name: string; already: boolean; job: number | null }
  | { ok: false; error: string }
> {
  const pid = bare(opts.playerId);
  const row = await dbojs.queryOne({ id: pid });
  if (!row) return { ok: false, error: "Player not found." };
  const c = readChar(row);
  if (!c) return { ok: false, error: "No Sprawl sheet." };

  const name = String(
    (row as { name?: string }).name ??
      (row.data as { name?: string } | undefined)?.name ??
      c.name ??
      pid,
  );

  if (c.chargenComplete || c.chargenStatus === "approved") {
    return { ok: true, name, already: true, job: null };
  }

  const next: ISprawlChar = {
    ...c,
    name,
    chargenStatus: "approved",
    chargenComplete: true,
    resilience: c.resilienceMax || CHARGEN.resilience,
    resilienceMax: c.resilienceMax || CHARGEN.resilience,
    reviewNote: undefined,
  };

  // Storage is data.* — hydrate maps data → state. Do not write
  // state.sprawl via raw dbojs (no rewriteStatePaths); it never
  // reaches the sheet getChar/readSprawl sees.
  await dbojs.modify({ id: pid }, "$set", {
    "data.sprawl": next,
  });
  await setApprovedFlag(pid, true);

  let jobNum: number | null = c.submittedJob ?? null;
  if (opts.completeJob !== false) {
    const job = await completeCgenJob({
      jobNumber: c.submittedJob,
      playerId: pid,
      staffId: opts.staffId ?? "0",
      staffName: opts.staffName ?? "Staff",
      notes: opts.notes,
      outcome: "approved",
    });
    if (job.number != null) jobNum = job.number;
  }

  const staff = opts.staffName ?? "Staff";
  const note = opts.notes?.trim()
    ? ` Notes: ${opts.notes.trim()}`
    : "";
  await notifyPlayer(
    pid,
    `%chSprawl sheet approved by ${staff}.%cn` +
      `${note}  Use %ch+sheet%cn.`,
  );

  try {
    await sendSprawlMail({
      to: pid,
      subject: `Character approved: ${name}`,
      body: [
        `You're cleared for the street, ${name}.`,
        `Approved by: ${staff}`,
        `Background: ${c.backgroundName || "—"}`,
        jobNum != null ? `CGEN job: #${jobNum}` : "",
        opts.notes?.trim()
          ? `\nStaff notes:\n${opts.notes.trim()}`
          : "",
        ``,
        `In-game: +sheet  +roll  inv  @desc me=…`,
      ].filter(Boolean).join("\n"),
    });
  } catch { /* optional mail */ }

  return { ok: true, name, already: false, job: jobNum };
}

export async function rejectPlayer(opts: {
  playerId: string;
  staffId?: string;
  staffName?: string;
  notes: string;
}): Promise<
  | {
    ok: true;
    name: string;
    job: number | null;
    char: ISprawlChar;
  }
  | { ok: false; error: string }
> {
  const pid = bare(opts.playerId);
  const row = await dbojs.queryOne({ id: pid });
  if (!row) return { ok: false, error: "Player not found." };
  const c = readChar(row);
  if (!c) return { ok: false, error: "No Sprawl sheet." };

  const name = String(
    (row as { name?: string }).name ?? c.name ?? pid,
  );
  const note = opts.notes.trim() || "Revise and resubmit.";
  const staff = opts.staffName ?? "Staff";

  const next: ISprawlChar = {
    ...c,
    chargenStatus: "revision",
    chargenComplete: false,
    reviewNote: note,
    // Allow a fresh CGEN job on resubmit
    submittedJob: undefined,
  };

  await dbojs.modify({ id: pid }, "$set", {
    "data.sprawl": next,
  });
  await setApprovedFlag(pid, false);

  let jobNum: number | null = c.submittedJob ?? null;
  const job = await completeCgenJob({
    jobNumber: c.submittedJob,
    playerId: pid,
    staffId: opts.staffId ?? "0",
    staffName: staff,
    notes: note,
    outcome: "rejected",
  });
  if (job.number != null) jobNum = job.number;

  await notifyPlayer(
    pid,
    `%chChargen revision from ${staff}:%cn ${note}` +
      `  Fix with %ch+chargen%cn then %ch+chargen/submit%cn.`,
  );

  try {
    await sendSprawlMail({
      to: pid,
      subject: `Chargen revision: ${name}`,
      body: [
        `Staff sent your Sprawl sheet back.`,
        `From: ${staff}`,
        `Note: ${note}`,
        jobNum != null ? `CGEN job: #${jobNum} (closed)` : "",
        ``,
        `Edit with +chargen, then +chargen/submit again.`,
      ].filter(Boolean).join("\n"),
    });
  } catch { /* optional */ }

  return { ok: true, name, job: jobNum, char: next };
}
