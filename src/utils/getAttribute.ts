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
  attr: string
): Promise<IAttribute | undefined> => {
  const attribute = obj.data?.attributes?.find(
    (a) => a.name.toLowerCase() === attr.toLowerCase()
  );

  if (attribute) return attribute;

  if (obj.data?.parent) {
    const parent = await dbojs.queryOne({ id: obj.data.parent as string });
    if (parent) return getAttribute(parent, attr);
  }

  return undefined;
};
