/**
 * +glance — one-line-per-occupant room scan.
 */
import { addCmd } from "../../commands/addCmd.ts";
import type { IUrsamuSDK, IDBObj } from "../../commands/types.ts";
import { divider, footer, header } from "../../format/handlers.ts";
import { fmtIdle } from "./time-fmt.ts";

function shortDesc(obj: IDBObj): string {
  const attrs =
    (obj.state?.attributes as
      | Array<{ name?: string; value?: string }>
      | undefined) ?? [];
  return (
    attrs.find((a) => {
      const n = (a.name ?? "").toLowerCase();
      return n === "short-desc" || n === "shortdesc";
    })?.value ?? ""
  );
}

function plainName(p: IDBObj): string {
  return String((p.state?.name as string) || p.name || "").trim();
}

function roomPlayers(here: IDBObj): IDBObj[] {
  return (here.contents ?? []).filter(
    (o: IDBObj) =>
      o.flags.has("player") && o.flags.has("connected"),
  );
}

/** Telnet glance with full layout chrome. */
export function renderGlanceText(
  u: IUrsamuSDK,
  roomName: string,
  players: IDBObj[],
): string {
  const width = (u.me.state?.termWidth as number) || 78;
  const lines: string[] = [];
  lines.push(
    header(`At a glance — ${roomName}`, "=", width),
  );
  if (players.length === 0) {
    lines.push("  No one else is here.");
  } else {
    lines.push(
      `  ${"Name".padEnd(26)}${"Idle".padEnd(6)}Short-desc`,
    );
    lines.push(divider("", "-", width));
    for (const p of players) {
      const name = u.util.displayName(p, u.me);
      const idle = fmtIdle(p.state?.lastCommand);
      const desc = shortDesc(p);
      // Approximate columns (color codes don't take visible width)
      lines.push(
        `  ${name.padEnd(26)}${idle.padEnd(6)}${desc}`,
      );
    }
  }
  lines.push(divider("", "-", width));
  const n = players.length;
  lines.push(
    `  ${n} player${n === 1 ? "" : "s"} here.`,
  );
  lines.push(footer("", "=", width));
  return lines.join("\n");
}

function sendGlanceWeb(
  u: IUrsamuSDK,
  roomName: string,
  players: IDBObj[],
): void {
  if (!u.ui?.layout) return;
  const items = players.map((p) => {
    const name = plainName(p);
    return {
      id: p.id,
      label: u.util.displayName(p, u.me),
      meta: fmtIdle(p.state?.lastCommand),
      sublabel: shortDesc(p) || undefined,
      action: name
        ? { type: "cmd" as const, cmd: `look ${name}` }
        : { type: "cmd" as const, cmd: `look #${p.id}` },
    };
  });
  const n = players.length;
  u.ui.layout({
    components: [
      {
        type: "header",
        title: `At a glance — ${roomName}`,
      },
      {
        type: "entity-list",
        title: n === 0
          ? "Empty"
          : (n === 1 ? "1 player" : `${n} players`),
        items,
      },
      {
        type: "text",
        content: n === 0
          ? "No one else is here."
          : `${n} player${n === 1 ? "" : "s"} here.`,
      },
    ],
    meta: { type: "glance" },
  });
}

export async function execGlance(u: IUrsamuSDK): Promise<void> {
  const here = u.here;
  if (!here?.id) {
    u.send("You aren't anywhere.");
    return;
  }

  const players = roomPlayers(here).sort((a, b) =>
    plainName(a).localeCompare(plainName(b), undefined, {
      sensitivity: "base",
    })
  );
  const roomName = String(here.name ?? "here");

  if (u.clientType === "web") {
    sendGlanceWeb(u, roomName, players);
    return;
  }
  u.send(renderGlanceText(u, roomName, players));
}

addCmd({
  name: "+glance",
  pattern: /^\+glance$/i,
  lock: "connected",
  category: "Social",
  help: `+glance  — One-line-per-occupant scan of the room.

Shows each connected player's name, idle, and short-desc.
Telnet uses layout header/divider/footer. Web play shows
an interactive list (click to look).

Examples:
  +glance`,
  exec: execGlance,
});
