// Phase 1 — module load: registers all addCmd calls immediately
import "./commands.ts";

import type { IPlugin, SessionEvent } from "@ursamu/mush";
import {
  registerPluginRoute,
  gameHooks,
  dbojs,
  sessions,
  send,
} from "@ursamu/mush";
import { registerHelpDir } from "@ursamu/help-plugin";
import { getMyMail, runExpirySweep } from "./mailHelpers.ts";
import { mailRouteHandler } from "./routes.ts";
import { EXPIRY_SWEEP_MS } from "./mailDbo.ts";
import { getDraft } from "./draft.ts";
import {
  registerMailStaffNav,
  unregisterMailStaffNav,
} from "./staff-nav-bridge.ts";

export type { IMail } from "./mailDbo.ts";
export type { MailStats } from "./mailHelpers.ts";
export { getMailStats } from "./mailHelpers.ts";

// Phase 2 hooks

/**
 * On login: notify the player of unread mail and any unsent draft.
 * Uses the player's connected socket so the message arrives in the same
 * stream as the rest of the connect sequence.
 */
const onLogin = async (
  { actorId }: SessionEvent,
): Promise<void> => {
  const player = await dbojs.queryOne({ id: actorId });
  if (!player) return;

  const allSessions = sessions.list();
  const socks = allSessions
    .filter((s) =>
      (s as unknown as Record<string, unknown>).actorId ===
        actorId ||
      s.sessionId === actorId
    )
    .map((s) => s.socketId);
  if (socks.length === 0) return;

  const unread = (await getMyMail(actorId, "inbox"))
    .filter((m) => !m.read);
  if (unread.length > 0) {
    send(
      socks,
      `%ch%cyYou have ${unread.length} unread mail message` +
        `${unread.length === 1 ? "" : "s"}.%cn`,
    );
  }

  if (getDraft(player)) {
    send(
      socks,
      "%chMAIL:%cn You have an unsent draft. Use " +
        "'@mail/proof' to review or '@mail/abort' to discard.",
    );
  }
};

// Plugin

let _expirySweepTimer: ReturnType<typeof setInterval> | null =
  null;

const onEngineReady = (): void => {
  void registerMailStaffNav();
};

export const plugin: IPlugin = {
  name: "mail",
  version: "2.7.0",
  description:
    "In-game mail — drafts, folders, REST, and staff console.",
  dependencies: [
    { name: "help", version: ">=1.0.0" },
  ],

  init: () => {
    registerPluginRoute("/api/v1/mail", mailRouteHandler);
    try {
      registerHelpDir(
        new URL("../help", import.meta.url),
        "mail",
      );
    } catch (e: unknown) {
      console.warn("[mail] help dir registration skipped:", e);
    }
    gameHooks.on("player:login", onLogin);
    gameHooks.on("engine:ready", onEngineReady);
    _expirySweepTimer = setInterval(() => {
      runExpirySweep().catch((e: unknown) =>
        console.error("[mail] expiry sweep error:", e)
      );
    }, EXPIRY_SWEEP_MS);
    runExpirySweep().catch((e: unknown) =>
      console.error("[mail] startup sweep error:", e)
    );
    void registerMailStaffNav();
    console.log(
      "[mail] Plugin initialized — @mail + /api/v1/mail",
    );
    return true;
  },

  remove: () => {
    gameHooks.off("player:login", onLogin);
    gameHooks.off("engine:ready", onEngineReady);
    void unregisterMailStaffNav();
    if (_expirySweepTimer !== null) {
      clearInterval(_expirySweepTimer);
      _expirySweepTimer = null;
    }
    console.log("[mail] Plugin removed");
  },
};

export default plugin;
