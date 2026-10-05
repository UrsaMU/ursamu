/**
 * Specialty combat rules (SG p.30–32): shotguns, mono,
 * ammo, falling, drowning, explosives, knife-to-gunfight.
 */
import type { SprawlItemData, StatKey } from "../db/schemas.ts";
import combatRules from "../data/combat-rules.json" with {
  type: "json",
};

const SG = (combatRules as {
  shotgun?: { pb?: number; close?: number; bunchedTargets?: number };
}).shotgun ?? { pb: 3, close: 2, bunchedTargets: 3 };

export type ShotgunBand = "pb" | "close" | "range";

export function isShotgun(d: SprawlItemData | null): boolean {
  if (!d) return false;
  const tags = (d.tags ?? []).map((t) => t.toLowerCase());
  if (tags.includes("shotgun") || tags.includes("autoshotgun")) {
    return true;
  }
  if (String(d.category ?? "").toLowerCase() === "shotgun") {
    return true;
  }
  return /shotgun|12g|gauge/i.test(d.slug + (d.notes ?? ""));
}

export function isAutoshotgun(d: SprawlItemData | null): boolean {
  if (!isShotgun(d) || !d) return false;
  const tags = (d.tags ?? []).map((t) => t.toLowerCase());
  return tags.includes("autoshotgun") ||
    tags.includes("auto");
}

export function shotgunDamageBonus(band: ShotgunBand): number {
  if (band === "pb") return Number(SG.pb ?? 3);
  if (band === "close") return Number(SG.close ?? 2);
  return 0;
}

export function shotgunMaxTargets(): number {
  return Math.max(1, Number(SG.bunchedTargets ?? 3));
}

export function isMonofilament(d: SprawlItemData | null): boolean {
  if (!d) return false;
  const tags = (d.tags ?? []).map((t) => t.toLowerCase());
  if (tags.includes("monofilament") || tags.includes("mono")) {
    return true;
  }
  return /mono/i.test(d.slug + (d.notes ?? ""));
}

export function monofilamentAdjust(opts: {
  weapon: SprawlItemData | null;
  targetArmourBonus: number;
}): {
  ignoreArmour: boolean;
  damageBonus: number;
  parts: string[];
} {
  if (!isMonofilament(opts.weapon)) {
    return { ignoreArmour: false, damageBonus: 0, parts: [] };
  }
  const armored = (opts.targetArmourBonus ?? 0) > 0;
  // Book: negate armour on roll; +1 dmg only if already unarmoured.
  return {
    ignoreArmour: true,
    damageBonus: armored ? 0 : 1,
    parts: armored
      ? ["mono (no armour)"]
      : ["mono+1"],
  };
}

export type AmmoFx = {
  rollBonus: number;
  damageBonus: number;
  ignoreArmour: boolean;
  destroyArmour: boolean;
  fireRounds: number;
  stun: boolean;
  parts: string[];
};

const emptyAmmo = (): AmmoFx => ({
  rollBonus: 0,
  damageBonus: 0,
  ignoreArmour: false,
  destroyArmour: false,
  fireRounds: 0,
  stun: false,
  parts: [],
});

/** Resolve specialty munitions from ammo slug/tags. */
export function ammoSpecialty(
  tagsOrSlug: string[] | string | undefined,
): AmmoFx {
  const raw = Array.isArray(tagsOrSlug)
    ? tagsOrSlug.join(" ")
    : String(tagsOrSlug ?? "");
  const t = raw.toLowerCase();
  if (!t.trim()) return emptyAmmo();
  const fx = emptyAmmo();

  if (/hellfire|incendiary/.test(t)) {
    fx.fireRounds = 3;
    fx.parts.push("hellfire");
  }
  if (/shredder|mono.*fil/.test(t)) {
    fx.ignoreArmour = true;
    fx.parts.push("shredder");
  }
  if (/ln2|nitrogen/.test(t)) {
    fx.destroyArmour = true;
    fx.parts.push("ln2");
  }
  if (/splinter/.test(t)) {
    fx.damageBonus += 1;
    fx.parts.push("splinter+1");
  }
  if (/high-?explosive|\bhe\b|moisture-he/.test(t)) {
    fx.damageBonus += 2;
    fx.parts.push("HE+2");
  }
  if (/depleted|uranium|\bdu\b/.test(t)) {
    fx.destroyArmour = true;
    fx.rollBonus += 1;
    fx.parts.push("DU");
  }
  if (/jelly|stun/.test(t)) {
    fx.stun = true;
    fx.parts.push("stun");
  }
  if (/hollow|ap\b|armour.?pierc/.test(t)) {
    fx.ignoreArmour = true;
    fx.parts.push("AP");
  }
  if (/acid/.test(t)) {
    fx.fireRounds = Math.max(fx.fireRounds, 3);
    fx.destroyArmour = true;
    fx.parts.push("acid");
  }
  return fx;
}

