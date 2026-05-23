import { addCmd } from "../services/commands/cmdParser.ts";
import type { IUrsamuSDK, IDBObj } from "../@types/UrsamuSDK.ts";
import { header, divider, footer } from "../utils/format.ts";
import { resolveFormat } from "../utils/resolveFormat.ts";

const WIDTH = 78;
const NO_DESCRIPTION = "You see nothing special.";

/** Bare moniker/name, plus `(#id)` when actor can edit. No flag codes — that
 *  detail belongs to examine, not look. */
function headerName(target: IDBObj, canEdit: boolean): string {
  const base = (target.state?.moniker as string | undefined)
    || (target.state?.name as string | undefined)
    || target.name
    || "Unknown";
  return canEdit ? `${base}(#${target.id})` : base;
}

const visualLen = (s: string): number =>
  s.replace(/<#[0-9a-fA-F]{6}>/g, "").replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "").length;

function wordWrap(text: string, width: number): string {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.trim() === "") { out.push(""); continue; }
    let i = 0;
    while (i < paragraph.length && (paragraph[i] === " " || paragraph[i] === "\t")) i++;
    const indent = paragraph.slice(0, i);
    const indentW = visualLen(indent);
    if (visualLen(paragraph) <= width) { out.push(paragraph); continue; }
    const words = paragraph.slice(i).split(" ");
    let line = indent + words[0];
    let lineLen = indentW + visualLen(words[0]);
    for (let w = 1; w < words.length; w++) {
      const wl = visualLen(words[w]);
      if (lineLen + 1 + wl > width) { out.push(line); line = words[w]; lineLen = wl; }
      else { line += " " + words[w]; lineLen += 1 + wl; }
    }
    if (line.length > 0) out.push(line);
  }
  return out.join("\n");
}

function nColumn(items: string[], n: number, width: number): string {
  const inner = width - 1;
  const colW = Math.floor(inner / n);
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += n) {
    const row = items.slice(i, i + n);
    const cells = row.map((c, j) => {
      if (j === row.length - 1) return c;
      const pad = Math.max(1, colW - visualLen(c));
      return c + " ".repeat(pad);
    });
    rows.push(" " + cells.join(""));
  }
  return rows.join("\n");
}

function exitDisplay(e: IDBObj): string {
  const raw = (e.state.name as string) || e.name || "";
  const parts = raw.split(";").map((p) => p.trim()).filter(Boolean);
  const name = parts[0] || "???";
  const alias = parts[1] || "";
  if (alias && alias.toLowerCase() !== name.toLowerCase()) {
    return `<%cc${alias}%cn> ${name}`;
  }
  return name;
}

async function renderRoom(u: IUrsamuSDK, actor: IDBObj, target: IDBObj, showContents: boolean, canEdit: boolean): Promise<string> {
  const lines: string[] = [];

  const displayName = headerName(target, canEdit);
  const nameOverride = await resolveFormat(u, target, "NAMEFORMAT", displayName);
  lines.push(nameOverride ?? header(displayName, "=", WIDTH));
  lines.push("");

  const rawDesc = (target.state.description as string) || NO_DESCRIPTION;
  const parsedDesc = u.util.parseDesc
    ? await u.util.parseDesc(rawDesc, actor, target)
    : rawDesc;
  const descOverride = await resolveFormat(u, target, "DESCFORMAT", parsedDesc);
  lines.push(descOverride ?? wordWrap(parsedDesc, WIDTH));

  const contents = target.contents || [];
  const characters = contents.filter((o) => o.flags.has("player") && o.flags.has("connected") && o.id !== actor.id);
  const objects = contents.filter((o) => !o.flags.has("player") && !o.flags.has("exit") && !o.flags.has("room"));
  const exits = contents.filter((o) => o.flags.has("exit"));

  if (showContents) {
    const visible = [...characters, ...objects];
    if (visible.length > 0) {
      const idList = visible.map((o) => `#${o.id}`).join(" ");
      const conOverride = await resolveFormat(u, target, "CONFORMAT", idList);
      if (conOverride != null) {
        lines.push(conOverride);
      } else {
        if (characters.length > 0) {
          lines.push(divider("Players", "-", WIDTH));
          for (const c of characters) lines.push(` ${u.util.displayName(c, actor)}`);
        }
        if (objects.length > 0) {
          lines.push(divider("Contents", "-", WIDTH));
          for (const o of objects) lines.push(` ${u.util.displayName(o, actor)}`);
        }
      }
    }
  }

  if (exits.length > 0) {
    const idList = exits.map((e) => `#${e.id}`).join(" ");
    const exitOverride = await resolveFormat(u, target, "EXITFORMAT", idList);
    if (exitOverride != null) {
      lines.push(exitOverride);
    } else {
      lines.push(divider("Exits", "-", WIDTH));
      lines.push(nColumn(exits.map(exitDisplay), 3, WIDTH));
    }
  }

  lines.push(footer("", "=", WIDTH));
  return lines.join("\n");
}

