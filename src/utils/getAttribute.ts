import type { IAttribute } from "../@types/IAttribute.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";
import { dbojs } from "@ursamu/mush";

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
    (a: IAttribute) => a.name.toLowerCase() === attr.toLowerCase(),
  );
  if (attribute) return attribute;

  if (obj.data?.parent) {
    const parentId = obj.data.parent as string;
    visited.add(obj.id);
    if (visited.has(parentId)) return undefined;
    const parent = await dbojs.queryOne({ id: parentId });
    if (parent) return getAttribute(parent, attr, visited);
  }
  return undefined;
};