/** 1 Res per 3m fallen, rounded up. */
export function fallingDamage(meters: number): number {
  const m = Math.max(0, Number(meters) || 0);
  if (m <= 0) return 0;
  return Math.ceil(m / 3);
}

/** −1 Morphology per load item when drowning. */
export function drowningPenalty(loadItems: number): number {
  return Math.max(0, Math.floor(Number(loadItems) || 0));
}

/**
 * Planted charge: Nd6, always at least 1 per die (book min damage).
 */
export function explosiveDamage(
  nDice: number,
  rng = () => 1 + Math.floor(Math.random() * 6),
): { dice: number; rolls: number[]; total: number; minApplied: boolean } {
  const n = Math.max(1, Math.min(6, Math.floor(nDice) || 1));
  const rolls: number[] = [];
  let raw = 0;
  let minApplied = false;
  for (let i = 0; i < n; i++) {
    let r = rng();
    if (r < 1) {
      r = 1;
      minApplied = true;
    }
    rolls.push(r);
    raw += r;
  }
  // "always do their minimum damage" → floor at N
  const total = Math.max(n, raw);
  if (total > raw) minApplied = true;
  return { dice: n, rolls, total, minApplied };
}

/** Parse up to 3 DS numbers for shotgun bunched targets. */
export function parseMultiDs(raw: string): number[] {
  const nums = String(raw)
    .split(/[,\s]+/)
    .map((t) => Number(t))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 30);
  return nums.slice(0, shotgunMaxTargets());
}

export function knifeToGunfight(opts: {
  unaware?: boolean;
}): {
  stat: StatKey;
  upgrade: number;
  parts: string[];
} {
  return {
    stat: "morphology",
    upgrade: opts.unaware ? 1 : 0,
    parts: opts.unaware
      ? ["knife-rush", "unaware upg"]
      : ["knife-rush"],
  };
}

export function shotgunBandFromMode(mode: string): ShotgunBand | null {
  const m = mode.toLowerCase();
  if (m === "sg" || m === "shotgun" || m === "sg-range") {
    return "range";
  }
  if (m === "sg-close" || m === "close" || m === "sgc") {
    return "close";
  }
  if (m === "sg-pb" || m === "sgpb") return "pb";
  return null;
}

/** Map attack mode tokens that stack with shotgun band. */
export function resolveShotgunBand(
  mode: string,
  weapon: SprawlItemData | null,
): ShotgunBand | null {
  if (!isShotgun(weapon)) return null;
  const fromMode = shotgunBandFromMode(mode);
  if (fromMode) return fromMode;
  // Point blank mode on a shotgun → shotgun PB damage table.
  if (mode === "pb" || mode === "pointblank") return "pb";
  return "range";
}

export function wornArmourBonus(
  // deno-lint-ignore no-explicit-any
  items: ReadonlyArray<any>,
  // deno-lint-ignore no-explicit-any
  itemDataFn: (o: any) => SprawlItemData | null,
): number {
  let n = 0;
  for (const raw of items) {
    const d = raw && typeof raw === "object" && "flags" in raw
      ? itemDataFn(raw)
      : raw as SprawlItemData | null;
    if (!d || d.kind !== "armor") continue;
    if ((d.slot ?? "carried") !== "worn") continue;
    n += Number(d.bonus ?? 0) || 0;
  }
  return n;
}
