import type { WikiMeta } from "./router.ts";

// ─── types ────────────────────────────────────────────────────────────────────

export interface WikiPageRef {
  /** URL path, e.g. "news/battle-2026" */
  path: string;
  /** Parsed frontmatter fields */
  meta: WikiMeta;
  /** Page body (only present on created/edited hooks) */
  body?: string;
}

// ─── hook type map ────────────────────────────────────────────────────────────

export type WikiHookMap = {
  /** A new page was written via POST /api/v1/wiki. */
  "wiki:created": (page: WikiPageRef) => void | Promise<void>;
  /** A page's body or frontmatter was updated via PATCH /api/v1/wiki/:path. */
  "wiki:edited":  (page: WikiPageRef) => void | Promise<void>;
  /** A page file was removed via DELETE /api/v1/wiki/:path. */
  "wiki:deleted": (page: WikiPageRef) => void | Promise<void>;
};

type HandlerList = { [K in keyof WikiHookMap]: WikiHookMap[K][] };

// ─── registry ─────────────────────────────────────────────────────────────────

const _handlers: HandlerList = {
  "wiki:created": [],
  "wiki:edited":  [],
  "wiki:deleted": [],
};

// ─── public API ───────────────────────────────────────────────────────────────

export interface IWikiHooks {
  on<K extends keyof WikiHookMap>(event: K, handler: WikiHookMap[K]): void;
  off<K extends keyof WikiHookMap>(event: K, handler: WikiHookMap[K]): void;
  emit<K extends keyof WikiHookMap>(event: K, ...args: Parameters<WikiHookMap[K]>): Promise<void>;
}

export const wikiHooks: IWikiHooks = {
  /**
   * Register a handler for a wiki lifecycle hook.
   *
   * @example
   * ```ts
   * import { wikiHooks } from "jsr:@ursamu/ursamu/plugins/wiki";
   *
   * wikiHooks.on("wiki:created", (page) => {
   *   console.log(`New wiki page: ${page.path} — "${page.meta.title}"`);
   * });
   * ```
   */
  on<K extends keyof WikiHookMap>(event: K, handler: WikiHookMap[K]): void {
    (_handlers[event] as WikiHookMap[K][]).push(handler);
  },

  /** Remove a previously registered handler. */
  off<K extends keyof WikiHookMap>(event: K, handler: WikiHookMap[K]): void {
    const list = _handlers[event] as WikiHookMap[K][];
    const idx  = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);
  },

  /** Fire all registered handlers (errors are caught and logged). */
  async emit<K extends keyof WikiHookMap>(
    event: K,
    ...args: Parameters<WikiHookMap[K]>
  ): Promise<void> {
    for (const handler of [...(_handlers[event] as ((...a: Parameters<WikiHookMap[K]>) => void | Promise<void>)[])]) {
      try {
        await (handler as (...a: Parameters<WikiHookMap[K]>) => void | Promise<void>)(...args);
      } catch (e) {
        console.error(`[wiki] Uncaught error in hook "${event}":`, e);
      }
    }
  },
};
