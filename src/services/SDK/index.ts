import type { IUrsamuSDK, IDBObj } from "../../@types/UrsamuSDK.ts";
import type { IDBOBJ } from "../../@types/IDBObj.ts";
import { dbojs, chans, chanHistory, texts } from "../Database/index.ts";
import { wsService } from "../WebSocket/index.ts";
import { hydrate, evaluateLock } from "../../utils/evaluateLock.ts";
import { canEdit as canEditFn } from "../../utils/canEdit.ts";
import { target as targetFn } from "../../utils/target.ts";
import { displayName as displayNameFn } from "../../utils/displayName.ts";
import { setFlags as setFlagsFn } from "../../utils/setFlags.ts";
import { getAttribute } from "../../utils/getAttribute.ts";
import { getNextId } from "../../utils/getNextId.ts";
import { center, ljust, rjust } from "../../utils/format.ts";
import parser from "../parser/parser.ts";
import { setConfig } from "../Config/mod.ts";
import { hash, compare } from "../../../deps.ts";
import { sandboxService } from "../Sandbox/SandboxService.ts";
import { buildContext, type GameContext } from "../../engine/context.ts";
import { sprintf, templateFn } from "./formatting.ts";

// --- Helpers ---

/** Convert IDBObj (SDK type, Set<string> flags) → minimal IDBOBJ for legacy utilities */
const toRaw = (o: IDBObj): IDBOBJ =>
  ({
    id: o.id,
    flags: Array.from(o.flags).join(" "),
    data: { name: o.name, ...o.state },
    location: o.location || "",
  } as unknown as IDBOBJ);

// --- Main factory ---

/**
 * Build a full IUrsamuSDK from a socket ID, actor ID, and parsed command.
 * Delegates to `buildContext` (src/engine/context.ts) to hydrate the actor
 * and room, then assembles all SDK methods via `buildSDKFromContext`.
 */
export async function createNativeSDK(
  socketId: string,
  actorId: string,
  cmd: { name: string; original?: string; args: string[]; switches?: string[] }
): Promise<IUrsamuSDK> {
  return buildSDKFromContext(await buildContext(socketId, actorId, cmd));
}

/**
 * Assemble the full IUrsamuSDK from an already-resolved GameContext.
 * All DB fetching and hydration has already happened in buildContext.
 */
