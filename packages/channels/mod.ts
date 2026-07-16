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
import { addMiddleware } from "@ursamu/core";
import { registerHelpDir } from "@ursamu/help-plugin";
import type { IPlugin, SessionEvent } from "@ursamu/mush";
import type { IMiddlewareFn } from "@ursamu/core";

import { matchChannel } from "./src/middleware/matchChannel.ts";
import { joinChans } from "./src/middleware/joinChans.ts";
import type { IChannel } from "./src/types.ts";

export * from "./src/commands/verbs.ts";
export { matchChannel } from "./src/middleware/matchChannel.ts";
export { joinChans } from "./src/middleware/joinChans.ts";
export { channelEvents } from "./src/channel-events.ts";
export type { IChannel, IChanEntry, IChanMessage } from "./src/types.ts";

const onLogin = async ({
  actorId,
  socketId,
}: SessionEvent): Promise<void> => {
  if (!socketId || !actorId) return;
  await joinChans(actorId, socketId).catch((e: unknown) =>
    console.error("[channels] joinChans error:", e)
  );
};

const onReady = async (): Promise<void> => {
  const dbName = getConfig<string>("plugins.channels.db", "server.chans");
  const chans = new DBO<IChannel>(dbName);
  const defaults = getConfig<Array<{
    name: string;
    alias: string;
    lock?: string;
  }>>("plugins.channels.defaults") || [
    { name: "Public", alias: "pub", lock: "connected" },
    { name: "Admin", alias: "ad", lock: "connected admin+" },
  ];

  for (const def of defaults) {
    const id = def.name.toLowerCase();
    const existing = await chans.queryOne({ id });
    if (!existing) {
      await chans.create({
        id,
        name: def.name,
        header: `[${def.name.toUpperCase()}]`,
        alias: def.alias,
        lock: def.lock || "",
        hidden: false,
        owner: "",
      });
      console.log(`[channels] Seeded default channel: ${def.name}`);
    }
  }
};

const channelMiddleware: IMiddlewareFn = async (ctx, next) => {
  if (await matchChannel(ctx)) return;
  await next();
};

export const channelsPlugin: IPlugin = {
  name: "@ursamu/channels",
  version: "0.1.0",
  description:
    "Channel system — chat channels with aliases, history, and admin tools.",

  init: () => {
    import("./src/commands/verbs.ts");
    registerHelpDir(
      new URL("./help", import.meta.url).pathname,
      "channels",
    );
    gameHooks.on("player:login", onLogin);
    gameHooks.on("engine:ready", onReady);
    addMiddleware(channelMiddleware);
    return true;
  },

  remove: () => {
    gameHooks.off("player:login", onLogin);
    gameHooks.off("engine:ready", onReady);
    // addMiddleware is not reversible — restart required to fully remove.
  },
};

export { channelsPlugin as plugin, channelsPlugin as default };
