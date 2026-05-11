import { addCmd } from "../services/commands/cmdParser.ts";
import type { IUrsamuSDK, IDBObj } from "../@types/UrsamuSDK.ts";
import { resolveFormat, type FormatSlot } from "../utils/resolveFormat.ts";
import { dbojs } from "../services/Database/database.ts";
import { hydrate } from "../utils/evaluateLock.ts";

/**
 * Two-tier lookup for global-list format slots (e.g. WHO):
 *   1. attr on #0 (game-wide skin) — wins if set.
 *   2. attr on the enactor (per-player skin).
 *   3. null → caller renders built-in default.
 *
 * Mirrors TinyMUX/PennMUSH precedent for WHO-style commands. Kept inline
 * here until a third caller appears; then promote to src/utils/.
 */
async function resolveGlobalFormat(
  u: IUrsamuSDK,
  slot: FormatSlot,
  defaultArg: string,
): Promise<string | null> {
  // Only consult #0 if it actually exists — otherwise plugin handlers would
  // be invoked with a phantom target.id="0" (latent bug, M1 in TDD audit).
  const root = await dbojs.queryOne({ id: "0" });
  if (root) {
    const rootObj = hydrate(root as unknown as Parameters<typeof hydrate>[0]) as IDBObj;
    const onRoot = await resolveFormat(u, rootObj, slot, defaultArg);
    if (onRoot != null) return onRoot;
  }
  return await resolveFormat(u, u.me, slot, defaultArg);
}

export async function execWho(u: IUrsamuSDK): Promise<void> {
  const players = (await u.db.search({ flags: /connected/i }))
    .filter((p) => p.flags.has("player") && !p.flags.has("dark"));
  const width = (u.me.state?.termWidth as number) || 78;

  const formatIdle = (lastCmd: unknown): string => {
    if (typeof lastCmd !== "number" || isNaN(lastCmd)) return "---";
    const secs = Math.floor((Date.now() - lastCmd) / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  const renderRow = (p: IDBObj): string => {
    const pName = (p.state.moniker as string) || (p.state.name as string) || p.name || "Unknown";
    const idle = formatIdle(p.state.lastCommand);
    const doing = (p.state.doing as string) || "";
    return `${pName.padEnd(24)}${idle.padEnd(8)}${doing}`;
  };

  // Build per-player rows, with optional WHOROWFORMAT override.
  const rows: string[] = [];
  for (const p of players) {
    const defaultRow = renderRow(p);
    const rowOverride = await resolveGlobalFormat(u, "WHOROWFORMAT", defaultRow);
    rows.push(rowOverride != null ? rowOverride : defaultRow);
  }

  // Default block — used both as the fallback output and as %0 for WHOFORMAT.
  let defaultBlock = `%chWho's Online%cn\n`;
  defaultBlock += `${"Player".padEnd(24)}${"Idle".padEnd(8)}Doing\n`;
  defaultBlock += `${"-".repeat(width)}\n`;
  for (const r of rows) defaultBlock += `${r}\n`;
  defaultBlock += `${"-".repeat(width)}\n`;
  defaultBlock += `${players.length} player${players.length === 1 ? "" : "s"} online.\n`;

  const blockOverride = await resolveGlobalFormat(u, "WHOFORMAT", defaultBlock);
  u.send(blockOverride != null ? blockOverride : defaultBlock);
}

export function execScore(u: IUrsamuSDK): void {
  const me = u.me;
  const name = (me.state.moniker as string) || (me.state.name as string) || me.name;
  let telnet = `%chPlayer Scorecard: ${name}%cn\n`;
  telnet += `DBRef: #${me.id}  Flags: ${Array.from(me.flags).join(" ")}\n`;
  telnet += `Doing: ${(me.state.doing as string) || "Nothing."}\n`;
  telnet += `Money: ${(me.state.money as number) || 0} credits\n`;
  u.send(telnet);
}

export async function execDoing(u: IUrsamuSDK): Promise<void> {
  const message = (u.cmd.args[0] || "").trim();
  const actorName = u.util.displayName(u.me, u.me);
  if (!message) {
    await u.db.modify(u.me.id, "$unset", { "data.doing": 1 });
    u.send("@doing cleared.");
    u.here.broadcast(`${actorName} is no longer doing anything special.`,
      { exclude: [u.me.id] } as Record<string, unknown>);
  } else {
    if (message.length > 100) { u.send("Doing message is too long (max 100)."); return; }
    await u.db.modify(u.me.id, "$set", { "data.doing": message });
    u.send(`You are now doing: ${message}`);
    u.here.broadcast(`${actorName} is now: ${message}`, { exclude: [u.me.id] } as Record<string, unknown>);
  }
}

export async function execPoll(u: IUrsamuSDK): Promise<void> {
  const doing = (u.cmd.args[0] || "").trim();
  await u.db.modify(u.me.id, "$set", { "data.doing": doing });
  if (doing) {
    u.send(`WHO doing set to: ${doing}`);
  } else {
    u.send("WHO doing cleared.");
  }
}

export async function execAway(u: IUrsamuSDK): Promise<void> {
  const msg = (u.cmd.args[0] || "").trim();
  await u.db.modify(u.me.id, "$set", { "data.away": msg });
  if (msg) {
    u.send(`Away message set: ${msg}`);
  } else {
    u.send("Away message cleared.");
  }
}

export async function execLast(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const isStaff = actor.flags.has("admin") || actor.flags.has("wizard") || actor.flags.has("superuser");
  const query = (u.cmd.args[0] || "").trim();

  let target = actor;
  if (query) {
    if (!isStaff) { u.send("Permission denied."); return; }
    const results = await u.db.search(query);
    const found = results.find((r) => r.flags.has("player"));
    if (!found) { u.send(`No player found: "${query}".`); return; }
    target = found;
  }

  const name = (target.state.moniker as string) || (target.state.name as string) || target.name || target.id;
  const lastLogin = target.state.lastLogin as number | undefined;
  const lastLogout = target.state.lastLogout as number | undefined;
  const fmt = (ts: number | undefined) => ts ? new Date(ts).toLocaleString() : "Never";

  u.send(`--- Last for ${name} ---`);
  u.send(`Last login:   ${fmt(lastLogin)}`);
  u.send(`Last logout:  ${fmt(lastLogout)}`);
  u.send(`Status:       ${target.flags.has("connected") ? "%chOnline%cn" : "Offline"}`);
}

export default () => {
  addCmd({
    name: "who",
    pattern: /^who$/i,
    lock: "",
    category: "Information",
    help: `who  — List all connected players.

Override hooks (attr on #0 first, else enactor):
  @whoformat     Replaces the entire WHO block; %0 = default block.
  @whorowformat  Replaces one player row; %0 = default rendered row.

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
    help: `@poll [<message>]  — Set or clear your WHO-list doing blurb.

@poll is like @doing but without the room announcement.

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

When someone pages you while an away message is set, they see the message
in addition to receiving the page.

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
};
