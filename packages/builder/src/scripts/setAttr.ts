import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";

export const aliases = ["setAttr"];

/**
 * &ATTR <object>=<value>
 *
 * Sets a named attribute on an object. Omit the value to clear the attribute.
 * The attribute name is always uppercased.
 *
 * Examples:
 *   &COLOR widget=red
 *   &COLOR widget=          — clears the attribute
 */
export default async (u: IUrsamuSDK) => {
  // Parser delivers: &ATTRNAME obj=value  → args[0] = "ATTRNAME obj=value"
  const raw = (u.cmd.args[0] || "").trim();
  const spaceIdx = raw.indexOf(" ");

  if (spaceIdx === -1) {
    u.send("Usage: &ATTR <object>=<value>");
    return;
  }

  const attrName  = raw.slice(0, spaceIdx).trim().toUpperCase();
  const rest      = raw.slice(spaceIdx + 1).trim();
  const eqIdx     = rest.indexOf("=");
  const targetName = eqIdx === -1 ? rest : rest.slice(0, eqIdx);
  const value      = eqIdx === -1 ? undefined : rest.slice(eqIdx + 1);

  if (!attrName || !targetName.trim()) {
    u.send("Usage: &ATTR <object>=<value>");
    return;
  }

  const target = await u.util.target(u.me, targetName.trim());
  if (!target) { u.send("Target not found."); return; }
  if (!(await u.canEdit(u.me, target))) { u.send("Permission denied."); return; }

  // deno-lint-ignore no-explicit-any
  const attributes     = (target.state.attributes as any[]) || [];
  // deno-lint-ignore no-explicit-any
  const existingIndex  = attributes.findIndex((a: any) => a.name === attrName);

  if (value !== undefined) {
    const trimmedValue = value.trim();
    if (trimmedValue.length > 4096) {
      u.send("Attribute value too long (max 4096 characters).");
      return;
    }
    if (existingIndex < 0 && attributes.length >= 100) {
      u.send("Too many attributes (limit 100). Remove some before adding new ones.");
      return;
    }
    const newAttr = { name: attrName, value: trimmedValue, setter: u.me.id, type: "attribute" };
    if (existingIndex >= 0) {
      attributes[existingIndex] = newAttr;
    } else {
      attributes.push(newAttr);
    }
    u.send(`Set %ch${attrName}%cn on ${u.util.displayName(target, u.me)}.`);
  } else {
    if (existingIndex >= 0) {
      attributes.splice(existingIndex, 1);
      u.send(`Cleared %ch${attrName}%cn on ${u.util.displayName(target, u.me)}.`);
    } else {
      u.send(`%ch${attrName}%cn not set on ${u.util.displayName(target, u.me)}.`);
    }
  }

  await u.db.modify(target.id, "$set", { "data.attributes": attributes });
};
