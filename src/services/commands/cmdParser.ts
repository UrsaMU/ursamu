/**
 * @module cmdParser
 *
 * Command registry and dispatch pipeline for UrsaMU.
 *
 * The dispatch order is:
 *   1. checkInterceptors   — AOP script blocks on room objects
 *   2. runScriptNode       — SCRIPT_NODE personal command attributes
 *   3. matchNativeCmd      — addCmd() registrations
 *   4. matchSandboxScript  — game-project overrides / plugin scripts
 *   5. matchSoftcodePattern — $-pattern softcode attributes
 *   6. matchExits          — room exit names
 *   7. "Huh?"              — unrecognised input fallback
 *
 * Plugin middleware is prepended via registerCmdMiddleware() and runs
 * before all stages above.
 */
import { MiddlewareStack } from "./middleware.ts";
import type { ICmd } from "../../@types/ICmd.ts";
import { send } from "../broadcast/index.ts";
import { Obj } from "../DBObjs/DBObjs.ts";
import { matchExits } from "./movement.ts";
import { parseIntent } from "./dispatch-helpers.ts";
import {
  checkInterceptors,
  runScriptNode,
  matchNativeCmd,
  matchSandboxScript,
  matchSoftcodePattern,
} from "./pipeline-stages.ts";

// ---------------------------------------------------------------------------
// Script lookup
// ---------------------------------------------------------------------------

/**
 * Read a game-project override or plugin-registered script.
 * Engine system scripts are native commands — this only handles
 * local ./system/scripts/ overrides and plugin-registered scripts.
 */
async function readLocalOrPluginScript(name: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(`./system/scripts/${name}.ts`);
  } catch { /* no local copy */ }

  const pluginScript = _pluginScripts.get(name);
  return pluginScript ?? null;
}

// ---------------------------------------------------------------------------
// Registry state
// ---------------------------------------------------------------------------

export const cmdParser: MiddlewareStack = new MiddlewareStack();
export const cmds: ICmd[] = [];
export const txtFiles = new Map<string, string>();
export const systemAliases: Record<string, string> = {};

/** Plugin-registered scripts — keyed by script name (no .ts extension). */
const _pluginScripts = new Map<string, string>();

/**
 * Register a script provided by a plugin. Plugin scripts take priority over
 * engine-bundled scripts but are overridden by local ./system/scripts/ copies.
 * Aliases declared via `export const aliases = [...]` in the content are
 * parsed and registered automatically.
 */
export function registerScript(name: string, content: string): void {
  _pluginScripts.set(name, content);
  parseAliasesFromContent(content, name);
}

function parseAliasesFromContent(content: string, scriptName: string) {
  const match = content.match(/export\s+const\s+aliases\s*=\s*(\[.*?\])/);
  if (!match) return;
  try {
    const cleanArray = match[1].replace(/'/g, '"').replace(/,\s*\]/, "]");
    const aliases = JSON.parse(cleanArray);
    aliases.forEach((alias: string) => { systemAliases[alias] = scriptName; });
  } catch (e) {
    console.warn(`[CmdParser] Failed to parse aliases for ${scriptName}:`, e);
  }
}

/** Load aliases from ./system/scripts/ and the plugin registry. */
export async function loadSystemAliases() {
  try {
    for await (const entry of Deno.readDir("./system/scripts")) {
      if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
      const name = entry.name.replace(".ts", "");
      try {
        const content = await Deno.readTextFile(`./system/scripts/${entry.name}`);
        parseAliasesFromContent(content, name);
      } catch (e) {
        console.warn(`[CmdParser] Failed to parse aliases for ${entry.name}:`, e);
      }
    }
  } catch { /* ./system/scripts/ not present — fine */ }
}

// Lazy-loaded on first dispatch to avoid readTextFile at module load time.
let _aliasesReady: Promise<void> | null = null;
function ensureAliasesLoaded(): Promise<void> {
  if (!_aliasesReady) _aliasesReady = loadSystemAliases();
  return _aliasesReady;
}

/**
 * Register one or more commands with the game's command parser.
 * Commands are matched in registration order; the first match wins.
 */
export const addCmd = (...cmd: ICmd[]): void => { cmds.push(...cmd); };

/** Clear all registered commands (used by @reload). */
export const clearCmds = (): void => { cmds.length = 0; };

/**
 * Prepend a middleware function to the command pipeline.
 * Plugin middleware runs before all built-in dispatch stages.
 *
 * @example
 * ```ts
 * import { registerCmdMiddleware } from "jsr:@ursamu/ursamu";
 * registerCmdMiddleware(async (ctx, next) => {
 *   if (await matchChannel(ctx)) return;
 *   await next();
 * });
 * ```
 */
export const registerCmdMiddleware = (
  fn: Parameters<typeof cmdParser.use>[0],
): void => { cmdParser.prepend(fn); };

// ---------------------------------------------------------------------------
// Dispatch pipeline
// ---------------------------------------------------------------------------

cmdParser.use(async (ctx, next) => {
  const { msg } = ctx;
  if (!msg) return next();

  const char = await Obj.get(ctx.socket.cid);
  const { intentName, intent } = parseIntent(msg, ctx.socket.cid);
  const room = char?.location ? await Obj.get(char.location) : null;

  if (!await checkInterceptors(room, intent)) return;
  if (await runScriptNode(ctx, char, room, intentName, intent)) return;

  await ensureAliasesLoaded();

  if (await matchNativeCmd(ctx, char, msg, cmds)) return;
  if (await matchSandboxScript(ctx, char, room, msg, intentName, intent, systemAliases, readLocalOrPluginScript)) return;

  await next();
});

cmdParser.use(async (ctx, next) => {
  if (await matchSoftcodePattern(ctx)) return;
  await next();
});

cmdParser.use(async (ctx, next) => {
  if (await matchExits(ctx)) return;
  await next();
});

cmdParser.use(async (ctx) => {
  if (ctx.socket.cid && ctx.msg?.trim()) {
    send([ctx.socket.id], "Huh? Type 'help' for help.", { error: true });
  }
});
