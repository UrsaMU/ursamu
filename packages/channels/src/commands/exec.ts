import { DBO, getConfig } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import type { IChanEntry } from "../types.ts";
import { announceChannelMember } from "../announce.ts";

export async function execChannel(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] || "").toLowerCase().trim();
  const arg = (u.cmd.args[1] || "").trim();

  if (sw === "join") {
    const eqIdx = arg.indexOf("=");
    if (eqIdx === -1) {
      u.send("Usage: @channel/join <channel>=<alias>");
      return;
    }
    const chan = arg.slice(0, eqIdx).trim();
    const alias = arg.slice(eqIdx + 1).trim();
    if (!chan || !alias) {
      u.send("Usage: @channel/join <channel>=<alias>");
      return;
    }
    await u.chan.join(chan, alias);
    const who = String(u.me.state.name || u.me.name || u.me.id);
    await announceChannelMember(chan, who, "join");
    u.send(`You have joined channel ${chan} with alias ${alias}.`);
    return;
  }

  if (sw === "leave") {
    if (!arg) {
      u.send("Usage: @channel/leave <alias>");
      return;
    }
    const entries =
      ((u.me.state as Record<string, unknown>).channels as
        | IChanEntry[]
        | undefined) ?? [];
    const leaving = entries.find((e) => e.alias === arg);
    const who = String(u.me.state.name || u.me.name || u.me.id);
    if (leaving) {
      await announceChannelMember(leaving.channel, who, "leave");
    }
    await u.chan.leave(arg);
    u.send(`You have left the channel with alias ${arg}.`);
    return;
  }

  const cmdName = u.cmd.name.toLowerCase().replace(/^@/, "");
  const list = (await u.chan.list()) as any[];

  if (
    cmdName === "clist" ||
    sw === "list" ||
    sw === "full" ||
    sw === "headers"
  ) {
    const isFull = sw === "full";
    const isHeaders = sw === "headers";

    if (isFull) {
      // Real fields only (no Obj/Charge/Balance/Messages economy stubs).
      u.send("*** Channel      Flags      Owner          Users");
      for (const chan of list) {
        if (
          chan.hidden &&
          !u.me.flags.has("admin") &&
          !u.me.flags.has("wizard") &&
          !u.me.flags.has("superuser")
        ) {
          continue;
        }
        const flagsStr = `${chan.hidden ? "H" : "-"}${
          chan.masking ? "M" : "-"
        }${chan.logHistory ? "L" : "-"}${
          chan.announce ? "A" : "-"
        }`;
        const own = chan.owner || "God";
        const { rooms } = await import("@ursamu/core");
        const users = rooms.members(chan.name).length;
        u.send(
          `--- ${u.util.ljust(chan.name, 12)} ` +
            `${u.util.ljust(flagsStr, 10)} ` +
            `${u.util.ljust(own, 14)} ` +
            `${u.util.rjust(String(users), 5)}`,
        );
      }
    } else if (isHeaders) {
      u.send("*** Channel Owner Header");
      for (const chan of list) {
        if (
          chan.hidden &&
          !u.me.flags.has("admin") &&
          !u.me.flags.has("wizard") &&
          !u.me.flags.has("superuser")
        ) {
          continue;
        }
        const own = chan.owner || "God";
        u.send(
          `--- ${u.util.ljust(chan.name, 15)} ${u.util.ljust(
            own,
            15,
          )} ${chan.header}`,
        );
      }
    } else {
      u.send("*** Channel Owner Description");
      for (const chan of list) {
        if (
          chan.hidden &&
          !u.me.flags.has("admin") &&
          !u.me.flags.has("wizard") &&
          !u.me.flags.has("superuser")
        ) {
          continue;
        }
        const own = chan.owner || "God";
        u.send(
          `--- ${u.util.ljust(chan.name, 15)} ${u.util.ljust(
            own,
            15,
          )} No description.`,
        );
      }
    }
    return;
  }

  u.send("--- Channels ---");
  for (const chan of list as { name: string; alias?: string }[]) {
    u.send(`${chan.name} [${chan.alias || "No Alias"}]`);
  }
  u.send("----------------");
}

