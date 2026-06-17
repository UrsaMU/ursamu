/**
 * @module handlers/objects
 *
 * Handles worker messages for game-object operations:
 *   attr:get, attr:set, attr:clear
 *   flags:set
 *   util:target, util:parseDesc
 *   trigger:attr
 *   events:emit, events:subscribe
 */
import { dbojs } from "../../world/dbobjs.ts";
import type { IDBOBJ } from "../../world/types.ts";
import type { SDKContext } from "../sdk-service.ts";

type Msg    = Record<string, unknown>;
type Worker = globalThis.Worker;

function respond(worker: Worker, msgId: unknown, data: unknown): void {
  worker.postMessage({ type: "response", msgId, data });
}

export async function handleAttrMessage(
  msg:     Msg,
  worker:  Worker,
  context: SDKContext | undefined,
): Promise<void> {
  const { type, msgId } = msg;

  if (type === "attr:get") {
    if (!msg.id || !msg.name) { respond(worker, msgId, null); return; }
    const obj = await dbojs.queryOne({ id: msg.id as string });
    if (!obj) { respond(worker, msgId, null); return; }
    const attrs = (obj.data?.attributes as Array<{ name: string; value: string }> | undefined) || [];
    const found = attrs.find(a => a.name.toUpperCase() === (msg.name as string).toUpperCase());
    respond(worker, msgId, found?.value ?? null);
    return;
  }

  if (type === "attr:set") {
    if (!msg.id || !msg.name) { respond(worker, msgId, null); return; }
    const obj = await dbojs.queryOne({ id: msg.id as string });
    if (!obj) { respond(worker, msgId, null); return; }
    obj.data ||= {};
    const attrs = ((obj.data.attributes as Array<{ name: string; value: string; type?: string; setter?: string }>) || []);
    const idx   = attrs.findIndex(a => a.name.toUpperCase() === (msg.name as string).toUpperCase());
    const entry = {
      name:   (msg.name as string).toUpperCase(),
      value:  msg.value as string,
      type:   String(msg.attrType || "attribute"),
      setter: String(context?.id || ""),
    };
    if (idx >= 0) attrs[idx] = entry; else attrs.push(entry);
    (obj.data as Record<string, unknown>).attributes = attrs;
    await dbojs.modify({ id: obj.id }, "$set", { "data.attributes": attrs } as Record<string, unknown>);
    respond(worker, msgId, null);
    return;
  }

  if (type === "attr:clear") {
    if (!msg.id || !msg.name) { respond(worker, msgId, false); return; }
    const obj = await dbojs.queryOne({ id: msg.id as string });
    if (!obj) { respond(worker, msgId, false); return; }
    obj.data ||= {};
    const attrs    = ((obj.data.attributes as Array<{ name: string }>) || []);
    const filtered = attrs.filter(a => a.name.toUpperCase() !== (msg.name as string).toUpperCase());
    if (filtered.length === attrs.length) { respond(worker, msgId, false); return; }
    await dbojs.modify({ id: obj.id }, "$set", { "data.attributes": filtered } as Record<string, unknown>);
    respond(worker, msgId, true);
    return;
  }
}

export async function handleFlagsMessage(
  msg:     Msg,
  worker:  Worker,
  context: SDKContext | undefined,
): Promise<void> {
  const { msgId } = msg;
  if (!msg.target || !msg.flags) { respond(worker, msgId, null); return; }
  const tar = await dbojs.queryOne({ id: msg.target as string });
  if (tar) {
    // Append new flags to the existing space-delimited string (dedup)
    const existing = new Set((tar.flags || "").split(" ").filter(Boolean));
    String(msg.flags).split(" ").filter(Boolean).forEach(f => existing.add(f.replace(/^!/, "")));
    // Flags prefixed with ! are removals
    String(msg.flags).split(" ").filter(f => f.startsWith("!")).forEach(f => existing.delete(f.slice(1)));
    await dbojs.modify({ id: tar.id }, "$set", { flags: [...existing].join(" ") });
  }
  void context;
  respond(worker, msgId, null);
}

