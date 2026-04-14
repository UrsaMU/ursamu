/**
 * @module pipeline-stages
 *
 * Named stage functions for the command dispatch pipeline.
 * Each stage returns a boolean:
 *   true  = handled — stop processing this command
 *   false = not handled — continue to next stage
 *
 * Wired together in cmdParser.ts. Do NOT import from cmdParser.ts here.
 */
import type { IContext } from "../../@types/IContext.ts";
import type { IDBOBJ } from "../../@types/IDBObj.ts";
import type { ICmd } from "../../@types/ICmd.ts";
import type { IDBObj } from "../../@types/UrsamuSDK.ts";
import { send } from "../broadcast/index.ts";
import { dbojs } from "../Database/index.ts";
import { Obj } from "../DBObjs/DBObjs.ts";
import { InterceptorService, type Intent } from "../Intents/InterceptorService.ts";
import { sandboxService } from "../Sandbox/SandboxService.ts";
import { SDKService, type SDKObject } from "../Sandbox/SDKService.ts";
import { getAttribute } from "../../utils/getAttribute.ts";
import { evaluateLock, hydrate } from "../../utils/evaluateLock.ts";
import { target } from "../../utils/target.ts";
import { getConfig } from "../Config/mod.ts";
import { findDollarPattern } from "../../utils/dollarPatterns.ts";
import { createNativeSDK } from "../SDK/index.ts";
import {
  CONNECT_SCREEN,
  PREFIX_MAP,
  resolveScriptName,
} from "./dispatch-helpers.ts";

export { parseIntent, resolveScriptName } from "./dispatch-helpers.ts";

// ---------------------------------------------------------------------------
// Pipeline stages
// ---------------------------------------------------------------------------

/**
 * Run AOP interceptor scripts on objects in the actor's room.
 * Returns false if any interceptor blocks the command (stop processing).
 */
export async function checkInterceptors(
  room: Obj | null,
  intent: Intent,
): Promise<boolean> {
  if (!room) return true;

  const contents = await dbojs.query({ location: room.id });
  const candidates = [];

  for (const item of [room.dbobj, ...contents] as IDBOBJ[]) {
    const scriptAttr = await getAttribute(item, "script");
    if (scriptAttr?.value) {
      candidates.push({
        id: item.id,
        script: scriptAttr.value,
        state: (item.data?.state as Record<string, unknown>) || {},
      });
    }
  }

  return candidates.length === 0 || InterceptorService.intercept(intent, candidates);
}

/**
 * Handle SCRIPT_NODE objects whose commands are driven by `cmd:<intent>`
 * attributes instead of the normal dispatch pipeline.
 * Returns true if a matching script ran (stop processing).
 */
export async function runScriptNode(
  ctx: IContext,
  char: Obj | null,
  room: Obj | null,
  intentName: string,
  intent: Intent,
): Promise<boolean> {
  if (!char?.flags.includes("SCRIPT_NODE")) return false;

  const scriptAttr = await getAttribute(char.dbobj as unknown as IDBOBJ, `cmd:${intentName}`);
  if (!scriptAttr?.value) return false;

  const targetObj = intent.args[0]
    ? await target(char.dbobj as unknown as IDBOBJ, intent.args[0])
    : undefined;

  await sandboxService.runScript(scriptAttr.value, {
    id: char.id,
    me: await SDKService.hydrate(char),
    here: room ? await SDKService.hydrate(room, true) : undefined,
    target: targetObj ? await SDKService.hydrate(new Obj(targetObj)) : undefined,
    location: char.location || "limbo",
    state: (char.data?.state as Record<string, unknown>) || {},
    socketId: ctx.socket.id,
  });
  return true;
}

/**
 * Match input against native addCmd() registrations.
 * Returns true if a command matched and executed (stop processing).
 */
