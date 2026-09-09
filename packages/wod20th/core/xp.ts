// core/xp.ts -- XP advancement cost calculator and spend engine (W20 p.124).
import type { IWoDChar, IXpEntry, IGiftDef, IVtmSplatExt } from "./types.ts";
import { SplatRegistry } from "./registry.ts";
import { resolveTrait } from "./resolver.ts";
import { canonicalAttr, canonicalAbil } from "./attributes.ts";
import { WTA_GIFTS } from "../splats/wta/data/gifts.ts";
import { WTA_RITES } from "../splats/wta/data/rites.ts";
import { getMagicPath } from "../splats/vtm/data/magicPaths.ts";

/** VtM: discipline is in-clan if listed on the character's clan def. */
export function isInClanDiscipline(char: IWoDChar, discName: string): boolean {
  if (char.splat !== "vtm" || !char.clan) return true; // default cheaper
  const ext = SplatRegistry.get("vtm")?.ext as IVtmSplatExt | undefined;
  const clan = ext?.clans?.find(
    (c) =>
      c.id === char.clan?.toLowerCase() ||
      c.name.toLowerCase() === char.clan?.toLowerCase(),
  );
  if (!clan || clan.disciplines.length === 0) return true; // Caitiff = any
  const q = discName.toLowerCase();
  return clan.disciplines.some((d) => d.toLowerCase() === q);
}

// -- Pure cost helpers (M20) -----------------------------------------------

export function attributeXpCost(currentRating: number): number  { return currentRating * 4; }
export function abilityXpCost(currentRating: number): number    { return currentRating === 0 ? 3 : currentRating * 2; }
export function backgroundXpCost(currentRating: number): number { return currentRating === 0 ? 2 : currentRating * 2; }
export function willpowerXpCost(currentRating: number): number  { return currentRating; }
export function rageXpCost(currentRating: number): number       { return currentRating; }
export function gnosisXpCost(currentRating: number): number     { return currentRating * 2; }
export function giftXpCost(level: number, isAffinity: boolean): number { return level * (isAffinity ? 3 : 5); }
export function riteXpCost(level: number): number               { return level * 2; }

/** Is this gift in-affinity for the given char (any breed/auspice/tribe match)? */
export function isAffinityGift(char: IWoDChar, giftDef: IGiftDef): boolean {
  const pools = [char.breed, char.auspice, char.tribe]
    .filter((p): p is string => typeof p === "string" && p.length > 0)
    .map((p) => p.toLowerCase().replace(/\s+/g, "-"));
  return giftDef.source.some((s) => pools.includes(s.toLowerCase()));
}

function findGift(name: string): { slug: string; def: IGiftDef } | undefined {
  const key = name.toLowerCase().trim();
  if (WTA_GIFTS[key]) return { slug: key, def: WTA_GIFTS[key] };
  for (const [slug, def] of Object.entries(WTA_GIFTS)) {
    if (def.name.toLowerCase() === key) return { slug, def };
  }
  return undefined;
}

export interface XpSpendResult {
  ok: boolean;
  message: string;
  cost?: number;
  oldValue?: number;
  newValue?: number;
}

// -- W20 XP Cost Table -----------------------------------------------------
//
// Attribute:           current × 4
// New Ability (0->1):   3
// Ability:             current × 2
// New Merit:           merit cost (same as freebie cost)
// Willpower:           current × 1
// Rage:                current × 1
// Gnosis:              current × 2
// New Gift (in-pool):  level × 3
// New Gift (out-pool): level × 5
// Renown:              not bought with XP (earned through play)
// Background:          current × 2 (staff approval required)

