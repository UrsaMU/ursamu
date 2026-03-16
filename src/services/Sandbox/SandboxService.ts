import { Sandbox, type SandboxOptions } from "../../../deps.ts";

const SERVER_START = Date.now();
import type { ISandboxConfig } from "../../@types/ISandboxConfig.ts";
import { SDKService, type SDKContext } from "./SDKService.ts";
import { send as broadcastSend, broadcast as broadcastAll } from "../broadcast/index.ts";
import { Obj } from "../DBObjs/DBObjs.ts";
import type { IDBOBJ } from "../../@types/IDBObj.ts";
import type { IDBObj } from "../../@types/UrsamuSDK.ts";
import type { IChanEntry } from "../../@types/Channels.ts";
import { wsService } from "../WebSocket/index.ts";

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
        const { type, data, prop, value, message, target: msgTarget } = e.data;
        
        switch (type) {
          case "result":
            worker.terminate();
            resolve(data);
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
                wsService.getConnectedSockets().find(s => s.id === context.socketId)?.disconnect();
              }
            }
            break;
          case "broadcast":
            if (message) {
              broadcastAll(message, data);
            }
            break;
          case "teleport":
            if (e.data.target && e.data.destination) {
                Obj.get(e.data.target).then(obj => {
                    if (obj) {
                        obj.location = e.data.destination;
                    }
                });
            }
            break;
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
              const { dbojs: db } = await import("../Database/index.ts");

              (async () => {
                const found = await isNameTaken(e.data.name);
                if (!found) return worker.postMessage({ type: "response", msgId: e.data.msgId, data: false });

                const match = await compare(e.data.password, found.data?.password || "");
                if (!match) {
                  // Track failed attempts
                  const attempts = ((found.data?.failedAttempts as number) || 0) + 1;
                  found.data ||= {};
                  found.data.failedAttempts = attempts;
                  await db.modify({ id: found.id }, "$set", found);
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
                    socket.cid = e.data.id;
                    socket.join(`#${e.data.id}`);
                    const player = await db.queryOne({ id: e.data.id });
                    if (player) {
                      await setFlags(player, "connected");
                      if (player.location) socket.join(`#${player.location}`);

                      // Feature parity with legacy connect
                      const { joinChans } = await import("../../utils/joinChans.ts");
                      const { hooks } = await import("../Hooks/index.ts");

                      const ctx = { socket, msg: "" };
                      await joinChans(ctx);
                      await hooks.aconnect(player);
                    }
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
                     player.data ||= {};
                     player.data.password = hashed;
                     await db.modify({ id: e.data.id }, "$set", player);
                   }
                   worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
                 })();
             } else {
                 worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
             }
             break;
          }
          case "sys:setConfig": {
              if (e.data.key && e.data.value !== undefined) {
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
                    en.data.channels = channels;
                    await db.modify({ id: en.id }, "$set", en);
                    
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
                      en.data.channels = channels;
                      await db.modify({ id: en.id }, "$set", en);
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
                await chanDb.modify({ name }, "$set", updates);
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: { ok: true } });
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
            if (e.data.command && context?.id) {
               const { force } = await import("../commands/index.ts");
               const { dbojs: db } = await import("../Database/index.ts");
               (async () => {
                  const en = await db.queryOne({ id: context.id });
                  if (en) {
                      const { wsService } = await import("../WebSocket/index.ts");
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
          case "mail:send": {
            if (e.data.mail) {
              const { mail } = await import("../Database/index.ts");
              (async () => {
                await mail.create(e.data.mail);
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
              })();
            }
            break;
          }
          case "mail:read": {
            if (e.data.query) {
               const { mail } = await import("../Database/index.ts");
               (async () => {
                 const results = await mail.query(e.data.query);
                 worker.postMessage({ type: "response", msgId: e.data.msgId, data: results });
               })();
            }
            break;
          }
          case "mail:delete": {
            if (e.data.id) {
               const { mail } = await import("../Database/index.ts");
               (async () => {
                 await mail.delete({ id: e.data.id });
                 worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
               })();
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
          case "bb:listBoards": {
            const { bboards } = await import("../Database/index.ts");
            const { bboard: bbPost } = await import("../Database/index.ts");
            (async () => {
              const boards = await bboards.query({});
              boards.sort((a, b) => a.order - b.order);
              const result = await Promise.all(boards.map(async (b) => {
                const posts = await bbPost.query({ board: b.id });
                // get per-player read state from context
                const lastRead = (context?.state as Record<string, unknown>)?.bbLastRead as Record<string, number> || {};
                const lastReadNum = lastRead[b.id] || 0;
                const newCount = posts.filter(p => p.num > lastReadNum).length;
                return { id: b.id, name: b.name, description: b.description, order: b.order, postCount: posts.length, newCount };
              }));
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: result });
            })();
            break;
          }
          case "bb:listPosts": {
            if (e.data.boardId) {
              const { bboard: bbPost } = await import("../Database/index.ts");
              (async () => {
                const posts = await bbPost.query({ board: e.data.boardId as string });
                posts.sort((a, b) => a.num - b.num);
                const result = posts.map(p => ({ id: p.id, num: p.num, subject: p.subject, authorName: p.authorName, date: p.date, edited: p.edited }));
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: result });
              })();
            } else {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: [] });
            }
            break;
          }
          case "bb:readPost": {
            if (e.data.boardId && e.data.postNum !== undefined) {
              const { bboard: bbPost } = await import("../Database/index.ts");
              (async () => {
                const post = await bbPost.queryOne({ board: e.data.boardId as string, num: e.data.postNum as number });
                if (!post) {
                  worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
                  return;
                }
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: { id: post.id, subject: post.subject, body: post.body, authorName: post.authorName, date: post.date, edited: post.edited } });
              })();
            } else {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
            }
            break;
          }
          case "bb:post": {
            if (e.data.boardId && e.data.subject && e.data.body) {
              const { bboards, bboard: bbPost } = await import("../Database/index.ts");
              const { dbojs: db } = await import("../Database/index.ts");
              (async () => {
                const board = await bboards.queryOne({ id: e.data.boardId as string });
                if (!board) {
                  worker.postMessage({ type: "response", msgId: e.data.msgId, data: { error: "Board not found." } });
                  return;
                }
                const posts = await bbPost.query({ board: e.data.boardId as string });
                const num = posts.length + 1;
                const author = context?.id || "0";
                const en = await db.queryOne({ id: author });
                const authorName = en?.data?.name || en?.id || "Unknown";
                const { crypto } = globalThis;
                const id = crypto.randomUUID();
                const post = await bbPost.create({ id, board: e.data.boardId as string, num, subject: e.data.subject as string, body: e.data.body as string, author, authorName, date: Date.now() });
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: { id: post.id } });
              })();
            } else {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
            }
            break;
          }
          case "bb:editPost": {
            if (e.data.boardId && e.data.postNum !== undefined && e.data.body !== undefined) {
              const { bboard: bbPost } = await import("../Database/index.ts");
              (async () => {
                const post = await bbPost.queryOne({ board: e.data.boardId as string, num: e.data.postNum as number });
                if (!post) {
                  worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
                  return;
                }
                await bbPost.modify({ id: post.id }, "$set", { body: e.data.body as string, edited: Date.now() });
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
              })();
            } else {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
            }
            break;
          }
          case "bb:deletePost": {
            if (e.data.boardId && e.data.postNum !== undefined) {
              const { bboard: bbPost } = await import("../Database/index.ts");
              (async () => {
                const post = await bbPost.queryOne({ board: e.data.boardId as string, num: e.data.postNum as number });
                if (post) await bbPost.delete({ id: post.id });
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
              })();
            } else {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
            }
            break;
          }
          case "bb:createBoard": {
            if (e.data.name) {
              const { bboards } = await import("../Database/index.ts");
              (async () => {
                const name = (e.data.name as string).trim();
                const id = name.toLowerCase().replace(/\s+/g, "-");
                const existing = await bboards.queryOne({ id });
                if (existing) {
                  worker.postMessage({ type: "response", msgId: e.data.msgId, data: { error: "Board already exists." } });
                  return;
                }
                const allBoards = await bboards.query({});
                const order = (e.data.order as number) ?? (allBoards.length + 1);
                const board = await bboards.create({ id, name, description: e.data.description as string | undefined, order });
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: { id: board.id, name: board.name } });
              })();
            } else {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
            }
            break;
          }
          case "bb:destroyBoard": {
            if (e.data.boardId) {
              const { bboards, bboard: bbPost } = await import("../Database/index.ts");
              (async () => {
                await bboards.delete({ id: e.data.boardId as string });
                await bbPost.delete({ board: e.data.boardId as string });
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
              })();
            } else {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
            }
            break;
          }
          case "bb:markRead": {
            if (e.data.boardId && context?.id) {
              const { bboard: bbPost } = await import("../Database/index.ts");
              const { dbojs: db } = await import("../Database/index.ts");
              (async () => {
                const posts = await bbPost.query({ board: e.data.boardId as string });
                const maxNum = posts.reduce((m, p) => Math.max(m, p.num), 0);
                const en = await db.queryOne({ id: context.id });
                if (en) {
                  en.data ||= {};
                  const lastRead = (en.data.bbLastRead as Record<string, number>) || {};
                  lastRead[e.data.boardId as string] = maxNum;
                  en.data.bbLastRead = lastRead;
                  await db.modify({ id: en.id }, "$set", en);
                }
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
              })();
            } else {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: null });
            }
            break;
          }
          case "bb:newPostCount": {
            if (e.data.boardId && context?.id) {
              const { bboard: bbPost } = await import("../Database/index.ts");
              const { dbojs: db } = await import("../Database/index.ts");
              (async () => {
                const en = await db.queryOne({ id: context.id });
                const lastRead = (en?.data?.bbLastRead as Record<string, number>) || {};
                const lastReadNum = lastRead[e.data.boardId as string] || 0;
                const posts = await bbPost.query({ board: e.data.boardId as string });
                const count = posts.filter(p => p.num > lastReadNum).length;
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: count });
              })();
            } else {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: 0 });
            }
            break;
          }
          case "bb:totalNewCount": {
            if (context?.id) {
              const { bboards, bboard: bbPost } = await import("../Database/index.ts");
              const { dbojs: db } = await import("../Database/index.ts");
              (async () => {
                const en = await db.queryOne({ id: context.id });
                const lastRead = (en?.data?.bbLastRead as Record<string, number>) || {};
                const boards = await bboards.query({});
                let total = 0;
                for (const board of boards) {
                  const lastReadNum = lastRead[board.id] || 0;
                  const posts = await bbPost.query({ board: board.id });
                  total += posts.filter(p => p.num > lastReadNum).length;
                }
                worker.postMessage({ type: "response", msgId: e.data.msgId, data: total });
              })();
            } else {
              worker.postMessage({ type: "response", msgId: e.data.msgId, data: 0 });
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
  private defaultTimeout = 200;

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
        const { transform } = await import("https://esm.sh/sucrase@3.35.0?exports=transform");
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
