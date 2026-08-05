/**
 * Structured look UI for web clients (u.ui.layout).
 *
 * Honors `plugins.globals.theme.look` (same keys as text look chrome):
 *   showShortDesc, showIdle, showExitAliases, aliasCase, exitColumns,
 *   roleTags, descIndent, categorizeExits
 *
 * Building blocks: header → text → entity-list → actions
 * Interactive items carry `action.cmd` for FE click → send.
 */
import type { IUrsamuSDK, IDBObj } from "../commands/types.ts";
import { getConfig } from "@ursamu/core";
import { dbrefWithFlags } from "../world/flags.ts";
import {
  isPlayableImageUrl,
  resolveObjectImageUrl,
} from "../media/object-image.ts";

export type UIAction = {
  /** Exact player input to send when activated. */
  cmd: string;
};

export type UIEntityItem = {
  id: string;
  label: string;
  /** Staff-only dbref+flags, e.g. #2pUAc */
  dbref?: string;
  sublabel?: string;
  meta?: string;
  /** Role tag display from config (may include %c codes). */
  role?: string;
  action?: UIAction;
};

export type UIActionItem = {
  id: string;
  label: string;
  dbref?: string;
  badge?: string;
  action: UIAction;
};

export type UIComponent = {
  type: string;
  title?: string;
  content?: unknown;
  items?: unknown[];
  url?: string;
  alt?: string;
};

export type LookTheme = {
  showShortDesc: boolean;
  showIdle: boolean;
  categorizeExits: boolean;
  showExitAliases: boolean;
  aliasCase: "preserve" | "upper" | "lower";
  exitColumns: number;
  descIndent: number;
  roleTags: Array<{ flag: string; display: string }>;
};

const NO_DESCRIPTION = "You see nothing special.";
const SHORTDESC_PROMPT =
  "To set this, type ‘&short-desc me=<desc>’";

const DEFAULT_ROLE_TAGS: LookTheme["roleTags"] = [
  { flag: "wizard", display: "(Wizard)" },
  { flag: "superuser", display: "(Root)" },
  { flag: "admin", display: "(Admin)" },
  { flag: "staff", display: "(Staff)" },
];

/** Read look layout flags from config (plugins.globals.theme.look). */
export function getLookTheme(): LookTheme {
  const raw = (getConfig<Record<string, unknown>>(
    "plugins.globals.theme.look",
  ) ?? {}) as Record<string, unknown>;

  const aliasCaseRaw = String(raw.aliasCase ?? "upper").toLowerCase();
  const aliasCase: LookTheme["aliasCase"] =
    aliasCaseRaw === "preserve" || aliasCaseRaw === "lower"
      ? aliasCaseRaw
      : "upper";

  const roleTagsRaw = raw.roleTags;
  const roleTags =
    Array.isArray(roleTagsRaw) && roleTagsRaw.length > 0
      ? (roleTagsRaw as LookTheme["roleTags"]).filter(
        (t) => t && typeof t.flag === "string" && t.display != null,
      )
      : DEFAULT_ROLE_TAGS;

  const cols = Number(raw.exitColumns);
  const indent = Number(raw.descIndent);

  return {
    showShortDesc: raw.showShortDesc !== false,
    showIdle: raw.showIdle !== false,
    categorizeExits: raw.categorizeExits !== false,
    showExitAliases: raw.showExitAliases !== false,
    aliasCase,
    exitColumns: Number.isFinite(cols)
      ? Math.max(1, Math.min(3, Math.floor(cols)))
      : 2,
    descIndent: Number.isFinite(indent)
      ? Math.max(0, Math.min(8, Math.floor(indent)))
      : 0,
    roleTags,
  };
}

export function prefersUiLayout(u: IUrsamuSDK): boolean {
  if (u.clientType === "web") return true;
  return false;
}

function canSeeStaffDetail(actor: IDBObj): boolean {
  return (
    actor.flags.has("wizard") ||
    actor.flags.has("admin") ||
    actor.flags.has("superuser") ||
    actor.flags.has("staff") ||
    actor.flags.has("storyteller") ||
    actor.flags.has("builder")
  );
}

function showStaffDbref(actor: IDBObj, canEdit: boolean): boolean {
  return canEdit || canSeeStaffDetail(actor);
}

function staffDbref(
  obj: IDBObj,
  actor: IDBObj,
  canEdit: boolean,
): string | undefined {
  if (!showStaffDbref(actor, canEdit)) return undefined;
  return dbrefWithFlags(obj.id, obj.flags);
}

