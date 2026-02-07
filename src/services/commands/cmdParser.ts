import { MiddlewareStack } from "./middleware.ts";
import type { ICmd } from "../../@types/ICmd.ts";
import type { IDBOBJ } from "../../@types/IDBObj.ts";
import { send } from "../broadcast/index.ts";
import { dbojs } from "../Database/index.ts";
import { matchExits } from "./movement.ts";
import { matchChannel } from "./channels.ts";
import { Obj } from "../DBObjs/DBObjs.ts";
import { InterceptorService } from "../Intents/InterceptorService.ts";
import { intentRegistry } from "../Intents/IntentRegistry.ts";
import { sandboxService } from "../Sandbox/SandboxService.ts";
import { getAttribute } from "../../utils/getAttribute.ts";
import { evaluateLock } from "../../utils/evaluateLock.ts";
import type { IDBObj } from "../../@types/UrsamuSDK.ts";
import { SDKService, type SDKObject } from "../Sandbox/SDKService.ts";
import { target } from "../../utils/target.ts";

export const cmdParser = new MiddlewareStack();
export const cmds: ICmd[] = [];
export const txtFiles = new Map<string, string>();

export const systemAliases: Record<string, string> = {};

export async function loadSystemAliases() {
  try {
    for await (const dirEntry of Deno.readDir("./system/scripts")) {
      if (dirEntry.isFile && dirEntry.name.endsWith(".ts")) {
        try {
            const content = await Deno.readTextFile(`./system/scripts/${dirEntry.name}`);
            const match = content.match(/export\s+const\s+aliases\s*=\s*(\[.*?\])/);
            if (match) {
                // Safer than eval, but requires standard JSON syntax or simple string array
                // Since it's TS code, it might use single quotes.
                // Let's use a simple regex approach or JSON.parse if we enforce double quotes.
                // Given we control the scripts or user writes them, `JSON.parse` on a relaxed string might fail.
                // Let's do a simple eval-like parse or just use `Function` if trusted (it is local code).
                // Actually, `JSON.parse` with replacing ' with " might suffice for simple arrays.
                
                // We'll use a safer approach than eval by parsing the array string manual-ish or loose JSON.
                const rawArray = match[1];
                const cleanArray = rawArray.replace(/'/g, '"').replace(/,\s*\]/, "]");
                const aliases = JSON.parse(cleanArray);
                
                const scriptName = dirEntry.name.replace(".ts", "");
                aliases.forEach((alias: string) => {
                systemAliases[alias] = scriptName;
                });
            }
        } catch (e) {
             console.warn(`[CmdParser] Failed to parse aliases for ${dirEntry.name}:`, e);
        }
      }
    }
    console.log("[CmdParser] Loaded system aliases:", systemAliases);
  } catch (e) {
    console.warn("[CmdParser] Failed to load system aliases:", e);
  }
}

// Start loading aliases
loadSystemAliases();

export const addCmd = (...cmd: ICmd[]) => {
  cmds.push(...cmd);
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
  const aliasMap: Record<string, string> = {
    "l": "look",
    "ex": "examine",
    "i": "inventory",
    "inv": "inventory",
    "p": "page",
    "tel": "teleport",
    "teleport": "teleport",
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

  let scriptName = aliasMap[intentName] || intentName;
  let scriptArgs = intent.args;

  // Handle prefixes
  for (const [prefix, name] of Object.entries(prefixMap)) {
    if (msg.trim().startsWith(prefix)) {
        scriptName = name;
        scriptArgs = [msg.trim().slice(prefix.length).trim()];
        break;
    }
  }

  // Common MUX @ prefixes
  if (scriptName.startsWith("@") || scriptName.startsWith("+")) {
     scriptName = scriptName.slice(1);
  }

  // Attempt to load and run script if it exists in system/scripts
  try {
    const scriptPath = `./system/scripts/${scriptName}.ts`;
    const scriptInfo = await Deno.stat(scriptPath).catch(() => null);
    
    if (scriptInfo?.isFile) {
        const code = await Deno.readTextFile(scriptPath);
        
        // Update last command
        if (char) {
            char.data ||= {};
            char.data.lastCommand = Date.now();
            await dbojs.modify({ id: char.id }, "$set", char.dbobj);
        }

        // For system scripts, we want the raw arguments after the command name
        // to be available as the first argument in the SDK's cmd.args array.
        const rawArgs = msg.trim().slice(intentName.length).trim();
        const targetQuery = scriptArgs[0];
        const targetObj = targetQuery ? await target(char as unknown as IDBOBJ, targetQuery) : undefined;
        const room = char?.location ? await Obj.get(char.location) : null;

        await sandboxService.runScript(code, {
            id: char?.id || "#-1",
            me: char ? await SDKService.hydrate(char) : { id: "#-1", flags: new Set(), state: {} } as unknown as SDKObject,
            here: room ? await SDKService.hydrate(room, true) : undefined,
            target: targetObj ? await SDKService.hydrate(new Obj(targetObj)) : undefined,
            location: char?.location || "limbo",
            state: char?.data?.state as Record<string, unknown> || {},
            cmd: { name: scriptName, args: [rawArgs, ...scriptArgs] },
            socketId: ctx.socket.id
        });
        return;
    }
  } catch (e) {
    console.warn(`[CmdParser] System script execution failed for ${scriptName}:`, e);
  }

  // 4. Fallback to legacy hard-coded commands (only if any are loaded)
  if (cmds.length > 0) {
    const actor: IDBObj = {
      id: char?.id || "unknown",
      name: (char?.data?.name as string) || "Unknown",
      flags: new Set(char?.flags ? char.flags.split(" ") : []),
      location: char?.location || "limbo",
      state: (char?.data as Record<string, unknown>) || {},
      contents: []
    };

    console.log(`[CmdParser] Processing msg: "${msg}" with ${cmds.length} registered commands.`);
    for (const cmd of cmds) {
      const match = msg?.trim().match(cmd.pattern);
      if (await evaluateLock(cmd.lock || "", actor, actor)) {
        if (match) {
          if (char) {
            char.data ||= {};
            char.data.lastCommand = Date.now();
            await dbojs.modify({ id: char.id }, "$set", char.dbobj);
          }
          await (cmd.exec(ctx, match.slice(1)) as Promise<void>)?.catch((e: Error) => {
            console.error(e);
            send(
              [ctx.socket.id],
              `Uh oh! You've run into an error! please contact staff wit hthe following info!%r%r%chError:%cn ${e}`,
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

cmdParser.use(async (ctx, next) => {
  if (await matchChannel(ctx)) return;
  await next();
});

cmdParser.use(async (ctx, _next) => {
  if (ctx.socket.cid && ctx.msg?.trim()) {
    send([ctx.socket.id], "Huh? Type 'help' for help.", { error: true });
  }
  await Promise.resolve();
});
