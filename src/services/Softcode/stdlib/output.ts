/**
 * Output side-effect functions — pemit, remit, oemit, cemit, emit, npemit, trigger.
 *
 * All message-sending functions delegate to ctx.output, which is injected by
 * the worker and posts back to the main thread over the Deno Worker message channel.
 *
 * Function signatures follow TinyMUX 2.x conventions:
 *   pemit(player, message)         — send to named player
 *   remit(room, message)           — broadcast to room (all contents)
 *   oemit(player, message)         — broadcast to room, excluding player
 *   cemit(channel, message)        — send to channel (stub: not yet wired)
 *   emit(message)                  — broadcast to executor's room
 *   npemit(player, message)        — pemit without player name prefix
 *   trigger(obj/attr[, args...])   — trigger an attribute (via @trigger wire)
 */
import { register } from "./registry.ts";
import type { EvalContext } from "../context.ts";
import type { IDBObj } from "../../../@types/UrsamuSDK.ts";

// ── helpers ───────────────────────────────────────────────────────────────

async function resolveObj(ref: string, ctx: EvalContext): Promise<IDBObj | null> {
  const r = ref.trim();
  if (!r) return null;
  if (r.toLowerCase() === "me")      return ctx.executor;
  if (r.toLowerCase() === "here")    return await ctx.db.queryById(ctx.executor.location ?? "") ?? null;
  if (r.toLowerCase() === "enactor") return ctx.actor;
  if (/^#(-?\d+)$/.test(r))         return await ctx.db.queryById(r.slice(1));
  if (/^#[a-zA-Z]/.test(r)) {
    const tagName  = r.slice(1);
    const personalId = await ctx.db.getPlayerTagById(ctx.actor.id, tagName);
    if (personalId) return await ctx.db.queryById(personalId);
    const globalId = await ctx.db.getTagById(tagName);
    return globalId ? await ctx.db.queryById(globalId) : null;
  }
  return await ctx.db.queryByName(r);
}

// ── pemit(player, message) ────────────────────────────────────────────────

register("pemit", async (a, ctx: EvalContext) => {
  const target = await resolveObj(a[0] ?? "", ctx);
  if (!target) return "#-1 NO MATCH";
  ctx.output.send(a[1] ?? "", target.id);
  return "";
});

// ── npemit(player, message) — no-prefix pemit ─────────────────────────────
// TinyMUX: identical to pemit for softcode purposes (prefix stripping is
// a client-display concern, not enforced at the protocol level).

register("npemit", async (a, ctx: EvalContext) => {
  const target = await resolveObj(a[0] ?? "", ctx);
  if (!target) return "#-1 NO MATCH";
  ctx.output.send(a[1] ?? "", target.id);
  return "";
});

// ── remit(room, message) ──────────────────────────────────────────────────

register("remit", async (a, ctx: EvalContext) => {
  const room = await resolveObj(a[0] ?? "", ctx);
  if (!room) return "#-1 NO MATCH";
  ctx.output.roomBroadcast(a[1] ?? "", room.id);
  return "";
});

// ── oemit(player, message) — emit to room, excluding player ───────────────

register("oemit", async (a, ctx: EvalContext) => {
  const target = await resolveObj(a[0] ?? "", ctx);
  if (!target) return "#-1 NO MATCH";
  const roomId = target.location ?? ctx.executor.location ?? "";
  if (!roomId) return "#-1 LOCATION NOT FOUND";
  ctx.output.roomBroadcast(a[1] ?? "", roomId, target.id);
  return "";
});

// ── emit(message) — broadcast to executor's room ─────────────────────────

register("emit", async (a, ctx: EvalContext) => {
  const roomId = ctx.executor.location ?? "";
  if (roomId) ctx.output.roomBroadcast(a[0] ?? "", roomId);
  return "";
});

// ── cemit(channel, message) — channel emit ───────────────────────────────
// Wired via the @channel system; output accessor does not yet expose a
// channel broadcast path, so we delegate to the main thread via a sentinel
// prefix and resolve on the SoftcodeService side.

register("cemit", async (a, ctx: EvalContext) => {
  const channel = (a[0] ?? "").trim();
  const msg     = a[1] ?? "";
  if (!channel) return "#-1 NO MATCH";
  // Sentinel: "\x00cemit\x00<channel>\x00<msg>" — SoftcodeService strips it.
  ctx.output.broadcast(`\x00cemit\x00${channel}\x00${msg}`);
  return "";
});

// ── trigger(obj/attr[, %0, %1, ...]) ─────────────────────────────────────
// Sends an @trigger command back to the main thread via the output accessor,
// encoded as a sentinel so SoftcodeService can dispatch it.
// Format: "\x00atcmd\x00@trigger <obj>/<attr>=<args>"

register("trigger", async (a, ctx: EvalContext) => {
  const objAttr = (a[0] ?? "").trim();
  if (!objAttr) return "#-1 NO MATCH";
  const args = a.slice(1).join(",");
  const cmd  = args ? `@trigger ${objAttr}=${args}` : `@trigger ${objAttr}`;
  ctx.output.send(`\x00atcmd\x00${cmd}`, ctx.actor.id);
  return "";
});

// ── textfile / text — MUX help-file display stubs ────────────────────────
// Full implementation requires file-system access; stubs return empty for
// compatibility (TinyMUX returns "" on missing file, not an error).

register("textfile", async () => "");
register("text",     async () => "");
