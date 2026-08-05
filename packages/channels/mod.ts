/**
 * @module @ursamu/channels
 *
 * Channel system for UrsaMU — chat channels with aliases, history, and
 * admin tools.
 *
 * Consolidates the channel functionality from @ursamu/mush verbs and the
 * legacy channel-plugin into a single installable plugin.
 */

import { DBO, gameHooks, getConfig } from "@ursamu/mush";
import { addMiddleware, sessions } from "@ursamu/core";
import { registerHelpDir } from "@ursamu/help-plugin";
import type { IPlugin, SessionEvent } from "@ursamu/mush";
import type { IMiddlewareFn } from "@ursamu/core";

import { matchChannel } from "./src/middleware/matchChannel.ts";
import { joinChans } from "./src/middleware/joinChans.ts";
import { announcePresence } from "./src/announce.ts";
import type { IChannel } from "./src/types.ts";
import { registerPluginRoute } from "@ursamu/mush";
import { channelsRouteHandler } from "./src/routes.ts";
import {
  registerChannelsStaffNav,
  unregisterChannelsStaffNav,
} from "./src/staff-nav-bridge.ts";

/** JWT soft-reboot restore — telnet opens WS with reconnect=true. */
function isReauthSession(socketId?: string): boolean {
  if (!socketId) return false;
  const s = sessions.get(socketId) as
    | { meta?: Record<string, unknown> }
    | undefined;
  return s?.meta?.reconnect === true;
}

export * from "./src/commands/verbs.ts";
export { matchChannel } from "./src/middleware/matchChannel.ts";
export { joinChans } from "./src/middleware/joinChans.ts";
export { channelEvents } from "./src/channel-events.ts";
export {
  announcePresence,
  announceChannelMember,
  channelAnnounces,
} from "./src/announce.ts";
export type { IChannel, IChanEntry, IChanMessage } from "./src/types.ts";

type ChanDefault = {
  name: string;
  alias: string;
  lock?: string;
  announce?: boolean;
};

const onLogin = async ({
  actorId,
  socketId,
  reason,
}: SessionEvent): Promise<void> => {
  if (!socketId || !actorId) return;
  await joinChans(actorId, socketId).catch((e: unknown) =>
    console.error("[channels] joinChans error:", e)
  );
  // Fresh connect only. Skip JWT soft-reboot restore (reason and/or
  // session.meta.reconnect) — no Public "has connected" spam.
  if (reason === "reauth" || isReauthSession(socketId)) return;
  if (reason != null && reason !== "login") return;
  await announcePresence(actorId, "connect").catch((e: unknown) =>
    console.error("[channels] announce connect:", e)
  );
};

const onLogout = async ({
  actorId,
  reason,
}: SessionEvent): Promise<void> => {
  if (!actorId) return;
  // Main exiting for @restart — no disconnect spam.
  if (reason === "reboot" || reason === "reauth") return;
  await announcePresence(actorId, "disconnect").catch((e: unknown) =>
    console.error("[channels] announce disconnect:", e)
  );
};

const onReady = async (): Promise<void> => {
  const dbName = getConfig<string>("plugins.channels.db", "server.chans");
  const chans = new DBO<IChannel>(dbName);
  const defaults = getConfig<ChanDefault[]>(
    "plugins.channels.defaults",
  ) || [
    {
      name: "Public",
      alias: "pub",
      lock: "connected",
      announce: true,
    },
    {
      name: "Admin",
      alias: "ad",
      lock: "connected admin+",
      announce: false,
    },
  ];

  for (const def of defaults) {
    const id = def.name.toLowerCase();
    // Match by id or name — older engine seeds used id "pub" for Public.
    const existing =
      (await chans.queryOne({ id })) ||
      (await chans.queryOne({ name: def.name }));
    if (!existing) {
      await chans.create({
        id,
        name: def.name,
        header: `[${def.name.toUpperCase()}]`,
        alias: def.alias,
        lock: def.lock || "",
        hidden: false,
        owner: "",
        announce: def.announce === true,
      });
      console.log(`[channels] Seeded default channel: ${def.name}`);
      continue;
    }
    // Heal legacy rows (missing lock, wrong alias, old id "pub").
    const patch: Record<string, unknown> = {};
    if (!existing.alias) patch.alias = def.alias;
    if (existing.lock == null || existing.lock === "") {
      patch.lock = def.lock || "";
    }
    if (
      def.lock &&
      existing.lock &&
      existing.lock !== def.lock &&
      // Upgrade bare "admin+" → "connected admin+"
      !String(existing.lock).includes("connected")
    ) {
      patch.lock = def.lock;
    }
    // Apply announce from config when the field is still unset.
    if (
      def.announce === true &&
      existing.announce !== true &&
      existing.announce !== false
    ) {
      patch.announce = true;
    }
    if (Object.keys(patch).length) {
      await chans.modify({ id: existing.id }, "$set", patch);
      console.log(
        `[channels] Updated channel ${def.name}:`,
        patch,
      );
    }
  }
};

const channelMiddleware: IMiddlewareFn = async (ctx, next) => {
  if (await matchChannel(ctx)) return;
  await next();
};

const onStaffReady = (): void => {
  void registerChannelsStaffNav();
};

export const channelsPlugin: IPlugin = {
  name: "@ursamu/channels",
  version: "1.1.0",
  description:
    "Channel system: chat, aliases, history, staff REST/UI.",

  init: () => {
    import("./src/commands/verbs.ts");
    registerHelpDir(
      new URL("./help", import.meta.url),
      "channels",
    );
    registerPluginRoute(
      "/api/v1/channels",
      channelsRouteHandler,
    );
    gameHooks.on("player:login", onLogin);
    gameHooks.on("player:logout", onLogout);
    gameHooks.on("engine:ready", onReady);
    gameHooks.on("engine:ready", onStaffReady);
    addMiddleware(channelMiddleware);
    void registerChannelsStaffNav();
    return true;
  },

  remove: () => {
    gameHooks.off("player:login", onLogin);
    gameHooks.off("player:logout", onLogout);
    gameHooks.off("engine:ready", onReady);
    gameHooks.off("engine:ready", onStaffReady);
    void unregisterChannelsStaffNav();
    // addMiddleware is not reversible — restart required.
  },
};

export { channelsPlugin as plugin, channelsPlugin as default };
