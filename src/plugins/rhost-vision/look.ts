import { IUrsamuSDK, IDBObj } from "../../@types/UrsamuSDK.ts";

/**
 * Rhost Vision: look.ts
 * Rhost-style room display with bordered headers, sectioned exits,
 * player idle times, and short descriptions.
 *
 * To activate: copy this file to system/scripts/look.ts
 * To deactivate: restore system/scripts/look.ts from look.original.ts
 */

const WIDTH = 78;
const CARDINAL = new Set([
  "n", "s", "e", "w", "ne", "nw", "se", "sw",
  "north", "south", "east", "west",
  "northeast", "northwest", "southeast", "southwest",
  "up", "down", "u", "d",
]);

function centerLine(text: string, char: string, width: number): string {
  const t = ` ${text} `;
  const pad = Math.floor((width - t.length) / 2);
  const right = width - pad - t.length;
  return char.repeat(Math.max(0, pad)) + t + char.repeat(Math.max(0, right));
}

function headerLine(text: string): string {
  return " " + centerLine(text, "=", WIDTH);
}

function sectionLine(text: string): string {
  return " " + centerLine(text, "-", WIDTH);
}

function footerLine(): string {
  return " " + "=".repeat(WIDTH);
}

function formatIdle(lastCommand: number | undefined): string {
  if (!lastCommand) return "??";
  const diff = Math.floor((Date.now() - lastCommand) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

interface IAttr {
  name?: string;
  value?: string;
}

function getShortDesc(obj: IDBObj): string {
  const attrs = (obj.state?.attributes as IAttr[]) || [];
  const sd = attrs.find(
    (a: IAttr) =>
      a.name?.toLowerCase() === "short-desc" ||
      a.name?.toLowerCase() === "shortdesc",
  );
  return sd?.value || "";
}

function getExitInfo(
  exit: IDBObj,
): { name: string; alias: string; isDirection: boolean } {
  const raw = (exit.state?.name as string) || exit.name || "";
  const parts = raw
    .split(";")
    .map((p: string) => p.trim())
    .filter(Boolean);
  const name = parts[0] || "???";
  const aliases = parts.slice(1);

  const isDirection = parts.some((p: string) =>
    CARDINAL.has(p.toLowerCase()),
  );

  let displayAlias = "";
  if (aliases.length > 0) {
    aliases.sort((a: string, b: string) => a.length - b.length);
    displayAlias = aliases[0];
  } else if (CARDINAL.has(name.toLowerCase())) {
    displayAlias = name;
  }

  return { name, alias: displayAlias, isDirection };
}

function formatExitEntry(info: { name: string; alias: string }): string {
  if (info.alias && info.alias.toLowerCase() !== info.name.toLowerCase()) {
    return `${info.name} <${info.alias.toUpperCase()}>`;
  }
  return info.name;
}

function twoColumn(items: string[], colWidth: number): string {
  const lines: string[] = [];
  for (let i = 0; i < items.length; i += 2) {
    const left = (items[i] || "").padEnd(colWidth);
    const right = items[i + 1] || "";
    lines.push(` ${left}${right}`);
  }
  return lines.join("\n");
}

export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const target = u.target || u.here;

  if (!target) {
    u.send("I can't find that here.");
    return;
  }

  if (actor.flags.has("blind")) {
    u.send("You can't see anything!");
    return;
  }

  const canEditTarget = await u.canEdit(actor, target);
  const isOpaque = target.flags.has("opaque");
  const showContents = !isOpaque || canEditTarget;
  const isRoom = target.flags.has("room") || !!(target.contents);

  // ---- Non-room objects: use simple display ----
  if (!isRoom) {
    const nameStr = canEditTarget
      ? `${u.util.displayName(target, actor)}(#${target.id})`
      : u.util.displayName(target, actor);
    const desc =
      (target.state.description as string) || "You see nothing special.";
    u.send(`%ch${nameStr}%cn\n${desc}`);
    return;
  }

  // ---- Room display: Rhost Vision ----
  const description =
    (target.state.description as string) || "You see nothing special.";

  const characters = (target.contents || []).filter(
    (obj: IDBObj) =>
      obj.flags.has("player") &&
      obj.flags.has("connected"),
  );

  const objects = (target.contents || []).filter(
    (obj: IDBObj) =>
      !obj.flags.has("player") &&
      !obj.flags.has("exit") &&
      !obj.flags.has("room"),
  );

  const exits = (target.contents || []).filter((obj: IDBObj) =>
    obj.flags.has("exit"),
  );

  // Strip dbref from room name for display (e.g., "OOC Polis #1" → "OOC Polis")
  const rawRoomName = u.util.displayName(target, actor);
  const roomName = rawRoomName.replace(/\s*#\d+$/, "");
  const lines: string[] = [];

  // Header
  lines.push(headerLine(roomName));
  lines.push("");

  // Description
  lines.push(description);
  lines.push("");

  // Players
  if (showContents && characters.length > 0) {
    lines.push(sectionLine("Players"));
    for (const c of characters) {
      const name = u.util.displayName(c, actor);
      const idle = formatIdle(c.state?.lastCommand as number);
      const shortDesc = getShortDesc(c);
      const nameCol = name.padEnd(20);
      const idleCol = idle.padEnd(6);
      lines.push(` ${nameCol}${idleCol}${shortDesc}`);
    }
  }

  // Contents (non-player, non-exit objects)
  if (showContents && objects.length > 0) {
    lines.push(sectionLine("Contents"));
    for (const o of objects) {
      lines.push(` ${o.name || u.util.displayName(o, actor)}`);
    }
  }

  // Exits — split into Locations and Directions
  if (exits.length > 0) {
    const exitInfos = exits.map(getExitInfo);
    const locations = exitInfos.filter((e) => !e.isDirection);
    const directions = exitInfos.filter((e) => e.isDirection);

    if (locations.length > 0) {
      lines.push(sectionLine("Locations"));
      const formatted = locations.map(formatExitEntry);
      lines.push(twoColumn(formatted, 38));
    }

    if (directions.length > 0) {
      lines.push(sectionLine("Directions"));
      const formatted = directions.map(formatExitEntry);
      lines.push(twoColumn(formatted, 38));
    }
  }

  // Footer
  lines.push(footerLine());

  u.send(lines.join("\n"));

  // Phase 2: Web UI Output
  const components: unknown[] = [];
  components.push(
    u.ui.panel({
      type: "header",
      content: roomName,
      style: "bold centered",
    }),
  );
  components.push(u.ui.panel({ type: "panel", content: description }));

  if (showContents && characters.length > 0) {
    components.push(
      u.ui.panel({
        type: "list",
        title: "Players",
        content: characters.map((c: IDBObj) => ({
          name: u.util.displayName(c, actor),
          desc: getShortDesc(c),
        })),
      }),
    );
  }

  if (showContents && objects.length > 0) {
    components.push(
      u.ui.panel({
        type: "grid",
        title: "Contents",
        content: objects.map((o: IDBObj) => ({ name: o.name, id: o.id })),
      }),
    );
  }

  if (exits.length > 0) {
    components.push(
      u.ui.panel({
        type: "grid",
        title: "Exits",
        content: exits.map((e: IDBObj) => {
          const parts = ((e.state.name as string) || e.name || "").split(";");
          return { name: parts[0], alias: parts[1] || parts[0] };
        }),
      }),
    );
  }

  const mapData = u.util.getMapData
    ? u.util.getMapData(target.id, 2)
    : null;
  u.ui.layout({
    components,
    meta: { targetId: target.id, type: "look", map: mapData },
  });
};
