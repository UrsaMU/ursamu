/**
 * @module @ursamu/channels
 *
 * Channel system for UrsaMU — chat channels with aliases, history, and admin tools.
 *
 * Consolidates the channel functionality from @ursamu/mush verbs and the
 * legacy channel-plugin into a single installable plugin.
 */

import { gameHooks } from "@ursamu/mush";
import { addMiddleware } from "@ursamu/core";
import type { IPlugin, SessionEvent } from "@ursamu/mush";
import type { IMiddlewareFn } from "@ursamu/core";

import { matchChannel } from "./src/middleware/matchChannel.ts";
import { joinChans } from "./src/middleware/joinChans.ts";

export * from "./src/commands/verbs.ts";
export { matchChannel } from "./src/middleware/matchChannel.ts";
export { joinChans } from "./src/middleware/joinChans.ts";
export type { IChannel, IChanEntry, IChanMessage } from "./src/types.ts";

const onLogin = async ({ actorId, socketId }: SessionEvent): Promise<void> => {
  if (!socketId || !actorId) return;
  await joinChans(actorId, socketId).catch(
    (e: unknown) => console.error("[channels] joinChans error:", e),
  );
};

const channelMiddleware: IMiddlewareFn = async (ctx, next) => {
  if (await matchChannel(ctx)) return;
  await next();
};

export const channelsPlugin: IPlugin = {
  name: "@ursamu/channels",
  version: "0.1.0",
  description: "Channel system — chat channels with aliases, history, and admin tools.",

  init: () => {
    import("./src/commands/verbs.ts");
    gameHooks.on("player:login", onLogin);
    addMiddleware(channelMiddleware);
    return true;
  },

  remove: () => {
    gameHooks.off("player:login", onLogin);
    // addMiddleware is not reversible — restart required to fully remove.
  },
};
