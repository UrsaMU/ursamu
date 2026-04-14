/**
 * @module sandbox-handlers-db
 *
 * Handles worker messages for database and authentication operations:
 *   db:search, db:create, db:destroy, db:modify
 *   lock:check
 *   auth:verify, auth:login, auth:hash, auth:setPassword
 */
import { scopedUpdate } from "./SandboxService.ts";
import { SDKService, type SDKContext } from "./SDKService.ts";
import { wsService } from "../WebSocket/index.ts";
import type { IDBOBJ } from "../../@types/IDBObj.ts";

type Msg    = Record<string, unknown>;
type Worker = globalThis.Worker;

function respond(worker: Worker, msgId: unknown, data: unknown): void {
  worker.postMessage({ type: "response", msgId, data });
}

export async function handleDbMessage(
  msg:     Msg,
  worker:  Worker,
  context: SDKContext | undefined,
): Promise<void> {
  const { type, msgId } = msg;

  if (type === "db:search") {
    if (!msg.query) return;
    const { dbojs: db } = await import("../Database/index.ts");
    const { target }    = await import("../../utils/target.ts");
    try {
      let results: unknown[];
      if (typeof msg.query === "string") {
        const char = await db.queryOne({ id: context?.id || "1" });
        const found = await target(
          char || ({ id: "1", flags: "wizard", data: {} } as unknown as IDBOBJ),
          msg.query as string,
          true,
        );
        results = found ? [found] : [];
      } else {
        results = await db.query(msg.query as Record<string, unknown>);
      }

      const sdkResults = await Promise.all(results.map((r: unknown) => {
        const obj = r as IDBOBJ;
        const ctx = {
          id:    obj.id,
          me:    { ...obj, name: obj.data?.name, flags: new Set(obj.flags.split(" ")), state: obj.data || {} },
          state: obj.data || {},
        };
        return SDKService.prepareSDK(ctx as unknown as SDKContext).me;
      }));
      respond(worker, msgId, sdkResults);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      worker.postMessage({ type: "error", msgId, data: message });
    }
    return;
  }

  if (type === "db:create") {
    if (!msg.template) return;
    const { dbojs: db }  = await import("../Database/index.ts");
    const { getNextId }  = await import("../../utils/getNextId.ts");
    const tpl = msg.template as { flags?: unknown; location?: string; state?: Record<string, unknown> };
    const id  = await getNextId("objid");
    const newObj = {
      id,
      flags: tpl.flags instanceof Set
        ? Array.from(tpl.flags as Set<string>).join(" ")
        : Array.isArray(tpl.flags) ? (tpl.flags as string[]).join(" ") : String(tpl.flags || ""),
      location: tpl.location,
      data:     tpl.state || {},
    };
    const created = await db.create(newObj);
    const sdkObj  = SDKService.prepareSDK({
      id:    created.id,
      me:    { ...created, flags: new Set(created.flags.split(" ")), state: created.data || {} },
      state: created.data || {},
    }).me;
    respond(worker, msgId, sdkObj);
    return;
  }

  if (type === "db:destroy") {
    if (!msg.id) return;
    const { dbojs: db } = await import("../Database/index.ts");
    await db.delete({ id: msg.id as string });
    respond(worker, msgId, null);
    return;
  }

  if (type === "db:modify") {
    if (!msg.id || !msg.op || !msg.data) return;
    const allowed = ["$set", "$unset", "$inc"];
    if (!allowed.includes(msg.op as string)) {
      respond(worker, msgId, { error: `Invalid op: ${msg.op}` });
      return;
    }
    const { dbojs: db } = await import("../Database/index.ts");
    await db.modify({ id: msg.id as string }, msg.op as "$set" | "$unset" | "$inc", msg.data as Record<string, unknown>);
    respond(worker, msgId, null);
    return;
  }

  if (type === "lock:check") {
    if (!msg.target || !msg.lock) return;
    const { evaluateLock, hydrate } = await import("../../utils/evaluateLock.ts");
    const { dbojs: db } = await import("../Database/index.ts");
    const en  = await db.queryOne({ id: context?.id || "1" });
    const tar = await db.queryOne({ id: msg.target as string });
    if (!en || !tar) { respond(worker, msgId, false); return; }
    const result = await evaluateLock(
      msg.lock as string,
      hydrate(en as unknown as Parameters<typeof hydrate>[0]),
      hydrate(tar as unknown as Parameters<typeof hydrate>[0]),
    );
    respond(worker, msgId, result);
    return;
  }
}

export async function handleAuthMessage(
  msg:     Msg,
  worker:  Worker,
  context: SDKContext | undefined,
): Promise<void> {
  const { type, msgId } = msg;

  if (type === "auth:verify") {
    if (!msg.name || !msg.password) return;
    const { isNameTaken } = await import("../../utils/isNameTaken.ts");
    const { compare }     = await import("../../../deps.ts");
    const found = await isNameTaken(msg.name as string);
    if (!found) { respond(worker, msgId, false); return; }
    const match = await compare(msg.password as string, found.data?.password || "");
    if (!match) {
      const attempts = ((found.data?.failedAttempts as number) || 0) + 1;
      await scopedUpdate(found.id, { "data.failedAttempts": attempts });
    }
    respond(worker, msgId, match);
    return;
  }

  if (type === "auth:login") {
    if (!msg.id || !context?.socketId) { respond(worker, msgId, null); return; }
    const { dbojs: db } = await import("../Database/index.ts");
    const { setFlags }  = await import("../../utils/setFlags.ts");
    const { hooks }     = await import("../Hooks/index.ts");
    const socket = wsService.getConnectedSockets().find(s => s.id === context.socketId);
    if (socket) {
      if (!socket.cid) socket.cid = msg.id as string;
      socket.join(`#${msg.id as string}`);
      const player = await db.queryOne({ id: msg.id as string });
      if (player) {
        await setFlags(player, "connected");
        if (player.location) socket.join(`#${player.location}`);
        await scopedUpdate(player.id, { "data.lastLogin": Date.now() });
        await hooks.aconnect(player, socket.id);
      }
      wsService.send([socket.id], { event: "message", payload: { msg: "", data: { cid: msg.id } } });
    }
    respond(worker, msgId, null);
    return;
  }

  if (type === "auth:hash") {
    const { hash } = await import("../../../deps.ts");
    const hashed   = msg.password ? await hash(msg.password as string, 10) : null;
    respond(worker, msgId, hashed);
    return;
  }

  if (type === "auth:setPassword") {
    if (!msg.id || !msg.password) { respond(worker, msgId, null); return; }
    const { hash }      = await import("../../../deps.ts");
    const { dbojs: db } = await import("../Database/index.ts");
    const hashed  = await hash(msg.password as string, 10);
    const player  = await db.queryOne({ id: msg.id as string });
    if (player) await scopedUpdate(msg.id as string, { "data.password": hashed });
    respond(worker, msgId, null);
    return;
  }
}
