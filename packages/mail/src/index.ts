// Phase 1 — module load: registers all addCmd calls immediately
import "./commands.ts";

import type { IPlugin, SessionEvent } from "@ursamu/mush";
import { registerPluginRoute, gameHooks, dbojs } from "@ursamu/mush";
import { sessions, send } from "@ursamu/core";
import { getMyMail, runExpirySweep } from "./mailHelpers.ts";
import { mailRouteHandler } from "./routes.ts";
import { EXPIRY_SWEEP_MS } from "./mailDbo.ts";

export type { IMail } from "./mailDbo.ts";

// ─── Phase 2 hooks ────────────────────────────────────────────────────────────

/**
 * On login: notify the player of unread mail and any unsent draft.
 * Uses the player's connected socket so the message arrives in the same
 * stream as the rest of the connect sequence.
 */
const onLogin = async ({ actorId }: SessionEvent): Promise<void> => {
  const player = await dbojs.queryOne({ id: actorId });
  if (!player) return;

  // Find sockets connected for this actor
  const allSessions = sessions.list();
  const socks = allSessions
    .filter((s) => (s as unknown as Record<string, unknown>).actorId === actorId || s.sessionId === actorId)
    .map((s) => s.socketId);
  if (socks.length === 0) return;

  const unread = (await getMyMail(actorId, "inbox")).filter(m => !m.read);
  if (unread.length > 0) {
    send(socks, `%ch%cyYou have ${unread.length} unread mail message${unread.length === 1 ? "" : "s"}.%cn`);
  }

  if (player.data?.tempMail) {
    send(socks, "%chMAIL:%cn You have an unsent draft. Use '@mail/proof' to review or '@mail/abort' to discard.");
  }
};

// ─── plugin ───────────────────────────────────────────────────────────────────

let _expirySweepTimer: ReturnType<typeof setInterval> | null = null;

export const plugin: IPlugin = {
  name: "mail",
  version: "1.0.0",
  description: "In-game mail system with drafts, folders, attachments, quota, and expiry.",

  init: () => {
    registerPluginRoute("/api/v1/mail", mailRouteHandler);
    gameHooks.on("player:login", onLogin);
    _expirySweepTimer = setInterval(() => {
      runExpirySweep().catch((e: unknown) => console.error("[mail] expiry sweep error:", e));
    }, EXPIRY_SWEEP_MS);
    // Run an initial sweep on startup
    runExpirySweep().catch((e: unknown) => console.error("[mail] startup sweep error:", e));
    console.log("[mail] Plugin initialized — @mail commands active, /api/v1/mail routes registered");
    return true;
  },

  remove: () => {
    gameHooks.off("player:login", onLogin);
    if (_expirySweepTimer !== null) {
      clearInterval(_expirySweepTimer);
      _expirySweepTimer = null;
    }
    // Note: REST route /api/v1/mail persists until server restart
    console.log("[mail] Plugin removed");
  },
};

export default plugin;
