// core/lookConformat.ts -- CONFORMAT player/thing rows for look.
//
// Player row (fixed cells, ≤78-col hard cap):
//   " " + name clip 25 + role clip 8 + idle clip 4 + short-desc
// short-desc is one line, truncated to remaining width.
// NAWS never widens CONFORMAT past 78.

import type { IUrsamuSDK, IDBObj } from "@ursamu/mush";
import { divider, dbrefWithFlags, getConfig } from "@ursamu/mush";
import {
  lookerWidth,
  visualLen,
  visualTruncate,
  DEFAULT_LOOK_WIDTH,
} from "./lookWidth.ts";
import { getEqMeta } from "./eq.ts";

/** Name 25 cols; short-desc fills rest (clipped to width). */
const NAME_W = 25;
const ROLE_W = 8;
const IDLE_W = 4;

// Keep short — long prompt overflows narrow terminals.
const SHORTDESC_PROMPT = "%ch%cx&short-desc me=<desc>%cn";

const ROLE_TAGS = [
  { flag: "wizard", display: "(Wizard)" },
  { flag: "superuser", display: "(Root)" },
  { flag: "admin", display: "(Admin)" },
  { flag: "staff", display: "(Staff)" },
];

function showDbref(looker: IDBObj, canEdit: boolean): boolean {
  if (canEdit) return true;
  return (
    looker.flags.has("wizard") ||
    looker.flags.has("admin") ||
    looker.flags.has("superuser") ||
    looker.flags.has("staff") ||
    looker.flags.has("builder")
  );
}

function nameWithDbref(
  display: string,
  obj: IDBObj,
  looker: IDBObj,
  canEdit: boolean,
): string {
  if (!showDbref(looker, canEdit)) return display;
  return `${display}(${dbrefWithFlags(obj.id, obj.flags)})`;
}

function coloredName(
  obj: IDBObj,
  u: IUrsamuSDK,
  looker: IDBObj,
): string {
  try {
    const d = u.util.displayName(obj, looker);
    if (d?.trim()) return d;
  } catch { /* fall through */ }
  const moniker = (obj.state?.moniker as string) || "";
  if (moniker) return moniker;
  return (obj.state?.name as string) || obj.name || "Unknown";
}

function formatIdle(lastCommand: number | undefined): string {
  if (lastCommand === undefined || Number.isNaN(lastCommand)) {
    return "%ch%cx0s%cn";
  }
  const diff = Math.floor((Date.now() - lastCommand) / 1000);
  if (diff <= 0) return "%ch%cx0s%cn";
  if (diff < 60) return `%cg${diff}s%cn`;
  if (diff < 600) return `%cg${Math.floor(diff / 60)}m%cn`;
  if (diff < 3600) return `%cy${Math.floor(diff / 60)}m%cn`;
  if (diff < 86400) return `%cy${Math.floor(diff / 3600)}h%cn`;
  return `%ch%cx${Math.floor(diff / 86400)}d%cn`;
}

function getCharShortDesc(obj: IDBObj): string {
  const attrs =
    (obj.state?.attributes as {
      name?: string;
      value?: string;
    }[]) || [];
  const sd = attrs.find(
    (a) =>
      a.name?.toLowerCase() === "short-desc" ||
      a.name?.toLowerCase() === "shortdesc",
  );
  return sd?.value || "";
}

function roleTag(obj: IDBObj): string {
  if (obj.flags.has("npc")) return "(NPC)";
  let tags = ROLE_TAGS;
  try {
    // Prefer game config (roses uses <Root>, etc.).
    const configured = getConfig<
      Array<{ flag: string; display: string }>
    >("plugins.globals.theme.look.roleTags");
    if (Array.isArray(configured) && configured.length > 0) {
      tags = configured;
    }
  } catch {
    /* config unavailable — built-in tags */
  }
  for (const t of tags) {
    if (obj.flags?.has(t.flag)) return t.display;
  }
  return "";
}

