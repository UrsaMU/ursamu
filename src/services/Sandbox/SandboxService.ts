import { Sandbox, type SandboxOptions } from "../../../deps.ts";

const SERVER_START = Date.now();

/**
 * Scoped DB update — writes only the specified dot-notation field paths instead
 * of the entire object. Prevents full-object $set from clobbering concurrent writes.
 * Exported for direct use in tests.
 */
export async function scopedUpdate(id: string, fields: Record<string, unknown>): Promise<void> {
  const { dbojs } = await import("../Database/index.ts");
  await dbojs.modify({ id }, "$set", fields);
}
import type { ISandboxConfig } from "../../@types/ISandboxConfig.ts";
import { SDKService, type SDKContext } from "./SDKService.ts";
import { send as broadcastSend, broadcast as broadcastAll } from "../broadcast/index.ts";
import { Obj as _Obj } from "../DBObjs/DBObjs.ts";
import type { IDBOBJ } from "../../@types/IDBObj.ts";
import type { IDBObj } from "../../@types/UrsamuSDK.ts";
import type { IChanEntry } from "../../@types/Channels.ts";
import { wsService } from "../WebSocket/index.ts";
import { gameHooks } from "../Hooks/GameHooks.ts";

/**
 * Local fallback for Sandbox when no Deno Deploy token is available.
 */
class LocalSandbox {
  private terminated = false;

