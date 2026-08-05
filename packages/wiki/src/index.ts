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
import {
  WIKI_DESCRIPTION,
  WIKI_PLUGIN_ID,
  WIKI_TITLE,
  WIKI_VERSION,
} from "./version.ts";
import {
  registerWikiStaffNav,
  unregisterWikiStaffNav,
} from "./staff-nav-bridge.ts";
import {
  publishWikiDraftsBadge,
  registerWikiBadgeHooks,
  removeWikiBadgeHooks,
} from "./staff-badge-bridge.ts";

// ─── hook handlers (named references — required for remove()) ───────────────

const onCreated = async (page: WikiPageRef): Promise<void> => {
  await maybeFireWebhook("wiki:created", page);
};

const onEdited = async (page: WikiPageRef): Promise<void> => {
  await maybeFireWebhook("wiki:edited", page);
  // Notify watchers
  const subs = await subscriptions.find({ path: page.path });
  for (const s of subs) {
    const title = (page.meta.title as string) || page.path;
    send(
      [s.playerId],
      `%ch>Wiki:%cn '%cc${title}%cn' (${page.path}) was updated.`,
    );
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
      send(
        [s.playerId],
        `%ch>Wiki:%cn '%cc${page.oldPath}%cn' was moved ` +
          `to '%cc${page.path}%cn'.`,
      );
    }
  }
};

const bootstrapStaffUi = async (): Promise<void> => {
  await registerWikiStaffNav();
  registerWikiBadgeHooks();
  await publishWikiDraftsBadge();
};

// ─── plugin ─────────────────────────────────────────────────────────────────

export const plugin: IPlugin = {
  name: WIKI_PLUGIN_ID,
  version: WIKI_VERSION,
  description: `${WIKI_TITLE} — ${WIKI_DESCRIPTION}`,

  init: () => {
    registerPluginRoute("/api/v1/wiki", wikiRouteHandler);
    wikiHooks.on("wiki:created", onCreated);
    wikiHooks.on("wiki:edited", onEdited);
    wikiHooks.on("wiki:deleted", onDeleted);
    wikiHooks.on("wiki:renamed", onRenamed);
    // Fire-and-forget — soft-peer @ursamu/web may be absent.
    void bootstrapStaffUi();
    console.log(
      `[${WIKI_PLUGIN_ID}] ${WIKI_TITLE} — +wiki/@wiki, ` +
        `/api/v1/wiki; staff UI via @ursamu/web /admin/wiki`,
    );
    return true;
  },

  remove: () => {
    wikiHooks.off("wiki:created", onCreated);
    wikiHooks.off("wiki:edited", onEdited);
    wikiHooks.off("wiki:deleted", onDeleted);
    wikiHooks.off("wiki:renamed", onRenamed);
    removeWikiBadgeHooks();
    void unregisterWikiStaffNav();
  },
};

export default plugin;
