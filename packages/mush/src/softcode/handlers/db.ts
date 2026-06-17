/**
 * @module handlers/db
 *
 * Handles worker messages for database and authentication operations:
 *   db:search, db:create, db:destroy, db:modify
 *   lock:check
 *   auth:verify, auth:login, auth:hash, auth:setPassword
 */
import { sessions, send as coreSend, gameHooks } from "@ursamu/core";
import { dbojs } from "../../world/dbobjs.ts";
import { hydrate, counters } from "../../world/dbobjs.ts";
import { evaluateLock } from "../../world/locks.ts";
import type { SDKContext } from "../sdk-service.ts";
import { SDKService } from "../sdk-service.ts";

type Msg    = Record<string, unknown>;
type Worker = globalThis.Worker;
// deno-lint-ignore no-explicit-any
type AnyData = any;

function respond(worker: Worker, msgId: unknown, data: unknown): void {
  worker.postMessage({ type: "response", msgId, data });
}

async function getNextId(name: string): Promise<string> {
  return (await counters.atomicIncrement(name)).toString();
}

export async function handleDbMessage(
  msg:     Msg,
  worker:  Worker,
  context: SDKContext | undefined,
): Promise<void> {
  const { type, msgId } = msg;

  if (type === "db:search") {
    if (!msg.query) return;
    try {
      let results: unknown[];
      if (typeof msg.query === "string") {
        const enId = context?.id || "1";
        const en   = await dbojs.queryOne({ id: enId });
        const query = msg.query as string;
        // Simple name/id lookup inline (replaces target utility)
        if (query.startsWith("#")) {
          const found = await dbojs.queryOne({ id: query.slice(1) });
          results = found ? [found] : [];
        } else {
          const found = await dbojs.queryOne({
            $or: [
              { id: query },
              { "data.name": new RegExp(`^${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
            ],
          });
          void en;
          results = found ? [found] : [];
        }
      } else {
        results = await dbojs.query(msg.query as Record<string, unknown>);
      }

      const sdkResults = results.map((r: unknown) => {
        const obj = r as { id: string; flags: string; location?: string; data?: Record<string, unknown> };
        return SDKService.prepareSDK({
          id:    obj.id,
          me:    { id: obj.id, name: obj.data?.name as string, flags: new Set((obj.flags || "").split(" ").filter(Boolean)), state: obj.data || {}, location: obj.location, contents: [] },
          state: obj.data || {},
        }).me;
      });
      respond(worker, msgId, sdkResults);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      worker.postMessage({ type: "error", msgId, data: message });
    }
    return;
  }

  if (type === "db:create") {
    if (!msg.template) return;
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
    const created = await dbojs.create(newObj);
    if (tpl.location) {
      await gameHooks.emit("object:moved", {
        objectId: created.id,
        from:     null,
        to:       tpl.location,
        cause:    "create",
        actorId:  context?.id as string | undefined,
      });
    }
    const sdkObj = SDKService.prepareSDK({
      id:    created.id,
      me:    { id: created.id, flags: new Set((created.flags || "").split(" ")), state: created.data || {}, contents: [] },
      state: created.data || {},
    }).me;
    respond(worker, msgId, sdkObj);
    return;
  }

  if (type === "db:destroy") {
    if (!msg.id) return;
    const prev = await dbojs.queryOne({ id: msg.id as string });
    const prevLocation = prev ? (prev.location ?? null) : null;
    await dbojs.delete({ id: msg.id as string });
    await gameHooks.emit("object:moved", {
      objectId: msg.id as string,
      from:     prevLocation,
      to:       null,
      cause:    "destroy",
      actorId:  context?.id as string | undefined,
    });
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
    await dbojs.modify({ id: msg.id as string }, msg.op as "$set" | "$unset" | "$inc", msg.data as Record<string, unknown>);
    respond(worker, msgId, null);
    return;
  }

  if (type === "lock:check") {
    if (!msg.target || !msg.lock) return;
    const en  = await dbojs.queryOne({ id: context?.id || "1" });
    const tar = await dbojs.queryOne({ id: msg.target as string });
    if (!en || !tar) { respond(worker, msgId, false); return; }
    const result = await evaluateLock(
      msg.lock as string,
      hydrate(en),
      hydrate(tar),
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
    const bcrypt      = await import("bcrypt");
    const compare     = bcrypt.compare ?? (bcrypt as unknown as { default: { compare: typeof bcrypt.compare } }).default.compare;
    const found = await dbojs.queryOne({
      "data.name": new RegExp(`^${String(msg.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    });
    if (!found) { respond(worker, msgId, false); return; }
    const match = await compare(msg.password as string, (found.data?.password as string) || "");
    if (!match) {
      const attempts = ((found.data?.failedAttempts as number) || 0) + 1;
      await dbojs.modify({ id: found.id }, "$set", { "data.failedAttempts": attempts } as AnyData);
    }
    respond(worker, msgId, match);
    return;
  }

  if (type === "auth:login") {
    if (!msg.id || !context?.socketId) { respond(worker, msgId, null); return; }
    const session = sessions.get(context.socketId as string);
    if (session) {
      const player = await dbojs.queryOne({ id: msg.id as string });
      if (player) {
        await dbojs.modify({ id: player.id }, "$set", {
          flags: ((player.flags || "") + " connected").trim(),
          "data.lastLogin": Date.now(),
        } as AnyData);
        coreSend([session.socketId], JSON.stringify({ event: "message", payload: { msg: "", data: { cid: msg.id } } }));
      }
    }
    respond(worker, msgId, null);
    return;
  }

  if (type === "auth:hash") {
    const bcrypt = await import("bcrypt");
    const hash   = bcrypt.hash ?? (bcrypt as unknown as { default: typeof bcrypt }).default.hash;
    const hashed = msg.password ? await hash(msg.password as string, 10) : null;
    respond(worker, msgId, hashed);
    return;
  }

  if (type === "auth:setPassword") {
    if (!msg.id || !msg.password) { respond(worker, msgId, null); return; }
    const bcrypt = await import("bcrypt");
    const hash   = bcrypt.hash ?? (bcrypt as unknown as { default: typeof bcrypt }).default.hash;
    const hashed = await hash(msg.password as string, 10);
    const player   = await dbojs.queryOne({ id: msg.id as string });
    if (player) {
      await dbojs.modify({ id: msg.id as string }, "$set", { "data.password": hashed } as AnyData);
    }
    respond(worker, msgId, null);
    return;
  }
}
