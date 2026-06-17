import "./commands/reading.ts";
import "./commands/writing.ts";
import "./commands/social.ts";
import { registerPluginRoute } from "@ursamu/mush";
import type { IPlugin } from "@ursamu/mush";
import { wikiRouteHandler } from "./router.ts";
import { wikiHooks } from "./hooks.ts";
import { maybeFireWebhook } from "./webhook.ts";
import { subscriptions } from "./db.ts";
import { send } from "@ursamu/mush";
import type { WikiPageRef } from "./hooks.ts";

// ─── hook handlers (named references — required for remove()) ─────────────────

const onCreated = async (page: WikiPageRef): Promise<void> => {
  await maybeFireWebhook("wiki:created", page);
};

const onEdited = async (page: WikiPageRef): Promise<void> => {
  await maybeFireWebhook("wiki:edited", page);
  // Notify watchers
  const subs = await subscriptions.find({ path: page.path });
  for (const s of subs) {
    const title = (page.meta.title as string) || page.path;
    send([s.playerId], `%ch>Wiki:%cn '%cc${title}%cn' (${page.path}) was updated.`);
  }
};

const onDeleted = async (page: WikiPageRef): Promise<void> => {
  await maybeFireWebhook("wiki:deleted", page);
  // Remove all subscriptions for deleted page
  const subs = await subscriptions.find({ path: page.path });
  for (const s of subs) await subscriptions.delete({ id: s.id });
};

const onRenamed = async (page: WikiPageRef): Promise<void> => {
  await maybeFireWebhook("wiki:renamed", page);
  // Notify watchers on old path
  if (page.oldPath) {
    const subs = await subscriptions.find({ path: page.oldPath });
    for (const s of subs) {
      send([s.playerId], `%ch>Wiki:%cn '%cc${page.oldPath}%cn' was moved to '%cc${page.path}%cn'.`);
    }
  }
};

// ─── plugin ───────────────────────────────────────────────────────────────────

export const plugin: IPlugin = {
  name: "wiki",
  version: "0.1.0",
  description: "File-based markdown wiki with revision history, access control, webhooks, wikilinks, and watch subscriptions.",

  init: () => {
    registerPluginRoute("/api/v1/wiki", wikiRouteHandler);
    wikiHooks.on("wiki:created", onCreated);
    wikiHooks.on("wiki:edited",  onEdited);
    wikiHooks.on("wiki:deleted", onDeleted);
    wikiHooks.on("wiki:renamed", onRenamed);
    console.log("[wiki] Plugin initialized — +wiki/+wikiwatch/@wiki commands active, /api/v1/wiki routes registered");
    return true;
  },

  remove: () => {
    wikiHooks.off("wiki:created", onCreated);
    wikiHooks.off("wiki:edited",  onEdited);
    wikiHooks.off("wiki:deleted", onDeleted);
    wikiHooks.off("wiki:renamed", onRenamed);
  },
};

export default plugin;
