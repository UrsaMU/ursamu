/**
 * Full chargen wipe → fresh draft.
 * Clears sheet, look base, approved flag; destroys personal gear.
 */
import { dbojs } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import {
  defaultChar,
  type ISprawlChar,
} from "../db/schemas.ts";
import {
  carriedItems,
  destroyItem,
  personalGearItems,
} from "../engine/items.ts";
import { saveChar } from "../engine/sheet-io.ts";

function bare(id: string): string {
  return String(id ?? "").replace(/^#/, "").trim();
}

function flagsOf(raw: unknown): Set<string> {
  if (raw instanceof Set) return new Set([...raw].map(String));
  if (Array.isArray(raw)) return new Set(raw.map(String));
  return new Set(
    String(raw ?? "").split(/[,\s]+/).filter(Boolean),
  );
}

async function clearApprovedFlag(playerId: string): Promise<void> {
  try {
    const row = await dbojs.queryOne({ id: bare(playerId) });
    if (!row) return;
    const flags = flagsOf(row.flags);
    if (!flags.has("approved")) return;
    flags.delete("approved");
    await dbojs.modify({ id: bare(playerId) }, "$set", {
      flags: [...flags].join(" "),
    });
  } catch (e: unknown) {
    console.error("[sprawl] clearApprovedFlag:", e);
  }
}

/** Destroy carried sprawl gear (not vehicles unless forceAll). */
export async function wipePersonalGear(
  u: IUrsamuSDK,
  ownerId: string,
  opts: { vehicles?: boolean } = {},
): Promise<number> {
  const all = await carriedItems(u, ownerId);
  const pack = opts.vehicles ? all : personalGearItems(all);
  let n = 0;
  for (const o of pack) {
    try {
      await destroyItem(u, o.id);
      n++;
    } catch (e: unknown) {
      console.error("[sprawl] wipe gear:", o.id, e);
    }
  }
  return n;
}

export type ResetResult = {
  ok: true;
  draft: ISprawlChar;
  destroyed: number;
  name: string;
};

/**
 * Replace sheet with a clean draft. Caller must enforce staff/self
 * and the confirm token.
 */
export async function resetChargen(
  u: IUrsamuSDK,
  target: IDBObj,
  opts: { wipeVehicles?: boolean } = {},
): Promise<ResetResult> {
  const name = String(
    target.name ?? target.state?.name ?? "Goon",
  );
  const destroyed = await wipePersonalGear(u, target.id, {
    vehicles: opts.wipeVehicles === true,
  });

  const draft = defaultChar(name);
  draft.chargenStatus = "draft";
  draft.chargenComplete = false;
  draft.belongingsPicked = 0;
  draft.accessories = [];
  draft.affectations = [];
  draft.baseDesc = "";
  draft.lookDesc = "";
  draft.lookOpener = undefined;
  draft.reviewNote = undefined;
  draft.submittedJob = undefined;
  draft.missionReady = false;

  await saveChar(u, draft, target.id);
  target.state = {
    ...target.state,
    sprawl: draft,
    description: "",
  };
  await u.db.modify(target.id, "$set", {
    "data.description": "",
    "data.sprawl": draft,
  });
  await clearApprovedFlag(target.id);

  return { ok: true, draft, destroyed, name };
}

/** True if arg is an explicit confirm token. */
export function isRestartConfirm(arg: string): boolean {
  const a = arg.toLowerCase().trim();
  return (
    a === "confirm" ||
    a === "yes" ||
    a === "wipe" ||
    a.endsWith(" confirm") ||
    a.endsWith("=confirm") ||
    a.endsWith("/confirm")
  );
}

/** Split staff target: "Name confirm" | "Name=confirm" | "Name". */
export function parseRestartArg(arg: string): {
  who: string;
  confirmed: boolean;
} {
  const raw = arg.trim();
  if (!raw) return { who: "", confirmed: false };
  if (/^(confirm|yes|wipe)$/i.test(raw)) {
    return { who: "", confirmed: true };
  }
  const eq = raw.match(/^(.+?)\s*=\s*(confirm|yes|wipe)\s*$/i);
  if (eq) return { who: eq[1].trim(), confirmed: true };
  const sp = raw.match(/^(.+?)\s+(confirm|yes|wipe)\s*$/i);
  if (sp) return { who: sp[1].trim(), confirmed: true };
  return { who: raw, confirmed: false };
}
