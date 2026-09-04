/**
 * Parent-walking attribute resolution (TinyMUX-style).
 *
 * Single source for world verbs, softcode get/u/hasattr, and
 * $pattern dispatch. Local attrs win; no_inherit stops the walk.
 */
import { dbojs } from "./dbobjs.ts";
import type { IAttribute, IDBOBJ, IDBObj } from "./types.ts";

type AttrHost = IDBOBJ | IDBObj;

function flagSet(obj: AttrHost): Set<string> {
  if (obj.flags instanceof Set) {
    return new Set(
      [...obj.flags].map((f) => String(f).toLowerCase()),
    );
  }
  return new Set(
    String(obj.flags ?? "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean),
  );
}

function localAttrs(obj: AttrHost): IAttribute[] {
  if ("data" in obj && obj.data?.attributes) {
    return obj.data.attributes as IAttribute[];
  }
  const state = (obj as IDBObj).state;
  if (state?.attributes) {
    return state.attributes as IAttribute[];
  }
  return [];
}

function parentIdOf(obj: AttrHost): string | undefined {
  if ("data" in obj && obj.data?.parent != null) {
    const p = obj.data.parent;
    return p === "" || p == null ? undefined : String(p);
  }
  const state = (obj as IDBObj).state;
  if (state?.parent != null) {
    const p = state.parent;
    return p === "" || p == null ? undefined : String(p);
  }
  return undefined;
}

function findLocal(
  attrs: IAttribute[],
  attr: string,
): IAttribute | undefined {
  const want = attr.toLowerCase();
  return attrs.find((a) => a.name.toLowerCase() === want);
}

/**
 * Recursively fetch a named attribute, walking the parent chain.
 * Cycles are detected via a visited set. Objects with the
 * `no_inherit` flag do not read from their parent.
 */
export async function getAttribute(
  obj: AttrHost,
  attr: string,
  visited: Set<string> = new Set(),
): Promise<IAttribute | undefined> {
  const hit = findLocal(localAttrs(obj), attr);
  if (hit) return hit;

  if (flagSet(obj).has("no_inherit")) return undefined;

  const parentId = parentIdOf(obj);
  if (!parentId) return undefined;

  visited.add(obj.id);
  if (visited.has(parentId)) return undefined;

  const parent = await dbojs.queryOne({ id: parentId });
  if (!parent) return undefined;
  return getAttribute(parent as IDBOBJ, attr, visited);
}

/** Softcode-friendly: attribute value or null if missing. */
export async function getAttributeValue(
  obj: AttrHost,
  attr: string,
): Promise<string | null> {
  const a = await getAttribute(obj, attr);
  return a?.value ?? null;
}
