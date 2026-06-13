// dbojs.query returns the engine's raw storage shape:
//   { id, flags: string, data: { name, location, state, contents } }
// but the SDK / mock store presents a flat shape:
//   { id, name, location, flags: Set, state, contents }
//
// Most plugin code is written against the flat shape. This module bridges
// the two so hook/tick callsites can use dbojs and still see consistent
// objects. It exports:
//
//   - normalize(raw)         coerce either shape into the flat shape
//   - flagsToSet(raw)        coerce flags (string, array, Set) into a Set
//   - queryByLocation(rid)   dbojs.query that matches both flat and nested
//                            storage formats (handles mock + prod).

import { dbojs, type IDBObj } from "@ursamu/ursamu";

interface RawEngineObj {
  id: string;
  flags: unknown;
  data?: Record<string, unknown>;
  // flat-shape fallbacks (mock store / SDK outputs):
  name?: string;
  location?: string;
  state?: Record<string, unknown>;
  contents?: unknown[];
}

/** Coerce any flags representation into a Set of tags. */
export function flagsToSet(raw: unknown): Set<string> {
  if (raw instanceof Set) return raw as Set<string>;
  if (Array.isArray(raw)) return new Set(raw.filter((s) => typeof s === "string") as string[]);
  return new Set(String(raw ?? "").split(/[,\s]+/).filter(Boolean));
}

/**
 * Normalize a raw dbojs result (or a mock-store flat record) into the flat
 * IDBObj shape the rest of the plugin expects.
 */
export function normalize(raw: RawEngineObj): IDBObj {
  // Prefer top-level fields (flat / mock shape) and fall back to nested
  // fields under `data` (engine-raw shape). Most objects only set one or
  // the other, but mixed shapes (e.g. test fixtures with both top-level
  // `location` and nested `data.destination`) are handled by reading from
  // whichever side has the field.
  const d = raw.data ?? {};
  // Flags are top-level in both shapes; fall back to data.flags if a mixed
  // fixture only set them under data (M4 defense-in-depth).
  const rawFlags = raw.flags ?? (d as Record<string, unknown>).flags;
  // deno-lint-ignore no-explicit-any
  const result: any = {
    id: raw.id,
    name: raw.name ?? (d.name as string | undefined),
    location: raw.location ?? (d.location as string | undefined),
    flags: flagsToSet(rawFlags),
    state: raw.state ?? (d.state as Record<string, unknown>) ?? {},
    contents: raw.contents ?? (d.contents as IDBObj[]) ?? [],
  };
  // Preserve the raw `data` blob for downstream consumers that need to
  // read engine-specific fields like data.destination on exits.
  if (raw.data) result.data = raw.data;
  return result as IDBObj;
}

/**
 * Query objects in a room across both storage shapes. The engine stores
 * location under data.location; the test mock stores it at top-level. Both
 * are scanned and merged (by id, no duplicates).
 */
export async function queryByLocation(roomId: string): Promise<IDBObj[]> {
  // deno-lint-ignore no-explicit-any
  const flat = (await dbojs.query({ location: roomId } as any)) as unknown as RawEngineObj[];
  // deno-lint-ignore no-explicit-any
  const nested = (await dbojs.query({ "data.location": roomId } as any)) as unknown as RawEngineObj[];

  const seen = new Set<string>();
  const out: IDBObj[] = [];
  for (const r of [...flat, ...nested]) {
    if (!r?.id || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(normalize(r));
  }
  return out;
}

/**
 * Query exits leaving a room. Returns the destination room ids. Handles
 * both flat ({location, flags, data:{destination}}) and nested storage.
 */
export async function exitsFromRoom(roomId: string): Promise<string[]> {
  const objs = await queryByLocation(roomId);
  const out: string[] = [];
  for (const o of objs) {
    if (!o.flags?.has?.("exit")) continue;
    // Exit destination can live at o.data.destination (engine) or
    // o.state.destination (some setups). Try both.
    // deno-lint-ignore no-explicit-any
    const anyO = o as any;
    const dest = anyO.data?.destination ?? anyO.state?.destination ??
      anyO.destination;
    if (typeof dest === "string") out.push(dest);
  }
  return out;
}
