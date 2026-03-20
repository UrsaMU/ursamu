import type { IAttribute } from "../@types/IAttribute.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";
import { dbojs } from "../services/Database/index.ts";

/**
 * recursively check for an attribute on an object or its parents
 * @param obj The object to check
 * @param attr The attribute to check for
 * @returns The attribute if found, or undefined
 */
export const getAttribute = async (
  obj: IDBOBJ,
  attr: string,
  visited: Set<string> = new Set()
): Promise<IAttribute | undefined> => {
  const attribute = obj.data?.attributes?.find(
    (a) => a.name.toLowerCase() === attr.toLowerCase()
  );

  if (attribute) return attribute;

  if (obj.data?.parent) {
    const parentId = obj.data.parent as string;
    visited.add(obj.id);
    if (visited.has(parentId)) return undefined; // Cycle detected
    const parent = await dbojs.queryOne({ id: parentId });
    if (parent) return getAttribute(parent, attr, visited);
  }

  return undefined;
};
