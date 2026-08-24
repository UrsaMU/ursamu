/**
 * Magazine capacity and spend (book p.40).
 * Modes: shot=1, burst=3, auto/suppress=empty mag.
 */
import magSizes from "../data/mag-sizes.json" with {
  type: "json",
};
import type { SprawlItemData } from "../db/schemas.ts";

const SIZES = magSizes as Record<string, number | string>;

/** Map weapon category / slug hints → mag-sizes key. */
export function magKeyFor(
  d: Pick<SprawlItemData, "category" | "slug" | "kind">,
): string | null {
  const cat = String(d.category ?? "").toLowerCase();
  const slug = String(d.slug ?? "").toLowerCase();
  const blob = `${cat} ${slug}`;
  if (/revolver|pkd/.test(blob)) return "revolver";
  if (/smg/.test(blob)) return "smg";
  if (/sniper/.test(blob)) return "sniper";
  if (/flechette|shard/.test(blob)) return "flechette";
  if (/lmg|saw|minigun/.test(blob)) return "lmg-saw";
  if (/autoshot|auto.?shot/.test(blob)) return "autoshotgun";
  if (/shotgun|scatter/.test(blob)) return "autoshotgun";
  if (/assault|rifle|kr-16|ar-/.test(blob)) {
    return "assault-rifle";
  }
  if (/handgun|pistol|gun/.test(blob)) return "pistol";
  if (/rpg|rocket/.test(blob)) return "rpg";
  if (/gl|grenade.?launch/.test(blob)) return "auto-gl";
  if (d.kind === "firearm" || d.kind === "heavy") {
    return "pistol";
  }
  return null;
}

export function magCapacity(
  d: Pick<SprawlItemData, "category" | "slug" | "kind" | "magMax">,
): number | null {
  if (d.magMax != null && d.magMax > 0) return d.magMax;
  const key = magKeyFor(d);
  if (!key) return null;
  const n = Number(SIZES[key]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Ensure mag/magMax on a ranged weapon; no-op if N/A. */
export function ensureMag(d: SprawlItemData): SprawlItemData {
  const cap = magCapacity(d);
  if (cap == null) return d;
  const magMax = d.magMax ?? cap;
  const mag = d.mag != null ? Math.min(d.mag, magMax) : magMax;
  return { ...d, mag, magMax };
}

export type FireMode = "shot" | "burst" | "auto" | "suppress";

export function modeFromAttack(mode: string): FireMode {
  const m = mode.toLowerCase();
  if (m === "auto" || m === "fa" || m === "full") return "auto";
  if (m === "burst" || m === "b") return "burst";
  if (m === "suppress") return "suppress";
  return "shot";
}

export function roundsForMode(
  mode: FireMode,
  mag: number,
): number {
  if (mode === "auto" || mode === "suppress") {
    return Math.max(0, mag);
  }
  if (mode === "burst") return Math.min(3, Math.max(0, mag));
  return Math.min(1, Math.max(0, mag));
}

export type SpendResult =
  | { ok: true; data: SprawlItemData; spent: number; left: number }
  | { ok: false; reason: "empty" | "no-mag"; data: SprawlItemData };

/** Spend rounds for a fire mode. Empty mag → fail. */
export function spendMag(
  d: SprawlItemData,
  mode: FireMode,
): SpendResult {
  const withMag = ensureMag(d);
  if (withMag.magMax == null) {
    return { ok: true, data: withMag, spent: 0, left: -1 };
  }
  const mag = withMag.mag ?? 0;
  if (mag <= 0) {
    return { ok: false, reason: "empty", data: withMag };
  }
  const spent = roundsForMode(mode, mag);
  if (spent <= 0) {
    return { ok: false, reason: "empty", data: withMag };
  }
  const left = mag - spent;
  return {
    ok: true,
    data: { ...withMag, mag: left },
    spent,
    left,
  };
}

export function reloadMag(d: SprawlItemData): SprawlItemData {
  const withMag = ensureMag(d);
  if (withMag.magMax == null) return withMag;
  return { ...withMag, mag: withMag.magMax };
}

export function magLabel(d: SprawlItemData): string {
  const w = ensureMag(d);
  if (w.magMax == null) return "";
  return `${w.mag ?? 0}/${w.magMax}`;
}
