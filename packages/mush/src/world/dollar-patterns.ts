/**
 * dollar-patterns.ts
 *
 * Utilities for MUX $pattern command dispatch.
 *
 * Objects can define user-commanded actions via attributes whose names start
 * with `$`. When a player types something that matches the pattern the action
 * is evaluated as softcode (substituting captures as %0–%9) and the result
 * is dispatched as a command.
 *
 * Pattern syntax (glob):
 *   $tell *          matches "tell hello" with %0="hello"
 *   $give * to *     matches "give sword to Bob" with %0="sword" %1="Bob"
 *   $greet           exact match (no wildcards)
 *
 * Matching is case-insensitive. Wildcards are greedy left-to-right.
 */
import type { IDBOBJ } from "./types.ts";

/** Attribute entry shape used in IDBOBJ.data.attributes arrays. */
export interface IAttribute {
  name:    string;
  value:   string;
  type?:   string;
  setter?: string;
}

/**
 * Match `input` against a glob `pattern` (case-insensitive).
 * Returns an array of captured wildcard values, or null if no match.
 */
export function matchGlob(pattern: string, input: string): string[] | null {
  const lp = pattern.toLowerCase();
  const li = input.toLowerCase();

  const stars = lp.split("*");
  if (stars.length === 1) {
    return li === lp ? [] : null;
  }

  const captures: string[] = [];
  let pos = 0;

  for (let i = 0; i < stars.length; i++) {
    const seg = stars[i];

    if (i === 0) {
      if (!li.startsWith(seg)) return null;
      pos = seg.length;
    } else if (i === stars.length - 1) {
      if (seg === "") {
        captures.push(input.slice(pos));
      } else {
        if (!li.endsWith(seg)) return null;
        const captureEnd = input.length - seg.length;
        if (captureEnd < pos) return null;
        captures.push(input.slice(pos, captureEnd));
      }
    } else {
      const idx = li.indexOf(seg, pos);
      if (idx === -1) return null;
      captures.push(input.slice(pos, idx));
      pos = idx + seg.length;
    }
  }

  return captures;
}

export interface DollarMatch {
  obj: IDBOBJ;
  attr: IAttribute;
  captures: string[];
}

// Real DBO uses typed Query<T>; keep loose for callers.
// deno-lint-ignore no-explicit-any
type DollarDb = {
  // deno-lint-ignore no-explicit-any
  query: (...args: any[]) => Promise<IDBOBJ[]>;
  // deno-lint-ignore no-explicit-any
  queryOne: (...args: any[]) => Promise<IDBOBJ | null | undefined>;
};

/**
 * Scan an object's attributes for `$pattern` attrs that match `input`.
 * Local attrs first; then parents (same order as getAttribute).
 * Returns the first match found, or null.
 */
async function scanObj(
  obj: IDBOBJ,
  input: string,
  dbojs: DollarDb,
  visited: Set<string> = new Set(),
): Promise<DollarMatch | null> {
  const attrs = (obj.data?.attributes as IAttribute[] | undefined) ?? [];
  for (const attr of attrs) {
    if (!attr.name.startsWith("$")) continue;

    const slashIdx = attr.name.indexOf("/", 1);
    const pattern = slashIdx === -1
      ? attr.name.slice(1)
      : attr.name.slice(1, slashIdx);

    const captures = matchGlob(pattern.trim(), input);
    if (captures !== null) return { obj, attr, captures };
  }

  const flags = String(obj.flags ?? "").toLowerCase();
  if (flags.split(/\s+/).includes("no_inherit")) return null;

  const parentId = obj.data?.parent as string | undefined;
  if (!parentId) return null;
  visited.add(obj.id);
  if (visited.has(parentId)) return null;
  const parent = await dbojs.queryOne({ id: parentId });
  if (!parent) return null;
  // Match is attributed to the leaf object that received the command.
  const hit = await scanObj(parent as IDBOBJ, input, dbojs, visited);
  if (!hit) return null;
  return { obj, attr: hit.attr, captures: hit.captures };
}

/**
 * Scan all reachable objects for a matching `$pattern` attribute.
 *
 * Scan order (mirrors TinyMUX):
 *   1. Actor's inventory (objects the player is carrying)
 *   2. Room contents (other objects in the same room)
 *   3. Room object itself
 *   4. Master room contents (if configured and different from current room)
 *
 * Returns the first match found, or null if nothing matches.
 */
export async function findDollarPattern(
  actor: IDBOBJ,
  input: string,
  masterRoomId: string,
  dbojs: DollarDb,
): Promise<DollarMatch | null> {
  const candidates: IDBOBJ[] = [];

  const inventory = await dbojs.query({ location: actor.id });
  candidates.push(...inventory);

  if (actor.location) {
    const roomContents = await dbojs.query({ location: actor.location });
    for (const obj of roomContents) {
      if (obj.id !== actor.id) candidates.push(obj);
    }
    const room = await dbojs.queryOne({ id: actor.location });
    if (room) candidates.push(room);
  }

  if (masterRoomId && masterRoomId !== actor.location) {
    const masterContents = await dbojs.query({ location: masterRoomId });
    for (const obj of masterContents) {
      if (obj.id !== actor.id) candidates.push(obj);
    }
  }

  for (const obj of candidates) {
    const hit = await scanObj(obj, input, dbojs);
    if (hit) return hit;
  }
  return null;
}
