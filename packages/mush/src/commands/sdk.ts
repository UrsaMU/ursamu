// deno-lint-ignore-file require-await no-control-regex
/**
 * createNativeSDK — build a full IUrsamuSDK from a socket ID, actor ID, and
 * parsed command. This is the MUSH package's equivalent of the engine-level
 * SDK factory; it wires together all the world-model utilities and core
 * services into a single context object passed to addCmd exec handlers.
 */
import type { IDBObj, IGameTime } from "../world/types.ts";
import { gameClock } from "../world/game-clock.ts";
import type { IDBOBJ } from "../world/types.ts";
import type { IUrsamuSDK } from "./types.ts";
import { dbojs, hydrate } from "../world/dbobjs.ts";
import { evaluateLock } from "../world/locks.ts";
import { flags as flagsUtil } from "../world/flags.ts";
import { send, sendPayload, sessions, gameHooks, setConfig } from "@ursamu/core";
import "../events/types.ts";
import { resolveFormat, resolveFormatOr, resolveGlobalFormat, resolveGlobalFormatOr, header, divider, footer, center, ljust, rjust } from "../format/handlers.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toRaw = (o: IDBObj): IDBOBJ => ({
  id: o.id,
  flags: Array.from(o.flags).join(" "),
  data: { name: o.name, ...o.state },
  location: o.location || "",
} as unknown as IDBOBJ);

