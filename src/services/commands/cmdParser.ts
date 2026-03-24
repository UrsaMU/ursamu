import { MiddlewareStack } from "./middleware.ts";
import type { ICmd } from "../../@types/ICmd.ts";
import type { IDBOBJ } from "../../@types/IDBObj.ts";
import { send } from "../broadcast/index.ts";
import { dbojs } from "../Database/index.ts";
import { matchExits } from "./movement.ts";
import { Obj } from "../DBObjs/DBObjs.ts";
import { InterceptorService } from "../Intents/InterceptorService.ts";
import { intentRegistry } from "../Intents/IntentRegistry.ts";
import { sandboxService } from "../Sandbox/SandboxService.ts";
import { getAttribute } from "../../utils/getAttribute.ts";
import { evaluateLock, hydrate } from "../../utils/evaluateLock.ts";
import type { IDBObj } from "../../@types/UrsamuSDK.ts";
import { SDKService, type SDKObject } from "../Sandbox/SDKService.ts";
import { target } from "../../utils/target.ts";
import { createNativeSDK } from "../SDK/index.ts";
import { fromFileUrl } from "@std/path";

// Base URL for the engine's bundled system scripts (3 dirs up from this file: src/services/commands/ -> root)
const ENGINE_SCRIPTS_URL = new URL("../../../system/scripts/", import.meta.url);