  eval(code: string, options?: { sdk?: unknown; context?: SDKContext }): Promise<unknown> {
    if (this.terminated) throw new Error("Sandbox is terminated");
    const { context } = options || {};

    const workerUrl = new URL("./worker.ts", import.meta.url).href;
    const worker = new Worker(workerUrl, { type: "module" });

    return new Promise((resolve, reject) => {
      worker.onmessage = async (e) => {
        // Guard: reject malformed messages before touching any field
        if (!e.data || typeof e.data !== "object" || typeof e.data.type !== "string") {
          console.warn("[SandboxService] Dropped malformed worker message");
          return;
        }
        const { type, data, prop, value, message, target: msgTarget } = e.data;

        switch (type) {
          case "result":
            worker.terminate();
            resolve(data);
            // Emit game hooks for communication events (fire-and-forget)
            (async () => {
              const meta = (data as { meta?: Record<string, unknown> } | null)?.meta;
              if (!meta || typeof meta.type !== "string") return;
              const roomId = (context?.here as { id?: string } | undefined)?.id
                          || context?.location as string
                          || "";
              if (meta.type === "say") {
                await gameHooks.emit("player:say", {
                  actorId:   (meta.actorId   as string) || context?.id || "",
                  actorName: (meta.actorName as string) || "",
                  roomId,
                  message:   (meta.message   as string) || "",
                });
              } else if (meta.type === "pose") {
                await gameHooks.emit("player:pose", {
                  actorId:    (meta.actorId   as string) || context?.id || "",
                  actorName:  (meta.actorName as string) || "",
                  roomId,
                  content:    (meta.content    as string) || "",
                  isSemipose: (meta.isSemipose as boolean) || false,
                });
              } else if (meta.type === "page") {
                await gameHooks.emit("player:page", {
                  actorId:    (meta.actorId    as string) || context?.id || "",
                  actorName:  (meta.actorName  as string) || "",
                  targetId:   (meta.targetId   as string) || "",
                  targetName: (meta.targetName as string) || "",
                  message:    (meta.message    as string) || "",
                });
              }
            })().catch(e => console.error("[GameHooks] emit error:", e));
            break;
          case "error":
            worker.terminate();
            reject(new Error(data));
            break;
          case "patch":
            if (prop && context?.state) {
              context.state[prop] = value;
            }
            break;
          case "send":
            if (message) {
              const targets = msgTarget ? [msgTarget] : (context?.socketId ? [context.socketId] : []);
              broadcastSend(targets, message, data);
              
              if (data?.quit && context?.socketId) {
                const sock = wsService.getConnectedSockets().find(s => s.id === context.socketId);
                if (sock?.cid) wsService.disconnect(sock.cid);
              }
            }
            break;
          case "broadcast":
            if (message) {
              broadcastAll(message, data);
            }
            break;
          case "room:broadcast": {
            if (message && e.data.room) {
              const { dbojs: db } = await import("../Database/index.ts");
              const excludeIds: string[] = Array.isArray(e.data.exclude) ? e.data.exclude as string[] : [];
              const players = await db.query({
                $and: [{ location: e.data.room }, { flags: /connected/i }]
              });
              const targets = players
                .filter(p => !excludeIds.includes(p.id))
                .map(p => p.id);
              if (targets.length > 0) {
                broadcastSend(targets, message, data);
              }
            }
            break;
          }
          case "teleport": {
            if (e.data.target && e.data.destination) {
                const { dbojs: db } = await import("../Database/index.ts");
                const { moniker: mk } = await import("../../utils/moniker.ts");

                (async () => {
                    const target = await db.queryOne({ id: e.data.target });
                    const dest = await db.queryOne({ id: e.data.destination });
                    if (!target || !dest) return;

                    const sourceId = target.location;

                    // Notify source room players
                    if (sourceId) {
                        const sourcePlayers = await db.query({
                            $and: [{ location: sourceId }, { flags: /connected/i }, { id: { $ne: target.id } }]
                        });
                        const sourceTargets = sourcePlayers.map(p => p.id);
                        if (sourceTargets.length > 0) {
                            broadcastSend(sourceTargets, `${mk(target)} has left.`, {});
                        }
                    }

                    // Persist new location
                    await db.modify({ id: target.id }, "$set", { location: e.data.destination });

                    // Notify destination room players
                    const destPlayers = await db.query({
                        $and: [{ location: e.data.destination }, { flags: /connected/i }, { id: { $ne: target.id } }]
                    });
                    const destTargets = destPlayers.map(p => p.id);
                    if (destTargets.length > 0) {
                        const sourceRoom = sourceId ? await db.queryOne({ id: sourceId }) : null;
                        const fromStr = sourceRoom?.data?.name ? ` from ${sourceRoom.data.name}` : "";
                        broadcastSend(destTargets, `${mk(target)} has arrived${fromStr}.`, {});
                    }

                    // Auto-look for the moved player
                    const targetSocket = wsService.getConnectedSockets().find(s => s.cid === target.id);
                    if (targetSocket) {
                        const { cmdParser } = await import("../commands/index.ts");
                        await cmdParser.run({ socket: targetSocket, msg: "look" });
                    }
                })();
            }
            break;
          }
          case "db:search":
            if (e.data.query) {
              const { dbojs: db } = await import("../Database/index.ts");
              const { target } = await import("../../utils/target.ts");
              
              (async () => {
                try {
                  let results: unknown[] = [];
                  if (typeof e.data.query === "string") {
                    const char = await db.queryOne({ id: context?.id || "1" });
                    const found = await target(char || { id: "1", flags: "wizard", data: {} } as unknown as IDBOBJ, e.data.query, true);
                    results = found ? [found] : [];
                  } else {
                    results = await db.query(e.data.query);
                  }
                  
                  const sdkResults = await Promise.all(results.map((r: unknown) => {
                      const obj = r as IDBOBJ;
                      const ctx = {
                        id: obj.id,
                        me: { ...obj, name: obj.data?.name, flags: new Set(obj.flags.split(" ")), state: obj.data || {} },
                        state: obj.data || {}
                      };
                      const sdk = SDKService.prepareSDK(ctx as unknown as SDKContext);
                      return sdk.me;
                  }));
                  worker.postMessage({ type: "response", msgId: e.data.msgId, data: sdkResults });
                } catch (err) {
                  const message = err instanceof Error ? err.message : String(err);
                  worker.postMessage({ type: "error", msgId: e.data.msgId, data: message });
                }
              })();
            }
            break;
          case "db:create":
            if (e.data.template) {
              const { dbojs: db } = await import("../Database/index.ts");
              const { getNextId } = await import("../../utils/getNextId.ts");
              const { template } = e.data;
              
              const id = await getNextId("objid");
              const newObj = {
                id,
                flags: template.flags instanceof Set ? Array.from(template.flags).join(" ") : (Array.isArray(template.flags) ? template.flags.join(" ") : (template.flags || "")),
                location: template.location,
                data: template.state || {}
              };
              
              const created = await db.create(newObj);
              const sdkObj = SDKService.prepareSDK({ 
                id: created.id, 
                me: { ...created, flags: new Set(created.flags.split(" ")), state: created.data || {} }, 
                state: created.data || {} 
              }).me;
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: sdkObj });
            }
            break;
          case "db:destroy":
            if (e.data.id) {
               const { dbojs: db } = await import("../Database/index.ts");
               await db.delete({ id: e.data.id });
               worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
            }
            break;
          case "db:modify":
            if (e.data.id && e.data.op && e.data.data) {
                const allowedOps = ["$set", "$unset", "$inc"];
                if (!allowedOps.includes(e.data.op)) {
                  worker.postMessage({ type: "response", msgId: e.data.msgId, data: { error: `Invalid op: ${e.data.op}` } });
                  break;
                }
                const { dbojs: db } = await import("../Database/index.ts");
                await db.modify({ id: e.data.id }, e.data.op, e.data.data);
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
            }
            break;
          case "lock:check":
            if (e.data.target && e.data.lock) {
              const { evaluateLock } = await import("../../utils/evaluateLock.ts");
              const { dbojs: db } = await import("../Database/index.ts");
              
              (async () => {
                try {
                  const en = await db.queryOne({ id: context?.id || "1" });
                  const tar = await db.queryOne({ id: e.data.target });
                  
                  if (!en || !tar) {
                    worker.postMessage({ type: "response", msgId: e.data.msgId, data: false });
                    return;
                  }

                  const hydrate = (obj: IDBOBJ): IDBObj => ({
                    id: obj.id,
                    name: obj.data?.name || "Unknown",
                    flags: new Set(obj.flags.split(" ")),
                    location: obj.location,
                    state: obj.data || {},
                    contents: []
                  });

                  const result = await evaluateLock(e.data.lock, hydrate(en), hydrate(tar));
                  worker.postMessage({ type: "response", msgId: e.data.msgId, data: result });
                } catch (err) {
                  const message = err instanceof Error ? err.message : String(err);
                  worker.postMessage({ type: "error", msgId: e.data.msgId, data: message });
                }
              })();
            }
            break;
          case "auth:verify": {
            if (e.data.name && e.data.password) {
              const { isNameTaken } = await import("../../utils/isNameTaken.ts");
              const { compare } = await import("../../../deps.ts");
              (async () => {
                const found = await isNameTaken(e.data.name);
                if (!found) return worker.postMessage({ type: "response", msgId: e.data.msgId, data: false });

                const match = await compare(e.data.password, found.data?.password || "");
                if (!match) {
                  // Track failed attempts — scoped update to avoid clobbering concurrent writes
                  const attempts = ((found.data?.failedAttempts as number) || 0) + 1;
                  await scopedUpdate(found.id, { "data.failedAttempts": attempts });
                }
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: match });
              })();
            }
            break;
          }
          case "auth:login": {
            if (e.data.id && context?.socketId) {
               const { wsService } = await import("../WebSocket/index.ts");
               const { dbojs: db } = await import("../Database/index.ts");
               const { setFlags } = await import("../../utils/setFlags.ts");

               (async () => {
                  const socket = wsService.getConnectedSockets().find(s => s.id === context.socketId);
                  if (socket) {
                    // Only assign cid if not already set — prevents a compromised script
                    // from hijacking another player's authenticated socket.
                    if (!socket.cid) socket.cid = e.data.id;
                    socket.join(`#${e.data.id}`);
                    const player = await db.queryOne({ id: e.data.id });
                    if (player) {
                      await setFlags(player, "connected");
                      if (player.location) socket.join(`#${player.location}`);

                      // Record login time — scoped update to avoid clobbering concurrent writes
                      await scopedUpdate(player.id, { "data.lastLogin": Date.now() });

                      // Feature parity with legacy connect
                      const { joinChans } = await import("../../utils/joinChans.ts");
                      const { hooks } = await import("../Hooks/index.ts");

                      const ctx = { socket, msg: "" };
                      await joinChans(ctx);
                      await hooks.aconnect(player);
                    }
                  }
                  // Send cid back to the WebSocket client so it can reconnect after restart
                  if (socket) {
                    wsService.send([socket.id], {
                      event: "message",
                      payload: { msg: "", data: { cid: e.data.id } }
                    });
                  }

                  worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
               })();
            }
            break;
          }
          case "auth:hash": {
             if (e.data.password) {
                 const { hash } = await import("../../../deps.ts");
                 const hashed = await hash(e.data.password, 10);
                 worker.postMessage({ type: "response", msgId: e.data.msgId, data: hashed });
             } else {
                 worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
             }
             break;
          }
          case "auth:setPassword": {
             if (e.data.id && e.data.password) {
                 const { hash } = await import("../../../deps.ts");
                 const { dbojs: db } = await import("../Database/index.ts");
                 (async () => {
                   const hashed = await hash(e.data.password, 10);
                   const player = await db.queryOne({ id: e.data.id });
                   if (player) {
                     await scopedUpdate(e.data.id, { "data.password": hashed });
                   }
                   worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
                 })();
             } else {
                 worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
             }
             break;
          }
          case "sys:setConfig": {
              const ALLOWED_CONFIG_KEYS = new Set([
                "server.name", "server.description", "server.banner",
                "server.corsOrigins", "server.maxConnections",
                "game.maxPlayers", "game.description", "game.loginMessage", "game.welcomeMessage",
              ]);
              if (e.data.key && e.data.value !== undefined && ALLOWED_CONFIG_KEYS.has(e.data.key)) {
                  const { setConfig } = await import("../Config/mod.ts");
                  setConfig(e.data.key, e.data.value);
                  worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
              } else {
                  worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
              }
              break;
          }
          case "sys:disconnect": {
              if (e.data.id) {
                  const { wsService } = await import("../WebSocket/index.ts");
                  wsService.disconnect(e.data.id);
                  worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
              } else {
                  worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
              }
              break;
          }
          case "sys:update": {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
              const { send: bsend, broadcast: bcast } = await import("../broadcast/index.ts");
              const socketTargets = context?.socketId ? [context.socketId] : [];
              const branch = (e.data.branch as string) || "";

              // Permission guard — must be admin/wizard/superuser at the engine level.
              if (context?.id) {
                const { dbojs: _db } = await import("../Database/index.ts");
                const actor = await _db.queryOne({ id: context.id });
                const flags = (actor?.flags as unknown as string) || "";
                if (!flags.includes("admin") && !flags.includes("wizard") && !flags.includes("superuser")) {
                  bsend(socketTargets, "%chGame>%cn Permission denied.", {});
                  break;
                }
              }

              // Validate branch name — must be alphanumeric/hyphens/dots/slashes only,
              // and must not start with "-" (prevents git option injection).
              if (branch && (!/^[\w./\-]+$/.test(branch) || branch.startsWith("-"))) {
                bsend(socketTargets, `%chGame>%cn Invalid branch name: "${branch}"`, {});
                break;
              }

              (async () => {
                try {
                  // 1. git pull
                  const pullArgs = branch ? ["pull", "origin", branch] : ["pull"];
                  const pullProc = new Deno.Command("git", {
                    args: pullArgs,
                    stdout: "piped",
                    stderr: "piped",
                    cwd: Deno.cwd(),
                  });
                  const pull = await pullProc.output();
                  const pullOut = new TextDecoder().decode(pull.stdout).trim();
                  const pullErr = new TextDecoder().decode(pull.stderr).trim();
                  const pullMsg = (pullOut || pullErr).replace(/\n/g, " | ");

                  if (!pull.success) {
                    bsend(socketTargets, `%chGame>%cn git pull failed: ${pullErr || pullOut}`, {});
                    return;
                  }

                  bsend(socketTargets, `%chGame>%cn ${pullMsg || "Already up to date."}`, {});

                  // 2. Reboot
                  bcast("%chGame>%cn Update complete. Rebooting...", {});
                  setTimeout(() => Deno.exit(75), 500);
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  bsend(socketTargets, `%chGame>%cn Update error: ${msg}`, {});
                }
              })();
              break;
          }
          case "sys:reboot": {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
              const { broadcast: bcast } = await import("../broadcast/index.ts");
              bcast("Server rebooting...", {});
              setTimeout(() => Deno.exit(75), 500); // exit code 75 signals reboot to ursamu.sh
              break;
          }
          case "sys:shutdown": {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
              const { broadcast: bcast } = await import("../broadcast/index.ts");
              bcast("Server shutting down...", {});
              setTimeout(() => Deno.exit(0), 500);
              break;
          }
          case "sys:uptime": {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: Date.now() - SERVER_START });
              break;
          }
          case "chan:join": {
            if (e.data.channel && e.data.alias && context?.id) {
               const { dbojs: db } = await import("../Database/index.ts");
               const { wsService } = await import("../WebSocket/index.ts");
               
               (async () => {
                  const en = await db.queryOne({ id: context.id });
                  if (en) {
                    en.data ||= {};
                    const channels = (en.data.channels as unknown[] || []) as IChanEntry[];
                    channels.push({ channel: e.data.channel, alias: e.data.alias, active: true } as IChanEntry);
                    await scopedUpdate(en.id, { "data.channels": channels });

                    const socket = wsService.getConnectedSockets().find(s => s.cid === en.id);
                    if (socket) socket.join(e.data.channel);
                  }
                  worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
               })();
            }
            break;
          }
          case "chan:leave": {
            if (e.data.alias && context?.id) {
               const { dbojs: db } = await import("../Database/index.ts");
               const { wsService } = await import("../WebSocket/index.ts");
               
               (async () => {
                  const en = await db.queryOne({ id: context.id });
                  if (en) {
                    en.data ||= {};
                    const channels = (en.data.channels as unknown[] || []) as IChanEntry[];
                    const index = channels.findIndex((c) => c.alias === e.data.alias);
                    if (index !== -1) {
                      const [chan] = channels.splice(index, 1);
                      await scopedUpdate(en.id, { "data.channels": channels });
                      const socket = wsService.getConnectedSockets().find(s => s.cid === en.id);
                      if (socket) socket.leave(chan.channel);
                    }
                  }
                  worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
               })();
            }
            break;
          }
          case "chan:list": {
            const { chans } = await import("../Database/index.ts");
            (async () => {
              const list = await chans.query({});
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: list });
            })();
            break;
          }
          case "chan:create": {
            if (e.data.name) {
              const { chans: chanDb } = await import("../Database/index.ts");
              (async () => {
                const name = (e.data.name as string).toLowerCase().trim();
                const existing = await chanDb.queryOne({ name });
                if (existing) {
                  worker.postMessage({ type: "response", msgId: e.data.msgId, data: { error: "Channel already exists." } });
                  return;
                }
                const chan = await chanDb.create({
                  id: name,
                  name,
                  header: (e.data.header as string) || `[${name.toUpperCase()}]`,
                  lock: (e.data.lock as string) || "",
                  hidden: (e.data.hidden as boolean) || false,
                  owner: context?.id || ""
                });
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: chan });
              })();
            } else {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
            }
            break;
          }
          case "chan:destroy": {
            if (e.data.name) {
              const { chans: chanDb } = await import("../Database/index.ts");
              (async () => {
                const name = (e.data.name as string).toLowerCase().trim();
                const existing = await chanDb.queryOne({ name });
                if (!existing) {
                  worker.postMessage({ type: "response", msgId: e.data.msgId, data: { error: "Channel not found." } });
                  return;
                }
                await chanDb.delete({ name });
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: { ok: true } });
              })();
            } else {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
            }
            break;
          }
          case "chan:set": {
            if (e.data.name) {
              const { chans: chanDb } = await import("../Database/index.ts");
              (async () => {
                const name = (e.data.name as string).toLowerCase().trim();
                const existing = await chanDb.queryOne({ name });
                if (!existing) {
                  worker.postMessage({ type: "response", msgId: e.data.msgId, data: { error: "Channel not found." } });
                  return;
                }
                const updates: Record<string, unknown> = {};
                if (e.data.header !== undefined) updates.header = e.data.header;
                if (e.data.lock !== undefined) updates.lock = e.data.lock;
                if (e.data.hidden !== undefined) updates.hidden = e.data.hidden;
                if (e.data.masking !== undefined) updates.masking = e.data.masking;
                if (e.data.logHistory !== undefined) updates.logHistory = e.data.logHistory;
                if (e.data.historyLimit !== undefined) updates.historyLimit = e.data.historyLimit;
                await chanDb.modify({ name }, "$set", updates);
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: { ok: true } });
              })();
            } else {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
            }
            break;
          }
          case "chan:history": {
            (async () => {
              const { chanHistory: histDb, chans: chanDb } = await import("../Database/index.ts");
              const name = (e.data.name as string | undefined)?.toLowerCase().trim();
              if (!name) {
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: [] });
                return;
              }
              const chan = await chanDb.queryOne({ name });
              if (!chan) {
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: { error: "Channel not found." } });
                return;
              }
              const limit = typeof e.data.limit === "number" ? e.data.limit : 20;
              const all = await histDb.find({ chanId: chan.id });
              all.sort((a, b) => a.timestamp - b.timestamp);
              const slice = all.slice(-limit);
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: slice });
            })();
            break;
          }
          case "trigger:attr": {
            if (e.data.target && e.data.attr) {
              const { dbojs: db } = await import("../Database/index.ts");
              const { hooks } = await import("../Hooks/index.ts");
              (async () => {
                try {
                  const obj = await db.queryOne({ id: e.data.target as string });
                  const enactor = context?.id ? await db.queryOne({ id: context.id }) : undefined;
                  if (obj) {
                    await hooks.executeAttribute(obj, e.data.attr as string, (e.data.args as string[]) || [], enactor || undefined);
                  }
                } catch (_) { /* attribute not found or script error — non-fatal */ }
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
              })();
            } else {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
            }
            break;
          }
          case "flags:set": {
            if (e.data.target && e.data.flags) {
              const { dbojs: db } = await import("../Database/index.ts");
              const { setFlags } = await import("../../utils/setFlags.ts");
              (async () => {
                const tar = await db.queryOne({ id: e.data.target });
                const en = context?.id ? await db.queryOne({ id: context.id }) : undefined;
                if (tar) {
                  await setFlags(tar, e.data.flags, en || undefined);
                }
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
              })();
            }
            break;
          }
          case "util:target": {
            if (e.data.actor && e.data.query) {
              const { dbojs: db } = await import("../Database/index.ts");
              const { target } = await import("../../utils/target.ts");
              (async () => {
                const en = await db.queryOne({ id: e.data.actor });
                if (en) {
                  const result = await target(en, e.data.query);
                  if (result) {
                    // Serialize with array flags so worker can hydrate into a Set
                    const sdkResult = {
                      id: result.id,
                      name: result.data?.name || result.id,
                      flags: result.flags.split(" ").filter(Boolean),
                      location: result.location,
                      state: result.data || {},
                      contents: [],
                    };
                    worker.postMessage({ type: "response", msgId: e.data.msgId, data: sdkResult });
                  } else {
                    worker.postMessage({ type: "response", msgId: e.data.msgId, data: undefined });
                  }
                } else {
                  worker.postMessage({ type: "response", msgId: e.data.msgId, data: undefined });
                }
              })();
            } else {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: undefined });
            }
            break;
          }
          case "attr:get": {
            if (e.data.id && e.data.name) {
              const { dbojs: db } = await import("../Database/index.ts");
              (async () => {
                const obj = await db.queryOne({ id: e.data.id as string });
                if (!obj) {
                  worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
                  return;
                }
                const attrs = (obj.data?.attributes as Array<{ name: string; value: string }> | undefined) || [];
                const found = attrs.find(a => a.name.toUpperCase() === (e.data.name as string).toUpperCase());
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: found?.value ?? null });
              })();
            } else {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
            }
            break;
          }
          case "events:emit": {
            if (e.data.event) {
              const { eventsService } = await import("../Events/index.ts");
              eventsService.emit(e.data.event, e.data.data, e.data.context);
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
            } else {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
            }
            break;
          }
          case "events:subscribe": {
            if (e.data.event && e.data.handler && context?.id) {
              const { eventsService } = await import("../Events/index.ts");
              const subId = await eventsService.subscribe(e.data.event, e.data.handler, context.id);
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: subId });
            } else {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
            }
            break;
          }
          case "execute":
          case "force": {
            if (e.data.command) {
               const { force } = await import("../commands/index.ts");
               const { dbojs: db } = await import("../Database/index.ts");
               (async () => {
                  const { wsService } = await import("../WebSocket/index.ts");
                  // Resolve actor: prefer context.id, fall back to the live socket's cid (e.g. post-login in connect script)
                  let actorId = context?.id && context.id !== "#-1" ? context.id : undefined;
                  if (!actorId && context?.socketId) {
                    const liveSocket = wsService.getConnectedSockets().find(s => s.id === context.socketId);
                    if (liveSocket?.cid) actorId = liveSocket.cid;
                  }
                  const en = actorId ? await db.queryOne({ id: actorId }) : undefined;
                  if (en) {
                      const socket = wsService.getConnectedSockets().find(s => s.cid === en.id);
                      const mockCtx = { socket: socket || { cid: en.id, id: "script-" + en.id, join: () => {}, leave: () => {}, send: () => {} }, msg: e.data.command };
                      // deno-lint-ignore no-explicit-any
                      await force(mockCtx as any, e.data.command);
                  }
                  worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
               })();
            } else {
               worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
            }
            break;
          }
          case "force:as": {
            if (e.data.targetId && e.data.command) {
              const { force } = await import("../commands/index.ts");
              const { dbojs: db } = await import("../Database/index.ts");
              (async () => {
                const { wsService } = await import("../WebSocket/index.ts");
                const en = await db.queryOne({ id: e.data.targetId });
                if (en) {
                  const socket = wsService.getConnectedSockets().find(s => s.cid === en.id);
                  const mockCtx = { socket: socket || { cid: en.id, id: "force-" + en.id, join: () => {}, leave: () => {}, send: () => {}, disconnect: () => {} }, msg: e.data.command };
                  // deno-lint-ignore no-explicit-any
                  await force(mockCtx as any, e.data.command);
                }
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
              })();
            } else {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
            }
            break;
          }
          case "eval:attr": {
            (async () => {
              try {
                const { dbojs: db } = await import("../Database/index.ts");
                // deno-lint-ignore no-explicit-any
                let tarObj: any = await db.queryOne({ id: e.data.targetStr });
                if (!tarObj) {
                  tarObj = await db.queryOne({
                    "data.name": new RegExp(`^${String(e.data.targetStr).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
                  });
                }
                if (!tarObj) {
                  worker.postMessage({ type: "response", msgId: e.data.msgId, data: "" });
                  return;
                }
                const attrs = ((tarObj.data?.attributes as Array<{ name: string; value: string }>) || []);
                const attrData = attrs.find((a: { name: string }) => a.name.toUpperCase() === String(e.data.attr).toUpperCase());
                if (!attrData) {
                  worker.postMessage({ type: "response", msgId: e.data.msgId, data: "" });
                  return;
                }
                const result = await sandboxService.runScript(attrData.value, {
                  id: tarObj.id,
                  state: (tarObj.data?.state as Record<string, unknown>) || {},
                  cmd: { name: "", args: (e.data.args as string[]) || [] },
                });
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: result != null ? String(result) : "" });
              } catch (_err) {
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: "" });
              }
            })();
            break;
          }
          case "sys:gametime": {
            (async () => {
              const { gameClock } = await import("../GameClock/index.ts");
              const t = gameClock.now();
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: t });
            })();
            break;
          }
          case "sys:setgametime": {
            if (e.data.t) {
              (async () => {
                const { gameClock } = await import("../GameClock/index.ts");
                gameClock.set(e.data.t as import("../GameClock/index.ts").IGameTime);
                await gameClock.save();
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
              })();
            } else {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
            }
            break;
          }
          case "util:parseDesc": {
            if (e.data.desc !== undefined) {
              (async () => {
                const { parseDesc } = await import("../../utils/parseDesc.ts");
                const { dbojs: db } = await import("../Database/index.ts");
                const actor = e.data.actor ? await db.queryOne({ id: (e.data.actor as { id: string }).id }) : null;
                const target = e.data.target ? await db.queryOne({ id: (e.data.target as { id: string }).id }) : null;
                const result = await parseDesc(
                  String(e.data.desc),
                  // deno-lint-ignore no-explicit-any
                  (actor || e.data.actor) as any,
                  // deno-lint-ignore no-explicit-any
                  (target || e.data.target) as any,
                );
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: result });
              })();
            } else {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: "" });
            }
            break;
          }
          case "text:read": {
            if (e.data.id) {
              const { texts } = await import("../Database/index.ts");
              (async () => {
                const entry = await texts.queryOne({ id: e.data.id as string });
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: entry ? entry.content : "" });
              })();
            } else {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: "" });
            }
            break;
          }
          case "text:set": {
            if (e.data.id !== undefined && e.data.content !== undefined) {
              const { texts } = await import("../Database/index.ts");
              (async () => {
                const existing = await texts.queryOne({ id: e.data.id as string });
                if (existing) {
                  await texts.modify({ id: e.data.id as string }, "$set", { content: e.data.content });
                } else {
                  await texts.create({ id: e.data.id as string, content: e.data.content as string });
                }
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
              })();
            } else {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
            }
            break;
          }
        }
      };
      worker.onerror = (e) => {
        worker.terminate();
        reject(new Error(e.message));
      };
      worker.postMessage({ code, sdk: options?.sdk });
    });
  }

  kill(): Promise<void> {
    this.terminated = true;
    return Promise.resolve();
  }
}

export type SandboxInstance = Sandbox | LocalSandbox;

export class SandboxService {
  private static instance: SandboxService;
  private pool: SandboxInstance[] = [];
  private poolSize = 5;
  private maxPoolSize = 10;
  private defaultTimeout = 10000;

  private constructor() {}

  static getInstance(): SandboxService {
    if (!SandboxService.instance) {
      SandboxService.instance = new SandboxService();
    }
    return SandboxService.instance;
  }

  /**
   * Initialize the warm pool of sandboxes.
   */
  async initPool() {
    const needed = this.poolSize - this.pool.length;
    if (needed > 0) {
      const promises = Array.from({ length: needed }, () => this.createSandbox());
      const sandboxes = await Promise.all(promises);
      this.pool.push(...sandboxes);
    }
  }

  /**
   * Create a new Firecracker micro-VM sandbox.
   */
  async createSandbox(_config?: ISandboxConfig): Promise<SandboxInstance> {
    const options: SandboxOptions = {
      // memory: config?.memoryLimit || 128,
      // cpu: config?.cpuLimit || 1,
    };

    try {
      if (Deno.env.get("DENO_DEPLOY_TOKEN")) {
        return await Sandbox.create(options);
      }
    } catch (e) {
      console.warn("Failed to create Deno Sandbox, falling back to LocalSandbox:", e);
    }

    return new LocalSandbox();
  }

  /**
   * Get a sandbox from the pool or create a new one.
   */
  getSandbox(): Promise<SandboxInstance> {
    const sandbox = this.pool.shift();
    if (sandbox) {
      this.initPool().catch(console.error);
      return Promise.resolve(sandbox);
    }
    return this.createSandbox();
  }

  /**
   * Run a script within a sandbox.
   */
  async runScript(code: string, context: SDKContext, config?: ISandboxConfig) {
    const sandbox = await this.getSandbox();
    const timeout = config?.timeout || this.defaultTimeout;

    // Phase 1: Transpile TypeScript if necessary
    let execCode = code;
    try {
        const { transform } = await import("npm:sucrase@3.35.0");
        execCode = transform(code, { transforms: ["typescript"] }).code;
        
        // Strip imports - they are for IDE type checking and won't resolve in the sandbox
        execCode = execCode.replace(/^import\s+.*?;?\s*$/gm, '');
    } catch (e) {
        console.warn("[Sandbox] Transpilation failed, running as raw JS/stripping imports:", e);
        execCode = code.replace(/^import\s+.*?;?\s*$/gm, '');
    }

    // Phase 2: Prepare SDK context
    const sdkData = SDKService.prepareSDK(context);

    let timeoutId: number | undefined;
    try {
      const result = await Promise.race([
        (sandbox as LocalSandbox).eval(execCode, { sdk: sdkData, context }),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("Script execution timed out")), timeout);
        }),
      ]);

      return result;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      await sandbox.kill();
    }
  }
}

export const sandboxService = SandboxService.getInstance();