function getShortDesc(obj: IDBObj): string {
  const attrs =
    (obj.state?.attributes as { name?: string; value?: string }[]) ||
    [];
  const sd = attrs.find((a) =>
    a.name?.toLowerCase() === "short-desc" ||
    a.name?.toLowerCase() === "shortdesc"
  );
  if (sd?.value) return sd.value;
  const flat =
    (obj.state?.["short-desc"] as string | undefined) ||
    (obj.state?.shortdesc as string | undefined);
  return flat || "";
}

function formatIdlePlain(lastCommand: unknown): string {
  if (typeof lastCommand !== "number" || isNaN(lastCommand)) {
    return "0s";
  }
  const diff = Math.floor((Date.now() - lastCommand) / 1000);
  if (diff <= 0) return "0s";
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

/** Role display string from config roleTags (keeps %c codes). */
export function roleTagFromTheme(
  obj: IDBObj,
  theme: LookTheme,
): string {
  for (const t of theme.roleTags) {
    if (obj.flags?.has(t.flag)) return String(t.display ?? "");
  }
  return "";
}

function isExitObj(o: IDBObj): boolean {
  for (const f of o.flags) {
    if (String(f).toLowerCase() === "exit") return true;
  }
  return false;
}

function exitParts(e: IDBObj): string[] {
  const raw = (e.state.name as string) || e.name || "";
  return raw.split(";").map((p) => p.trim()).filter(Boolean);
}

function formatAlias(
  alias: string,
  aliasCase: LookTheme["aliasCase"],
): string {
  if (aliasCase === "lower") return alias.toLowerCase();
  if (aliasCase === "preserve") return alias;
  return alias.toUpperCase();
}

function exitBadge(
  e: IDBObj,
  theme: LookTheme,
): string | undefined {
  if (!theme.showExitAliases) return undefined;
  const parts = exitParts(e);
  if (parts.length < 2) return undefined;
  const aliases = parts.slice(1).sort((a, b) => a.length - b.length);
  const a = aliases[0];
  return a ? formatAlias(a, theme.aliasCase) : undefined;
}

/** Command to send when the exit control is activated. */
export function exitCmd(e: IDBObj): string {
  const parts = exitParts(e);
  if (parts.length > 1) {
    const aliases = parts.slice(1).sort((a, b) => a.length - b.length);
    return (aliases[0] || parts[0] || "").toLowerCase();
  }
  return (parts[0] || "").toLowerCase();
}

/** Moniker-first label for look rows (web + shared). */
export function lookLabel(
  obj: IDBObj,
  u?: IUrsamuSDK,
  actor?: IDBObj,
): string {
  if (u?.util?.displayName && actor) {
    const d = String(u.util.displayName(obj, actor) || "").trim();
    if (d) return d;
  }
  const bag = {
    ...((obj as { data?: Record<string, unknown> }).data ?? {}),
    ...(obj.state ?? {}),
  } as Record<string, unknown>;
  let mon = String(bag.moniker ?? "").trim();
  if (!mon) {
    const attrs = (bag.attributes as
      | { name?: string; value?: string }[]
      | undefined) ?? [];
    const hit = attrs.find((a) =>
      String(a.name ?? "").toUpperCase() === "MONIKER"
    );
    mon = String(hit?.value ?? "").trim();
  }
  if (mon) return mon.split(";")[0]?.trim() || mon;
  return exitParts(obj)[0] ||
    String(bag.name ?? obj.name ?? "???").split(";")[0]?.trim() ||
    "???";
}

function exitLabel(e: IDBObj, u?: IUrsamuSDK, actor?: IDBObj): string {
  // Exits: moniker when set, else first ;-name segment (not aliases)
  if (u && actor) {
    const bag = {
      ...((e as { data?: Record<string, unknown> }).data ?? {}),
      ...(e.state ?? {}),
    } as Record<string, unknown>;
    const mon = String(bag.moniker ?? "").trim();
    if (mon) return lookLabel(e, u, actor);
  }
  return exitParts(e)[0] || "???";
}

function indentDesc(text: string, spaces: number): string {
  if (spaces <= 0) return text;
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.trim() ? pad + line : line))
    .join("\n");
}

/**
 * Web look body — no telnet gutter indent. Strip leading spaces
 * per line (DB/softcode often stores " desc").
 */
function webDesc(text: string): string {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^[ \t]+/, ""))
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

export type LookUiContext = {
  u: IUrsamuSDK;
  actor: IDBObj;
  target: IDBObj;
  showContents: boolean;
  canEdit: boolean;
  exits: IDBObj[];
  headerTitle: string;
  description: string;
};

