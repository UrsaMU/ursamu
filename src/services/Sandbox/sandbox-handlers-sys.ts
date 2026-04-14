/**
 * @module sandbox-handlers-sys
 *
 * Handles worker messages for system and channel operations:
 *   sys:setConfig, sys:disconnect, sys:update, sys:reboot, sys:shutdown,
 *   sys:uptime, sys:gametime, sys:setgametime
 *   chan:join, chan:leave, chan:list, chan:create, chan:destroy, chan:set, chan:history
 *   text:read, text:set
 */
import { scopedUpdate } from "./SandboxService.ts";
import type { SDKContext } from "./SDKService.ts";
import { wsService } from "../WebSocket/index.ts";
import { send as broadcastSend, broadcast as broadcastAll } from "../broadcast/index.ts";
import type { IChanEntry } from "../../@types/Channels.ts";

const SERVER_START = Date.now();

type Msg    = Record<string, unknown>;
type Worker = globalThis.Worker;

function respond(worker: Worker, msgId: unknown, data: unknown): void {
  worker.postMessage({ type: "response", msgId, data });
}

const ALLOWED_CONFIG_KEYS = new Set([
  "server.name", "server.description", "server.banner",
  "server.corsOrigins", "server.maxConnections",
  "game.maxPlayers", "game.description", "game.loginMessage", "game.welcomeMessage",
]);

export async function handleSysMessage(
  msg:     Msg,
  worker:  Worker,
  context: SDKContext | undefined,
): Promise<void> {
  const { type, msgId } = msg;

  if (type === "sys:setConfig") {
    if (msg.key && msg.value !== undefined && ALLOWED_CONFIG_KEYS.has(msg.key as string)) {
      const { setConfig } = await import("../Config/mod.ts");
      setConfig(msg.key as string, msg.value);
    }
    respond(worker, msgId, null);
    return;
  }

  if (type === "sys:disconnect") {
    if (msg.id) wsService.disconnect(msg.id as string);
    respond(worker, msgId, null);
    return;
  }

  if (type === "sys:update") {
    respond(worker, msgId, null);
    const socketTargets = context?.socketId ? [context.socketId as string] : [];
    const branch = String(msg.branch || "");

    // Permission guard — admin/wizard/superuser only
    if (context?.id) {
      const { dbojs: db } = await import("../Database/index.ts");
      const actor = await db.queryOne({ id: context.id as string });
      const flags = String(actor?.flags || "");
      if (!flags.includes("admin") && !flags.includes("wizard") && !flags.includes("superuser")) {
        broadcastSend(socketTargets, "%chGame>%cn Permission denied.", {});
        return;
      }
    }

    if (branch && (!/^[\w./\-]+$/.test(branch) || branch.startsWith("-"))) {
      broadcastSend(socketTargets, `%chGame>%cn Invalid branch name: "${branch}"`, {});
      return;
    }

    (async () => {
      try {
        const pullArgs = branch ? ["pull", "origin", branch] : ["pull"];
        const pull = await new Deno.Command("git", {
          args: pullArgs, stdout: "piped", stderr: "piped", cwd: Deno.cwd(),
        }).output();
        const out = new TextDecoder().decode(pull.stdout).trim();
        const err = new TextDecoder().decode(pull.stderr).trim();
        if (!pull.success) { broadcastSend(socketTargets, `%chGame>%cn git pull failed: ${err || out}`, {}); return; }
        broadcastSend(socketTargets, `%chGame>%cn ${(out || err) || "Already up to date."}`, {});
        broadcastAll("%chGame>%cn Update complete. Rebooting...", {});
        setTimeout(() => Deno.exit(75), 500);
      } catch (err) {
        broadcastSend(socketTargets, `%chGame>%cn Update error: ${err instanceof Error ? err.message : String(err)}`, {});
      }
    })();
    return;
  }

  if (type === "sys:reboot") {
    respond(worker, msgId, null);
    broadcastAll("Server rebooting...", {});
    setTimeout(() => Deno.exit(75), 500);
    return;
  }

  if (type === "sys:shutdown") {
    respond(worker, msgId, null);
    broadcastAll("Server shutting down...", {});
    setTimeout(() => Deno.exit(0), 500);
    return;
  }

  if (type === "sys:uptime") {
    respond(worker, msgId, Date.now() - SERVER_START);
    return;
  }

  if (type === "sys:gametime") {
    const { gameClock } = await import("../GameClock/index.ts");
    respond(worker, msgId, gameClock.now());
    return;
  }

  if (type === "sys:setgametime") {
    if (msg.t) {
      const { gameClock } = await import("../GameClock/index.ts");
      gameClock.set(msg.t as import("../GameClock/index.ts").IGameTime);
      await gameClock.save();
    }
    respond(worker, msgId, null);
    return;
  }
}