export async function execChanhistory(u: IUrsamuSDK): Promise<void> {
  const input = (u.cmd.args[0] || "").trim();
  if (!input) {
    u.send("Usage: @chanhistory <name>[=<lines>]");
    return;
  }

  const [chanName, limitStr] = input.split("=");
  const name = chanName.trim().toLowerCase();
  const limit = Math.max(
    Math.min(parseInt(limitStr || "20", 10) || 20, 500),
    1,
  );

  const history = await u.chan.history(name, limit);
  if (!Array.isArray(history) || (history as { error?: string }).error) {
    u.send(`Channel not found: ${name}`);
    return;
  }
  if (history.length === 0) {
    u.send(`No history available for channel %ch${name}%cn.`);
    return;
  }
  u.send(`--- Channel History: ${name} (last ${history.length}) ---`);
  for (const entry of history) {
    u.send(`[${new Date(entry.timestamp).toUTCString()}] ${entry.message}`);
  }
  u.send("---");
}

export async function execChantranscript(u: IUrsamuSDK): Promise<void> {
  const input = (u.cmd.args[0] || "").trim();
  const match = input.match(/^([^=]+)=(\d+)$/);
  if (!match) {
    u.send("Usage: @chantranscript <name>=<lines>");
    return;
  }

  const name = match[1].trim().toLowerCase();
  const lines = Math.max(Math.min(parseInt(match[2], 10) || 20, 500), 1);

  const history = await u.chan.history(name, lines);
  if (!Array.isArray(history) || (history as { error?: string }).error) {
    u.send(`Channel not found: ${name}`);
    return;
  }
  if (history.length === 0) {
    u.send(`No history available for channel %ch${name}%cn.`);
    return;
  }
  u.send(`--- Transcript: ${name} (${lines} lines) ---`);
  for (const entry of history) {
    u.send(`[${new Date(entry.timestamp).toISOString()}] ${entry.message}`);
  }
  u.send("--- End Transcript ---");
}

export async function execChancreate(u: IUrsamuSDK): Promise<void> {
  const isAdmin = u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
  if (!isAdmin) {
    u.send("Permission denied.");
    return;
  }

  const sw = (u.cmd.args[0] || "").toLowerCase().trim();
  const input = (u.cmd.args[1] || "").trim();
  if (!input) {
    u.send("Usage: @chancreate <name>[=<header>]");
    return;
  }

  const eqIdx = input.indexOf("=");
  const namePart = eqIdx >= 0 ? input.slice(0, eqIdx).trim() : input.trim();
  const valuePart = eqIdx >= 0 ? input.slice(eqIdx + 1).trim() : "";
  const name = namePart.toLowerCase();
  const isLockSwitch = sw === "lock";
  const hidden = sw === "hidden";
  const header = isLockSwitch
    ? `[${name.toUpperCase()}]`
    : valuePart || `[${name.toUpperCase()}]`;
  const lock = isLockSwitch ? valuePart : "";

  const result = (await u.chan.create(name, {
    header,
    lock,
    hidden,
  })) as { error?: string };
  if (result?.error) {
    u.send(result.error);
    return;
  }

  let msg = `Channel %ch${name}%cn created with header "${header}".`;
  if (lock) msg += ` Lock: ${lock}`;
  if (hidden) msg += " (hidden)";
  u.send(msg);
}

export async function execChandestroy(u: IUrsamuSDK): Promise<void> {
  const isAdmin = u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
  if (!isAdmin) {
    u.send("Permission denied.");
    return;
  }

  const name = (u.cmd.args[0] || "").trim().toLowerCase();
  if (!name) {
    u.send("Usage: @chandestroy <name>");
    return;
  }

  const result = (await u.chan.destroy(name)) as { error?: string };
  if (result?.error) {
    u.send(result.error);
    return;
  }
  u.send(`Channel %ch${name}%cn has been destroyed.`);
}