/** Read a script file, checking local override → plugin registry → engine built-ins. */
async function readEngineScript(name: string): Promise<string | null> {
  // 1. Local game-project override (./system/scripts/<name>)
  try {
    return await Deno.readTextFile(`./system/scripts/${name}`);
  } catch { /* no local copy */ }

  // 2. Plugin registry — registered via registerScript() in plugin init()
  const scriptKey = name.replace(/\.ts$/, "");
  const pluginScript = _pluginScripts.get(scriptKey);
  if (pluginScript !== undefined) return pluginScript;

  // 3. Engine's bundled copy (works for both local dev [file://] and JSR [https://])
  const url = new URL(name, ENGINE_SCRIPTS_URL);
  try {
    if (url.protocol === "file:") {
      return await Deno.readTextFile(fromFileUrl(url));
    }
    const res = await fetch(url.toString());
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

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
 *
 * @param name    Script name without .ts extension (e.g. "dig")
 * @param content Full TypeScript source of the script
 */
export function registerScript(name: string, content: string): void {
  _pluginScripts.set(name, content);
  parseAliasesFromContent(content, name);
}

/** Names of all engine system scripts — used for alias scanning when no local system/scripts dir exists.
 *  Channel scripts (chancreate, chandestroy, channels, chanset) are provided by channel-plugin, not the engine. */
const ENGINE_SCRIPT_NAMES = [
  "admin","alias","connect","create",
  "doing","drop","emit","find","flags","format","get","give","help","home","inventory",
  "look","mail","mailadd","moniker","motd","page","pemit","pose","quit","remit",
  "say","score","search","stats","teleport","think","trigger","update","who",
  "tel","forceCmd","sweep","entrances",
];

function parseAliasesFromContent(content: string, scriptName: string) {
  const match = content.match(/export\s+const\s+aliases\s*=\s*(\[.*?\])/);
  if (!match) return;
  try {
    const rawArray = match[1];
    const cleanArray = rawArray.replace(/'/g, '"').replace(/,\s*\]/, "]");
    const aliases = JSON.parse(cleanArray);
    aliases.forEach((alias: string) => { systemAliases[alias] = scriptName; });
  } catch (e) {
    console.warn(`[CmdParser] Failed to parse aliases for ${scriptName}:`, e);
  }
}

export async function loadSystemAliases() {
  // Try the game project's local system/scripts directory first
  let localDirExists = false;
  try {
    for await (const dirEntry of Deno.readDir("./system/scripts")) {
      if (dirEntry.isFile && dirEntry.name.endsWith(".ts")) {
        localDirExists = true;
        try {
          const content = await Deno.readTextFile(`./system/scripts/${dirEntry.name}`);
          await parseAliasesFromContent(content, dirEntry.name.replace(".ts", ""));
        } catch (e) {
          console.warn(`[CmdParser] Failed to parse aliases for ${dirEntry.name}:`, e);
        }
      }
    }
  } catch { /* local dir not present — fall through to engine scripts */ }

  if (!localDirExists) {
    // Fall back to the engine's bundled scripts
    for (const name of ENGINE_SCRIPT_NAMES) {
      const content = await readEngineScript(`${name}.ts`);
      if (content) await parseAliasesFromContent(content, name);
    }
  }
}

// Start loading aliases
loadSystemAliases();

/**
 * Register one or more commands with the game's command parser.
 *
 * Commands are matched in registration order. The first command whose
 * `pattern` matches the player's input wins.
 *
 * @param cmd - One or more command descriptors (`ICmd`) to register.
 */
export const addCmd = (...cmd: ICmd[]): void => {
  cmds.push(...cmd);
};

/** Clear all registered legacy commands (used by @reload commands). */
export const clearCmds = (): void => {
  cmds.length = 0;
};

/**
 * Inject a middleware function into the command pipeline.
 *
 * Use this in your plugin's `init()` to add custom command interceptors,
 * such as channel alias dispatch or softcode triggers.
 *
 * @example
 * ```ts
 * import { registerCmdMiddleware } from "jsr:@ursamu/ursamu";
 *
 * registerCmdMiddleware(async (ctx, next) => {
 *   if (await matchChannel(ctx)) return;
 *   await next();
 * });
 * ```
 */
export const registerCmdMiddleware = (
  fn: Parameters<typeof cmdParser.use>[0]
): void => {
  cmdParser.use(fn);
};

cmdParser.use(async (ctx, next) => {
  const char = await Obj.get(ctx.socket.cid);
  const { msg } = ctx;
  if (!msg) return await next();

  // 1. Phase 3: Interceptor Logic (AOP)
  const room = char?.location ? await Obj.get(char.location) : null;
  const candidates = [];
  if (room) {
    // Collect scripts from room and its contents
    const contents = await dbojs.query({ location: room.id });
    for (const item of [room, ...contents]) {
      const it = item as unknown as IDBOBJ;
      const scriptAttr = await getAttribute(it, "script");
      if (scriptAttr?.value) {
        candidates.push({
          id: it.id,
          script: scriptAttr.value,
          state: it.data?.state as Record<string, unknown> || {}
        });
      }
    }
  }

  // Determine intent
  const parts = msg.trim().split(/\s+/);
  const intentName = parts[0].toLowerCase();
  
  // Check if intent is enabled in registry
  const _intentDef = intentRegistry.getIntent(intentName);
  const intent = {
    name: intentName,
    actorId: ctx.socket.cid || "unknown",
    args: parts.slice(1)
  };

  const allowed = await InterceptorService.intercept(intent, candidates);
  if (!allowed) return; // Halted by script

  // 2. Phase 5: SCRIPT_NODE bypass
  if (char?.flags.includes("SCRIPT_NODE")) {
     // If it's a script node, we check if we have a script for this intent
     const scriptAttr = await getAttribute(char as unknown as IDBOBJ, `cmd:${intentName}`);
      if (scriptAttr?.value) {
         const targetQuery = intent.args[0];
         const targetObj = targetQuery ? await target(char as unknown as IDBOBJ, targetQuery) : undefined;
         
         await sandboxService.runScript(scriptAttr.value, {
             id: char.id,
             me: await SDKService.hydrate(char),
             here: room ? await SDKService.hydrate(room, true) : undefined,
             target: targetObj ? await SDKService.hydrate(new Obj(targetObj)) : undefined,
             location: char.location || "limbo",
             state: char.data?.state as Record<string, unknown> || {},
             socketId: ctx.socket.id
         });
         return;
      }
  }

  // 3. Fallback to system scripts in system/scripts/
  // Connect-screen commands that system scripts may handle for unauthenticated users
  const connectScreenScripts = new Set(["connect", "create", "who", "help", "quit"]);

  const aliasMap: Record<string, string> = {
    "l": "look",
    "ex": "examine",
    "i": "inventory",
    "inv": "inventory",
    "p": "page",
    "tel": "teleport",
    "teleport": "teleport",
    "co": "connect",
    ...systemAliases
  };

  const prefixMap: Record<string, string> = {
    ":": "pose",
    ";": "pose",
    '"': "say",
    "'": "say",
    "-": "mailadd",
    "~": "mailadd",
  };

  // Strip @ / + before alias lookup so "@desc" resolves via the same alias as "desc"
  const lookupName = (intentName.startsWith("@") || intentName.startsWith("+"))
    ? intentName.slice(1)
    : intentName;

  let scriptName = aliasMap[lookupName] || lookupName;
  let scriptArgs = intent.args;

  // Handle prefixes
  let usedPrefix = "";
  for (const [prefix, name] of Object.entries(prefixMap)) {
    if (msg.trim().startsWith(prefix)) {
        scriptName = name;
        usedPrefix = prefix;
        scriptArgs = [msg.trim().slice(prefix.length).trim()];
        break;
    }
  }

  // Common MUX @ prefixes
  if (scriptName.startsWith("@") || scriptName.startsWith("+")) {
     scriptName = scriptName.slice(1);
     // Re-check alias map after stripping prefix (e.g. @desc → desc → describe)
     if (aliasMap[scriptName]) {
       scriptName = aliasMap[scriptName];
     }
  }


  // Parse switches from command name (e.g., "bbpost/edit" → name="bbpost", switches=["edit"])
  // Also handle compound aliases (e.g., "mail/delete" aliased to "mail" — extract "delete" as switch)
  let cmdSwitches: string[] = [];

  // Check if the current scriptName was resolved from a compound alias (e.g., "mail/delete" → "mail")
  // In that case, find the original lookupName to extract the switch
  const originalLookup = (intentName.startsWith("@") || intentName.startsWith("+"))
    ? intentName.slice(1) : intentName;
  if (originalLookup.includes("/") && !scriptName.includes("/")) {
    // The alias consumed the switch — extract it from the original
    cmdSwitches = originalLookup.slice(originalLookup.indexOf("/") + 1).split("/").filter(Boolean);
  }

  if (scriptName.includes("/")) {
    const slashIdx = scriptName.indexOf("/");
    // Re-check alias map for the base name before "/" (e.g. channel/join → channels/join)
    const baseName = scriptName.slice(0, slashIdx);
    if (aliasMap[baseName]) {
      scriptName = aliasMap[baseName] + scriptName.slice(slashIdx);
    }
    cmdSwitches = scriptName.slice(scriptName.indexOf("/") + 1).split("/").filter(Boolean);
    scriptName = scriptName.slice(0, scriptName.indexOf("/"));
  }

  // Attempt to load and run script — checks game project override then engine's built-in copy
  // Skip system scripts for unauthenticated users unless it's a connect-screen command
  try {
    if (!ctx.socket.cid && !connectScreenScripts.has(scriptName)) {
      // Fall through to legacy commands (e.g. character creation via "create")
      throw { skip: true };
    }
    const code = await readEngineScript(`${scriptName}.ts`);

    if (code && (char || connectScreenScripts.has(scriptName))) {
        
        // Update last command
        if (char) {
            char.data ||= {};
            char.data.lastCommand = Date.now();
            await dbojs.modify({ id: char.id }, "$set", char.dbobj);
        }

        // For system scripts, we want the raw arguments after the command name
        // to be available as the first argument in the SDK's cmd.args array.
        // For prefix-mapped commands (like - → mailadd), use the prefix-extracted args
        // since intentName is the first word, not just the prefix character.
        const isPrefixCmd = Object.keys(prefixMap).some(p => msg.trim().startsWith(p) && scriptName === prefixMap[p]);
        const rawArgs = isPrefixCmd ? (scriptArgs[0] || "") : msg.trim().slice(intentName.length).trim();
        const targetQuery = scriptArgs[0];
        const targetObj = (targetQuery && char) ? await target(char as unknown as IDBOBJ, targetQuery) : undefined;
        const room = char?.location ? await Obj.get(char.location) : null;

        await sandboxService.runScript(code, {
            id: char?.id || "#-1",
            me: char ? await SDKService.hydrate(char) : { id: "#-1", flags: new Set(), state: {} } as unknown as SDKObject,
            here: room ? await SDKService.hydrate(room, true) : undefined,
            target: targetObj ? await SDKService.hydrate(new Obj(targetObj)) : undefined,
            location: char?.location || "limbo",
            state: char?.data?.state as Record<string, unknown> || {},
            cmd: { name: usedPrefix || scriptName, original: msg.trim(), args: [rawArgs], switches: cmdSwitches.length ? cmdSwitches : undefined },
            socketId: ctx.socket.id
        });
        return;
    }
  } catch (e: unknown) {
    if (!(e && typeof e === "object" && "skip" in e)) {
      console.warn(`[CmdParser] System script execution failed for ${scriptName}:`, e);
    }
  }

  // 4. Fallback to legacy hard-coded commands (only if any are loaded)
  if (cmds.length > 0) {
    const actor: IDBObj = char
      ? hydrate(char as unknown as Parameters<typeof hydrate>[0])
      : {
          id: "unknown",
          flags: new Set<string>(),
          state: {},
          contents: [],
        };

    for (const cmd of cmds) {
      const match = msg?.trim().match(cmd.pattern);
      if (await evaluateLock(cmd.lock || "", actor, actor)) {
        if (match) {
          if (char) {
            char.data ||= {};
            char.data.lastCommand = Date.now();
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
              { error: true }
            );
          });
          return;
        }
      }
    }
  }
  await next();
});

cmdParser.use(async (ctx, next) => {
  if (await matchExits(ctx)) return;
  await next();
});

cmdParser.use(async (ctx, _next) => {
  if (ctx.socket.cid && ctx.msg?.trim()) {
    send([ctx.socket.id], "Huh? Type 'help' for help.", { error: true });
  }
  await Promise.resolve();
});
