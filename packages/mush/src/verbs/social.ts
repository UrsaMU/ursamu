import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK, IDBObj } from "../commands/types.ts";
import {
  divider,
  footer,
  header,
  resolveGlobalFormat,
} from "../format/handlers.ts";
import {
  actionsComp,
  cmdAction,
  headerComp,
  lookAction,
  sendCmdLayout,
  sendListLayout,
  textComp,
} from "./cmd-ui.ts";

function formatIdle(lastCmd: unknown): string {
  if (typeof lastCmd !== "number" || isNaN(lastCmd)) return "---";
  const secs = Math.floor((Date.now() - lastCmd) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function playerLabel(u: IUrsamuSDK, p: IDBObj): string {
  if (u.util?.displayName) return u.util.displayName(p, u.me);
  return String(
    (p.state?.moniker as string) ||
      (p.state?.name as string) ||
      p.name ||
      "Unknown",
  );
}

function plainName(p: IDBObj): string {
  return String((p.state?.name as string) || p.name || "").trim();
}

function renderWhoRow(u: IUrsamuSDK, p: IDBObj): string {
  const pName = playerLabel(u, p);
  const idle = formatIdle(p.state?.lastCommand);
  const doing = String((p.state?.doing as string) || "");
  // Visual pad is approximate when monikers carry color codes
  return `${pName.padEnd(24)}${idle.padEnd(8)}${doing}`;
}

/** Default telnet block using game layout chrome. */
function buildDefaultWhoBlock(
  u: IUrsamuSDK,
  players: IDBObj[],
  rows: string[],
): string {
  const width = (u.me.state?.termWidth as number) || 78;
  const lines: string[] = [];
  lines.push(header("Who's Online", "=", width));
  lines.push(
    `  ${"Player".padEnd(22)}${"Idle".padEnd(8)}Doing`,
  );
  lines.push(divider("", "-", width));
  if (rows.length === 0) {
    lines.push("  No one is connected.");
  } else {
    for (const r of rows) {
      lines.push(`  ${r}`);
    }
  }
  lines.push(divider("", "-", width));
  const n = players.length;
  lines.push(
    `  ${n} player${n === 1 ? "" : "s"} online.`,
  );
  lines.push(footer("", "=", width));
  return lines.join("\n");
}

export async function execWho(u: IUrsamuSDK): Promise<void> {
  const players = (await u.db.search({ flags: /connected/i }))
    .filter((p) =>
      p.flags.has("player") && !p.flags.has("dark")
    )
    .sort((a, b) =>
      plainName(a).localeCompare(plainName(b), undefined, {
        sensitivity: "base",
      })
    );

  const rows: string[] = [];
  for (const p of players) {
    const defaultRow = renderWhoRow(u, p);
    const rowOverride = await resolveGlobalFormat(
      u,
      "WHOROWFORMAT",
      defaultRow,
    );
    rows.push(rowOverride != null ? rowOverride : defaultRow);
  }

  const defaultBlock = buildDefaultWhoBlock(u, players, rows);
  const blockOverride = await resolveGlobalFormat(
    u,
    "WHOFORMAT",
    defaultBlock,
  );
  const text = blockOverride != null
    ? blockOverride
    : defaultBlock;

  // Custom WHOFORMAT → plain text for all clients
  const customWho = blockOverride != null &&
    blockOverride !== defaultBlock;
  if (!customWho && u.clientType === "web") {
    const n = players.length;
    sendListLayout(u, {
      metaType: "who",
      title: "Who's Online",
      listTitle: n === 1 ? "1 player" : `${n} players`,
      items: players.map((p) => {
        const name = plainName(p) || playerLabel(u, p);
        const doing = String((p.state?.doing as string) || "");
        return {
          id: p.id,
          label: playerLabel(u, p),
          meta: formatIdle(p.state?.lastCommand),
          sublabel: doing || undefined,
          action: lookAction(name),
        };
      }),
      emptyText: "No one is connected.",
      footerText:
        `${n} player${n === 1 ? "" : "s"} online.`,
      textLines: rows,
    });
    return;
  }
  u.send(text);
}

function scoreText(u: IUrsamuSDK): string {
  const me = u.me;
  const name = (me.state.moniker as string) ||
    (me.state.name as string) || me.name;
  let output = `%chPlayer Scorecard: ${name}%cn\n`;
  output += `DBRef: #${me.id}  Flags: ${
    Array.from(me.flags).join(" ")
  }\n`;
  output += `Doing: ${
    (me.state.doing as string) || "Nothing."
  }\n`;
  output += `Money: ${
    (me.state.money as number) || 0
  } credits\n`;
  return output;
}

export function execScore(u: IUrsamuSDK): void {
  const me = u.me;
  const name = (me.state.moniker as string) ||
    (me.state.name as string) || me.name;
  const flags = Array.from(me.flags).join(" ");
  const doing = (me.state.doing as string) || "Nothing.";
  const money = (me.state.money as number) || 0;
  const body =
    `DBRef: #${me.id}\nFlags: ${flags}\n` +
    `Doing: ${doing}\nMoney: ${money} credits`;

  sendCmdLayout(u, {
    metaType: "score",
    textFallback: scoreText(u),
    components: [
      headerComp(`Player Scorecard: ${name}`),
      textComp(body),
      actionsComp("Quick", [
        {
          label: "Inventory",
          action: cmdAction("inventory"),
        },
        {
          label: "Who",
          action: cmdAction("who"),
        },
        {
          label: "Look me",
          action: cmdAction("look me"),
        },
      ]),
    ],
  });
}

export async function execDoing(u: IUrsamuSDK): Promise<void> {
  const message = u.util.stripSubs(u.cmd.args[0] || "").trim();
  const actorName = u.util.displayName(u.me, u.me);
  if (!message) {
    await u.db.modify(u.me.id, "$unset", { "data.doing": 1 });
    u.send("@doing cleared.");
    u.here.broadcast(
      `${actorName} is no longer doing anything special.`,
      { exclude: [u.me.id] } as Record<string, unknown>,
    );
  } else {
    if (message.length > 100) {
      u.send("Doing message is too long (max 100).");
      return;
    }
    await u.db.modify(u.me.id, "$set", { "data.doing": message });
    u.send(`You are now doing: ${message}`);
    u.here.broadcast(`${actorName} is now: ${message}`, {
      exclude: [u.me.id],
    } as Record<string, unknown>);
  }
}

export async function execPoll(u: IUrsamuSDK): Promise<void> {
  const doing = u.util.stripSubs(u.cmd.args[0] || "").trim();
  await u.db.modify(u.me.id, "$set", { "data.doing": doing });
  if (doing) {
    u.send(`WHO doing set to: ${doing}`);
  } else {
    u.send("WHO doing cleared.");
  }
}

export async function execAway(u: IUrsamuSDK): Promise<void> {
  const msg = u.util.stripSubs(u.cmd.args[0] || "").trim();
  await u.db.modify(u.me.id, "$set", { "data.away": msg });
  if (msg) {
    u.send(`Away message set: ${msg}`);
  } else {
    u.send("Away message cleared.");
  }
}

export async function execLast(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const isStaff = actor.flags.has("admin") ||
    actor.flags.has("wizard") ||
    actor.flags.has("superuser");
  const query = u.util.stripSubs(u.cmd.args[0] || "").trim();

  let target = actor;
  if (query) {
    if (!isStaff) {
      u.send("Permission denied.");
      return;
    }
    const results = await u.db.search(query);
    const found = results.find((r) => r.flags.has("player"));
    if (!found) {
      u.send(`No player found: "${query}".`);
      return;
    }
    target = found;
  }

  const name = (target.state.moniker as string) ||
    (target.state.name as string) ||
    target.name ||
    target.id;
  const lastLogin = target.state.lastLogin as number | undefined;
  const lastLogout = target.state.lastLogout as number | undefined;
  const fmt = (ts: number | undefined) =>
    ts ? new Date(ts).toLocaleString() : "Never";

  u.send(`--- Last for ${name} ---`);
  u.send(`Last login:   ${fmt(lastLogin)}`);
  u.send(`Last logout:  ${fmt(lastLogout)}`);
  u.send(
    `Status:       ${
      target.flags.has("connected") ? "%chOnline%cn" : "Offline"
    }`,
  );
}

addCmd({
  name: "who",
  pattern: /^who$/i,
  lock: "",
  category: "Information",
  help: `who  — List all connected players.

Uses game layout header / divider / footer on telnet.
On web play, shows an interactive player list.

Override hooks (attr on #0 first, else enactor):
  @whoformat     Replaces the entire WHO block; %0 = default.
  @whorowformat  Replaces one player row; %0 = default row.

Examples:
  who`,
  exec: execWho,
});

addCmd({
  name: "score",
  pattern: /^score$/i,
  lock: "connected",
  category: "Information",
  help: `score  — Display your character scorecard.

Web play shows a layout with quick actions (inventory, who,
look me). Telnet gets the classic text card.

Examples:
  score`,
  exec: execScore,
});

addCmd({
  name: "@doing",
  pattern: /^@doing(?:\s+(.*))?$/i,
  lock: "connected",
  category: "Information",
  help: `@doing [<message>]  — Set or clear your WHO-list description.

Without a message, clears your doing.

Examples:
  @doing Adventuring in the Shadowlands
  @doing`,
  exec: execDoing,
});

addCmd({
  name: "@poll",
  pattern: /^@poll(?:\s+(.*))?$/i,
  lock: "connected",
  category: "Information",
  help: `@poll [<message>]  — Set or clear your WHO-list doing blurb (no room announcement).

Examples:
  @poll Exploring the northern ruins
  @poll`,
  exec: execPoll,
});

addCmd({
  name: "@away",
  pattern: /^@away(?:\s+(.*))?$/i,
  lock: "connected",
  category: "Communication",
  help: `@away [<message>]  — Set or clear your away message.

When someone pages you while away, they see this message.

Examples:
  @away At dinner, back in 30 min.
  @away`,
  exec: execAway,
});

addCmd({
  name: "@last",
  pattern: /^@last(?:\s+(.*))?$/i,
  lock: "connected",
  category: "Information",
  help: `@last [<player>]  — Show last login/logout times.

Without an argument, shows your own times.
Admin/wizard can look up any player.

Examples:
  @last
  @last Alice`,
  exec: execLast,
});