export async function handleUtilTargetMessage(
  msg:     Msg,
  worker:  Worker,
  _context: SDKContext | undefined,
): Promise<void> {
  const { msgId } = msg;
  if (!msg.actor || !msg.query) { respond(worker, msgId, undefined); return; }
  const query = String(msg.query);
  let result: { id: string; flags: string; location?: string; data?: Record<string, unknown> } | null | undefined;

  if (query.startsWith("#")) {
    result = await dbojs.queryOne({ id: query.slice(1) });
  } else {
    result = await dbojs.queryOne({
      $or: [
        { id: query },
        { "data.name": new RegExp(`^${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      ],
    });
  }
  if (!result) { respond(worker, msgId, undefined); return; }
  respond(worker, msgId, {
    id:       result.id,
    name:     result.data?.name || result.id,
    flags:    (result.flags || "").split(" ").filter(Boolean),
    location: result.location,
    state:    result.data || {},
    contents: [],
  });
}

export function handleUtilParseDescMessage(
  msg:    Msg,
  worker: Worker,
): void {
  const { msgId } = msg;
  if (msg.desc === undefined) { respond(worker, msgId, ""); return; }
  // identity — softcode evaluator handles desc parsing
  respond(worker, msgId, String(msg.desc));
}

export async function handleTriggerMessage(
  msg:     Msg,
  worker:  Worker,
  context: SDKContext | undefined,
): Promise<void> {
  const { msgId } = msg;
  if (!msg.target || !msg.attr) { respond(worker, msgId, null); return; }
  try {
    const obj     = await dbojs.queryOne({ id: msg.target as string });
    void context;
    if (obj) {
      const attrs = (obj.data?.attributes as Array<{ name: string; value: string; type?: string }> | undefined) || [];
      const attr  = attrs.find(a => a.name.toUpperCase() === String(msg.attr).toUpperCase());
      if (attr) {
        const isSoftcode = (v: string) => /^\[.*\]$/.test(v.trim());
        const evalArgs = (msg.args as string[]) || [];
        if (isSoftcode(attr.value)) {
          const { runSoftcodeSimple } = await import("../engine.ts");
          await runSoftcodeSimple(attr.value, {
            actorId:    String(context?.id || obj.id),
            executorId: obj.id,
            args:       evalArgs,
            socketId:   context?.socketId as string | undefined,
          });
        }
      }
    }
  } catch (_e: unknown) { /* attribute not found or script error — non-fatal */ }
  respond(worker, msgId, null);
}

export async function handleEventsMessage(
  msg:     Msg,
  worker:  Worker,
  context: SDKContext | undefined,
): Promise<void> {
  const { type, msgId } = msg;

  if (type === "events:emit") {
    if (!msg.event) { respond(worker, msgId, null); return; }
    // Emit through gameHooks for known events; no-op for custom events (stub)
    if (msg.event === "room:text" && msg.data) {
      const d = msg.data as { roomId?: string; text?: string; speakerId?: string };
      if (d.roomId && d.text) {
        const { fireCaretPatterns } = await import("../../world/caret-patterns.ts");
        const speakerId = d.speakerId ?? (context?.id as string | undefined) ?? "";
        const socketId  = (context?.socketId as string | undefined) ?? "";
        await fireCaretPatterns(d.roomId, d.text, speakerId, socketId, dbojs as { query: (q: unknown) => Promise<IDBOBJ[]> }).catch(
          (e: unknown) => console.error("[events:emit room:text]", e),
        );
      }
    }
    respond(worker, msgId, null);
    return;
  }

  if (type === "events:subscribe") {
    if (!msg.event || !msg.handler || !context?.id) { respond(worker, msgId, null); return; }
    // Stub: event subscription not yet wired in @ursamu/mush
    const subId = crypto.randomUUID();
    respond(worker, msgId, subId);
    return;
  }
}