/** Pad or clip to a fixed visible width (keeps columns aligned). */
function padClip(s: string, target: number): string {
  const raw = String(s ?? "");
  const len = visualLen(raw);
  if (len === target) return raw;
  if (len > target) return visualTruncate(raw, target);
  return raw + " ".repeat(target - len);
}

/** Short-desc stays on one line — no %r / newline wrap. */
function oneLineDesc(desc: string): string {
  return String(desc ?? "")
    .replace(/%r/gi, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

function formatPlayerRow(
  u: IUrsamuSDK,
  looker: IDBObj,
  c: IDBObj,
  canEdit: boolean,
  width: number,
): string {
  const isNpc = c.flags.has("npc");
  const cName = coloredName(c, u, looker);
  const role = isNpc ? "(NPC)" : roleTag(c);
  const idle = isNpc
    ? ""
    : formatIdle(c.state?.lastCommand as number | undefined);
  const desc = oneLineDesc(
    getCharShortDesc(c) || (isNpc ? "" : SHORTDESC_PROMPT),
  );
  const nameWithRef = nameWithDbref(cName, c, looker, canEdit);

  const prefix =
    ` ${padClip(nameWithRef, NAME_W)}` +
    `${padClip(role, ROLE_W)}` +
    `${padClip(idle, IDLE_W)}`;
  const prefixLen = visualLen(prefix);
  if (prefixLen >= width) {
    return visualTruncate(prefix.replace(/\s+$/, ""), width);
  }
  const maxDescLen = width - prefixLen;
  const finalDesc = visualTruncate(desc, maxDescLen);
  return (prefix + finalDesc).replace(/\s+$/, "");
}

function formatThingRow(
  u: IUrsamuSDK,
  looker: IDBObj,
  obj: IDBObj,
  canEdit: boolean,
  width: number,
): string {
  let label = coloredName(obj, u, looker);
  label = nameWithDbref(label, obj, looker, canEdit);
  const meta = getEqMeta(obj);
  let tag = "";
  if (meta.wielded) tag = " (wielded)";
  else if (meta.worn) tag = " (worn)";
  if (meta.concealed) tag += " [concealed]";
  const line = `  ${label}${tag}`;
  if (visualLen(line) <= width) return line;
  return visualTruncate(line, width);
}

function pushSection(
  lines: string[],
  title: string,
  width: number,
): void {
  // divider may be multi-line (themed); keep each physical line intact.
  const block = divider(title, "-", width);
  for (const ln of String(block).split("\n")) {
    lines.push(ln);
  }
}

/** CONFORMAT -- CoFD columns; short-desc truncated to NAWS. */
export async function wodConformatHandler(
  u: IUrsamuSDK,
  target: IDBObj,
  idList: string,
): Promise<string | null> {
  const ids = idList.split(" ")
    .map((id) => id.replace("#", "").trim())
    .filter(Boolean);
  const contents = target.contents || [];
  const visible = ids
    .map((id) => contents.find((c) => c.id === id))
    .filter((o): o is IDBObj => o != null);

  const looker = u.me;
  // 78-char rule: never let NAWS expand CONFORMAT rows past 78.
  const width = Math.min(lookerWidth(looker), DEFAULT_LOOK_WIDTH);

  const people = visible.filter(
    (o) =>
      (o.flags.has("player") && o.flags.has("connected")) ||
      o.flags.has("npc"),
  );
  const things = visible.filter(
    (o) =>
      !o.flags.has("player") &&
      !o.flags.has("npc") &&
      !o.flags.has("exit") &&
      !o.flags.has("room"),
  );

  const lines: string[] = [];

  if (people.length > 0) {
    pushSection(lines, "Players", width);
    for (const c of people) {
      const canEdit = await u.canEdit(looker, c);
      lines.push(formatPlayerRow(u, looker, c, canEdit, width));
    }
  }

  if (things.length > 0) {
    pushSection(lines, "Contents", width);
    for (const t of things) {
      const canEdit = await u.canEdit(looker, t);
      lines.push(formatThingRow(u, looker, t, canEdit, width));
    }
  }

  if (lines.length === 0) return null;
  return lines.join("\n");
}