export async function execChanset(u: IUrsamuSDK): Promise<void> {
  const isAdmin = u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
  if (!isAdmin) {
    u.send("Permission denied.");
    return;
  }

  const input = (u.cmd.args[0] || "").trim();
  const match = input.match(/^([^/]+)\/(\w+)\s*=\s*(.*)$/);
  if (!match) {
    u.send("Usage: @chanset <name>/<property>=<value>");
    u.send(
      "  Properties: header, lock, hidden, masking, log, " +
        "historyLimit, announce",
    );
    return;
  }

  const chanName = match[1].trim().toLowerCase();
  const property = match[2].trim().toLowerCase();
  const value = match[3].trim();

  if (!u.me.flags.has("superuser")) {
    const allChans = (await u.chan.list()) as {
      name: string;
      owner?: string;
    }[];
    const chanObj = allChans.find((c) => c.name === chanName);
    if (
      chanObj &&
      chanObj.owner !== `#${u.me.id}` &&
      chanObj.owner !== u.me.id
    ) {
      u.send(
        "Permission denied. " +
          "Only the channel owner or a superuser may modify this channel.",
      );
      return;
    }
  }

  const options = buildChansetOptions(property, value);
  if (options === null) {
    u.send(
      `Unknown property: ${property}. ` +
        "Valid: header, lock, hidden, masking, log, " +
        "historyLimit, announce",
    );
    return;
  }
  if (typeof options === "string") {
    u.send(options);
    return;
  }

  const result = (await u.chan.set(chanName, options)) as {
    error?: string;
  };
  if (result?.error) {
    u.send(result.error);
    return;
  }
  u.send(`Channel %ch${chanName}%cn: ${property} set to "${value}".`);
}

type ChansetOptions = {
  header?: string;
  lock?: string;
  hidden?: boolean;
  masking?: boolean;
  logHistory?: boolean;
  historyLimit?: number;
  announce?: boolean;
};

/** Parse @chanset property/value (exported for unit tests). */
export function buildChansetOptions(
  property: string,
  value: string,
): ChansetOptions | string | null {
  const prop = property.toLowerCase().trim();
  const onOff = (v: string) =>
    v.toLowerCase() === "on" || v.toLowerCase() === "yes" || v === "1";
  switch (prop) {
    case "header":
      return { header: value };
    case "lock":
      return { lock: value };
    case "hidden":
      return { hidden: onOff(value) };
    case "masking":
      return { masking: onOff(value) };
    case "log":
    case "loghistory":
      return { logHistory: onOff(value) };
    case "announce":
      return { announce: onOff(value) };
    case "historylimit": {
      const n = parseInt(value, 10);
      if (isNaN(n) || n < 1 || n > 5000) {
        return "historyLimit must be a number between 1 and 5000.";
      }
      return { historyLimit: n };
    }
    default:
      return null;
  }
}

export async function execAddcom(u: IUrsamuSDK): Promise<void> {
  const raw = (u.cmd.original || u.cmd.name).trimStart();
  const cmd = raw.replace(/^@/, "").split(/\s/)[0].toLowerCase();
  const arg = (u.cmd.args[0] || "").trim();

  switch (cmd) {
    case "addcom":
      await doAddcom(u, arg);
      break;
    case "delcom":
      await doDelcom(u, arg);
      break;
    case "allcom":
    case "comlist":
      await doAllcom(u, arg);
      break;
    case "clearcom":
      await doClearcom(u);
      break;
    case "comtitle":
      await doComtitle(u, arg);
      break;
  }
}