/** Calculate XP cost to raise a trait by 1 dot from its current value. */
export function xpCost(char: IWoDChar, traitField: string): number {
  const splat = SplatRegistry.get(char.splat);

  // Attributes: current rating × 4  (current = base 1 + extras)
  if (traitField.startsWith("attributes.")) {
    const extra = (getField(char, traitField) as number) ?? 0;
    const current = 1 + extra;
    return current * 4;
  }

  // Abilities: new = 3, existing = current × 2
  if (traitField.startsWith("abilities.")) {
    const current = (getField(char, traitField) as number) ?? 0;
    return current === 0 ? 3 : current * 2;
  }

  // Backgrounds: current × 2 (requires staff approval -- noted in message)
  if (traitField.startsWith("backgrounds.")) {
    const current = (getField(char, traitField) as number) ?? 0;
    return current === 0 ? 2 : current * 2;
  }

  // Gifts: in-pool = level × 3, out-of-pool = level × 5
  if (traitField.startsWith("gifts.")) {
    const name = traitField.slice("gifts.".length);
    const found = findGift(name);
    if (!found) return 5;
    return giftXpCost(found.def.level, isAffinityGift(char, found.def));
  }

  // Rites: level × 2
  if (traitField.startsWith("rites.")) {
    const key = traitField.slice("rites.".length).toLowerCase();
    const def = WTA_RITES[key];
    if (!def) return 0;
    return riteXpCost(def.level);
  }

  // Merits: purchased post-chargen at freebie cost × 3 XP (narrative cost)
  if (traitField.startsWith("merit.")) {
    const meritName = traitField.slice("merit.".length);
    const def = splat?.merits?.find((m) => m.name === meritName);
    return def ? def.cost * 3 : 9; // fallback
  }

  // Pools
  if (traitField === "willpower") {
    const current = (getField(char, "willpower") as number) ?? 1;
    return current;
  }
  if (traitField === "rage") {
    const current = (getField(char, "rage") as number) ?? 1;
    return current;
  }
  if (traitField === "gnosis") {
    const current = (getField(char, "gnosis") as number) ?? 1;
    return current * 2;
  }

  // VtM: Disciplines -- in-clan currentx5 / new 10; out-of-clan x7 / new 10
  // (V20 p.124 simplified; out-of-clan first dot still 10).
  // Blood-magic secondary paths (Thaumaturgy / Necromancy paths stored as
  // disciplines["<Path Name>"]) cost new 7 / current x4 (V20 p.124).
  if (traitField.startsWith("disciplines.")) {
    const current = (getField(char, traitField) as number) ?? 0;
    const discName = traitField.slice("disciplines.".length);
    if (getMagicPath(discName)) {
      return current === 0 ? 7 : current * 4;
    }
    const inClan = isInClanDiscipline(char, discName);
    if (current === 0) return 10;
    return current * (inClan ? 5 : 7);
  }

  // VtM: Humanity / Path rating -- current x 2.
  if (traitField === "humanity") {
    const current = (getField(char, "humanity") as number) ?? 1;
    return current * 2;
  }

  // VtM: Virtues -- current x 2.
  if (traitField.startsWith("virtues.")) {
    const current = (getField(char, traitField) as number) ?? 1;
    return current * 2;
  }

  return 0; // unknown / not purchasable
}

/**
 * Spend XP to raise a trait by 1 dot.
 * Only valid on approved characters.
 * Mutates char in place; caller must persist the IXpEntry separately via xpDb.
 */
export function spendXp(
  char: IWoDChar,
  rawTrait: string,
): XpSpendResult & { entry?: IXpEntry } {
  if (char.status !== "approved") {
    return { ok: false, message: "XP spending is only available on approved characters." };
  }

  const res = resolveTrait(char, rawTrait);
  if (!res.found) {
    return { ok: false, message: `Unknown trait "${rawTrait}".` };
  }

  // Renown cannot be bought
  if (res.field.startsWith("renown.")) {
    return { ok: false, message: "Renown is earned through play, not bought with XP." };
  }

  const cost = xpCost(char, res.field);
  if (cost < 1) {
    return { ok: false, message: `"${rawTrait}" cannot be raised with XP.` };
  }

  const remaining = char.xpTotal - char.xpSpent;
  if (cost > remaining) {
    return { ok: false, message: `Raising ${rawTrait} costs ${cost} XP -- you have ${remaining}.` };
  }

  const oldValue = (getField(char, res.field) as number) ?? 0;
  const hardMax = res.max ?? 5;
  if (oldValue >= hardMax) {
    return { ok: false, message: `${rawTrait} is already at maximum (${hardMax}).` };
  }

  // Apply
  setField(char, res.field, oldValue + 1);
  char.xpSpent += cost;

  const ts = Date.now();
  char.statLog.push({ staffId: char.playerId, trait: res.field, old: oldValue, new: oldValue + 1, ts });

  const entry: IXpEntry = {
    id: crypto.randomUUID(),
    charId: char.id,
    playerId: char.playerId,
    type: "spend",
    trait: res.field,
    oldValue,
    newValue: oldValue + 1,
    amount: -cost,
    reason: `Raised ${rawTrait} from ${traitDisplay(char, res.field, oldValue)} to ${traitDisplay(char, res.field, oldValue + 1)}`,
    ts,
  };

  return {
    ok: true,
    message: `Raised %ch${rawTrait}%cn to ${oldValue + 1} for %ch${cost} XP%cn. ${remaining - cost} XP remaining.`,
    cost,
    oldValue,
    newValue: oldValue + 1,
    entry,
  };
}

