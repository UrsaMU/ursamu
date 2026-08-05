/**
 * +finger/set field writers.
 */
import type { IUrsamuSDK } from "../../commands/types.ts";
import {
  ALIAS_FIELD,
  attrFor,
  humanize,
  readFingerField,
} from "./finger-fields.ts";

export async function doFingerSet(
  u: IUrsamuSDK,
  rawArgs: string,
): Promise<void> {
  if (!rawArgs) {
    u.send("Usage: +finger/set <field>=<value>");
    return;
  }

  const eqIdx = rawArgs.indexOf("=");
  if (eqIdx === -1) {
    const field = rawArgs.toLowerCase().replace(/\s+/g, "_");
    const val = readFingerField(u.me, field);
    if (val === undefined) {
      u.send(`No finger field '${field}' set.`);
      return;
    }
    if (val === "@@") {
      u.send(`${humanize(field)} is hidden (@@).`);
      return;
    }
    u.send(`${humanize(field)}: ${val}`);
    return;
  }

  const field = rawArgs
    .slice(0, eqIdx)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  const value = u.util.stripSubs(rawArgs.slice(eqIdx + 1)).trim();
  if (!field) {
    u.send("Usage: +finger/set <field>=<value>");
    return;
  }

  const label = humanize(field);
  const current = readFingerField(u.me, field);

  if (field === ALIAS_FIELD) {
    await setAliasField(u, label, current, value);
    return;
  }

  const attrName = attrFor(field);
  if (!value) {
    if (current === undefined) {
      u.send(`${label} was not set.`);
      return;
    }
    await u.attr.clear(u.me.id, attrName);
    u.send(`${label} cleared.`);
    return;
  }

  await u.attr.set(u.me.id, attrName, value);
  if (value === "@@") {
    u.send(`${label} is now hidden from +finger.`);
    return;
  }
  u.send(`${label} set to: ${value}`);
}

async function setAliasField(
  u: IUrsamuSDK,
  label: string,
  current: string | undefined,
  value: string,
): Promise<void> {
  if (!value) {
    if (current === undefined) {
      u.send(`${label} was not set.`);
      return;
    }
    await u.db.modify(u.me.id, "$unset", { "data.alias": 1 });
    u.send(`${label} cleared.`);
    return;
  }
  await u.db.modify(u.me.id, "$set", { "data.alias": value });
  if (value === "@@") {
    u.send(`${label} is now hidden from +finger.`);
    return;
  }
  u.send(`${label} set to: ${value}`);
}
