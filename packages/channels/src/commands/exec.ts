import type { IUrsamuSDK } from "@ursamu/mush";
import type { IChanEntry } from "../types.ts";

export async function execChannel(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] || "").toLowerCase().trim();
  const arg = (u.cmd.args[1] || "").trim();

  if (sw === "join") {
    const eqIdx = arg.indexOf("=");
    if (eqIdx === -1) { u.send("Usage: @channel/join <channel>=<alias>"); return; }
    const chan = arg.slice(0, eqIdx).trim();
    const alias = arg.slice(eqIdx + 1).trim();
    if (!chan || !alias) { u.send("Usage: @channel/join <channel>=<alias>"); return; }
    await u.chan.join(chan, alias);
    u.send(`You have joined channel ${chan} with alias ${alias}.`);
    return;
  }

  if (sw === "leave") {
    if (!arg) { u.send("Usage: @channel/leave <alias>"); return; }
    await u.chan.leave(arg);
    u.send(`You have left the channel with alias ${arg}.`);
    return;
  }

  const list = await u.chan.list();
  u.send("--- Channels ---");
  for (const chan of list as { name: string; alias?: string }[]) {
    u.send(`${chan.name} [${chan.alias || "No Alias"}]`);
  }
  u.send("----------------");
}

export async function execChanhistory(u: IUrsamuSDK): Promise<void> {
  const input = (u.cmd.args[0] || "").trim();
  if (!input) { u.send("Usage: @chanhistory <name>[=<lines>]"); return; }

  const [chanName, limitStr] = input.split("=");
  const name = chanName.trim().toLowerCase();
  const limit = Math.max(Math.min(parseInt(limitStr || "20", 10) || 20, 500), 1);

  const history = await u.chan.history(name, limit);
  if (!Array.isArray(history) || (history as { error?: string }).error) {
    u.send(`Channel not found: ${name}`);
    return;
  }
  if (history.length === 0) { u.send(`No history available for channel %ch${name}%cn.`); return; }
  u.send(`--- Channel History: ${name} (last ${history.length}) ---`);
  for (const entry of history) {
    u.send(`[${new Date(entry.timestamp).toUTCString()}] ${entry.message}`);
  }
  u.send("---");
}

export async function execChantranscript(u: IUrsamuSDK): Promise<void> {
  const input = (u.cmd.args[0] || "").trim();
  const match = input.match(/^([^=]+)=(\d+)$/);
  if (!match) { u.send("Usage: @chantranscript <name>=<lines>"); return; }

  const name = match[1].trim().toLowerCase();
  const lines = Math.max(Math.min(parseInt(match[2], 10) || 20, 500), 1);

  const history = await u.chan.history(name, lines);
  if (!Array.isArray(history) || (history as { error?: string }).error) {
    u.send(`Channel not found: ${name}`);
    return;
  }
  if (history.length === 0) { u.send(`No history available for channel %ch${name}%cn.`); return; }
  u.send(`--- Transcript: ${name} (${lines} lines) ---`);
  for (const entry of history) {
    u.send(`[${new Date(entry.timestamp).toISOString()}] ${entry.message}`);
  }
  u.send("--- End Transcript ---");
}

export async function execChancreate(u: IUrsamuSDK): Promise<void> {
  const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
  if (!isAdmin) { u.send("Permission denied."); return; }

  const sw = (u.cmd.args[0] || "").toLowerCase().trim();
  const input = (u.cmd.args[1] || "").trim();
  if (!input) { u.send("Usage: @chancreate <name>[=<header>]"); return; }

  const eqIdx = input.indexOf("=");
  const namePart = eqIdx >= 0 ? input.slice(0, eqIdx).trim() : input.trim();
  const valuePart = eqIdx >= 0 ? input.slice(eqIdx + 1).trim() : "";
  const name = namePart.toLowerCase();
  const isLockSwitch = sw === "lock";
  const hidden = sw === "hidden";
  const header = isLockSwitch ? `[${name.toUpperCase()}]` : valuePart || `[${name.toUpperCase()}]`;
  const lock = isLockSwitch ? valuePart : "";

  const result = (await u.chan.create(name, { header, lock, hidden })) as { error?: string };
  if (result?.error) { u.send(result.error); return; }

  let msg = `Channel %ch${name}%cn created with header "${header}".`;
  if (lock) msg += ` Lock: ${lock}`;
  if (hidden) msg += " (hidden)";
  u.send(msg);
}

export async function execChandestroy(u: IUrsamuSDK): Promise<void> {
  const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
  if (!isAdmin) { u.send("Permission denied."); return; }

  const name = (u.cmd.args[0] || "").trim().toLowerCase();
  if (!name) { u.send("Usage: @chandestroy <name>"); return; }

  const result = (await u.chan.destroy(name)) as { error?: string };
  if (result?.error) { u.send(result.error); return; }
  u.send(`Channel %ch${name}%cn has been destroyed.`);
}

