/**
 * Register application slash commands with Discord REST API.
 */

import type { IDiscordBotCredentials } from "./config.ts";
import { HELP_COMMAND_JSON } from "./interactions/help-command.ts";
import { JOBS_COMMAND_JSON, REQUEST_COMMAND_JSON } from "./interactions/jobs-commands.ts";
import { SCENES_COMMAND_JSON } from "./interactions/scenes-commands.ts";

const API = "https://discord.com/api/v10";

/**
 * PUT guild or global application commands.
 * Guild scope is preferred (instant); global can take ~1 hour.
 */
export async function registerSlashCommands(
  creds: IDiscordBotCredentials,
): Promise<{ ok: boolean; scope: string; detail: string }> {
  const body = JSON.stringify([HELP_COMMAND_JSON, JOBS_COMMAND_JSON, REQUEST_COMMAND_JSON, SCENES_COMMAND_JSON]);
  const path = creds.guildId
    ? `/applications/${creds.applicationId}/guilds/${creds.guildId}/commands`
    : `/applications/${creds.applicationId}/commands`;
  const scope = creds.guildId ? `guild:${creds.guildId}` : "global";

  try {
    const res = await fetch(`${API}${path}`, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${creds.botToken}`,
        "Content-Type": "application/json",
      },
      body,
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[discord] register commands failed: ${res.status} ${text}`);
      return { ok: false, scope, detail: `${res.status}: ${text.slice(0, 200)}` };
    }
    console.log(`[discord] Registered /help (${scope}).`);
    return { ok: true, scope, detail: "ok" };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[discord] register commands error:", msg);
    return { ok: false, scope, detail: msg };
  }
}
