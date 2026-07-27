/**
 * Object edit control and attribute visibility.
 *
 * Privilege ranks (digibear lvl on staff flags only):
 *   0  mortal (no builder/staff/wizard/…)
 *   7  builder
 *   8  staff / storyteller
 *   9  wizard / admin
 *  10  superuser
 *
 * Edit (canEdit):
 *   - Self always
 *   - Owner always (object-level; attrs may still block)
 *   - Else only if actorRank > ownerRank (higher staff
 *     may edit lower-ranked owners' objects; never the reverse)
 *
 * Attributes:
 *   - Names starting with `_` : invisible + locked to rank 0
 *   - Attr flag `wizard`      : invisible + locked below wizard (9)
 *   - Even owners are subject to the above
 */

import { flags } from "./flags.ts";
// dbojs is loaded lazily in ownerPrivRank — importing it at top level
// opens Deno KV and breaks unit tests that only need pure helpers.

/** Flags that confer a privilege ladder rank. */
const PRIV_FLAGS = new Set([
  "superuser",
  "admin",
  "wizard",
  "staff",
  "storyteller",
  "builder",
]);

const WIZARD_RANK = 9;

export type FlagSource =
  | Set<string>
  | string[]
  | string
  | undefined;

function flagNames(src: FlagSource): string[] {
  if (!src) return [];
  if (typeof src === "string") {
    return src.split(/\s+/).filter(Boolean);
  }
  return [...src].filter(Boolean);
}

/** Max privilege rank for a flag set (0 = non-privileged). */
export function privRank(src: FlagSource): number {
  let max = 0;
  for (const name of flagNames(src)) {
    const key = name.toLowerCase();
    if (!PRIV_FLAGS.has(key)) continue;
    const tag = flags.exists(key);
    const lvl = tag?.lvl ?? 0;
    if (lvl > max) max = lvl;
  }
  return max;
}

/** True when actor has any builder+ privilege (rank > 0). */
export function isPrivileged(src: FlagSource): boolean {
  return privRank(src) > 0;
}

/** True when actor is wizard ladder (wizard / admin / superuser). */
export function isWizardPlus(src: FlagSource): boolean {
  return privRank(src) >= WIZARD_RANK;
}

function ownerIdOf(target: {
  id?: string;
  flags?: FlagSource;
  state?: Record<string, unknown>;
  data?: Record<string, unknown>;
}): string {
  const fromState = target.state?.owner ?? target.data?.owner;
  if (typeof fromState === "string" && fromState) {
    return fromState.replace(/^#/, "");
  }
  // Players own themselves when owner is unset.
  const fl = flagNames(target.flags).map((f) => f.toLowerCase());
  if (fl.includes("player") && target.id) return target.id;
  return target.id ?? "";
}

/**
 * Resolve the privilege rank of an object's controlling owner.
 * Uses cached owner flags when provided; otherwise loads owner.
 */
export async function ownerPrivRank(
  target: {
    id?: string;
    flags?: FlagSource;
    state?: Record<string, unknown>;
    data?: Record<string, unknown>;
  },
  ownerFlags?: FlagSource,
): Promise<number> {
  if (ownerFlags !== undefined) return privRank(ownerFlags);

  const oid = ownerIdOf(target);
  if (!oid) return 0;
  if (oid === target.id) return privRank(target.flags);

  const { dbojs } = await import("./dbobjs.ts");
  const owner = await dbojs.queryOne({ id: oid });
  if (!owner) return 0;
  return privRank(owner.flags);
}

/**
 * Object-level edit control (not attribute-specific).
 */
export async function canEditObject(
  actor: {
    id?: string;
    flags?: FlagSource;
  },
  target: {
    id?: string;
    flags?: FlagSource;
    state?: Record<string, unknown>;
    data?: Record<string, unknown>;
  },
): Promise<boolean> {
  if (!actor?.id || !target?.id) return false;
  if (actor.id === target.id) return true;

  const oid = ownerIdOf(target);
  if (oid && actor.id === oid) return true;

  const aRank = privRank(actor.flags);
  if (aRank <= 0) return false;

  const oRank = await ownerPrivRank(target);
  // Strictly higher rank may edit lower-ranked owners' objects.
  return aRank > oRank;
}

/** Attribute flag list for a name (from data._attrflags). */
export function attrFlagsOf(
  target: {
    state?: Record<string, unknown>;
    data?: Record<string, unknown>;
  },
  attrName: string,
): string[] {
  const key = attrName.toUpperCase();
  const bag = (target.state?._attrflags ?? target.data?._attrflags) as
    | Record<string, string[]>
    | undefined;
  if (!bag) return [];
  const list = bag[key] ?? bag[attrName] ?? [];
  return list.map((f) => String(f).toLowerCase());
}

function isPrivateName(attrName: string): boolean {
  // Leading underscore: internal / staff attrs (even on owned objects).
  return attrName.trim().startsWith("_");
}

/**
 * May the actor see this attribute name/value?
 * Rank 0: no `_`* names, no wizard-flagged attrs (even if owner).
 */
export function canSeeAttr(
  actorFlags: FlagSource,
  attrName: string,
  attrFlagList: string[] = [],
): boolean {
  const rank = privRank(actorFlags);
  const fl = attrFlagList.map((f) => f.toLowerCase());

  if (isPrivateName(attrName) && rank <= 0) return false;
  if (fl.includes("wizard") && rank < WIZARD_RANK) return false;
  if (fl.includes("hidden") && rank <= 0) return false;
  return true;
}

/**
 * May the actor set/clear this attribute?
 * Requires object edit rights separately (call canEditObject first).
 */
export function canSetAttr(
  actorFlags: FlagSource,
  attrName: string,
  attrFlagList: string[] = [],
): boolean {
  const rank = privRank(actorFlags);
  const fl = attrFlagList.map((f) => f.toLowerCase());

  if (isPrivateName(attrName) && rank <= 0) return false;
  if (fl.includes("wizard") && rank < WIZARD_RANK) return false;
  return true;
}

/**
 * Full attribute write check: object edit + attr rules.
 */
export async function canEditAttr(
  actor: { id?: string; flags?: FlagSource },
  target: {
    id?: string;
    flags?: FlagSource;
    state?: Record<string, unknown>;
    data?: Record<string, unknown>;
  },
  attrName: string,
  attrFlagList?: string[],
): Promise<boolean> {
  if (!(await canEditObject(actor, target))) return false;
  const fl = attrFlagList ?? attrFlagsOf(target, attrName);
  return canSetAttr(actor.flags, attrName, fl);
}
