import type { WikiMeta } from "./fs.ts";

// ─── types ────────────────────────────────────────────────────────────────────

export interface WikiPageRef {
  /** URL path, e.g. "news/battle-2026" */
  path:  string;
  /** Parsed frontmatter fields */
  meta:  WikiMeta;
  /** Page body (present on created/edited/renamed hooks, absent on deleted) */
  body?: string;
  /** Previous path (present on renamed hook only) */
  oldPath?: string;
}

export type WikiHookMap = {
  /** A new page was created. */
  "wiki:created": (page: WikiPageRef) => void | Promise<void>;
  /** A page's body or frontmatter was updated. */
  "wiki:edited":  (page: WikiPageRef) => void | Promise<void>;
  /** A page was deleted. */
  "wiki:deleted": (page: WikiPageRef) => void | Promise<void>;
  /** A page was moved to a new path. `page.path` is the new path; `page.oldPath` is the old. */
  "wiki:renamed": (page: WikiPageRef) => void | Promise<void>;
};

type HandlerList = { [K in keyof WikiHookMap]: WikiHookMap[K][] };

// ─── registry ─────────────────────────────────────────────────────────────────

const _handlers: HandlerList = {
  "wiki:created": [],
  "wiki:edited":  [],
  "wiki:deleted": [],
  "wiki:renamed": [],
};

// ─── public API ───────────────────────────────────────────────────────────────

export interface IWikiHooks {
  on<K extends keyof WikiHookMap>(event: K, handler: WikiHookMap[K]): void;
  off<K extends keyof WikiHookMap>(event: K, handler: WikiHookMap[K]): void;
  emit<K extends keyof WikiHookMap>(event: K, ...args: Parameters<WikiHookMap[K]>): Promise<void>;
}

export const wikiHooks: IWikiHooks = {
  /**
   * Register a handler for a wiki lifecycle event.
   * @example
   * ```ts
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

  /** Fire all handlers for the event. Errors are caught and logged per handler. */
  async emit<K extends keyof WikiHookMap>(
    event: K,
    ...args: Parameters<WikiHookMap[K]>
  ): Promise<void> {
    const handlers = [...(_handlers[event] as ((...a: Parameters<WikiHookMap[K]>) => void | Promise<void>)[])];
    for (const handler of handlers) {
      try {
        await (handler as (...a: Parameters<WikiHookMap[K]>) => void | Promise<void>)(...args);
      } catch (e) {
        console.error(`[wiki] Uncaught error in hook "${event}":`, e);
      }
    }
  },
};