async function doAddcom(u: IUrsamuSDK, arg: string): Promise<void> {
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) {
    u.send("Usage: @addcom <alias>=<channel>");
    return;
  }
  const alias = arg.slice(0, eqIdx).trim();
  const channel = arg.slice(eqIdx + 1).trim();
  if (!alias || !channel) {
    u.send("Usage: @addcom <alias>=<channel>");
    return;
  }
  const existing = (await u.chan.list()) as Array<{ name: string }>;
  if (
    !existing.find((c) => c.name.toLowerCase() === channel.toLowerCase())
  ) {
    u.send(`No channel named "${channel}".`);
    return;
  }
  await u.chan.join(channel, alias);
  const who = String(u.me.state.name || u.me.name || u.me.id);
  await announceChannelMember(channel, who, "join");
  u.send(`Added alias %ch${alias}%cn for channel %ch${channel}%cn.`);
}

async function doDelcom(u: IUrsamuSDK, arg: string): Promise<void> {
  if (!arg) {
    u.send("Usage: @delcom <alias>");
    return;
  }
  const entries =
    ((u.me.state as Record<string, unknown>).channels as
      | IChanEntry[]
      | undefined) ?? [];
  const leaving = entries.find((e) => e.alias === arg);
  const who = String(u.me.state.name || u.me.name || u.me.id);
  if (leaving) {
    await announceChannelMember(leaving.channel, who, "leave");
  }
  await u.chan.leave(arg);
  u.send(`Removed channel alias %ch${arg}%cn.`);
}

async function doAllcom(u: IUrsamuSDK, arg?: string): Promise<void> {
  const sub = (arg || "").toLowerCase().trim();
  const channels =
    ((u.me.state as Record<string, unknown>).channels as
      | IChanEntry[]
      | undefined) ?? [];

  if (sub === "on") {
    let count = 0;
    for (const entry of channels) {
      if (entry.alias && !entry.active) {
        entry.active = true;
        count++;
        const { sessions, rooms } = await import("@ursamu/core");
        const playerSessions = sessions.list().filter(
          (s) => s.sessionId === u.me.id || (s as any).actorId === u.me.id,
        );
        for (const s of playerSessions) {
          rooms.join(s.socketId, entry.channel);
        }
      }
    }
    if (count > 0) {
      await u.db.modify(u.me.id, "$set", { "data.channels": channels });
      u.send(`Turned on all channel aliases (${count} channel(s)).`);
    } else {
      u.send("All channels are already on.");
    }
    return;
  }

  if (sub === "off") {
    let count = 0;
    for (const entry of channels) {
      if (entry.alias && entry.active) {
        entry.active = false;
        count++;
        const { sessions, rooms } = await import("@ursamu/core");
        const playerSessions = sessions.list().filter(
          (s) => s.sessionId === u.me.id || (s as any).actorId === u.me.id,
        );
        for (const s of playerSessions) {
          rooms.leave(s.socketId, entry.channel);
        }
      }
    }
    if (count > 0) {
      await u.db.modify(u.me.id, "$set", { "data.channels": channels });
      u.send(`Turned off all channel aliases (${count} channel(s)).`);
    } else {
      u.send("All channels are already off.");
    }
    return;
  }

  if (sub === "who") {
    if (!channels.length) {
      u.send("You have no channel aliases.");
      return;
    }
    const { rooms, sessions } = await import("@ursamu/core");
    const { dbojs } = await import("@ursamu/mush");
    for (const entry of channels) {
      const sockets = rooms.members(entry.channel);
      const playerIds = new Set<string>();
      for (const socketId of sockets) {
        const s = sessions.get(socketId);
        const actorId = (s as any)?.actorId;
        if (actorId) playerIds.add(actorId);
      }
      const players: string[] = [];
      const objects: string[] = [];
      for (const id of playerIds) {
        const dbObj = await dbojs.queryOne({ id });
        if (dbObj) {
          const name = (dbObj.data?.name as string) || dbObj.id;
          // IDBOBJ.flags is a space-delimited string
          const isPlayer = String(dbObj.flags ?? "")
            .split(/\s+/)
            .includes("player");
          if (isPlayer) {
            players.push(name);
          } else {
            objects.push(name);
          }
        }
      }
      players.sort();
      objects.sort();

      u.send("-- Players --");
      for (const p of players) {
        u.send(p);
      }
      u.send("-- Objects --");
      for (const o of objects) {
        u.send(o);
      }
      u.send(`-- ${entry.channel} --`);
    }
    return;
  }

  if (!channels.length) {
    u.send("You have no channel aliases.");
    return;
  }
  u.send("--- Your Channel Aliases ---");
  for (const entry of channels) {
    const status = entry.active === false ? "%cr[off]%cn" : "%cg[on]%cn";
    const title = entry.title ? ` <${entry.title}>` : "";
    u.send(
      `  %ch${entry.alias || "?"}%cn → ${entry.channel}${title} ${status}`,
    );
  }
  u.send("----------------------------");
}