export async function execChanset(u: IUrsamuSDK): Promise<void> {
  const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
  if (!isAdmin) { u.send("Permission denied."); return; }

  const input = (u.cmd.args[0] || "").trim();
  const match = input.match(/^([^/]+)\/(\w+)\s*=\s*(.*)$/);
  if (!match) {
    u.send("Usage: @chanset <name>/<property>=<value>");
    u.send("  Properties: header, lock, hidden, masking, log, historyLimit");
    return;
  }

  const chanName = match[1].trim().toLowerCase();
  const property = match[2].trim().toLowerCase();
  const value = match[3].trim();

  if (!u.me.flags.has("superuser")) {
    const allChans = (await u.chan.list()) as { name: string; owner?: string }[];
    const chanObj = allChans.find((c) => c.name === chanName);
    if (chanObj && chanObj.owner !== `#${u.me.id}` && chanObj.owner !== u.me.id) {
      u.send("Permission denied. Only the channel owner or a superuser may modify this channel.");
      return;
    }
  }

  const options = buildChansetOptions(property, value);
  if (options === null) {
    u.send(`Unknown property: ${property}. Valid: header, lock, hidden, masking, log, historyLimit`);
    return;
  }
  if (typeof options === "string") { u.send(options); return; }

  const result = (await u.chan.set(chanName, options)) as { error?: string };
  if (result?.error) { u.send(result.error); return; }
  u.send(`Channel %ch${chanName}%cn: ${property} set to "${value}".`);
}

type ChansetOptions = {
  header?: string; lock?: string; hidden?: boolean;
  masking?: boolean; logHistory?: boolean; historyLimit?: number;
};

function buildChansetOptions(property: string, value: string): ChansetOptions | string | null {
  const onOff = (v: string) => v.toLowerCase() === "on" || v.toLowerCase() === "yes" || v === "1";
  switch (property) {
    case "header":       return { header: value };
    case "lock":         return { lock: value };
    case "hidden":       return { hidden: onOff(value) };
    case "masking":      return { masking: onOff(value) };
    case "log":
    case "loghistory":   return { logHistory: onOff(value) };
    case "historylimit": {
      const n = parseInt(value, 10);
      if (isNaN(n) || n < 1 || n > 5000) return "historyLimit must be a number between 1 and 5000.";
      return { historyLimit: n };
    }
    default: return null;
  }
}

export async function execAddcom(u: IUrsamuSDK): Promise<void> {
  const raw = (u.cmd.original || u.cmd.name).trimStart();
  const cmd = raw.replace(/^@/, "").split(/\s/)[0].toLowerCase();
  const arg = (u.cmd.args[0] || "").trim();

  switch (cmd) {
    case "addcom":   await doAddcom(u, arg); break;
    case "delcom":   await doDelcom(u, arg); break;
    case "allcom":   await doAllcom(u); break;
    case "clearcom": await doClearcom(u); break;
    case "comtitle": await doComtitle(u, arg); break;
  }
}

async function doAddcom(u: IUrsamuSDK, arg: string): Promise<void> {
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @addcom <alias>=<channel>"); return; }
  const alias = arg.slice(0, eqIdx).trim();
  const channel = arg.slice(eqIdx + 1).trim();
  if (!alias || !channel) { u.send("Usage: @addcom <alias>=<channel>"); return; }
  const existing = (await u.chan.list()) as Array<{ name: string }>;
  if (!existing.find((c) => c.name.toLowerCase() === channel.toLowerCase())) {
    u.send(`No channel named "${channel}".`);
    return;
  }
  await u.chan.join(channel, alias);
  u.send(`Added alias %ch${alias}%cn for channel %ch${channel}%cn.`);
}

async function doDelcom(u: IUrsamuSDK, arg: string): Promise<void> {
  if (!arg) { u.send("Usage: @delcom <alias>"); return; }
  await u.chan.leave(arg);
  u.send(`Removed channel alias %ch${arg}%cn.`);
}

async function doAllcom(u: IUrsamuSDK): Promise<void> {
  const list = (await u.chan.list()) as Array<{
    name: string; alias?: string; title?: string; active?: boolean;
  }>;
  if (!list.length) { u.send("You have no channel aliases."); return; }
  u.send("--- Your Channel Aliases ---");
  for (const entry of list) {
    const status = entry.active === false ? "%cr[off]%cn" : "%cg[on]%cn";
    const title = entry.title ? ` <${entry.title}>` : "";
    u.send(`  %ch${entry.alias || "?"}%cn → ${entry.name}${title} ${status}`);
  }
  u.send("----------------------------");
}

async function doClearcom(u: IUrsamuSDK): Promise<void> {
  const list = (await u.chan.list()) as Array<{ alias?: string }>;
  for (const entry of list) {
    if (entry.alias) await u.chan.leave(entry.alias);
  }
  u.send("All channel aliases removed.");
}

async function doComtitle(u: IUrsamuSDK, arg: string): Promise<void> {
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @comtitle <alias>=<title>"); return; }
  const alias = arg.slice(0, eqIdx).trim();
  const title = arg.slice(eqIdx + 1).trim();
  if (!alias) { u.send("Usage: @comtitle <alias>=<title>"); return; }

  const channels = ((u.me.state as Record<string, unknown>).channels as IChanEntry[] | undefined) ?? [];
  const entry = channels.find((c: IChanEntry) => c.alias === alias);
  if (!entry) { u.send(`No channel alias "${alias}" found.`); return; }
  entry.title = title || undefined;
  await u.db.modify(u.me.id, "$set", { "data.channels": channels });
  u.send(title ? `Title on %ch${alias}%cn set to: ${title}` : `Title on %ch${alias}%cn cleared.`);
}