export async function handleChanMessage(
  msg:     Msg,
  worker:  Worker,
  context: SDKContext | undefined,
): Promise<void> {
  const { type, msgId } = msg;

  if (type === "chan:join") {
    if (!msg.channel || !msg.alias || !context?.id) { respond(worker, msgId, null); return; }
    const { dbojs: db } = await import("../Database/index.ts");
    const en = await db.queryOne({ id: context.id as string });
    if (en) {
      en.data ||= {};
      const chans = ((en.data.channels as unknown[] || []) as IChanEntry[]);
      chans.push({ channel: msg.channel as string, alias: msg.alias as string, active: true });
      await scopedUpdate(en.id, { "data.channels": chans });
      const socket = wsService.getConnectedSockets().find(s => s.cid === en.id);
      if (socket) socket.join(msg.channel as string);
    }
    respond(worker, msgId, null);
    return;
  }

  if (type === "chan:leave") {
    if (!msg.alias || !context?.id) { respond(worker, msgId, null); return; }
    const { dbojs: db } = await import("../Database/index.ts");
    const en = await db.queryOne({ id: context.id as string });
    if (en) {
      en.data ||= {};
      const chans = ((en.data.channels as unknown[] || []) as IChanEntry[]);
      const idx = chans.findIndex(c => c.alias === msg.alias);
      if (idx !== -1) {
        const [chan] = chans.splice(idx, 1);
        await scopedUpdate(en.id, { "data.channels": chans });
        const socket = wsService.getConnectedSockets().find(s => s.cid === en.id);
        if (socket) socket.leave(chan.channel);
      }
    }
    respond(worker, msgId, null);
    return;
  }

  if (type === "chan:list") {
    const { chans } = await import("../Database/index.ts");
    const list = await chans.query({});
    respond(worker, msgId, list);
    return;
  }

  if (type === "chan:create") {
    if (!msg.name) { respond(worker, msgId, null); return; }
    const { chans: chanDb } = await import("../Database/index.ts");
    const name = String(msg.name).toLowerCase().trim();
    const existing = await chanDb.queryOne({ name });
    if (existing) { respond(worker, msgId, { error: "Channel already exists." }); return; }
    const chan = await chanDb.create({
      id: name, name,
      header: String(msg.header || `[${name.toUpperCase()}]`),
      lock: String(msg.lock || ""),
      hidden: Boolean(msg.hidden),
      owner: String(context?.id || ""),
    });
    respond(worker, msgId, chan);
    return;
  }

  if (type === "chan:destroy") {
    if (!msg.name) { respond(worker, msgId, null); return; }
    const { chans: chanDb } = await import("../Database/index.ts");
    const name = String(msg.name).toLowerCase().trim();
    const existing = await chanDb.queryOne({ name });
    if (!existing) { respond(worker, msgId, { error: "Channel not found." }); return; }
    await chanDb.delete({ name });
    respond(worker, msgId, { ok: true });
    return;
  }

  if (type === "chan:set") {
    if (!msg.name) { respond(worker, msgId, null); return; }
    const { chans: chanDb } = await import("../Database/index.ts");
    const name = String(msg.name).toLowerCase().trim();
    const existing = await chanDb.queryOne({ name });
    if (!existing) { respond(worker, msgId, { error: "Channel not found." }); return; }
    const updates: Record<string, unknown> = {};
    if (msg.header      !== undefined) updates.header      = msg.header;
    if (msg.lock        !== undefined) updates.lock        = msg.lock;
    if (msg.hidden      !== undefined) updates.hidden      = msg.hidden;
    if (msg.masking     !== undefined) updates.masking     = msg.masking;
    if (msg.logHistory  !== undefined) updates.logHistory  = msg.logHistory;
    if (msg.historyLimit !== undefined) updates.historyLimit = msg.historyLimit;
    await chanDb.modify({ name }, "$set", updates);
    respond(worker, msgId, { ok: true });
    return;
  }

  if (type === "chan:history") {
    const { chanHistory: histDb, chans: chanDb } = await import("../Database/index.ts");
    const name = String(msg.name || "").toLowerCase().trim();
    if (!name) { respond(worker, msgId, []); return; }
    const chan = await chanDb.queryOne({ name });
    if (!chan) { respond(worker, msgId, { error: "Channel not found." }); return; }
    const limit = typeof msg.limit === "number" ? msg.limit : 20;
    const all   = await histDb.find({ chanId: chan.id });
    all.sort((a, b) => a.timestamp - b.timestamp);
    respond(worker, msgId, all.slice(-limit));
    return;
  }
}

export async function handleTextMessage(
  msg:    Msg,
  worker: Worker,
): Promise<void> {
  const { type, msgId } = msg;

  if (type === "text:read") {
    if (!msg.id) { respond(worker, msgId, ""); return; }
    const { texts } = await import("../Database/index.ts");
    const entry = await texts.queryOne({ id: msg.id as string });
    respond(worker, msgId, entry ? entry.content : "");
    return;
  }

  if (type === "text:set") {
    if (msg.id === undefined || msg.content === undefined) { respond(worker, msgId, null); return; }
    const { texts } = await import("../Database/index.ts");
    const existing  = await texts.queryOne({ id: msg.id as string });
    if (existing) {
      await texts.modify({ id: msg.id as string }, "$set", { content: msg.content });
    } else {
      await texts.create({ id: msg.id as string, content: msg.content as string });
    }
    respond(worker, msgId, null);
    return;
  }
}