async function doClearcom(u: IUrsamuSDK): Promise<void> {
  const channels =
    ((u.me.state as Record<string, unknown>).channels as
      | IChanEntry[]
      | undefined) ?? [];
  for (const entry of channels) {
    if (entry.alias) await u.chan.leave(entry.alias);
  }
  u.send("All channel aliases removed.");
}

async function doComtitle(u: IUrsamuSDK, arg: string): Promise<void> {
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) {
    u.send("Usage: @comtitle <alias>=<title>");
    return;
  }
  const alias = arg.slice(0, eqIdx).trim();
  const title = arg.slice(eqIdx + 1).trim();
  if (!alias) {
    u.send("Usage: @comtitle <alias>=<title>");
    return;
  }

  const channels =
    ((u.me.state as Record<string, unknown>).channels as
      | IChanEntry[]
      | undefined) ?? [];
  const entry = channels.find((c: IChanEntry) => c.alias === alias);
  if (!entry) {
    u.send(`No channel alias "${alias}" found.`);
    return;
  }
  entry.title = title || undefined;
  await u.db.modify(u.me.id, "$set", { "data.channels": channels });
  u.send(
    title
      ? `Title on %ch${alias}%cn set to: ${title}`
      : `Title on %ch${alias}%cn cleared.`,
  );
}

export async function execCemit(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] || "").toLowerCase().trim();
  const input = (u.cmd.args[1] || "").trim();
  if (!input) {
    u.send("Usage: @cemit[/noheader] <channel>=<message>");
    return;
  }
  const eqIdx = input.indexOf("=");
  if (eqIdx === -1) {
    u.send("Usage: @cemit[/noheader] <channel>=<message>");
    return;
  }
  const chanName = input.slice(0, eqIdx).trim().toLowerCase();
  const msg = input.slice(eqIdx + 1).trim();

  const chans = new DBO<any>(() =>
    getConfig<string>("plugins.channels.db", "server.chans"),
  );
  const chan = await chans.queryOne({ name: chanName });
  if (!chan) {
    u.send(`Channel not found: ${chanName}`);
    return;
  }

  const isStaff =
    u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
  if (chan.owner !== u.me.id && !isStaff) {
    u.send("Permission denied.");
    return;
  }

  const header = sw === "noheader" ? "" : chan.header + " ";
  const { rooms } = await import("@ursamu/core");
  rooms.broadcast(chan.name, `${header}${msg}`);
}

