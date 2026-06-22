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
import { actorIsAdmin } from "./sandbox-permissions.ts";

type Msg    = Record<string, unknown>;
type Worker = globalThis.Worker;

function respond(worker: Worker, msgId: unknown, data: unknown): void {
  worker.postMessage({ type: "response", msgId, data });
}

// ---------------------------------------------------------------------------
// Auth handler rate limiting
// ---------------------------------------------------------------------------
// Per-actor rate limit for auth:verify and auth:hash. These are bcrypt-cost-10
// operations exposed to sandbox scripts; without a limit, any logged-in
// player can plant an `&onuse` script that calls verify/hash in a loop to
// brute-force passwords or burn server CPU. Anonymous calls (no context)
// share a single bucket.
const _authRateLimits = new Map<string, { count: number; resetAt: number }>();
const AUTH_RATE_LIMIT     = 5;
const AUTH_RATE_WINDOW_MS = 60_000;

function authRateLimited(context: SDKContext | undefined): boolean {
  const key = String(context?.id ?? "_anon");
  const now = Date.now();
  const entry = _authRateLimits.get(key);
  if (!entry || now >= entry.resetAt) {
    _authRateLimits.set(key, { count: 1, resetAt: now + AUTH_RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > AUTH_RATE_LIMIT;
}

// Sweep expired buckets so the map can't grow one stale entry per distinct
// actor for the life of the process (its two sibling rate-limit maps in
// app.ts / authRouter.ts already do this). Unref'd so it never holds the
// process open.
const _authRateLimitSweep = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of _authRateLimits) {
    if (now >= entry.resetAt) _authRateLimits.delete(key);
  }
}, AUTH_RATE_WINDOW_MS);
Deno.unrefTimer(_authRateLimitSweep);

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
        // Refuse the search if we can't resolve the actor — the previous
        // hardcoded `{ id: "1", flags: "wizard" }` fallback escalated any
        // sandbox call path that lost context to wizard-class search.
        const char = context?.id ? await db.queryOne({ id: String(context.id) }) : null;
        if (!char) {
          respond(worker, msgId, []);
          return;
        }
        const found = await target(char, msg.query as string, true);
        results = found ? [found] : [];
      } else {
        results = await db.query(msg.query as Record<string, unknown>);
      }

      const sdkResults = await Promise.all(results.map((r: unknown) => {
        const obj = r as IDBOBJ;
        // Strip sensitive fields before exposing to a sandbox script. The
        // raw `data` blob includes `password` (bcrypt hash), reset tokens,
        // and other internal session bookkeeping; a non-admin script that
        // calls db.search("admin") should not be able to fingerprint
        // those values.
        const safeData: Record<string, unknown> = { ...(obj.data || {}) };
        delete safeData.password;
        delete safeData.resetToken;
        delete safeData.resetTokenExpiry;
        delete safeData.failedAttempts;
        const ctx = {
          id:    obj.id,
          me:    { ...obj, name: obj.data?.name, flags: new Set(obj.flags.split(" ")), state: safeData },
          state: safeData,
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
    if (!(await actorIsAdmin(context))) {
      respond(worker, msgId, { error: "Permission denied." });
      return;
    }
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
    if (tpl.location) {
      const { gameHooks } = await import("../Hooks/GameHooks.ts");
      await gameHooks.emit("object:moved", {
        objectId: created.id,
        from:     null,
        to:       tpl.location,
        cause:    "create",
        actorId:  context?.id as string | undefined,
      });
    }
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
    if (!(await actorIsAdmin(context))) {
      respond(worker, msgId, { error: "Permission denied." });
      return;
    }
    const { dbojs: db } = await import("../Database/index.ts");
    const prev = await db.queryOne({ id: msg.id as string });
    const prevLocation = prev ? (prev.location ?? null) : null;
    await db.delete({ id: msg.id as string });
    const { gameHooks } = await import("../Hooks/GameHooks.ts");
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
    if (!(await actorIsAdmin(context))) {
      respond(worker, msgId, { error: "Permission denied." });
      return;
    }
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
    if (authRateLimited(context)) {
      respond(worker, msgId, { error: "Rate limit exceeded for auth:verify." });
      return;
    }
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
    // auth:login as a target other than self is privilege escalation; gate it.
    // Exception: when context has no actor (pre-auth login from `connect`),
    // allow it — the connect command verifies the password first.
    const ctxId = String(context?.id || "");
    if (ctxId && ctxId !== String(msg.id) && !(await actorIsAdmin(context))) {
      respond(worker, msgId, { error: "Permission denied." });
      return;
    }
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
    if (authRateLimited(context)) {
      respond(worker, msgId, { error: "Rate limit exceeded for auth:hash." });
      return;
    }
    const { hash } = await import("../../../deps.ts");
    const hashed   = msg.password ? await hash(msg.password as string, 10) : null;
    respond(worker, msgId, hashed);
    return;
  }

  if (type === "auth:setPassword") {
    if (!msg.id || !msg.password) { respond(worker, msgId, null); return; }
    // Allow setting your own password; setting another player's requires admin.
    if (String(msg.id) !== String(context?.id) && !(await actorIsAdmin(context))) {
      respond(worker, msgId, { error: "Permission denied." });
      return;
    }
    const { hash }      = await import("../../../deps.ts");
    const { dbojs: db } = await import("../Database/index.ts");
    const hashed  = await hash(msg.password as string, 10);
    const player  = await db.queryOne({ id: msg.id as string });
    if (player) await scopedUpdate(msg.id as string, { "data.password": hashed });
    respond(worker, msgId, null);
    return;
  }
}
