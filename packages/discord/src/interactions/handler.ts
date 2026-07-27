/**
 * Discord Interactions HTTP dispatcher.
 */

import { getBotCredentials } from "../config.ts";
import {
  readSignatureHeaders,
  verifyDiscordSignature,
} from "./verify.ts";
import {
  buildHelpAutocomplete,
  buildHelpEmbeds,
} from "./help-command.ts";
import {
  deferredEphemeralResponse,
  followUpEphemeral,
} from "./respond.ts";

// deno-lint-ignore no-explicit-any
type Interaction = Record<string, any>;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/**
 * Handle POST /api/v1/discord/interactions
 * Must verify signature against raw body before JSON parse.
 */
export async function handleInteraction(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const creds = getBotCredentials();
  if (!creds) {
    console.error(
      "[discord] Interactions: missing DISCORD_* env credentials",
    );
    return json({ error: "Bot not configured" }, 503);
  }

  const headers = readSignatureHeaders(req);
  if (!headers) return json({ error: "Missing signature" }, 401);

  const body = await req.text();
  const ok = verifyDiscordSignature(
    creds.publicKey,
    headers.signature,
    headers.timestamp,
    body,
  );
  if (!ok) return json({ error: "Invalid signature" }, 401);

  let interaction: Interaction;
  try {
    interaction = JSON.parse(body);
  } catch (_e: unknown) {
    return json({ error: "Invalid JSON" }, 400);
  }

  // type 1 PING — must be instant
  if (interaction.type === 1) {
    return json({ type: 1 });
  }

  const appId = String(interaction.application_id ?? "");
  const iToken = String(interaction.token ?? "");

  // type 2 APPLICATION_COMMAND
  if (interaction.type === 2) {
    const name = interaction.data?.name as string | undefined;
    const options =
      (interaction.data?.options as Array<
        { name: string; value?: string }
      >) ?? [];

    // /help can scan 200+ topics — defer within 3s, fill later.
    if (name === "help") {
      followUpEphemeral(appId, iToken, async () => {
        const embeds = await buildHelpEmbeds(options);
        return { embeds };
      });
      return deferredEphemeralResponse();
    }

    const discordUserId = String(
      interaction.member?.user?.id ||
        interaction.user?.id ||
        "",
    );

    if (name === "jobs") {
      const { handleJobsSlash } = await import("./jobs-commands.ts");
      return await handleJobsSlash(discordUserId, options);
    }
    if (name === "request") {
      const { handleRequestSlash } = await import("./jobs-commands.ts");
      return await handleRequestSlash(discordUserId, options);
    }
    if (name === "scenes") {
      const { handleScenesSlash } = await import("./scenes-commands.ts");
      return await handleScenesSlash(
        discordUserId,
        options,
        String(interaction.channel_id ?? ""),
        creds.botToken,
      );
    }

    return ephemeralText(`Unknown command: \`${name ?? "?"}\``);
  }

  // type 4 APPLICATION_COMMAND_AUTOCOMPLETE — cannot defer; keep fast
  if (interaction.type === 4) {
    const name = interaction.data?.name as string | undefined;
    if (name === "help") {
      const options =
        (interaction.data?.options as Array<
          { name: string; value?: string; focused?: boolean }
        >) ?? [];
      const focused = options.find((o) => o.focused) ??
        options.find((o) => o.name === "topic");
      try {
        return Response.json(
          await buildHelpAutocomplete(
            focused
              ? {
                name: focused.name,
                value: String(focused.value ?? ""),
              }
              : undefined,
          ),
        );
      } catch (e: unknown) {
        console.error("[discord] /help autocomplete failed:", e);
        return json({ type: 8, data: { choices: [] } });
      }
    }
    return json({ type: 8, data: { choices: [] } });
  }

  return json({ error: "Unhandled interaction type" }, 400);
}

function ephemeralText(content: string): Response {
  return json({
    type: 4,
    data: { flags: 64, content },
  });
}