export async function matchNativeCmd(
  ctx: IContext,
  char: Obj | null,
  msg: string,
  cmds: ICmd[],
): Promise<boolean> {
  const actor: IDBObj = char
    ? hydrate(char.dbobj as unknown as Parameters<typeof hydrate>[0])
    : { id: "unknown", flags: new Set<string>(), state: {}, contents: [] };

  const rawMsg = msg.trim();
  const strippedMsg = rawMsg.replace(/^[@+]/, "");

  for (const cmd of cmds) {
    const match = rawMsg.match(cmd.pattern) ??
      (strippedMsg !== rawMsg ? strippedMsg.match(cmd.pattern) : null);
    if (!match) continue;
    if (!(await evaluateLock(cmd.lock || "", actor, actor))) continue;

    if (char) {
      // Update lastCommand before building SDK (SDK re-fetches actor from DB)
      char.dbobj.data ||= {};
      char.dbobj.data.lastCommand = Date.now();
      await dbojs.modify({ id: char.id }, "$set", char.dbobj);
    }

    const u = await createNativeSDK(ctx.socket.id, char?.id || "#-1", {
      name: cmd.name,
      original: msg,
      args: match.slice(1),
    });

    await (cmd.exec(u) as Promise<void>)?.catch((e: Error) => {
      console.error(e);
      send(
        [ctx.socket.id],
        `Uh oh! You've run into an error! Please contact staff with the following info!%r%r%chError:%cn ${e}`,
        { error: true },
      );
    });
    return true;
  }
  return false;
}

/**
 * Match input against game-project overrides and plugin-registered sandbox scripts.
 * Returns true if a script was found and executed (stop processing).
 */
export async function matchSandboxScript(
  ctx: IContext,
  char: Obj | null,
  room: Obj | null,
  msg: string,
  intentName: string,
  intent: Intent,
  aliases: Record<string, string>,
  readScript: (name: string) => Promise<string | null>,
): Promise<boolean> {
  const { scriptName, scriptArgs, cmdSwitches, usedPrefix } =
    resolveScriptName(msg, intentName, intent, aliases);

  try {
    if (!ctx.socket.cid && !CONNECT_SCREEN.has(scriptName)) return false;
    const code = await readScript(scriptName);
    if (!code) return false;
    if (!char && !CONNECT_SCREEN.has(scriptName)) return false;

    if (char) {
      char.dbobj.data ||= {};
      char.dbobj.data.lastCommand = Date.now();
      await dbojs.modify({ id: char.id }, "$set", char.dbobj);
    }

    const isPrefixCmd = Object.keys(PREFIX_MAP).some(
      (p) => msg.trim().startsWith(p) && scriptName === PREFIX_MAP[p],
    );
    const rawArgs = isPrefixCmd
      ? (scriptArgs[0] || "")
      : msg.trim().slice(intentName.length).trim();

    const targetObj = (scriptArgs[0] && char)
      ? await target(char.dbobj as unknown as IDBOBJ, scriptArgs[0])
      : undefined;

    await sandboxService.runScript(code, {
      id: char?.id || "#-1",
      me: char
        ? await SDKService.hydrate(char)
        : { id: "#-1", flags: new Set(), state: {} } as unknown as SDKObject,
      here: room ? await SDKService.hydrate(room, true) : undefined,
      target: targetObj ? await SDKService.hydrate(new Obj(targetObj)) : undefined,
      location: char?.location || "limbo",
      state: (char?.data?.state as Record<string, unknown>) || {},
      cmd: {
        name: usedPrefix || scriptName,
        original: msg.trim(),
        args: [rawArgs],
        switches: cmdSwitches.length ? cmdSwitches : undefined,
      },
      socketId: ctx.socket.id,
    });
    return true;
  } catch (e: unknown) {
    if (!(e && typeof e === "object" && "skip" in e)) {
      console.warn(`[Pipeline] Script execution failed for "${scriptName}":`, e);
    }
    return false;
  }
}

/**
 * Scan the actor's environment for $-pattern softcode attributes and execute
 * the first match via the softcode evaluator.
 * Returns true if a pattern matched and ran (stop processing).
 */
export async function matchSoftcodePattern(ctx: IContext): Promise<boolean> {
  if (!ctx.socket.cid || !ctx.msg) return false;

  const actor = await dbojs.queryOne({ id: ctx.socket.cid });
  if (!actor) return false;

  const masterRoomId = getConfig<string>("game.masterRoom") || "0";
  // deno-lint-ignore no-explicit-any
  const hit = await findDollarPattern(actor, ctx.msg.trim(), masterRoomId, dbojs as any);
  if (!hit) return false;

  const { softcodeService } = await import("../Softcode/index.ts");
  const result = await softcodeService.runSoftcode(hit.attr.value, {
    actorId: actor.id,
    executorId: hit.obj.id,
    args: hit.captures,
    socketId: ctx.socket.id,
  });

  if (result?.trim()) {
    const { force } = await import("./force.ts");
    await force(ctx, result.trim());
  }
  return true;
}
