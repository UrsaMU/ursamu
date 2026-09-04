/**
 * Promote chargen draft → live sheet + approved flag.
 * Commands use SDK db; job hooks use dbojs host path.
 */
import {
  dbojs,
  send,
  sessions,
  type IDBObj,
  type IUrsamuSDK,
} from "@ursamu/mush";
import type { DndSheet } from "../stats/dnd_sheet.ts";
import { CLASS_METADATA } from "../data/catalog.ts";
import {
  hasLiveSheet,
  isApprovedFlag,
  readCg,
  type DndCgState,
} from "./state.ts";
import { buildSheetFromCg } from "./build_sheet.ts";
import {
  completeCgenJob,
  type JobTouchResult,
} from "./job_helpers.ts";

export type ApproveOpts = {
  playerId: string;
  staffId?: string;
  staffName?: string;
  notes?: string;
  completeJob?: boolean;
  /** Prefer SDK when available (commands / showcase). */
  u?: IUrsamuSDK;
  /** Pre-loaded target from u.util.target */
  target?: IDBObj;
};

export type ApproveResult =
  | {
    ok: true;
    name: string;
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

function playerName(
  // deno-lint-ignore no-explicit-any
  row: any,
): string {
  return String(
    row?.state?.name ?? row?.data?.name ?? row?.name ??
      "Unknown",
  );
}

async function notify(
  playerId: string,
  msg: string,
  u?: IUrsamuSDK,
): Promise<void> {
  if (u) {
    try {
      u.send(msg, playerId);
      return;
    } catch { /* fall through */ }
  }
  try {
    const socks = sessions.list()
      .filter((s) => {
        const a = (s as { actorId?: string }).actorId;
        return bareId(String(a ?? "")) === bareId(playerId);
      })
      .map((s) => s.socketId)
      .filter(Boolean);
    if (socks.length) send(socks as string[], msg, {});
  } catch (e: unknown) {
    console.error("[dnd] approve notify:", e);
  }
}

async function spawnStartingGearSdk(
  u: IUrsamuSDK,
  playerId: string,
  cg: DndCgState,
): Promise<void> {
  if (cg.startingGear === "gold") return;
  const cls = CLASS_METADATA[cg.class.toLowerCase()];
  if (!cls?.startingEquipmentChoices) return;

  const items: Array<{ name: string; spec: string }> = [];
  cls.startingEquipmentChoices.forEach((choice, idx) => {
    const optIdx = cg.chosenGearOptions?.[idx] ?? 0;
    const opt = choice.options[optIdx];
    if (opt) items.push(...opt.items);
  });

  for (const eq of items) {
    const parts = eq.spec.split(":");
    const type = parts[0].toLowerCase();
    // deno-lint-ignore no-explicit-any
    const dndData: Record<string, any> = {
      type,
      equipped: true,
    };
    if (type === "weapon") {
      dndData.damage = parts[1] || "1d6";
      dndData.damageType = parts[2] || "slashing";
      dndData.properties = parts.slice(3).map((p) =>
        p.toLowerCase()
      );
      dndData.weaponType = dndData.properties.includes("ranged")
        ? "ranged"
        : "melee";
    } else if (type === "armor") {
      dndData.ac = parseInt(parts[1] || "11", 10);
      dndData.armorType = (parts[2] || "light").toLowerCase();
    } else if (type === "shield") {
      dndData.ac = parseInt(parts[1] || "2", 10);
      dndData.armorType = "shield";
    }
    await u.db.create({
      flags: new Set(["thing"]),
      location: playerId,
      name: eq.name,
      state: {
        name: eq.name,
        dnd: dndData,
        owner: playerId,
      },
    });
  }
}

async function loadRow(
  opts: ApproveOpts,
): Promise<IDBObj | null> {
  if (opts.target) return opts.target;
  if (opts.u) {
    const found = await opts.u.db.search({
      id: bareId(opts.playerId),
      // deno-lint-ignore no-explicit-any
    } as any);
    if (found[0]) return found[0];
  }
  try {
    const row = await dbojs.queryOne({
      id: bareId(opts.playerId),
    });
    return (row as IDBObj | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function approvePlayer(
  opts: ApproveOpts,
): Promise<ApproveResult> {
  const playerId = bareId(opts.playerId);
  if (!playerId) return { ok: false, error: "playerId required" };

  const row = await loadRow(opts);
  if (!row) return { ok: false, error: "Player not found." };

  const name = playerName(row);
  const cg = readCg(row);

  if (
    isApprovedFlag(row) && hasLiveSheet(row) && !cg?.isSubmitted
  ) {
    return { ok: true, name, already: true, job: null };
  }

  if (!cg) {
    return {
      ok: false,
      error: "No chargen draft found for that player.",
    };
  }
  if (!cg.isSubmitted && !cg.pendingSheet) {
    return {
      ok: false,
      error:
        "Draft is not submitted. Player must +cg/submit first.",
    };
  }

  const sheet: DndSheet = cg.pendingSheet
    ? cg.pendingSheet
    : buildSheetFromCg(cg);

  // Write live sheet via SDK when present
  if (opts.u) {
    await opts.u.db.modify(playerId, "$set", {
      "data.dnd": sheet,
    });
    await opts.u.db.modify(playerId, "$unset", {
      "data.dnd_cg": "",
    });
    // deno-lint-ignore no-explicit-any
    if (row.state) {
      // deno-lint-ignore no-explicit-any
      (row.state as any).dnd = sheet;
      // deno-lint-ignore no-explicit-any
      delete (row.state as any).dnd_cg;
    }
    try {
      if (typeof opts.u.setFlags === "function") {
        await opts.u.setFlags(row, "approved");
      } else {
        row.flags.add("approved");
      }
    } catch {
      row.flags.add("approved");
    }
    try {
      await spawnStartingGearSdk(opts.u, playerId, cg);
    } catch (e: unknown) {
      console.error("[dnd] spawnStartingGear:", e);
    }
  } else {
    // deno-lint-ignore no-explicit-any
    const data = { ...((row as any).data ?? {}) };
    data.dnd = sheet;
    delete data.dnd_cg;
    await dbojs.modify({ id: playerId }, "$set", {
      data,
    } as never);
    const flags = flagsOf(row.flags);
    flags.add("approved");
    await dbojs.modify({ id: playerId }, "$set", {
      flags: [...flags].join(" "),
    });
  }

  let job: JobTouchResult | null = null;
  if (opts.completeJob !== false) {
    job = await completeCgenJob(
      cg.submittedJob,
      playerId,
      opts.staffId ?? "0",
      opts.staffName ?? "Staff",
      opts.notes ?? "",
    );
  }

  const staff = opts.staffName ?? "Staff";
  const note = opts.notes ? `\nNotes: ${opts.notes}` : "";
  await notify(
    playerId,
    `%ch%cgAPPROVE>>%cn ${staff} approved your character! ` +
      `Type %ch+sheet%cn to view it.${note}`,
    opts.u,
  );

  return { ok: true, name, already: false, job };
}

export async function unapprovePlayer(
  playerIdRaw: string,
  u?: IUrsamuSDK,
): Promise<{ ok: boolean; name?: string; error?: string }> {
  const playerId = bareId(playerIdRaw);
  let row: IDBObj | null = null;
  if (u) {
    const found = await u.db.search({
      id: playerId,
      // deno-lint-ignore no-explicit-any
    } as any);
    row = found[0] ?? null;
  }
  if (!row) {
    try {
      row = (await dbojs.queryOne({ id: playerId })) as
        unknown as IDBObj | null;
    } catch {
      row = null;
    }
  }
  if (!row) return { ok: false, error: "Player not found." };
  const name = playerName(row);

  if (u && typeof u.setFlags === "function") {
    try {
      await u.setFlags(row, "!approved");
    } catch {
      row.flags.delete("approved");
    }
  } else {
    const flags = flagsOf(row.flags);
    flags.delete("approved");
    await dbojs.modify({ id: playerId }, "$set", {
      flags: [...flags].join(" "),
    });
  }

  await notify(
    playerId,
    `%ch%cyAPPROVE>>%cn Your approved status was removed. ` +
      `Contact staff if this is unexpected.`,
    u,
  );
  return { ok: true, name };
}
