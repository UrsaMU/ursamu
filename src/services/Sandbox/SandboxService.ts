import { Sandbox, type SandboxOptions } from "../../../deps.ts";
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
          case "force":
            if (e.data.command) {
              (async () => {
                const { force } = await import("../commands/force.ts");
                const { wsService } = await import("../WebSocket/index.ts");
                const socket = wsService.getConnectedSockets().find(s => s.id === context?.socketId);
                if (socket) {
                  await force({ socket, msg: e.data.command }, e.data.command);
                }
              })();
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
                        me: { ...obj, flags: new Set(obj.flags.split(" ")), state: obj.data || {} }, 
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
              
              (async () => {
                const found = await isNameTaken(e.data.name);
                if (!found) return worker.postMessage({ type: "response", msgId: e.data.msgId, data: false });
                
                const match = await compare(e.data.password, found.data?.password || "");
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
                  worker.postMessage({ type: "response", msgId: e.data.msgId, data: result });
                } else {
                  worker.postMessage({ type: "response", msgId: e.data.msgId, data: undefined });
                }
              })();
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
