/**
 * Left-menu template expansion and plugin block registry.
 *
 * Template (plugins.site.leftMenu) is markdown-ish:
 *
 *   ## Featured
 *   [[featured]]
 *
 *   ## Links
 *   - [Home](/site/)
 *   - [Wiki](/site/wiki/)
 *
 * Block macros are a sole line `[[name]]` or `[[name:arg]]`.
 * Built-in names (client): featured, section.
 * Plugins register more via registerSiteMenuBlock().
 */

export type SiteMenuItem = {
  label: string;
  href: string;
  current?: boolean;
};

export type SiteMenuBlockResult = {
  /** Bullet list items (preferred). */
  items?: SiteMenuItem[];
  /** Raw HTML override (advanced). */
  html?: string;
};

export type SiteMenuBlockContext = {
  mode: string;
  wikiPath: string;
  /** Optional arg from [[name:arg]] */
  arg?: string;
};

export type SiteMenuBlockHandler = (
  ctx: SiteMenuBlockContext,
) =>
  | SiteMenuBlockResult
  | Promise<SiteMenuBlockResult>
  | null
  | undefined;

const blocks = new Map<string, SiteMenuBlockHandler>();

/** Register or replace a left-menu block macro (e.g. "featured"). */
export function registerSiteMenuBlock(
  name: string,
  handler: SiteMenuBlockHandler,
): void {
  const key = name.trim().toLowerCase();
  if (!key || !/^[a-z][a-z0-9_-]*$/i.test(key)) {
    throw new Error(
      `registerSiteMenuBlock: invalid name "${name}"`,
    );
  }
  blocks.set(key, handler);
}

export function unregisterSiteMenuBlock(name: string): void {
  blocks.delete(name.trim().toLowerCase());
}

export function listSiteMenuBlocks(): string[] {
  return [...blocks.keys()].sort();
}

export function clearSiteMenuBlocks(): void {
  blocks.clear();
}

/** Resolve all registered plugin blocks for config / API. */
export async function resolvePluginMenuBlocks(
  ctx: Omit<SiteMenuBlockContext, "arg">,
): Promise<Record<string, SiteMenuBlockResult>> {
  const out: Record<string, SiteMenuBlockResult> = {};
  for (const [name, fn] of blocks) {
    try {
      const r = await fn({ ...ctx, arg: undefined });
      if (r && (r.html || (r.items && r.items.length))) {
        out[name] = {
          items: r.items?.map((it) => ({
            label: String(it.label ?? ""),
            href: String(it.href ?? "#"),
            current: it.current === true,
          })),
          html: typeof r.html === "string" ? r.html : undefined,
        };
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[site] menu block "${name}" failed: ${msg}`);
    }
  }
  return out;
}

/**
 * Default left menu when plugins.site.leftMenu is unset.
 * Empty blocks are omitted (no empty headings).
 */
export const DEFAULT_LEFT_MENU = `[[section]]

## Featured
[[featured]]
`;

const BLOCK_LINE = /^\s*\[\[([a-z][a-z0-9_-]*)(?::([^\]]*))?\]\]\s*$/i;
const HEADING = /^\s*##\s+(.+?)\s*$/;
const UL_ITEM = /^\s*[-*+]\s+(.+?)\s*$/;
const MD_LINK = /^\[([^\]]+)\]\(([^)]+)\)\s*$/;

export type ExpandMenuOptions = {
  template: string;
  /** Built-in + plugin block payloads */
  blocks: Record<string, SiteMenuBlockResult>;
};

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderItems(items: SiteMenuItem[]): string {
  if (!items.length) return "";
  let html = '<ul class="site-menu__list">';
  for (const it of items) {
    const cur = it.current ? ' class="is-current"' : "";
    const aria = it.current ? ' aria-current="page"' : "";
    html += `<li${cur}><a href="${esc(it.href)}"${aria}>` +
      `${esc(it.label)}</a></li>`;
  }
  html += "</ul>";
  return html;
}

function renderSection(title: string, bodyHtml: string): string {
  if (!bodyHtml.trim()) return "";
  return (
    `<section class="site-menu menu">` +
    `<h2 class="site-menu__title">${esc(title)}</h2>` +
    bodyHtml +
    `</section>`
  );
}

/**
 * Expand a left-menu template to HTML.
 * Headings immediately followed by an empty block are dropped.
 */
export function expandLeftMenuTemplate(
  opts: ExpandMenuOptions,
): string {
  const lines = String(opts.template ?? "").split(/\r?\n/);
  const blocksMap = opts.blocks ?? {};
  let html = "";
  let pendingTitle: string | null = null;
  let staticItems: SiteMenuItem[] = [];

  function flushStatic() {
    if (!staticItems.length) return;
    const body = renderItems(staticItems);
    if (pendingTitle) {
      html += renderSection(pendingTitle, body);
      pendingTitle = null;
    } else {
      html += `<section class="site-menu menu">${body}</section>`;
    }
    staticItems = [];
  }

  function emitBlock(name: string, arg?: string) {
    const key = name.toLowerCase();
    // arg-specific keys: "name:arg" then "name"
    const keyed = arg != null && arg !== ""
      ? blocksMap[`${key}:${arg}`] ?? blocksMap[key]
      : blocksMap[key];
    if (!keyed) {
      pendingTitle = null;
      return;
    }
    let body = "";
    if (typeof keyed.html === "string" && keyed.html.trim()) {
      body = keyed.html;
    } else if (keyed.items?.length) {
      body = renderItems(keyed.items);
    }
    if (!body.trim()) {
      pendingTitle = null;
      return;
    }
    if (pendingTitle) {
      html += renderSection(pendingTitle, body);
      pendingTitle = null;
    } else {
      // Block without heading — if html is full section, use as-is
      if (/^\s*<section\b/i.test(body)) {
        html += body;
      } else {
        html += `<section class="site-menu menu">${body}</section>`;
      }
    }
  }

  for (const raw of lines) {
    const line = raw;

    const bm = line.match(BLOCK_LINE);
    if (bm) {
      flushStatic();
      emitBlock(bm[1], bm[2]?.trim());
      continue;
    }

    const hm = line.match(HEADING);
    if (hm) {
      flushStatic();
      pendingTitle = hm[1].trim();
      continue;
    }

    const um = line.match(UL_ITEM);
    if (um) {
      const content = um[1].trim();
      const lm = content.match(MD_LINK);
      if (lm) {
        staticItems.push({ label: lm[1], href: lm[2] });
      } else {
        staticItems.push({ label: content, href: "#" });
      }
      continue;
    }

    if (!line.trim()) {
      flushStatic();
      // blank line does not clear pending title before a block
      continue;
    }

    // ignore other lines
  }
  flushStatic();
  return html;
}
