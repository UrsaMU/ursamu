/**
 * @module handlers/exec
 *
 * Handles worker messages for command execution and softcode evaluation:
 *   execute, force, force:as
 *   eval:attr, eval:string
 */
import { sessions, send } from "@ursamu/core";
import { dbojs } from "../../world/dbobjs.ts";
import type { SDKContext } from "../sdk-service.ts";

type Msg    = Record<string, unknown>;
type Worker = globalThis.Worker;

function respond(worker: Worker, msgId: unknown, data: unknown): void {
  worker.postMessage({ type: "response", msgId, data });
}

function resolveActorId(context: SDKContext | undefined): string | undefined {
  let actorId = context?.id && context.id !== "#-1" ? context.id as string : undefined;
  if (!actorId && context?.socketId) {
    const session = sessions.get(context.socketId as string);
    if (session?.sessionId) actorId = session.sessionId;
  }
  return actorId;
}

/**
 * Force `actorId` to execute `command` through the MUSH addCmd pipeline.
 * Looks up the actor's socketId via sessions, then runs each registered
 * command whose pattern matches, respecting lock evaluation.
 */
async function forceExec(actorId: string, command: string): Promise<void> {
  const session = sessions.getBySession(actorId);
  if (!session) return;

  const { socketId } = session;
  const actor = await dbojs.queryOne({ id: actorId });
  if (!actor) return;

  const { cmds } = await import("../../commands/addCmd.ts");
  const { evaluateLock } = await import("../../world/locks.ts");
  const { hydrate } = await import("../../world/dbobjs.ts");
  const { createNativeSDK } = await import("../../commands/sdk.ts");

  const hydratedActor = hydrate(actor);
  const rawMsg = command.trim();

  for (const cmd of cmds) {
    const match = rawMsg.match(cmd.pattern);
    if (!match) continue;
    if (!(await evaluateLock(cmd.lock || "", hydratedActor, hydratedActor))) continue;

    const u = await createNativeSDK(socketId, actorId, {
      name: cmd.name,
      original: command,
      args: match.slice(1),
    });

    await (cmd.exec(u) as Promise<void>)?.catch((e: unknown) => {
      console.error("[forceExec]", e);
      send([socketId], `%chError:%cn ${String(e)}`);
    });
    return;
  }
}

export async function handleForceMessage(
  msg:     Msg,
  worker:  Worker,
  context: SDKContext | undefined,
): Promise<void> {
  const { type, msgId } = msg;

  if (type === "execute" || type === "force") {
    if (!msg.command) { respond(worker, msgId, null); return; }
    const actorId = await resolveActorId(context);
    if (actorId) await forceExec(actorId, msg.command as string);
    respond(worker, msgId, null);
    return;
  }

  if (type === "force:as") {
    if (!msg.targetId || !msg.command) { respond(worker, msgId, null); return; }
    const actorId = await resolveActorId(context);
    if (!actorId) { respond(worker, msgId, null); return; }
    const actor = await dbojs.queryOne({ id: actorId });
    const flags = String(actor?.flags || "");
    const isStaff = flags.includes("admin") || flags.includes("wizard") || flags.includes("superuser");
    if (!actor || !isStaff) { respond(worker, msgId, null); return; }
    await forceExec(msg.targetId as string, msg.command as string);
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
    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // deno-lint-ignore no-explicit-any
    const tarObj: any = await dbojs.queryOne({
      $or: [
        { id: msg.targetStr as string },
        { "data.name": new RegExp(`^${escapeRegex(String(msg.targetStr))}$`, "i") },
      ],
    });
    if (!tarObj) { respond(worker, msgId, ""); return; }

    const attrs    = ((tarObj.data?.attributes as Array<{ name: string; value: string; type?: string }>) || []);
    const attrData = attrs.find((a: { name: string }) => a.name.toUpperCase() === String(msg.attr).toUpperCase());
    if (!attrData) { respond(worker, msgId, ""); return; }

    const evalArgs = (msg.args as string[]) || [];
    const isSoftcode = (attr: { value?: string }) => /^\[.*\]$/.test((attr.value ?? "").trim());

    let result: string;
    if (isSoftcode(attrData)) {
      const { runSoftcodeSimple } = await import("../engine.ts");
      result = await runSoftcodeSimple(attrData.value, {
        actorId:    String(context?.id || tarObj.id),
        executorId: tarObj.id,
        args:       evalArgs,
        socketId:   context?.socketId as string | undefined,
      });
    } else if (attrData.type === "attribute") {
      const { sandboxService } = await import("../sandbox.ts");
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
      const actorId = await resolveActorId(context);
      if (!actorId) { respond(worker, msgId, code); return; }
      const { runSoftcodeSimple } = await import("../engine.ts");
      const result = await runSoftcodeSimple(code, {
        actorId,
        executorId: actorId,
        args:       [],
        socketId:   context?.socketId as string | undefined,
      });
      respond(worker, msgId, result);
    } catch (err: unknown) {
      console.error("[SandboxHandlers eval:string]", err);
      respond(worker, msgId, code);
    }
    return;
  }
}
