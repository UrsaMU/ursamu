/**
 * Shared helpers for interactive web command UIs.
 *
 * Pattern (mirror look):
 *   1. Build header + text + entity-list / actions
 *   2. Items carry `{ action: { cmd } }` for FE click → input
 *   3. Web: u.ui.layout; telnet: chrome text
 *   4. Optional theme via plugins.globals.theme.cmdUi
 */
import { getConfig } from "@ursamu/core";
import type { IUrsamuSDK } from "../commands/types.ts";
import {
  divider,
  footer,
  header,
} from "../format/handlers.ts";

export type CmdAction = { cmd: string };

export type CmdEntityItem = {
  id?: string;
  label: string;
  sublabel?: string;
  meta?: string;
  dbref?: string;
  role?: string;
  action?: CmdAction;
};

export type CmdActionItem = {
  id?: string;
  label: string;
  badge?: string;
  dbref?: string;
  action: CmdAction;
};

export type CmdUiComponent = {
  type: string;
  title?: string;
  content?: unknown;
  items?: unknown[];
  url?: string;
  alt?: string;
};

export type CmdUiTheme = {
  /** When true, list helpers may attach look actions (default true). */
  lookOnClick: boolean;
};

export type ListLayoutOpts = {
  /** Layout meta.type for the FE (e.g. "inventory"). */
  metaType: string;
  title: string;
  /** entity-list section title */
  listTitle?: string;
  items: CmdEntityItem[];
  emptyText: string;
  footerText: string;
  /** Optional chip row under the list */
  actions?: CmdActionItem[];
  /** Telnet body lines (already labeled); if omitted, uses item labels */
  textLines?: string[];
};

/** True when this session should get structured play layouts. */
export function prefersCmdUi(u: IUrsamuSDK): boolean {
  return u.clientType === "web" && typeof u.ui?.layout === "function";
}

/** plugins.globals.theme.cmdUi — small knobs shared by list commands. */
export function getCmdUiTheme(): CmdUiTheme {
  const raw = (getConfig<Record<string, unknown>>(
    "plugins.globals.theme.cmdUi",
  ) ?? {}) as Record<string, unknown>;
  return {
    lookOnClick: raw.lookOnClick !== false,
  };
}

export function cmdAction(cmd: string): CmdAction {
  return { cmd: String(cmd).trim() };
}

/** Look-target action when theme.lookOnClick is on. */
export function lookAction(
  nameOrId: string,
): CmdAction | undefined {
  if (!getCmdUiTheme().lookOnClick) return undefined;
  const t = String(nameOrId || "").trim();
  if (!t) return undefined;
  return cmdAction(`look ${t}`);
}

export function headerComp(title: string): CmdUiComponent {
  return { type: "header", title };
}

export function textComp(content: string): CmdUiComponent {
  return { type: "text", content };
}

export function entityListComp(
  title: string,
  items: CmdEntityItem[],
): CmdUiComponent {
  return { type: "entity-list", title, items };
}

export function actionsComp(
  title: string,
  items: CmdActionItem[],
): CmdUiComponent {
  return { type: "actions", title, items };
}

/** header → entity-list → optional actions → footer text */
export function buildListComponents(
  opts: ListLayoutOpts,
): CmdUiComponent[] {
  const n = opts.items.length;
  const listTitle = opts.listTitle ??
    (n === 0 ? "Empty" : (n === 1 ? "1 item" : `${n} items`));
  const comps: CmdUiComponent[] = [
    headerComp(opts.title),
    entityListComp(listTitle, opts.items),
  ];
  if (opts.actions?.length) {
    comps.push(actionsComp("Commands", opts.actions));
  }
  comps.push(
    textComp(n === 0 ? opts.emptyText : opts.footerText),
  );
  return comps;
}

/** Telnet chrome for the same list shape. */
export function renderListText(
  u: IUrsamuSDK,
  opts: ListLayoutOpts,
): string {
  const width = (u.me.state?.termWidth as number) || 78;
  const lines: string[] = [];
  lines.push(header(opts.title, "=", width));
  if (opts.items.length === 0) {
    lines.push(`  ${opts.emptyText}`);
  } else if (opts.textLines?.length) {
    for (const row of opts.textLines) {
      lines.push(row.startsWith("  ") ? row : `  ${row}`);
    }
  } else {
    for (const it of opts.items) {
      const bits = [it.label];
      if (it.meta) bits.push(it.meta);
      if (it.sublabel) bits.push(it.sublabel);
      lines.push(`  ${bits.join("  ")}`);
    }
  }
  lines.push(divider("", "-", width));
  lines.push(`  ${opts.footerText}`);
  lines.push(footer("", "=", width));
  return lines.join("\n");
}

/**
 * Web → u.ui.layout; otherwise → u.send(text).
 * Prefer this over hand-rolling clientType branches.
 */
export function sendListLayout(
  u: IUrsamuSDK,
  opts: ListLayoutOpts,
): void {
  if (prefersCmdUi(u)) {
    u.ui.layout({
      components: buildListComponents(opts),
      meta: { type: opts.metaType },
    });
    return;
  }
  u.send(renderListText(u, opts));
}

/** Free-form web layout with telnet fallback string. */
export function sendCmdLayout(
  u: IUrsamuSDK,
  opts: {
    components: CmdUiComponent[];
    metaType: string;
    textFallback: string;
  },
): void {
  if (prefersCmdUi(u)) {
    u.ui.layout({
      components: opts.components,
      meta: { type: opts.metaType },
    });
    return;
  }
  u.send(opts.textFallback);
}
