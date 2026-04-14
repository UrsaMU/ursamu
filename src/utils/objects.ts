/**
 * @module utils/objects
 *
 * Game-object resolution and attribute access helpers.
 */
import type { IAttribute } from "../@types/IAttribute.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";
import { dbojs, counters } from "../services/Database/index.ts";
import { flags } from "../services/flags/flags.ts";
import { moniker as _moniker } from "./session.ts";

// ---------------------------------------------------------------------------
// Identity helpers
// ---------------------------------------------------------------------------

/** Display name for an object: moniker + dbref/flags when `en` controls `tar`. */
export const displayName = (en: IDBOBJ, tar: IDBOBJ, controls = false): string => {
  if (
    controls ||
    en.flags.includes("superuser") ||
    en.flags.includes("admin") ||
    en.id === tar.id ||
    String(tar.data?.owner || "").replace(/^#/, "") === String(en.id).replace(/^#/, "")
  ) {
    return `${_moniker(tar)}(#${tar.id}${flags.codes(tar.flags).toUpperCase()})`;
  }
  return _moniker(tar);
};

// ---------------------------------------------------------------------------
// Target resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a target reference string relative to `en`.
 * Handles: "here", "me", "#dbref", name-prefix search.
 * Pass `global = true` to skip the location-proximity filter.
 */
export const target = async (
  en:     IDBOBJ,
  tar:    string,
  global?: boolean,
): Promise<IDBOBJ | undefined | false> => {
  if (!tar || ["here", "room"].includes(tar.toLowerCase())) {
    return en.location ? await dbojs.queryOne({ id: en.location }) : undefined;
  }
  if (tar.startsWith("#")) return await dbojs.queryOne({ id: tar.slice(1) });
  if (["me", "self"].includes(tar.toLowerCase())) return en;

  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const candidates = await dbojs.query({
    $where: function () {
      const searchPat = new RegExp(`^${escapeRegex(tar)}`, "i");
      const nameParts = (this.data?.name || "").split(";").map((p: string) => p.trim());
      return (
        nameParts.some((p) => searchPat.test(p)) ||
        this.id === tar ||
        (this.data?.alias as string | undefined)?.toLowerCase() === tar.toLowerCase()
      );
    },
  });

  if (!candidates.length) return undefined;
  if (global) return candidates[0];

  const found = candidates.find(obj =>
    obj.location && (
      (en.location && (obj.location === en.location || obj.id === en.location)) ||
      obj.location === en.id
    ),
  );
  return found ?? undefined;
};

// ---------------------------------------------------------------------------
// Attribute access
// ---------------------------------------------------------------------------

/**
 * Recursively fetch a named attribute from an object, walking its parent chain.
 * Returns `undefined` when not found; cycles are detected via a visited set.
 */
export const getAttribute = async (
  obj:     IDBOBJ,
  attr:    string,
  visited: Set<string> = new Set(),
): Promise<IAttribute | undefined> => {
  const attribute = obj.data?.attributes?.find(
    a => a.name.toLowerCase() === attr.toLowerCase(),
  );
  if (attribute) return attribute;

  if (obj.data?.parent) {
    const parentId = obj.data.parent as string;
    visited.add(obj.id);
    if (visited.has(parentId)) return undefined; // cycle guard
    const parent = await dbojs.queryOne({ id: parentId });
    if (parent) return getAttribute(parent, attr, visited);
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/** Atomically increment and return the next object ID for the given counter. */
export async function getNextId(name: string): Promise<string> {
  return (await counters.atomicIncrement(name)).toString();
}