/** Spend XP to learn a new gift. Mutates char.gifts; caller persists. */
export function spendXpOnGift(
  char: IWoDChar,
  giftName: string,
): XpSpendResult & { entry?: IXpEntry; slug?: string } {
  if (char.status !== "approved") {
    return { ok: false, message: "XP spending is only available on approved characters." };
  }
  const found = findGift(giftName);
  if (!found) return { ok: false, message: `Unknown gift: ${giftName}` };
  const { def, slug } = found;
  const known = (char.gifts ?? []).map((g) => g.toLowerCase());
  if (known.includes(def.name.toLowerCase()) || known.includes(slug)) {
    return { ok: false, message: `${def.name} is already known.` };
  }
  // M20 gift level constrained by rank when known.
  if (char.rank !== undefined && def.level > char.rank) {
    return { ok: false, message: `${def.name} is level ${def.level}; your rank is ${char.rank}.` };
  }
  const affinity = isAffinityGift(char, def);
  const cost = giftXpCost(def.level, affinity);
  const remaining = char.xpTotal - char.xpSpent;
  if (cost > remaining) {
    return { ok: false, message: `${def.name} costs ${cost} XP -- you have ${remaining}.` };
  }
  char.gifts = [...(char.gifts ?? []), def.name];
  char.xpSpent += cost;
  const entry: IXpEntry = {
    id: crypto.randomUUID(), charId: char.id, playerId: char.playerId,
    type: "spend", trait: `gifts.${def.name}`,
    amount: -cost,
    reason: `Learned ${def.name} (L${def.level}, ${affinity ? "affinity" : "out-of-pool"})`,
    ts: Date.now(),
  };
  char.statLog.push({ staffId: char.playerId, trait: `gifts.${def.name}`, old: null, new: def.name, ts: entry.ts });
  return {
    ok: true,
    message: `Learned %ch${def.name}%cn (L${def.level}) for %ch${cost} XP%cn. ${remaining - cost} XP remaining.`,
    cost, slug, entry,
  };
}

/** Spend XP to learn a new rite. Mutates char.rites; caller persists. */
export function spendXpOnRite(
  char: IWoDChar,
  riteSlug: string,
): XpSpendResult & { entry?: IXpEntry; slug?: string } {
  if (char.status !== "approved") {
    return { ok: false, message: "XP spending is only available on approved characters." };
  }
  const key = riteSlug.toLowerCase().trim();
  const def = WTA_RITES[key];
  if (!def) return { ok: false, message: `Unknown rite: ${riteSlug}` };
  if ((char.rites ?? []).some((r) => r.toLowerCase() === key)) {
    return { ok: false, message: `${def.name} is already known.` };
  }
  const cost = riteXpCost(def.level);
  const remaining = char.xpTotal - char.xpSpent;
  if (cost > remaining) {
    return { ok: false, message: `${def.name} costs ${cost} XP -- you have ${remaining}.` };
  }
  char.rites = [...(char.rites ?? []), key];
  char.xpSpent += cost;
  const entry: IXpEntry = {
    id: crypto.randomUUID(), charId: char.id, playerId: char.playerId,
    type: "spend", trait: `rites.${key}`, amount: -cost,
    reason: `Learned ${def.name} (L${def.level})`,
    ts: Date.now(),
  };
  char.statLog.push({ staffId: char.playerId, trait: `rites.${key}`, old: null, new: def.name, ts: entry.ts });
  return {
    ok: true,
    message: `Learned %ch${def.name}%cn (L${def.level}) for %ch${cost} XP%cn. ${remaining - cost} XP remaining.`,
    cost, slug: key, entry,
  };
}

/** Award XP to a character. Returns the log entry to persist. */
/** Maximum XP awardable in a single award command. */
const MAX_XP_AWARD = 500;

export function awardXp(
  char: IWoDChar,
  amount: number,
  reason: string,
  staffId: string,
): IXpEntry {
  // Fractional XP allowed (e.g. +vote awards 0.25). Reject only non-positive
  // or NaN/Infinity values.
  if (!(amount > 0) || !Number.isFinite(amount)) {
    throw new Error("XP award must be a positive number.");
  }
  if (amount > MAX_XP_AWARD) throw new Error(`Award amount ${amount} exceeds maximum of ${MAX_XP_AWARD}.`);
  if (staffId === char.playerId) throw new Error("Cannot award XP to yourself.");
  char.xpTotal += amount;
  return {
    id: crypto.randomUUID(),
    charId: char.id,
    playerId: char.playerId,
    type: "award",
    amount,
    reason,
    staffId,
    ts: Date.now(),
  };
}

// -- Helpers ----------------------------------------------------------------

function getField(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function setField(obj: object, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur = obj as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

/** Human-readable value display (attributes show total dots, not extras). */
function traitDisplay(char: IWoDChar, field: string, raw: number): string {
  if (field.startsWith("attributes.")) return String(1 + raw); // base 1 + extras
  return String(raw);
}

/** Exported so commands can use it without reimporting resolver. */
export { resolveTrait, canonicalAttr, canonicalAbil };
