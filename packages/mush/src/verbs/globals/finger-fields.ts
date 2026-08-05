/**
 * +finger field keys, attribute mapping, and readers.
 */
import type { IDBObj } from "../../commands/types.ts";

export const FINGER_PREFIX = "FINGER-";
export const ALIAS_FIELD = "alias";

/** [display_label, field_key, attr_name | null for special] */
export const DEFAULT_FIELDS: Array<[string, string, string | null]> = [
  ["Alias", "alias", null],
  ["Online Times", "online_times", "ONLINE-TIMES"],
  ["Pronouns", "pronouns", "PRONOUNS"],
  ["RP Preferences", "rp_preferences", "RP-PREFERENCES"],
  ["Character Quote", "character_quote", "CHARACTER-QUOTE"],
  ["Position", "position", "POSITION"],
];

export function attrFor(field: string): string {
  for (const [, key, attr] of DEFAULT_FIELDS) {
    if (key === field && attr) return attr;
  }
  return FINGER_PREFIX + field.toUpperCase().replace(/_/g, "-");
}

export function humanize(key: string): string {
  return key
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function readAttr(
  obj: IDBObj,
  name: string,
): string | undefined {
  const attrs =
    (obj.state?.attributes as
      | Array<{ name: string; value: string }>
      | undefined) ?? [];
  const hit = attrs.find(
    (a) => a.name.toUpperCase() === name.toUpperCase(),
  );
  return hit?.value;
}

export function readFingerField(
  obj: IDBObj,
  field: string,
): string | undefined {
  if (field === ALIAS_FIELD) {
    const a = obj.state?.alias as string | undefined;
    return a == null || a === "" ? undefined : a;
  }
  return readAttr(obj, attrFor(field));
}

export function readCustomFinger(
  obj: IDBObj,
): Array<[string, string]> {
  const attrs =
    (obj.state?.attributes as
      | Array<{ name: string; value: string }>
      | undefined) ?? [];
  return attrs
    .filter((a) =>
      a.name.toUpperCase().startsWith(FINGER_PREFIX),
    )
    .map(
      (a) =>
        [a.name.slice(FINGER_PREFIX.length), a.value] as [
          string,
          string,
        ],
    );
}

const COLON_COL = 22;
const WIDTH = 78;

/** Visible length (MUSH color / truecolor tokens take no columns). */
export function visLen(s: string): number {
  return String(s ?? "")
    .replace(
      /%c[a-zA-Z]|%[nrtbR]|<#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})>/gi,
      "",
    )
    .length;
}

/** Truncate to at most `keep` visible columns; close color with %cn. */
export function truncVis(s: string, keep: number): string {
  if (keep <= 0) return "";
  if (visLen(s) <= keep) return s;
  let out = "";
  let n = 0;
  let i = 0;
  const str = String(s ?? "");
  while (i < str.length && n < keep) {
    const rest = str.slice(i);
    const m = rest.match(
      /^(?:%c[a-zA-Z]|%[nrtbR]|<#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})>)/i,
    );
    if (m) {
      out += m[0];
      i += m[0].length;
      continue;
    }
    out += str[i];
    n++;
    i++;
  }
  return `${out}%cn`;
}

export function fitLine(s: string, width = WIDTH): string {
  if (visLen(s) <= width) return s;
  return truncVis(s, Math.max(0, width - 2)) + "..";
}

export function dotLine(
  label: string,
  value: string,
  width = WIDTH,
): string {
  const pre = ` ${label} `;
  const dotsNeeded = Math.max(1, COLON_COL - pre.length);
  const dots = ".".repeat(dotsNeeded);
  const head = `${pre}${dots}: `;
  const room = Math.max(0, width - visLen(head));
  return head + truncVis(value, room);
}
