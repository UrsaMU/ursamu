/**
 * addCmd — register a MUSH command.
 *
 * Wraps each registration with:
 *   1. Pattern match on raw input
 *   2. MUSH lock evaluation (evaluateLock)
 *   3. SDK construction (createNativeSDK)
 *   4. exec(u) call
 *
 * loadDefaultCommands() wires the built-in verb modules; call it from the
 * application entry point (after the DB is ready).
 */
import { addHandler, send } from "@ursamu/core";
import type { ICoreContext } from "@ursamu/core";
import type { ICmd } from "./types.ts";
import { evaluateLock } from "../world/locks.ts";
import { createNativeSDK } from "./sdk.ts";

export const cmds: ICmd[] = [];

// Script registry: name → softcode source.  Filled by registerScript() and
// read by matchSandboxScript() in the dispatch pipeline.
const _scriptRegistry = new Map<string, string>();

export function addCmd(...toAdd: ICmd[]): void {
  cmds.push(...toAdd);
  ensureHandlersRegistered();
}

export function clearCmds(): void {
  cmds.length = 0;
}

export function registerScript(name: string, content: string): void {
  _scriptRegistry.set(name, content);
}

export function getScript(name: string): string | null {
  return _scriptRegistry.get(name) ?? null;
}

export function scriptRegistry(): Map<string, string> {
  return _scriptRegistry;
}

let _handlersRegistered = false;

/**
 * Wire the command list into core's addHandler dispatch pipeline.
 * Safe to call multiple times — only registers once.
 */
function ensureHandlersRegistered(): void {
  if (_handlersRegistered) return;
  _handlersRegistered = true;

  addHandler({
    name: "mush:commands",
    pattern: /.*/,
    exec: async (ctx: ICoreContext) => {
      const socketId = ctx.socketId;
      const msg      = ctx.input;
      if (!msg) return;

      // session.actorId is set by the session:auth hook (JWT decoded → player DB ID).
      // ctx.sessionId is the raw JWT — do not use it as a DB lookup key.
      const { sessions } = await import("@ursamu/core");
      const session = sessions.get(socketId);
      const actorId = ((session as unknown as Record<string, unknown>)?.actorId as string | undefined)
        ?? "";

      const rawMsg = msg.trim();

      const { dbojs, hydrate } = await import("../world/dbobjs.ts");
      const rawActor = actorId ? await dbojs.queryOne({ id: actorId }) : null;
      const actor = rawActor
        ? hydrate(rawActor)
        : { id: "#-1", flags: new Set<string>(), state: {}, contents: [] };

      const {
        parseIntent,
        checkInterceptors,
        runScriptNode,
        matchNativeCmd,
        matchSoftcodePattern,
        matchExits,
      } = await import("./pipeline-stages.ts");

      const { intentName, intent } = parseIntent(rawMsg, actorId);

      // 1. Check AOP interceptors
      const allowed = await checkInterceptors(actor.location, actorId, intent);
      if (!allowed) return;

      // 2. Run SCRIPT_NODE commands
      if (await runScriptNode(socketId, actorId, intentName)) return;

      // 3. Match native commands (addCmds)
      if (await matchNativeCmd(socketId, actorId, rawMsg, cmds)) return;

      // 4. Match dollar-patterns ($)
      if (await matchSoftcodePattern(socketId, actorId, rawMsg)) return;

      // 5. Match local exits
      if (await matchExits(socketId, actorId, rawMsg)) return;
    },
  });
}

let _defaultsLoaded = false;

/**
 * Load the built-in MUSH verbs. Idempotent — safe to call multiple times.
 * Calling this at startup ensures look/say/pose/etc. are registered.
 */
export async function loadDefaultCommands(): Promise<void> {
  if (_defaultsLoaded) return;
  _defaultsLoaded = true;

  ensureHandlersRegistered();

  await import("../verbs/look.ts");
  await import("../verbs/say.ts");
  await import("../verbs/home.ts");
  await import("../verbs/social.ts");
  await import("../verbs/manipulation.ts");
  await import("../verbs/admin-reload.ts");
  await import("../verbs/admin.ts");
  await import("../verbs/alias.ts");
  await import("../verbs/assert.ts");
  await import("../verbs/auth-cmds.ts");
  await import("../verbs/auth.ts");
  // Building commands moved to @ursamu/builder — load via builderPlugin.init()
  // Channel commands moved to @ursamu/channels — load via channelsPlugin.init()
  await import("../verbs/emit-exec.ts");
  await import("../verbs/emit.ts");
  await import("../verbs/exits.ts");
  await import("../verbs/locks.ts");
  await import("../verbs/messages.ts");
  await import("../verbs/queue-ps.ts");
  await import("../verbs/queue.ts");
  await import("../verbs/search.ts");
  await import("../verbs/set-flags.ts");
  await import("../verbs/softcode-tools-2.ts");
  await import("../verbs/softcode-tools-3.ts");
  await import("../verbs/softcode-tools-attrs.ts");
  await import("../verbs/softcode-tools.ts");
  await import("../verbs/tags.ts");
  await import("../verbs/world.ts");
  await import("../verbs/world-find.ts");
  await import("../verbs/world-info.ts");
  await import("../verbs/world-sweep.ts");
  await import("../verbs/js-eval.ts");
  await import("../verbs/avatar.ts");
  await import("../verbs/moniker.ts");
  await import("../verbs/softcode-trigger.ts");
  await import("../verbs/softcode-wait.ts");
  await import("../verbs/softcode-dolist.ts");
  await import("../verbs/softcode-switch.ts");
  await import("../verbs/softcode-flow.ts");
}