export async function execCboot(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] || "").toLowerCase().trim();
  const input = (u.cmd.args[1] || "").trim();
  if (!input) {
    u.send("Usage: @cboot[/quiet] <channel>=<object>");
    return;
  }
  const eqIdx = input.indexOf("=");
  if (eqIdx === -1) {
    u.send("Usage: @cboot[/quiet] <channel>=<object>");
    return;
  }
  const chanName = input.slice(0, eqIdx).trim().toLowerCase();
  const targetName = input.slice(eqIdx + 1).trim();

  const chans = new DBO<any>(() =>
    getConfig<string>("plugins.channels.db", "server.chans"),
  );
  const chan = await chans.queryOne({ name: chanName });
  if (!chan) {
    u.send(`Channel not found: ${chanName}`);
    return;
  }

  const isStaff =
    u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
  if (chan.owner !== u.me.id && !isStaff) {
    u.send("Permission denied.");
    return;
  }

  const cleanTarget = targetName.replace(/^\*/, "");
  const target = await u.util.target(u.me, cleanTarget, true);
  if (!target) {
    u.send("Target not found.");
    return;
  }

  const { sessions, rooms } = await import("@ursamu/core");
  const { dbojs } = await import("@ursamu/mush");
  const targetObj = await dbojs.queryOne({ id: target.id });
  if (targetObj && targetObj.data?.channels) {
    const chs = targetObj.data.channels as IChanEntry[];
    const found = chs.find(
      (c) => c.channel.toLowerCase() === chan.name.toLowerCase(),
    );
    if (found) {
      const filtered = chs.filter(
        (c) => c.channel.toLowerCase() !== chan.name.toLowerCase(),
      );
      // deno-lint-ignore no-explicit-any
      await dbojs.modify(
        { id: target.id },
        "$set",
        { "data.channels": filtered } as any,
      );

      const targetSessions = sessions.list().filter(
        (s) => s.sessionId === target.id || (s as any).actorId === target.id,
      );
      for (const s of targetSessions) {
        rooms.leave(s.socketId, chan.name);
      }

      const quiet = sw === "quiet";
      const meName = u.util.displayName(u.me, u.me);
      const tName = u.util.displayName(target, u.me);
      if (!quiet) {
        rooms.broadcast(
          chan.name,
          `${chan.header} ${meName} boots ${tName} off the channel.`,
        );
        rooms.broadcast(
          chan.name,
          `${chan.header} ${tName} has left this channel.`,
        );
      }
      u.send(`Booted ${tName} from channel ${chan.name}.`);
    } else {
      const tName = u.util.displayName(target, u.me);
      u.send(`${tName} is not on channel ${chan.name}.`);
    }
  } else {
    const tName = u.util.displayName(target, u.me);
    u.send(`${tName} is not on channel ${chan.name}.`);
  }
}

export async function execCwho(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] || "").toLowerCase().trim();
  const chanName = (u.cmd.args[1] || "").trim().toLowerCase();
  if (!chanName) {
    u.send("Usage: @cwho <channel>[/all]");
    return;
  }

  const chans = new DBO<any>(() =>
    getConfig<string>("plugins.channels.db", "server.chans"),
  );
  const chan = await chans.queryOne({ name: chanName });
  if (!chan) {
    u.send(`Channel not found: ${chanName}`);
    return;
  }

  const isStaff =
    u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
  if (chan.owner !== u.me.id && !isStaff) {
    u.send("Permission denied.");
    return;
  }

  const { rooms, sessions } = await import("@ursamu/core");
  const { dbojs } = await import("@ursamu/mush");

  const sockets = rooms.members(chan.name);
  const playerIds = new Set<string>();
  for (const socketId of sockets) {
    const s = sessions.get(socketId);
    const actorId = (s as any)?.actorId;
    if (actorId) playerIds.add(actorId);
  }

  u.send("Name Status Player");

  if (sw === "all") {
    const allPlayers = await dbojs.query({
      "data.channels": { $exists: true },
    });
    for (const p of allPlayers) {
      const chs = (p.data?.channels || []) as IChanEntry[];
      const found = chs.find(
        (c) => c.channel.toLowerCase() === chan.name.toLowerCase(),
      );
      if (found) {
        const active = playerIds.has(p.id) ? "on" : "off";
        const isPlayer = String(p.flags ?? "")
          .split(/\s+/)
          .includes("player")
          ? "yes"
          : "no";
        u.send(
          `${u.util.ljust(p.data?.name || p.id, 15)} ${u.util.ljust(
            active,
            6,
          )} ${isPlayer}`,
        );
      }
    }
  } else {
    for (const id of playerIds) {
      const p = await dbojs.queryOne({ id });
      if (p) {
        const isPlayer = String(p.flags ?? "")
          .split(/\s+/)
          .includes("player")
          ? "yes"
          : "no";
        u.send(
          `${u.util.ljust(p.data?.name || p.id, 15)} on     ${isPlayer}`,
        );
      }
    }
  }
}