async function renderSingle(u: IUrsamuSDK, actor: IDBObj, target: IDBObj, showContents: boolean, canEdit: boolean): Promise<string> {
  const lines: string[] = [];

  const displayName = headerName(target, canEdit);
  const nameOverride = await resolveFormat(u, target, "NAMEFORMAT", displayName);
  lines.push(nameOverride ?? header(displayName, "=", WIDTH));
  lines.push("");

  const rawDesc = (target.state.description as string) || NO_DESCRIPTION;
  const parsedDesc = u.util.parseDesc
    ? await u.util.parseDesc(rawDesc, actor, target)
    : rawDesc;
  const descOverride = await resolveFormat(u, target, "DESCFORMAT", parsedDesc);
  lines.push(descOverride ?? wordWrap(parsedDesc, WIDTH));

  if (showContents && target.contents && target.contents.length > 0) {
    const players = target.contents.filter((c) => c.flags.has("player"));
    const things = target.contents.filter((c) => !c.flags.has("player") && !c.flags.has("exit"));
    const visible = [...players, ...things];
    if (visible.length > 0) {
      const idList = visible.map((o) => `#${o.id}`).join(" ");
      const conOverride = await resolveFormat(u, target, "CONFORMAT", idList);
      if (conOverride != null) {
        lines.push(conOverride);
      } else {
        if (players.length > 0) {
          lines.push(divider("Players", "-", WIDTH));
          for (const c of players) lines.push(` ${u.util.displayName(c, actor)}`);
        }
        if (things.length > 0) {
          lines.push(divider("Carrying", "-", WIDTH));
          for (const o of things) lines.push(` ${u.util.displayName(o, actor)}`);
        }
      }
    }
  }

  lines.push(footer("", "=", WIDTH));
  return lines.join("\n");
}

export async function execLook(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const arg = (u.cmd.args[0] || "").trim();

  if (actor.flags.has("blind")) {
    u.send("You can't see anything!");
    return;
  }

  let target: IDBObj = u.here;
  if (arg) {
    const results = await u.db.search(arg);
    const found = results.find((r) =>
      r.id === u.here.id ||
      u.here.contents?.some((c) => c.id === r.id) ||
      actor.contents?.some((c) => c.id === r.id)
    );
    if (!found) { u.send("I can't find that here."); return; }
    target = found;
  }

  const canEditTarget = await u.canEdit(actor, target);
  const isOpaque = target.flags.has("opaque");
  const showContents = !isOpaque || canEditTarget;

  const out = target.flags.has("room")
    ? await renderRoom(u, actor, target, showContents, canEditTarget)
    : await renderSingle(u, actor, target, showContents, canEditTarget);

  u.send(out);

  if (!target.flags.has("room")) {
    const odesc = await u.attr.get(target.id, "ODESC");
    if (odesc) {
      const actorName = u.util.displayName(actor, actor);
      u.here.broadcast(`${actorName} ${odesc}`, { exclude: [actor.id] } as Record<string, unknown>);
    }
  }
}

addCmd({
  name: "look",
  pattern: /^(?:look|l)(?:\s+(.*))?$/i,
  lock: "connected",
  category: "Navigation",
  help: `look [<object>]  — Look at your surroundings, or examine a specific object.

Without an argument, looks at the room you are in.
Aliases: l

Examples:
  look
  look sword
  look Alice`,
  exec: execLook,
});
