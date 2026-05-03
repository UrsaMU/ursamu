/**
 * @module sandbox-handlers-exec
 *
 * Handles worker messages for command execution and softcode evaluation:
 *   execute, force, force:as
 *   eval:attr, eval:string
 */
import type { SDKContext } from "./SDKService.ts";
import { wsService } from "../WebSocket/index.ts";

type Msg    = Record<string, unknown>;
type Worker = globalThis.Worker;

function respond(worker: Worker, msgId: unknown, data: unknown): void {
  worker.postMessage({ type: "response", msgId, data });
}

async function resolveSocket(context: SDKContext | undefined) {
  const { wsService: ws } = await import("../WebSocket/index.ts");
  let actorId = context?.id && context.id !== "#-1" ? context.id as string : undefined;
  if (!actorId && context?.socketId) {
    const live = ws.getConnectedSockets().find(s => s.id === context.socketId);
    if (live?.cid) actorId = live.cid;
  }
  return actorId;
}

export async function handleForceMessage(
  msg:     Msg,
  worker:  Worker,
  context: SDKContext | undefined,
): Promise<void> {
  const { type, msgId } = msg;

  if (type === "execute" || type === "force") {
    if (!msg.command) { respond(worker, msgId, null); return; }
    const { force }     = await import("../commands/index.ts");
    const { dbojs: db } = await import("../Database/index.ts");
    const actorId = await resolveSocket(context);
    const en = actorId ? await db.queryOne({ id: actorId }) : undefined;
    if (en) {
      const socket  = wsService.getConnectedSockets().find(s => s.cid === en.id);
      const mockCtx = {
        socket: socket || { cid: en.id, id: `script-${en.id}`, join: () => {}, leave: () => {}, send: () => {} },
        msg: msg.command as string,
      };
      // deno-lint-ignore no-explicit-any
      await force(mockCtx as any, msg.command as string);
    }
    respond(worker, msgId, null);
    return;
  }

  if (type === "force:as") {
    if (!msg.targetId || !msg.command) { respond(worker, msgId, null); return; }
    const { force }     = await import("../commands/index.ts");
    const { dbojs: db } = await import("../Database/index.ts");
    // Privilege check: only wizard/admin/superuser may force-execute as another object
    const actorId = await resolveSocket(context);
    if (!actorId) { respond(worker, msgId, null); return; }
    const actor = await db.queryOne({ id: actorId });
    const { isStaff } = await import("../../utils/isStaff.ts");
    if (!actor || !isStaff(actor.flags)) { respond(worker, msgId, null); return; }
    const en = await db.queryOne({ id: msg.targetId as string });
    if (en) {
      const socket  = wsService.getConnectedSockets().find(s => s.cid === en.id);
      const mockCtx = {
        socket: socket || {
          cid: en.id, id: `force-${en.id}`,
          join: () => {}, leave: () => {}, send: () => {}, disconnect: () => {},
        },
        msg: msg.command as string,
      };
      // deno-lint-ignore no-explicit-any
      await force(mockCtx as any, msg.command as string);
    }
    respond(worker, msgId, null);
    return;
  }
}

export async function handleEvalMessage(
  msg:     Msg,
  worker:  Worker,
  context: SDKContext | undefined,
): Promise<void> {
  const { type, msgId } = msg;

  if (type === "eval:attr") {
    const { dbojs: db } = await import("../Database/index.ts");
    const { escapeRegex } = await import("../../utils/escapeRegex.ts");
    // deno-lint-ignore no-explicit-any
    const tarObj: any = await db.queryOne({
      $or: [
        { id: msg.targetStr as string },
        { "data.name": new RegExp(`^${escapeRegex(String(msg.targetStr))}$`, "i") },
      ],
    });
    if (!tarObj) { respond(worker, msgId, ""); return; }

    const attrs    = ((tarObj.data?.attributes as Array<{ name: string; value: string; type?: string }>) || []);
    const attrData = attrs.find((a: { name: string }) => a.name.toUpperCase() === String(msg.attr).toUpperCase());
    if (!attrData) { respond(worker, msgId, ""); return; }

    const { isSoftcode } = await import("../../utils/isSoftcode.ts");
    const evalArgs = (msg.args as string[]) || [];
    let result: string;

    if (isSoftcode(attrData)) {
      const { softcodeService } = await import("../Softcode/index.ts");
      result = await softcodeService.runSoftcode(attrData.value, {
        actorId:    String(context?.id || tarObj.id),
        executorId: tarObj.id,
        args:       evalArgs,
        socketId:   context?.socketId as string | undefined,
      });
    } else if (attrData.type === "attribute") {
      const { sandboxService } = await import("./SandboxService.ts");
      const raw = await sandboxService.runScript(attrData.value, {
        id:    tarObj.id,
        state: (tarObj.data?.state as Record<string, unknown>) || {},
        cmd:   { name: "", args: evalArgs },
      });
      result = raw != null ? String(raw) : "";
    } else {
      result = attrData.value;
    }
    respond(worker, msgId, result);
    return;
  }

  if (type === "eval:string") {
    const code = String(msg.code || "");
    if (!code) { respond(worker, msgId, ""); return; }
    try {
      const actorId = await resolveSocket(context);
      if (!actorId) { respond(worker, msgId, code); return; }
      const { softcodeService } = await import("../Softcode/index.ts");
      const result = await softcodeService.runSoftcode(code, {
        actorId,
        executorId: actorId,
        args:       [],
        socketId:   context?.socketId as string | undefined,
      });
      respond(worker, msgId, result);
    } catch (_err) {
      console.error("[SandboxHandlers eval:string]", _err);
      respond(worker, msgId, code);
    }
    return;
  }
}
