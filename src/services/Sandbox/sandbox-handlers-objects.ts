/**
 * @module sandbox-handlers-objects
 *
 * Handles worker messages for game-object operations:
 *   attr:get, attr:set, attr:clear
 *   flags:set
 *   util:target, util:parseDesc
 *   trigger:attr
 *   events:emit, events:subscribe
 */
import type { SDKContext } from "./SDKService.ts";

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
    const { dbojs: db } = await import("../Database/index.ts");
    const obj = await db.queryOne({ id: msg.id as string });
    if (!obj) { respond(worker, msgId, null); return; }
    const attrs = (obj.data?.attributes as Array<{ name: string; value: string }> | undefined) || [];
    const found = attrs.find(a => a.name.toUpperCase() === (msg.name as string).toUpperCase());
    respond(worker, msgId, found?.value ?? null);
    return;
  }

  if (type === "attr:set") {
    if (!msg.id || !msg.name) { respond(worker, msgId, null); return; }
    const { dbojs: db } = await import("../Database/index.ts");
    const obj = await db.queryOne({ id: msg.id as string });
    if (!obj) { respond(worker, msgId, null); return; }
    obj.data ||= {};
    const attrs = ((obj.data.attributes as Array<{ name: string; value: string; type?: string; setter?: string }>) || []);
    const idx   = attrs.findIndex(a => a.name.toUpperCase() === (msg.name as string).toUpperCase());
    const entry = {
      name:     (msg.name as string).toUpperCase(),
      value:    msg.value as string,
      type:     String(msg.attrType || "attribute"),
      setter:   String(context?.id || ""),
    };
    if (idx >= 0) attrs[idx] = entry; else attrs.push(entry);
    (obj.data as Record<string, unknown>).attributes = attrs;
    await db.modify({ id: obj.id }, "$set", { "data.attributes": attrs } as Record<string, unknown>);
    respond(worker, msgId, null);
    return;
  }

  if (type === "attr:clear") {
    if (!msg.id || !msg.name) { respond(worker, msgId, false); return; }
    const { dbojs: db } = await import("../Database/index.ts");
    const obj = await db.queryOne({ id: msg.id as string });
    if (!obj) { respond(worker, msgId, false); return; }
    obj.data ||= {};
    const attrs    = ((obj.data.attributes as Array<{ name: string }>) || []);
    const filtered = attrs.filter(a => a.name.toUpperCase() !== (msg.name as string).toUpperCase());
    if (filtered.length === attrs.length) { respond(worker, msgId, false); return; }
    await db.modify({ id: obj.id }, "$set", { "data.attributes": filtered } as Record<string, unknown>);
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
  const { dbojs: db } = await import("../Database/index.ts");
  const { setFlags }  = await import("../../utils/setFlags.ts");
  const tar = await db.queryOne({ id: msg.target as string });
  const en  = context?.id ? await db.queryOne({ id: context.id as string }) : undefined;
  if (tar) await setFlags(tar, msg.flags as string, en || undefined);
  respond(worker, msgId, null);
}

export async function handleUtilTargetMessage(
  msg:     Msg,
  worker:  Worker,
  _context: SDKContext | undefined,
): Promise<void> {
  const { msgId } = msg;
  if (!msg.actor || !msg.query) { respond(worker, msgId, undefined); return; }
  const { dbojs: db } = await import("../Database/index.ts");
  const { target }    = await import("../../utils/target.ts");
  const en = await db.queryOne({ id: msg.actor as string });
  if (!en) { respond(worker, msgId, undefined); return; }
  const result = await target(en, msg.query as string);
  if (!result) { respond(worker, msgId, undefined); return; }
  respond(worker, msgId, {
    id:       result.id,
    name:     result.data?.name || result.id,
    flags:    result.flags.split(" ").filter(Boolean),
    location: result.location,
    state:    result.data || {},
    contents: [],
  });
}

export async function handleUtilParseDescMessage(
  msg:    Msg,
  worker: Worker,
): Promise<void> {
  const { msgId } = msg;
  if (msg.desc === undefined) { respond(worker, msgId, ""); return; }
  const { parseDesc } = await import("../../utils/parseDesc.ts");
  const { dbojs: db } = await import("../Database/index.ts");
  const actor  = msg.actor  ? await db.queryOne({ id: (msg.actor  as { id: string }).id }) : null;
  const target = msg.target ? await db.queryOne({ id: (msg.target as { id: string }).id }) : null;
  const result = await parseDesc(
    String(msg.desc),
    // deno-lint-ignore no-explicit-any
    (actor  || msg.actor)  as any,
    // deno-lint-ignore no-explicit-any
    (target || msg.target) as any,
  );
  respond(worker, msgId, result);
}

export async function handleTriggerMessage(
  msg:     Msg,
  worker:  Worker,
  context: SDKContext | undefined,
): Promise<void> {
  const { msgId } = msg;
  if (!msg.target || !msg.attr) { respond(worker, msgId, null); return; }
  const { dbojs: db } = await import("../Database/index.ts");
  const { hooks }     = await import("../Hooks/index.ts");
  try {
    const obj     = await db.queryOne({ id: msg.target as string });
    const enactor = context?.id ? await db.queryOne({ id: context.id as string }) : undefined;
    if (obj) {
      await hooks.executeAttribute(
        obj,
        msg.attr as string,
        (msg.args as string[]) || [],
        enactor || undefined,
      );
    }
  } catch (_) { /* attribute not found or script error — non-fatal */ }
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
    const { eventsService } = await import("../Events/index.ts");
    eventsService.emit(msg.event as string, msg.data, msg.context as Record<string, unknown> | undefined);

    // Also fire ^-pattern listeners when text is spoken in a room
    if (msg.event === "room:text" && msg.data) {
      const d = msg.data as { roomId?: string; text?: string; speakerId?: string };
      if (d.roomId && d.text) {
        const { fireCaretPatterns } = await import("../../utils/caretPatterns.ts");
        const { getConfig }         = await import("../Config/mod.ts");
        const { dbojs }             = await import("../Database/index.ts");
        const masterRoomId = getConfig<string>("game.masterRoom") || undefined;
        fireCaretPatterns(
          d.roomId, d.text, d.speakerId || "",
          String(context?.socketId || ""),
          // deno-lint-ignore no-explicit-any
          dbojs as any, masterRoomId,
        ).catch(err => console.error("[SandboxHandlers] room:text ^-pattern error:", err));
      }
    }
    respond(worker, msgId, null);
    return;
  }

  if (type === "events:subscribe") {
    if (!msg.event || !msg.handler || !context?.id) { respond(worker, msgId, null); return; }
    const { eventsService } = await import("../Events/index.ts");
    const subId = await eventsService.subscribe(
      msg.event   as string,
      msg.handler as string,
      context.id  as string,
    );
    respond(worker, msgId, subId);
    return;
  }
}