async function entityItem(
  u: IUrsamuSDK,
  actor: IDBObj,
  obj: IDBObj,
  theme: LookTheme,
  opts: { shortDescFallback?: string } = {},
): Promise<UIEntityItem> {
  const canEdit = await u.canEdit(actor, obj);
  const item: UIEntityItem = {
    id: obj.id,
    // Always moniker over plain name for web look contents
    label: lookLabel(obj, u, actor),
    dbref: staffDbref(obj, actor, canEdit),
    role: roleTagFromTheme(obj, theme) || undefined,
    action: { cmd: `look #${obj.id}` },
  };
  if (theme.showShortDesc) {
    const sd = getShortDesc(obj).replace(/^[ \t]+/, "");
    item.sublabel = sd || opts.shortDescFallback;
  }
  if (theme.showIdle && obj.flags.has("player")) {
    item.meta = formatIdlePlain(obj.state?.lastCommand);
  }
  return item;
}

/**
 * Build look components for the web client using theme.look flags.
 */
export async function buildLookLayout(
  ctx: LookUiContext,
): Promise<UIComponent[]> {
  const { u, actor, target, showContents, exits } = ctx;
  const theme = getLookTheme();
  const components: UIComponent[] = [];

  components.push({
    type: "header",
    title: ctx.headerTitle,
  });

  const bag = {
    ...((target as { data?: Record<string, unknown> }).data ?? {}),
    ...((target.state ?? {}) as Record<string, unknown>),
  };
  const fromDisk = await resolveObjectImageUrl(target.id, bag);
  const fromAttr = await u.attr.get(target.id, "IMAGE");
  const img = String(
    fromDisk ||
      fromAttr ||
      bag.image ||
      bag.image_url ||
      "",
  ).trim();
  if (img && isPlayableImageUrl(img)) {
    components.push({
      type: "media",
      url: img,
      alt: ctx.headerTitle,
    });
  }

  components.push({
    type: "text",
    content: webDesc(ctx.description || NO_DESCRIPTION),
  });

  if (showContents && target.flags.has("room")) {
    const contents = target.contents || [];
    const characters = contents.filter(
      (o) => o.flags.has("player") && o.flags.has("connected"),
    );
    const objects = contents.filter(
      (o) =>
        !o.flags.has("player") &&
        !isExitObj(o) &&
        !o.flags.has("room"),
    );

    if (characters.length > 0) {
      const items: UIEntityItem[] = [];
      for (const c of characters) {
        items.push(
          await entityItem(u, actor, c, theme, {
            shortDescFallback: SHORTDESC_PROMPT,
          }),
        );
      }
      components.push({
        type: "entity-list",
        title: "Characters",
        items,
      });
    }

    if (objects.length > 0) {
      const items: UIEntityItem[] = [];
      for (const o of objects) {
        items.push(await entityItem(u, actor, o, theme));
      }
      components.push({
        type: "entity-list",
        title: "Contents",
        items,
      });
    }
  }

  if (exits.length > 0) {
    const sorted = [...exits].sort((a, b) =>
      exitLabel(a, u, actor).localeCompare(exitLabel(b, u, actor))
    );
    const items: UIActionItem[] = [];
    for (const e of sorted) {
      const canEditE = await u.canEdit(actor, e);
      items.push({
        id: e.id,
        label: exitLabel(e, u, actor),
        dbref: staffDbref(e, actor, canEditE),
        badge: exitBadge(e, theme),
        action: { cmd: exitCmd(e) },
      });
    }
    // categorizeExits reserved for future exit-type groups; still
    // emit a single Exits section with configured columns.
    components.push({
      type: "actions",
      title: theme.categorizeExits ? "Exits" : "Exits",
      content: { columns: theme.exitColumns },
      items,
    });
  }

  return components;
}

/** Non-room look: header + desc + carrying list. */
export async function buildSingleLookLayout(
  ctx: LookUiContext,
): Promise<UIComponent[]> {
  const { u, actor, target, showContents } = ctx;
  const theme = getLookTheme();
  const components: UIComponent[] = [
    { type: "header", title: ctx.headerTitle },
    {
      type: "text",
      content: webDesc(ctx.description || NO_DESCRIPTION),
    },
  ];

  if (showContents && target.contents && target.contents.length > 0) {
    const players = target.contents.filter((c) =>
      c.flags.has("player")
    );
    const things = target.contents.filter(
      (c) => !c.flags.has("player") && !c.flags.has("exit"),
    );
    if (players.length > 0) {
      const items: UIEntityItem[] = [];
      for (const c of players) {
        items.push(await entityItem(u, actor, c, theme));
      }
      components.push({
        type: "entity-list",
        title: "Players",
        items,
      });
    }
    if (things.length > 0) {
      const items: UIEntityItem[] = [];
      for (const o of things) {
        items.push(await entityItem(u, actor, o, theme));
      }
      components.push({
        type: "entity-list",
        title: "Carrying",
        items,
      });
    }
  }

  return components;
}