const stripSubs = (s: string) =>
  s.replace(/%c[a-zA-Z]/gi, "").replace(/%[nrtbR]/gi, "").replace(/\x1b\[[0-9;]*m/g, "");

async function resolveActor(actorId: string): Promise<IDBObj> {
  if (!actorId || actorId === "#-1") {
    return { id: "#-1", flags: new Set<string>(), state: {}, contents: [] };
  }
  const raw = await dbojs.queryOne({ id: actorId });
  if (!raw) return { id: actorId, flags: new Set<string>(), state: {}, contents: [] };

  const actor = hydrate(raw);
  const contents = await dbojs.query({ location: actorId });
  actor.contents = contents.map(hydrate);
  return actor;
}

async function resolveRoom(roomId: string | undefined): Promise<IDBObj & { broadcast(msg: string, opts?: Record<string, unknown>): void }> {
  const fallback = {
    id: "limbo",
    flags: new Set<string>(["room"]),
    state: {},
    contents: [],
    broadcast: () => {},
  };
  if (!roomId) return fallback;

  const raw = await dbojs.queryOne({ id: roomId });
  if (!raw) return fallback;

  const room = hydrate(raw);
  const contents = await dbojs.query({ location: roomId });
  room.contents = contents.map(hydrate);

  return {
    ...room,
    broadcast: (msg: string, opts?: Record<string, unknown>) => {
      const exclude = (opts?.exclude as string[]) ?? [];
      const allSessions = sessions.list();
      room.contents
        .filter((o) => o.flags.has("connected") && !exclude.includes(o.id))
        .forEach((o) => {
          const socketIds = allSessions
            .filter((s) => ((s as unknown as Record<string, unknown>).actorId as string | undefined) === o.id)
            .map((s) => s.socketId);
          if (socketIds.length) send(socketIds, msg);
        });
    },
  };
}

async function canEdit(actor: IDBObj, target: IDBObj): Promise<boolean> {
  if (!actor || !target) return false;
  if (actor.flags.has("superuser")) return true;
  if (actor.flags.has("admin") || actor.flags.has("wizard")) return true;
  const rawTarget = toRaw(target);
  const owner = rawTarget.data?.owner as string | undefined;
  if (owner && owner === actor.id) return true;
  if (actor.id === target.id) return true;
  return false;
}

async function targetFn(actor: IDBObj, query: string, _global?: boolean): Promise<IDBObj | undefined> {
  const q = query.trim();
  if (!q) return undefined;

  if (q.toLowerCase() === "me") return actor;
  if (q.toLowerCase() === "here") {
    if (!actor.location) return undefined;
    return resolveRoom(actor.location);
  }

  const idMatch = q.match(/^#(\d+)$/);
  if (idMatch) {
    const raw = await dbojs.queryOne({ id: idMatch[1] });
    return raw ? hydrate(raw) : undefined;
  }

  const rx = new RegExp(`^${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");

  // Search current room contents
  const roomContents = actor.location
    ? await dbojs.query({ location: actor.location })
    : [];
  const inRoom = roomContents.find((o) => rx.test(o.data?.name as string || o.id));
  if (inRoom) return hydrate(inRoom);

  // Search actor inventory
  const invContents = await dbojs.query({ location: actor.id });
  const inInv = invContents.find((o) => rx.test(o.data?.name as string || o.id));
  if (inInv) return hydrate(inInv);

  return undefined;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export async function createNativeSDK(
  socketId: string,
  actorId: string,
  cmd: { name: string; original?: string; args: string[]; switches?: string[] },
): Promise<IUrsamuSDK> {
  const me = await resolveActor(actorId);
  const here = await resolveRoom(me.location);
  const state: Record<string, unknown> = {};

  const u: IUrsamuSDK = {
    state,
    socketId,
    me,
    here,
    target: undefined,

    ui: {
      panel: () => null,
      render: (tpl: string, data: Record<string, unknown>) =>
        tpl.replace(/\{\{(.+?)\}\}/g, (_, k) => String(data[k.trim()] ?? "")),
      layout: () => {},
    },

    util: {
      displayName: (obj: IDBObj, _actor: IDBObj) =>
        (obj.state?.moniker as string) || (obj.state?.name as string) || obj.name || "Unknown",
      target: targetFn,
      center,
      ljust,
      rjust,
      header,
      divider,
      footer,
      template: (tpl: string, data?: Record<string, unknown>) => {
        if (!data) return tpl;
        return tpl.replace(/\{\{(.+?)\}\}/g, (_, k) => {
          const v = data[k.trim()];
          if (typeof v === "string") return v;
          if (Array.isArray(v)) return v.join(", ");
          if (v && typeof v === "object" && "value" in v) return String((v as { value: unknown }).value);
          return String(v ?? "");
        });
      },
      sprintf: (fmt: string, ...args: unknown[]) => {
        let i = 0;
        return fmt.replace(/%(-)?(\d+)?([sdifx%])/g, (_, left, width, type) => {
          if (type === "%") return "%";
          const a = args[i++];
          let val = "";
          if (type === "d" || type === "i") val = String(Math.trunc(Number(a)));
          else if (type === "f") val = String(Number(a));
          else if (type === "x") val = Number(a).toString(16);
          else val = String(a ?? "");

          if (width) {
            const w = parseInt(width, 10);
            const pad = w - val.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "").length;
            if (pad > 0) {
              if (left) val = val + " ".repeat(pad);
              else val = " ".repeat(pad) + val;
            }
          }
          return val;
        });
      },
      stripSubs,
      resolveFormat: async (target: IDBObj, slot: string, defaultArg: string) =>
        resolveFormat(u, target, slot, defaultArg),
      resolveFormatOr: async (target: IDBObj, slot: string, defaultArg: string, fallback: string) =>
        resolveFormatOr(u, target, slot, defaultArg, fallback),
      resolveGlobalFormat: async (slot: string, defaultArg: string) =>
        resolveGlobalFormat(u, slot, defaultArg),
      resolveGlobalFormatOr: async (slot: string, defaultArg: string, fallback: string) =>
        resolveGlobalFormatOr(u, slot, defaultArg, fallback),
    },

    db: {
      search: async (query: string | Record<string, unknown>) => {
        let q: Record<string, unknown>;
        if (typeof query === "string") {
          const t = query.trim();
          if (!t) return [];
          if (/^#?\d+$/.test(t)) {
            q = { id: t.replace(/^#/, "") };
          } else {
            const rx = new RegExp(`^${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
            q = { $or: [{ "data.name": rx }, { "data.alias": rx }] };
          }
        } else {
          q = query;
        }
        const results = await dbojs.query(q);
        return results.map(hydrate);
      },
      create: async (template: Partial<IDBObj>) => {
        const counter = await import("../world/dbobjs.ts");
        const rawFlags = Array.from(template.flags || new Set<string>()).join(" ");
        const id = await counter.counters.atomicIncrement("objid").then((n) => String(n));
        await dbojs.create({
          id,
          flags: rawFlags,
          location: template.location,
          data: { name: template.name, ...template.state },
        } as IDBOBJ);
        const created = await dbojs.queryOne({ id });
        if (template.location) {
          await (gameHooks as unknown as { emit(e: string, p: unknown): Promise<void> }).emit("object:moved", {
            objectId: id,
            from: null,
            to: template.location,
            cause: "create",
            actorId: me.id,
          });
        }
        return created ? hydrate(created) : { id, flags: new Set<string>(), state: {}, contents: [] };
      },
      destroy: async (id: string) => {
        const prev = await dbojs.queryOne({ id });
        const prevLocation = prev ? (prev.location ?? null) : null;
        await dbojs.delete({ id });
        await (gameHooks as unknown as { emit(e: string, p: unknown): Promise<void> }).emit("object:moved", {
          objectId: id,
          from: prevLocation,
          to: null,
          cause: "destroy",
          actorId: me.id,
        });
      },
      modify: async (id: string, op: string, data: unknown) => {
        await dbojs.modify({ id }, op, data as Partial<IDBOBJ>);
      },
    },

    cmd,

    canEdit,

    send: (message: string, targetId?: string, options?: Record<string, unknown>) => {
      if (targetId && targetId !== socketId) {
        // targetId is a player DB ID — resolve to socket IDs via session store
        const socketIds = sessions.list()
          .filter((s) => ((s as unknown as Record<string, unknown>).actorId as string | undefined) === targetId)
          .map((s) => s.socketId);
        const dests = socketIds.length ? socketIds : [targetId];
        if (options && Object.keys(options).length > 0) {
          dests.forEach((d) => sendPayload(d, message, options));
        } else {
          send(dests, message);
        }
      } else {
        const dest = socketId;
        if (options && Object.keys(options).length > 0) {
          sendPayload(dest, message, options);
        } else {
          send([dest], message);
        }
      }
    },

    notify: async (actorId: string, message: string, _opts?: Record<string, unknown>) => {
      const allSessions = sessions.list();
      const socks = allSessions
        .filter((s) => (s as unknown as Record<string, unknown>).actorId === actorId || s.sessionId === actorId)
        .map((s) => s.socketId);
      if (socks.length === 0) return false;
      send(socks, message);
      return true;
    },

    broadcast: (message: string, opts?: Record<string, unknown>) => {
      (async () => {
        const liveActorId =
          ((sessions.get(socketId) as unknown as Record<string, unknown>)?.actorId as string | undefined)
          ?? actorId;
        let loc: string | undefined = me.location;
        if (liveActorId && liveActorId !== "#-1" && liveActorId !== actorId) {
          const liveActor = await dbojs.queryOne({ id: liveActorId });
          if (liveActor) loc = liveActor.location;
        }
        const liveRoom = await resolveRoom(loc);
        liveRoom.broadcast(message, opts);
      })().catch(console.error);
    },

    execute: async (command: string) => {
      const { cmds } = await import("./addCmd.ts");
      const rawMsg = command.trim();
      // Re-read actorId from the live session — login() may have updated it
      // after the SDK was constructed (e.g. execCreate / execConnect).
      const liveActorId =
        ((sessions.get(socketId) as unknown as Record<string, unknown>)?.actorId as string | undefined)
        ?? actorId;
      const { dbojs: db2, hydrate: hy2 } = await import("../world/dbobjs.ts");
      const rawActor2 = liveActorId ? await db2.queryOne({ id: liveActorId }) : null;
      const actor2 = rawActor2 ? hy2(rawActor2) : me;
      for (const c of cmds) {
        const match = rawMsg.match(c.pattern);
        if (!match) continue;
        const ok = await evaluateLock(c.lock || "", actor2, actor2);
        if (!ok) break;
        const eu = await createNativeSDK(socketId, liveActorId, {
          name: c.name,
          original: command,
          args: match.slice(1),
        });
        await (c.exec(eu) as Promise<void>)?.catch(console.error);
        return;
      }
    },

    force: async (command: string) => {
      const rawMsg = command.trim();
      const { cmds } = await import("./addCmd.ts");
      for (const c of cmds) {
        const match = rawMsg.match(c.pattern);
        if (!match) continue;
        const eu = await createNativeSDK(socketId, actorId, {
          name: c.name,
          original: command,
          args: match.slice(1),
        });
        await (c.exec(eu) as Promise<void>)?.catch(console.error);
        return;
      }
    },

    forceAs: async (targetId: string, command: string) => {
      const { cmds } = await import("./addCmd.ts");
      const rawMsg = command.trim();
      for (const c of cmds) {
        const match = rawMsg.match(c.pattern);
        if (!match) continue;
        const eu = await createNativeSDK(`forceAs:${targetId}`, targetId, {
          name: c.name,
          original: command,
          args: match.slice(1),
        });
        await (c.exec(eu) as Promise<void>)?.catch(console.error);
        return;
      }
    },

    teleport: async (targetStr: string, destination: string) => {
      const tarObj = await dbojs.queryOne({ id: targetStr });
      if (!tarObj) return;
      await dbojs.modify({ id: tarObj.id }, "$set", { location: destination } as Partial<IDBOBJ>);
    },

    checkLock: async (target: string | IDBObj, lock: string) => {
      const targetId = typeof target === "string" ? target : target.id;
      const tarObj = await dbojs.queryOne({ id: targetId });
      if (!tarObj) return false;
      return evaluateLock(lock, me, hydrate(tarObj));
    },

    auth: {
      verify: async (name: string, password: string) => {
        const cleaned = name.trim();
        const esc = cleaned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const rx = new RegExp(`^${esc}$`, "i");
        const conditions: Record<string, unknown>[] = [
          { "data.name": rx },
          { "data.alias": rx },
        ];
        const dbrefMatch = cleaned.match(/^#?(\d+)$/);
        if (dbrefMatch) {
          conditions.push({ id: dbrefMatch[1] });
        }
        const player = await dbojs.queryOne({
          $and: [
            { flags: /player/i },
            { $or: conditions }
          ]
        });
        if (!player || !player.data?.password) return false;
        // Simple comparison — production systems should use bcrypt
        if (String(player.data.password) !== password) return false;
        return hydrate(player);
      },
      login: async (id: string) => {
        const playerResult = await dbojs.queryOne({ id });
        if (!playerResult) return;
        const session = sessions.get(socketId);
        if (session) {
          // Update session actorId
          ((session as unknown) as Record<string, unknown>).actorId = id;
        }
        const fstr = flagsUtil.set(playerResult.flags, playerResult.data || {}, "connected");
        await dbojs.modify({ id }, "$set", {
          flags: fstr.tags,
          "data.lastCommand": Date.now(),
        } as Partial<IDBOBJ>);
      },
      hash: async (password: string) => {
        const bcrypt = await import("bcrypt");
        const hashFn = bcrypt.hash ?? (bcrypt as unknown as { default: typeof bcrypt }).default.hash;
        return hashFn(password, 10);
      },
      setPassword: async (id: string, password: string) => {
        const bcrypt = await import("bcrypt");
        const hashFn = bcrypt.hash ?? (bcrypt as unknown as { default: typeof bcrypt }).default.hash;
        const hashed = await hashFn(password, 10);
        await dbojs.modify({ id }, "$set", { "data.password": hashed } as Partial<IDBOBJ>);
      },
    },

    sys: {
      setConfig: async (key: string, value: unknown) => {
        setConfig(key, value);
        await Promise.resolve();
      },
      disconnect: async (id: string) => {
        const session = sessions.get(id);
        if (session && typeof ((session as unknown) as Record<string, unknown>).close === "function") {
          (((session as unknown) as Record<string, unknown>).close as () => void)();
        }
        await Promise.resolve();
      },
      reboot: async () => {
        setTimeout(() => Deno.exit(75), 500);
        await Promise.resolve();
      },
      shutdown: async () => {
        setTimeout(() => Deno.exit(0), 100);
        await Promise.resolve();
      },
      uptime: () => Promise.resolve(performance.now()),
      update: (_branch?: string) => Promise.resolve(),
      gameTime: async () => gameClock.now(),
      setGameTime: async (t: IGameTime) => { gameClock.set(t); },
    },

    chan: {
      join: async (_channel: string, _alias: string) => { await Promise.resolve(); },
      leave: async (_alias: string) => { await Promise.resolve(); },
      list: async () => {
        const { chans } = await import("../world/dbobjs.ts");
        return chans.query({});
      },
      create: async (name: string, options?: { header?: string; lock?: string; hidden?: boolean }) => {
        void options;
        return { name };
      },
      destroy: async (_name: string) => null,
      set: async (_name: string, _options: Record<string, unknown>) => null,
      history: async (_name: string, _limit?: number) => [],
    },

    attr: {
      get: async (id: string, name: string): Promise<string | null> => {
        const obj = await dbojs.queryOne({ id });
        if (!obj) return null;
        const attrs = (obj.data?.attributes as Array<{ name: string; value: string }> | undefined) || [];
        const found = attrs.find((a) => a.name.toUpperCase() === name.toUpperCase());
        return found?.value ?? null;
      },
      set: async (id: string, name: string, value: string, type = "attribute"): Promise<void> => {
        const obj = await dbojs.queryOne({ id });
        if (!obj) return;
        obj.data ||= {};
        const attrs = (
          (obj.data.attributes as Array<{ name: string; value: string; type?: string; setter?: string }>) || []
        );
        const idx = attrs.findIndex((a) => a.name.toUpperCase() === name.toUpperCase());
        const entry = { name: name.toUpperCase(), value, type, setter: me.id };
        if (idx >= 0) attrs[idx] = entry;
        else attrs.push(entry);
        await dbojs.modify({ id }, "$set", { "data.attributes": attrs } as unknown as Partial<IDBOBJ>);
      },
      clear: async (id: string, name: string): Promise<boolean> => {
        const obj = await dbojs.queryOne({ id });
        if (!obj) return false;
        const attrs = (obj.data?.attributes as Array<{ name: string }> | undefined) || [];
        const filtered = attrs.filter((a) => a.name.toUpperCase() !== name.toUpperCase());
        if (filtered.length === attrs.length) return false;
        await dbojs.modify({ id }, "$set", { "data.attributes": filtered } as unknown as Partial<IDBOBJ>);
        return true;
      },
    },

    setFlags: async (target: string | IDBObj, flagStr: string) => {
      const targetId = typeof target === "string" ? target : target.id;
      const tarObj = await dbojs.queryOne({ id: targetId });
      if (!tarObj) return;
      const result = flagsUtil.set(tarObj.flags, tarObj.data || {}, flagStr);
      await dbojs.modify({ id: targetId }, "$set", { flags: result.tags } as Partial<IDBOBJ>);
    },

    trigger: async (targetStr: string, attr: string, args?: string[]) => {
      const tarObj = await dbojs.queryOne({ id: targetStr });
      if (!tarObj) return;
      const attrs = (tarObj.data?.attributes as Array<{ name: string; value: string }> | undefined) || [];
      const attrData = attrs.find((a) => a.name.toUpperCase() === attr.toUpperCase());
      if (!attrData) return;
      const { runSoftcodeSimple } = await import("../softcode/engine.ts");
      await runSoftcodeSimple(attrData.value, {
        actorId: actorId,
        executorId: tarObj.id,
        args: args || [],
        socketId,
      });
    },

    eval: async (targetStr: string, attr: string, args?: string[]): Promise<string> => {
      let tarObj = await dbojs.queryOne({ id: targetStr });
      if (!tarObj) {
        tarObj = (await dbojs.queryOne({
          "data.name": new RegExp(`^${targetStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
        })) || undefined;
      }
      if (!tarObj) return "";
      const attrs = (tarObj.data?.attributes as Array<{ name: string; value: string }> | undefined) || [];
      const attrData = attrs.find((a) => a.name.toUpperCase() === attr.toUpperCase());
      if (!attrData) return "";
      const { runSoftcodeSimple } = await import("../softcode/engine.ts");
      const result = await runSoftcodeSimple(attrData.value, {
        actorId: actorId,
        executorId: tarObj.id,
        args: args || [],
        socketId,
      });
      return result != null ? String(result) : "";
    },

    evalString: async (str: string): Promise<string> => {
      if (!str) return "";
      if (!me.id || me.id === "#-1") return str;
      try {
        const { runSoftcodeSimple } = await import("../softcode/engine.ts");
        return await runSoftcodeSimple(str, {
          actorId: me.id,
          executorId: me.id,
          args: [],
          socketId,
        });
      } catch (e: unknown) {
        console.error("[evalString]", e);
        return str;
      }
    },

    text: {
      read: async (_id: string) => "",
      set: async (_id: string, _content: string) => {},
    },

    events: {
      emit: async (_event: string, _data: unknown) => { await Promise.resolve(); },
      on: (_event: string, _handler: string) => Promise.resolve(""),
    },
  };

  return u;
}

// Wire session:auth → decode JWT → set session.actorId so disconnect/cid lookup works.
// This runs once at module-load time (side-effect).
import { verifyToken } from "@ursamu/core";
gameHooks.on("session:auth", async (e) => {
  try {
    const payload = await verifyToken(e.sessionId);
    const userId = payload.id as string;
    if (!userId) return;
    const session = sessions.get(e.socketId);
    if (session) ((session as unknown) as Record<string, unknown>).actorId = userId;
    const player = await dbojs.queryOne({ id: userId });
    if (player) {
      const fstr = flagsUtil.set(player.flags, player.data || {}, "connected");
      await dbojs.modify({ id: userId }, "$set", { flags: fstr.tags } as Partial<IDBOBJ>);
    }
  } catch { /* invalid JWT — ignore */ }
});
