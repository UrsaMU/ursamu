/**
 * Staff wipe of CPR character data (draft or approved).
 * Clears data.cpr + any orphan state.cpr fork.
 */
import { dbojs, rewriteStatePaths } from "@ursamu/mush";
import type { ICPRCharacter } from "../../db/schemas.ts";

export type WipeOpts = {
  playerId: string;
  /** When set, notify the player in-game. */
  notify?: (playerId: string, msg: string) => void | Promise<void>;
  staffName?: string;
  reason?: string;
};

export type WipeResult =
  | {
    ok: true;
    name: string;
    hadSheet: boolean;
    wasApproved: boolean;
  }
  | { ok: false; error: string };

function bare(id: string): string {
  return String(id ?? "").replace(/^#/, "").trim();
}

// deno-lint-ignore no-explicit-any
function cprOf(obj: any): ICPRCharacter | undefined {
  return (obj?.data?.cpr ?? obj?.state?.cpr) as
    | ICPRCharacter
    | undefined;
}

// deno-lint-ignore no-explicit-any
function playerName(obj: any): string {
  return String(
    obj?.data?.name ?? obj?.data?.moniker ?? obj?.name ??
      "Unknown",
  );
}

/**
 * Fully remove CPR sheet/draft for a player.
 * Safe on already-empty targets (hadSheet: false).
 */
export async function wipeCharacter(
  opts: WipeOpts,
): Promise<WipeResult> {
  const playerId = bare(opts.playerId);
  if (!playerId) {
    return { ok: false, error: "playerId required" };
  }

  const rows = await dbojs.query({ id: playerId });
  const row = rows[0];
  if (!row) {
    return { ok: false, error: "Player not found" };
  }

  const cpr = cprOf(row);
  const hadSheet = !!cpr;
  const wasApproved = !!(
    cpr?.chargenComplete || cpr?.chargenStatus === "approved"
  );
  const name = playerName(row);

  // Clear both storage keys (SDK rewrites state.* → data.*).
  await dbojs.modify(
    { id: playerId },
    "$unset",
    rewriteStatePaths({ "state.cpr": "" }) as Record<
      string,
      unknown
    >,
  );
  await dbojs.modify({ id: playerId }, "$unset", {
    "state.cpr": "",
    "data.cpr": "",
  });

  if (opts.notify) {
    const who = opts.staffName
      ? String(opts.staffName)
      : "Staff";
    const why = opts.reason?.trim()
      ? ` Reason: ${opts.reason.trim()}`
      : "";
    try {
      await opts.notify(
        playerId,
        `[CPR] ${who} wiped your character sheet.` +
          why +
          " Run +chargen to start over.",
      );
    } catch (e: unknown) {
      console.error("[cpr] wipe notify:", e);
    }
  }

  return { ok: true, name, hadSheet, wasApproved };
}
