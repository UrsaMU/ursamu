/**
 * Foundation / option-slot checks for cyberware install.
 */
import type { ICPRCharacter, ICyberware } from "../db/schemas.ts";
import {
  CYBERWARE_CATALOG,
  displayCyberName,
  getCyberware,
  slugCyberName,
  type ICyberwareDef,
} from "../data/cyberware.ts";

export type InstallCheck =
  | { ok: true; hl: number; def: ICyberwareDef }
  | { ok: false; error: string };

/** SP granted by under-skin plating (combat uses highest). */
export const SUBDERMAL_SP_BY_NAME: Readonly<Record<string, number>> = {
  subdermal_armor: 11,
  skin_weave: 7,
};

/** Canonical slug: "Subdermal Armor" → "subdermal_armor". */
export function normalizeCyberName(raw: string): string {
  return slugCyberName(raw);
}

export { displayCyberName };

/**
 * Find installed chrome by slug, catalog name, or loose label.
 * Prefers exact name, then catalog resolve, then unique substring.
 */
export function findInstalledCyber(
  list: readonly ICyberware[] | undefined,
  nameRaw: string,
): { index: number; piece: ICyberware } | null {
  const pieces = list ?? [];
  if (!pieces.length) return null;
  const want = normalizeCyberName(nameRaw);
  if (!want) return null;

  // Catalog canonical name (handles aliases / spacing)
  const canon = getCyberware(want)?.name ?? want;

  let idx = pieces.findIndex((c) =>
    normalizeCyberName(c.name) === canon ||
    normalizeCyberName(c.name) === want
  );
  if (idx >= 0) return { index: idx, piece: pieces[idx] };

  // Unique substring (e.g. "subdermal" → subdermal_armor only)
  const hits: number[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const n = normalizeCyberName(pieces[i].name);
    if (n.includes(want) || want.includes(n)) hits.push(i);
  }
  if (hits.length === 1) {
    return { index: hits[0], piece: pieces[hits[0]] };
  }
  return null;
}

/** Highest SP from installed subdermal plating pieces. */
export function syncSubdermalSp(cpr: ICPRCharacter): number {
  let sp = 0;
  for (const c of cpr.cyberware ?? []) {
    const n = normalizeCyberName(c.name);
    const v = SUBDERMAL_SP_BY_NAME[n];
    if (v != null && v > sp) sp = v;
  }
  return sp;
}

function installedNames(cpr: ICPRCharacter): string[] {
  return (cpr.cyberware ?? []).map((c) => c.name);
}

function countFoundation(
  cpr: ICPRCharacter,
  foundation: string,
): number {
  return installedNames(cpr).filter((n) => n === foundation).length;
}

/**
 * Slots used on a specific foundation instance (by installedIn id),
 * falling back to name-match for legacy pieces without installedIn.
 */
function slotsUsedOnInstance(
  cpr: ICPRCharacter,
  foundationId: string,
  foundationName: string,
): number {
  let used = 0;
  for (const piece of cpr.cyberware ?? []) {
    const def = getCyberware(piece.name);
    if (!def?.requiresFoundation) continue;
    if (def.requiresFoundation !== foundationName) continue;
    const cost = def.slotCost ?? 1;
    if (cost <= 0) continue;
    if (piece.installedIn) {
      if (piece.installedIn === foundationId) used += cost;
    } else {
      // legacy: count against any foundation of that name
      used += cost;
    }
  }
  return used;
}

function slotsAvailable(
  cpr: ICPRCharacter,
  foundation: string,
): number {
  const foundations = (cpr.cyberware ?? []).filter(
    (c) => c.name === foundation,
  );
  if (!foundations.length) return 0;
  const fdef = getCyberware(foundation);
  const per = fdef?.optionSlots ?? 0;
  if (per <= 0) return 0;

  let free = 0;
  for (const f of foundations) {
    const used = slotsUsedOnInstance(cpr, f.id, foundation);
    free += Math.max(0, per - used);
  }
  return free;
}

/** Average HL when roll-based (chargen uses fixed midpoint). */
export function effectiveHL(def: ICyberwareDef): number {
  if (def.hlRoll) {
    // crude midpoint: NdM → N * (M+1)/2
    const m = def.hlRoll.match(/^(\d+)d(\d+)/i);
    if (m) {
      const n = Number(m[1]);
      const sides = Number(m[2]);
      return Math.round(n * (sides + 1) / 2);
    }
  }
  return def.hl;
}

export function canInstallCyberware(
  cpr: ICPRCharacter,
  nameRaw: string,
): InstallCheck {
  const name = normalizeCyberName(nameRaw);
  const def = getCyberware(name);
  if (!def) return { ok: false, error: "Unknown cyberware" };

  const names = installedNames(cpr);
  if (!def.allowMultiple && names.includes(name)) {
    return { ok: false, error: "Already installed" };
  }

  if (def.requiresFoundation) {
    const need = def.paired ? 2 : 1;
    const have = countFoundation(cpr, def.requiresFoundation);
    if (have < need) {
      const label = def.requiresFoundation.replace(/_/g, " ");
      return {
        ok: false,
        error: def.paired
          ? `Needs two ${label} installed first`
          : `Needs ${label} installed first`,
      };
    }
    const cost = def.slotCost ?? 1;
    if (cost > 0) {
      const free = slotsAvailable(cpr, def.requiresFoundation);
      if (free < cost) {
        return {
          ok: false,
          error: `Not enough option slots on ${
            def.requiresFoundation.replace(/_/g, " ")
          } (need ${cost}, have ${free})`,
        };
      }
    }
  }

  const hl = effectiveHL(def);
  const newHL = (cpr.humanityLoss ?? 0) + hl;
  if (newHL > 60) {
    return {
      ok: false,
      error: `Not enough humanity (HL ${hl}, ${
        60 - (cpr.humanityLoss ?? 0)
      } left)`,
    };
  }

  return { ok: true, hl, def };
}

export function catalogForChargen(): ICyberwareDef[] {
  return [...CYBERWARE_CATALOG].sort((a, b) => {
    const ca = a.category.localeCompare(b.category);
    if (ca !== 0) return ca;
    return a.name.localeCompare(b.name);
  });
}

export function chromeAvailability(
  cpr: ICPRCharacter,
  def: ICyberwareDef,
): {
  canInstall: boolean;
  reason?: string;
  hl: number;
} {
  const check = canInstallCyberware(cpr, def.name);
  if (check.ok) return { canInstall: true, hl: check.hl };
  return {
    canInstall: false,
    reason: check.error,
    hl: effectiveHL(def),
  };
}

/** Attach installedIn id for option pieces (first free foundation). */
export function pickFoundationId(
  cpr: ICPRCharacter,
  foundation: string,
): string | undefined {
  const pieces = cpr.cyberware ?? [];
  const foundations = pieces.filter((c) => c.name === foundation);
  if (!foundations.length) return undefined;
  const cap = getCyberware(foundation)?.optionSlots ?? 0;
  // Prefer foundation instance with remaining slots
  for (const f of foundations) {
    const used = slotsUsedOnInstance(cpr, f.id, foundation);
    if (cap <= 0 || used < cap) return f.id;
  }
  return foundations[0]?.id;
}
