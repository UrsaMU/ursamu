/**
 * @module dispatch-helpers
 *
 * Pure, stateless helpers used by the command dispatch pipeline.
 * No I/O, no DB access, no side-effects — safe to test without a live server.
 */
import type { Intent } from "../Intents/InterceptorService.ts";

/** Single-character shortcut prefixes → script name. */
export const PREFIX_MAP: Record<string, string> = {
  ":": "pose",
  ";": "pose",
  '"': "say",
  "'": "say",
  "&": "setattr",
};

/** Scripts that may run for unauthenticated (connect-screen) sockets. */
export const CONNECT_SCREEN = new Set(["connect", "create", "who", "quit"]);

/** Extract intent name and intent object from a raw input string. */
export function parseIntent(
  msg: string,
  actorId: string | undefined,
): { intentName: string; intent: Intent } {
  const parts = msg.trim().split(/\s+/);
  const intentName = parts[0].toLowerCase();
  return {
    intentName,
    intent: { name: intentName, actorId: actorId || "unknown", args: parts.slice(1) },
  };
}

/**
 * Resolve the canonical script name, args, switches, and prefix from raw input.
 * Handles @/+ sigil stripping, alias lookup, prefix shortcuts, and /switch extraction.
 */
export function resolveScriptName(
  msg: string,
  intentName: string,
  intent: Intent,
  aliases: Record<string, string>,
): { scriptName: string; scriptArgs: string[]; cmdSwitches: string[]; usedPrefix: string } {
  let scriptName = intentName;
  let scriptArgs = intent.args;
  let usedPrefix = "";

  // Single-char prefix shortcut (: ; " ' &) takes priority over everything else
  for (const [prefix, name] of Object.entries(PREFIX_MAP)) {
    if (msg.trim().startsWith(prefix)) {
      scriptName = name;
      usedPrefix = prefix;
      scriptArgs = [msg.trim().slice(prefix.length).trim()];
      break;
    }
  }

  // Strip @ or + sigil and resolve alias
  if (!usedPrefix) {
    const bare = (intentName.startsWith("@") || intentName.startsWith("+"))
      ? intentName.slice(1) : intentName;
    scriptName = aliases[bare] || bare;
  }

  // Strip sigil from the resolved script name
  if (scriptName.startsWith("@") || scriptName.startsWith("+")) {
    const bare = scriptName.slice(1);
    scriptName = aliases[bare] || bare;
  }

  // Extract /switches from the intent token
  let cmdSwitches: string[] = [];
  const baseLookup = (intentName.startsWith("@") || intentName.startsWith("+"))
    ? intentName.slice(1) : intentName;
  if (baseLookup.includes("/") && !scriptName.includes("/")) {
    cmdSwitches = baseLookup.slice(baseLookup.indexOf("/") + 1).split("/").filter(Boolean);
  }

  // Extract /switches embedded in the resolved script name
  if (scriptName.includes("/")) {
    const slashIdx = scriptName.indexOf("/");
    const base = scriptName.slice(0, slashIdx);
    if (aliases[base]) scriptName = aliases[base] + scriptName.slice(slashIdx);
    cmdSwitches = scriptName.slice(scriptName.indexOf("/") + 1).split("/").filter(Boolean);
    scriptName = scriptName.slice(0, scriptName.indexOf("/"));
  }

  return { scriptName, scriptArgs, cmdSwitches, usedPrefix };
}
