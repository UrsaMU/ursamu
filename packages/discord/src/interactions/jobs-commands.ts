/**
 * Discord slash commands for jobs system: /jobs and /request.
 */

import { dbojs, cmds, evaluateLock, hydrate } from "@ursamu/mush";
import { clean, COLORS } from "../helpers.ts";
import { markdownToDiscord } from "../help-embed.ts";

const EPHEMERAL = 1 << 6;

function ephemeralResponse(embeds: any[]): Response {
  return Response.json({
    type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
    data: {
      flags: EPHEMERAL,
      embeds,
    },
  });
}

function errorResponse(text: string): Response {
  return ephemeralResponse([{
    color: COLORS.orange,
    title: "Error",
    description: text,
  }]);
}

/** Resolves the character object linked to a Discord user. */
async function getLinkedPlayer(discordUserId: string): Promise<any | null> {
  return await dbojs.queryOne({ "state.discordId": discordUserId });
}

/** Execute a MUSH command using the parser and return the clean text output. */
async function runMushCommand(player: any, cmdName: string, originalText: string, sw: string, arg: string): Promise<string> {
  const outputLines: string[] = [];
  const hydratedPlayer = hydrate(player);

  const cmd = cmds.find((c) => c.name.toLowerCase() === cmdName.toLowerCase());
  if (!cmd) {
    return `❌ *Command ${cmdName} not found.*`;
  }

  // Check the command lock
  if (!(await evaluateLock(cmd.lock || "", hydratedPlayer, hydratedPlayer))) {
    return "❌ *Permission denied.*";
  }

  let finalArgs = [sw || undefined, arg];
  const match = originalText.match(cmd.pattern) ?? 
                (originalText.replace(/^[@+]/, "").match(cmd.pattern));
  if (match) {
    finalArgs = match.slice(1);
  }

  const mockSDK = {
    me: hydratedPlayer,
    cmd: {
      name: cmdName,
      original: originalText,
      args: finalArgs,
      switches: sw ? [sw] : [],
    },
    send: (text: string) => {
      outputLines.push(text);
    },
    db: dbojs,
    util: {
      stripSubs: (s: string) => s.replace(/%c[a-zA-Z0-9]/gi, "").replace(/%[rnth]/g, ""),
    },
  };

  try {
    await (cmd.exec(mockSDK as any) as any);
  } catch (e: unknown) {
    console.error(`[discord] Slash exec failed for ${originalText}:`, e);
    return "❌ *Error executing command inside the game engine.*";
  }

  return markdownToDiscord(outputLines.join("\n")) || "❌ *Permission denied or invalid command switch.*";
}

/** Handle /jobs command */
export async function handleJobsSlash(discordUserId: string, options: any[]): Promise<Response> {
  const player = await getLinkedPlayer(discordUserId);
  if (!player) return errorResponse("❌ Your Discord account is not linked to any character. Use `@discord/register` inside the game first.");

  const bucketOpt = options.find((o) => o.name === "bucket");
  const bucketName = bucketOpt?.value ? String(bucketOpt.value).trim().toUpperCase() : "";

  const originalText = bucketName ? `+jobs/bucket ${bucketName}` : "+jobs";
  const charName = player.data?.name || player.name || "Unknown";

  const output = await runMushCommand(player, "+jobs", originalText, bucketName ? "bucket" : "", bucketName);

  return ephemeralResponse([{
    color: COLORS.teal,
    title: `Command: /jobs${bucketName ? ` ${bucketName}` : ""}`,
    description: output,
    footer: { text: `Executed as ${charName}` },
  }]);
}

/** Handle /request command */
export async function handleRequestSlash(discordUserId: string, options: any[]): Promise<Response> {
  const player = await getLinkedPlayer(discordUserId);
  if (!player) return errorResponse("❌ Your Discord account is not linked to any character. Use `@discord/register` inside the game first.");

  const inputOpt = options.find((o) => o.name === "input");
  const inputText = inputOpt?.value ? String(inputOpt.value).trim() : "";

  if (!inputText) return errorResponse("Usage: `/request <title>=<text>` or `/request <bucket>/<title>=<text>`");

  // Determine if it is inline bucket or default SPHERE
  let sw = "";
  let arg = inputText;
  const slash = inputText.indexOf("/");
  const eq = inputText.indexOf("=");
  
  if (slash !== -1 && eq !== -1 && slash < eq) {
    // Has inline bucket path (e.g. SUGGESTION/Title=Text)
    sw = "";
    arg = inputText;
  }

  const charName = player.data?.name || player.name || "Unknown";
  const output = await runMushCommand(player, "+request", `+request ${inputText}`, sw, arg);

  return ephemeralResponse([{
    color: COLORS.teal,
    title: "Command: /request",
    description: output,
    footer: { text: `Executed as ${charName}` },
  }]);
}

/** slash schemas for registration */
export const JOBS_COMMAND_JSON = {
  name: "jobs",
  description: "View active jobs (Private reply, staff only)",
  options: [
    {
      name: "bucket",
      description: "Optional bucket name to filter by (e.g. BUG, PLOT)",
      type: 3, // STRING
      required: false,
    },
  ],
};

export const REQUEST_COMMAND_JSON = {
  name: "request",
  description: "Submit or update a job request (Private reply)",
  options: [
    {
      name: "input",
      description: "Syntax: <title>=<text> or <bucket>/<title>=<text>",
      type: 3,
      required: true,
    },
  ],
};