async function buildSDKFromContext(ctx: GameContext): Promise<IUrsamuSDK> {
  const { socketId, actor: me, room: here, state, cmd } = ctx;

  const getConnSocket = () =>
    wsService.getConnectedSockets().find((s) => s.id === socketId);

  const u: IUrsamuSDK = {
    state,
    socketId,
    me,
    here,
    target: undefined,

    ui: {
      panel: () => null,
      render: (tpl: string, ctx: Record<string, unknown>) =>
        tpl.replace(/\{\{(.+?)\}\}/g, (_, k) => String(ctx[k.trim()] ?? "")),
      layout: () => {},
    },

    util: {
      displayName: (obj: IDBObj, actor: IDBObj) =>
        displayNameFn(toRaw(actor), toRaw(obj)),
      target: async (actor: IDBObj, query: string, global?: boolean) => {
        const result = await targetFn(toRaw(actor), query, global);
        return result ? hydrate(result) : undefined;
      },
      center: (str: string, len: number, filler?: string) => center(str, len, filler),
      ljust: (str: string, len: number, filler?: string) => ljust(str, len, filler),
      rjust: (str: string, len: number, filler?: string) => rjust(str, len, filler),
      template: templateFn,
      sprintf,
      stripSubs: (str: string) => parser.stripSubs("telnet", str),
      parseDesc: async (desc: string, actor: IDBObj, target: IDBObj): Promise<string> => {
        const { parseDesc: parseFn } = await import("../../utils/parseDesc.ts");
        return parseFn(desc, actor, target);
      },
    },

    db: {
      search: async (query: string | Record<string, unknown>) => {
        const results = await dbojs.query(query as Record<string, unknown>);
        return results.map(hydrate);
      },
      create: async (template: Partial<IDBObj>) => {
        const id = await getNextId("objid");
        const rawFlags = Array.from(template.flags || new Set<string>()).join(" ");
        await dbojs.create({
          id,
          flags: rawFlags,
          location: template.location,
          data: { name: template.name, ...template.state },
        });
        const created = await dbojs.queryOne({ id });
        return created
          ? hydrate(created)
          : { id, flags: new Set<string>(), state: {}, contents: [] };
      },
      destroy: async (id: string) => {
        await dbojs.delete({ id });
      },
      modify: async (id: string, op: string, data: unknown) => {
        await dbojs.modify({ id }, op, data as Partial<import("../../@types/IDBObj.ts").IDBOBJ>);
      },
    },

    cmd,

    canEdit: async (actor: IDBObj, target: IDBObj) =>
      await canEditFn(toRaw(actor), toRaw(target)),

    send: ctx.send,

    broadcast: ctx.broadcast,

    execute: async (command: string) => {
      const socket = getConnSocket();
      if (socket) {
        const { cmdParser } = await import("../commands/cmdParser.ts");
        await cmdParser.run({ socket, msg: command });
      }
    },

    force: async (command: string) => {
      const socket = getConnSocket();
      if (socket) {
        const { cmdParser } = await import("../commands/cmdParser.ts");
        await cmdParser.run({ socket, msg: command });
      }
    },

    forceAs: async (targetId: string, command: string) => {
      const targetObj = await dbojs.queryOne({ id: targetId });
      if (!targetObj) return;
      const fakeSocket = { cid: targetId, id: `forceAs:${targetId}`, join: () => {}, leave: () => {}, send: () => {}, disconnect: () => {} };
      const { cmdParser } = await import("../commands/cmdParser.ts");
      await cmdParser.run({ socket: fakeSocket as never, msg: command });
    },

    teleport: async (targetStr: string, destination: string) => {
      const tarObj =
        (await dbojs.queryOne({ id: targetStr })) ||
        (await dbojs.queryOne({ "data.name": new RegExp(`^${targetStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i") }));
      if (!tarObj) return;
      tarObj.location = destination;
      await dbojs.modify({ id: tarObj.id }, "$set", tarObj);
    },

    checkLock: async (target: string | IDBObj, lock: string) => {
      const targetId = typeof target === "string" ? target : target.id;
      const tarObj = await dbojs.queryOne({ id: targetId });
      if (!tarObj) return false;
      return await evaluateLock(lock, me, hydrate(tarObj));
    },

    auth: {
      verify: async (name: string, password: string) => {
        const player = await dbojs.queryOne({
          "data.name": new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i"),
          flags: /player/i,
        });
        if (!player || !player.data?.password) return false;
        return await compare(String(player.data.password), password);
      },
      login: async (id: string) => {
        const playerResult = await dbojs.queryOne({ id });
        const player = playerResult || null;
        if (!player) return;
        const socket = getConnSocket();
        if (!socket) return;
        socket.cid = id;
        socket.join(`#${id}`);
        if (player.location) socket.join(`#${player.location}`);
      },
      hash: async (password: string) => {
        try { return await hash(password, 10); }
        catch (e) { console.error("[SDK] hash error:", e); throw e; }
      },
      setPassword: async (id: string, password: string) => {
        const hashed = await hash(password, 10);
        const objResult = await dbojs.queryOne({ id });
        const obj = objResult || null;
        if (!obj) return;
        obj.data ||= {};
        obj.data.password = hashed;
        await dbojs.modify({ id }, "$set", obj);
      },
    },

    sys: {
      setConfig: async (key: string, value: unknown) => {
        setConfig(key, value);
        await Promise.resolve();
      },
      disconnect: async (id: string) => {
        wsService.disconnect(id);
        await Promise.resolve();
      },
      reboot: async () => {
        // Exit code 75 signals the start.ts supervisor loop to restart main.ts.
        // In dev mode run.sh uses --watch on start.ts, so this exit also causes
        // start.ts (and thus main.ts) to be re-spawned by start.ts's restart loop.
        setTimeout(() => Deno.exit(75), 500);
        await Promise.resolve();
      },
      shutdown: async () => {
        setTimeout(() => Deno.exit(0), 100);
        await Promise.resolve();
      },
      uptime: () => Promise.resolve(performance.now()),
      update: (_branch?: string) => Promise.resolve(),
      gameTime: async () => {
        const { gameClock } = await import("../GameClock/index.ts");
        return gameClock.now();
      },
      setGameTime: async (t: import("../../@types/UrsamuSDK.ts").IGameTime) => {
        const { gameClock } = await import("../GameClock/index.ts");
        gameClock.set(t);
        await gameClock.save();
      },
    },

    chan: {
      join: async (_channel: string, _alias: string) => {
        await Promise.resolve();
      },
      leave: async (_alias: string) => {
        await Promise.resolve();
      },
      list: async () => {
        return await chans.all();
      },
      create: async (
        name: string,
        options?: { header?: string; lock?: string; hidden?: boolean }
      ) => {
        const id = await getNextId("chanid");
        const chan = { id, name, alias: name.slice(0, 2), ...options };
        await chans.create(chan as Parameters<typeof chans.create>[0]);
        return await chans.queryOne({ id });
      },
      destroy: async (name: string) => {
        return await chans.delete({ name });
      },
      set: async (
        name: string,
        options: {
          header?: string;
          lock?: string;
          hidden?: boolean;
          masking?: boolean;
          logHistory?: boolean;
          historyLimit?: number;
        }
      ) => {
        return await chans.modify({ name }, "$set", options);
      },
      history: async (chanName: string, limit = 20) => {
        const chan = await chans.queryOne({ name: chanName.toLowerCase().trim() });
        if (!chan) return [];
        const all = await chanHistory.find({ chanId: chan.id });
        all.sort((a, b) => a.timestamp - b.timestamp);
        return all.slice(-limit);
      },
    },

    attr: {
      get: async (id: string, name: string): Promise<string | null> => {
        const obj = await dbojs.queryOne({ id });
        if (!obj) return null;
        const attrs = (obj.data?.attributes as Array<{ name: string; value: string }> | undefined) || [];
        const found = attrs.find(a => a.name.toUpperCase() === name.toUpperCase());
        return found?.value ?? null;
      },
      set: async (id: string, name: string, value: string, type = "attribute"): Promise<void> => {
        const obj = await dbojs.queryOne({ id });
        if (!obj) return;
        obj.data ||= {};
        const attrs = ((obj.data.attributes as Array<{ name: string; value: string; type?: string; setter?: string }>) || []);
        const idx = attrs.findIndex(a => a.name.toUpperCase() === name.toUpperCase());
        const entry = { name: name.toUpperCase(), value, type, setter: me.id };
        if (idx >= 0) {
          attrs[idx] = entry;
        } else {
          attrs.push(entry);
        }
        await dbojs.modify({ id }, "$set", { "data.attributes": attrs });
      },
      clear: async (id: string, name: string): Promise<boolean> => {
        const obj = await dbojs.queryOne({ id });
        if (!obj) return false;
        const attrs = ((obj.data?.attributes as Array<{ name: string }>) || []);
        const filtered = attrs.filter(a => a.name.toUpperCase() !== name.toUpperCase());
        if (filtered.length === attrs.length) return false;
        await dbojs.modify({ id }, "$set", { "data.attributes": filtered });
        return true;
      },
    },

    setFlags: async (target: string | IDBObj, flagStr: string) => {
      const targetId = typeof target === "string" ? target : target.id;
      const tarObj = await dbojs.queryOne({ id: targetId });
      if (!tarObj) return;
      await setFlagsFn(tarObj, flagStr, toRaw(me));
    },

    trigger: async (targetStr: string, attr: string, args?: string[]) => {
      const tarObj = await dbojs.queryOne({ id: targetStr });
      if (!tarObj) return;
      const attrData = await getAttribute(tarObj as unknown as IDBOBJ, attr);
      if (!attrData) return;
      await sandboxService.runScript(attrData.value, {
        id: tarObj.id,
        location: tarObj.location || "limbo",
        state: (tarObj.data?.state as Record<string, unknown>) || {},
        ...(args?.[0] ? { target: { id: args[0] } } : {}),
      });
    },

    eval: async (targetStr: string, attr: string, args?: string[]): Promise<string> => {
      // Look up by id, then by name
      let tarObj = await dbojs.queryOne({ id: targetStr });
      if (!tarObj) {
        tarObj = await dbojs.queryOne({
          "data.name": new RegExp(`^${targetStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
        }) || undefined;
      }
      if (!tarObj) return "";
      const attrData = await getAttribute(tarObj as unknown as IDBOBJ, attr);
      if (!attrData) return "";
      const result = await sandboxService.runScript(attrData.value, {
        id: tarObj.id,
        location: tarObj.location || "limbo",
        state: (tarObj.data?.state as Record<string, unknown>) || {},
        cmd: { name: "", args: args || [] },
      });
      return result != null ? String(result) : "";
    },

    evalString: async (str: string): Promise<string> => {
      if (!str) return "";
      if (!me.id || me.id === "#-1") return str;
      try {
        const { softcodeService } = await import("../Softcode/index.ts");
        return await softcodeService.runSoftcode(str, {
          actorId:    me.id,
          executorId: me.id,
          args:       [],
          socketId,
        });
      } catch {
        return str;
      }
    },

    text: {
      read: async (id: string) => {
        const entry = await texts.queryOne({ id });
        return String((entry as unknown as Record<string, unknown>)?.content || "");
      },
      set: async (id: string, content: string) => {
        const existing = await texts.queryOne({ id });
        if (existing) {
          await texts.modify({ id }, "$set", { content });
        } else {
          await texts.create({ id, content } as Parameters<typeof texts.create>[0]);
        }
      },
    },

    events: {
      emit: async (_event: string, _data: unknown, _context?: Record<string, unknown>) => {
        await Promise.resolve();
      },
      on: (_event: string, _handler: string): Promise<string> => Promise.resolve(""),
    },
  };

  return u;
}
