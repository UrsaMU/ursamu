/**
 * Format-attribute pipeline for MUSH display slots
 * (NAMEFORMAT / DESCFORMAT / CONFORMAT / EXITFORMAT / WHOFORMAT / etc.).
 *
 * Resolution priority:
 *   1. Softcode attribute on the target — evaluated via softcodeEngine.
 *   2. Plugin-registered handler for the slot.
 *   3. null → caller falls back to its own built-in default.
 */
import type { IDBObj, IUrsamuSDK } from "../commands/types.ts";
import type { FormatSlot } from "../commands/types.ts";

export type { FormatSlot };

export type FormatHandler = (
  u: IUrsamuSDK,
  target: IDBObj,
  defaultArg: string,
) => Promise<string | null> | string | null;

const registry = new Map<FormatSlot, FormatHandler[]>();

export function registerFormatHandler(
  slot: FormatSlot,
  fn: FormatHandler,
  options?: { prepend?: boolean },
): void {
  const list = registry.get(slot) ?? [];
  if (options?.prepend) {
    list.unshift(fn);
  } else {
    list.push(fn);
  }
  registry.set(slot, list);
}

export function unregisterFormatHandler(slot: FormatSlot, fn: FormatHandler): void {
  const list = registry.get(slot);
  if (!list) return;
  const idx = list.indexOf(fn);
  if (idx >= 0) list.splice(idx, 1);
}

/**
 * Register a MUSH-softcode template as a format handler.
 * Returns the handler so callers can later pass it to `unregisterFormatHandler`.
 */
export function registerFormatTemplate(
  slot: FormatSlot,
  mushSource: string,
): FormatHandler {
  const handler: FormatHandler = async (u, target, defaultArg) => {
    const { runSoftcodeSimple } = await import("../softcode/engine.ts");
    const out = await runSoftcodeSimple(mushSource, {
      actorId:    u.me.id,
      executorId: target.id,
      args:       [defaultArg],
      socketId:   u.socketId,
    });
    return out ?? null;
  };
  registerFormatHandler(slot, handler);
  return handler;
}

export async function runPluginFormatHandlers(
  slot: FormatSlot,
  u: IUrsamuSDK,
  target: IDBObj,
  defaultArg: string,
): Promise<string | null> {
  const list = registry.get(slot);
  if (!list || list.length === 0) return null;
  for (const fn of list) {
    try {
      const out = await fn(u, target, defaultArg);
      if (out != null) return out;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[format-handler ${slot}] plugin handler threw: ${msg}`);
    }
  }
  return null;
}

export async function resolveFormat(
  u: IUrsamuSDK,
  target: IDBObj,
  slot: FormatSlot,
  defaultArg: string,
): Promise<string | null> {
  if (u.attr?.get) {
    try {
      const raw = await u.attr.get(target.id, slot);
      if (raw != null && raw !== "") {
        const { runSoftcodeSimple } = await import("../softcode/engine.ts");
        return await runSoftcodeSimple(raw, {
          actorId:    u.me.id,
          executorId: target.id,
          args:       [defaultArg],
          socketId:   u.socketId,
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[resolveFormat ${slot}] softcode eval failed on #${target.id}: ${msg}`);
    }
  }
  return await runPluginFormatHandlers(slot, u, target, defaultArg);
}

export async function resolveFormatOr(
  u: IUrsamuSDK,
  target: IDBObj,
  slot: FormatSlot,
  defaultArg: string,
  fallback: string,
): Promise<string> {
  return (await resolveFormat(u, target, slot, defaultArg)) ?? fallback;
}

export async function resolveGlobalFormat(
  u: IUrsamuSDK,
  slot: FormatSlot,
  defaultArg: string,
): Promise<string | null> {
  const { dbojs } = await import("../world/dbobjs.ts");
  const root = await dbojs.queryOne({ id: "0" });
  if (root) {
    const rootObj: IDBObj = {
      id: root.id,
      name: root.data?.name as string | undefined,
      flags: new Set((root.flags || "").split(" ").filter(Boolean)),
      location: root.location,
      state: root.data || {},
      contents: [],
    };
    const onRoot = await resolveFormat(u, rootObj, slot, defaultArg);
    if (onRoot != null) return onRoot;
  }
  return await resolveFormat(u, u.me, slot, defaultArg);
}

export async function resolveGlobalFormatOr(
  u: IUrsamuSDK,
  slot: FormatSlot,
  defaultArg: string,
  fallback: string,
): Promise<string> {
  return (await resolveGlobalFormat(u, slot, defaultArg)) ?? fallback;
}

// Layout helpers (mirrors src/utils/format.ts without the parser dep)
const stripAnsi = (s: string) =>
  s.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "");

const visLen = (s: string) => stripAnsi(s).length;

const repeatStr = (fill: string, n: number) => {
  if (n <= 0 || !fill) return "";
  const stripped = stripAnsi(fill);
  if (stripped.length === 0) return "";
  const reps = Math.floor(n / stripped.length);
  const rem  = n % stripped.length;
  return fill.repeat(reps) + stripped.slice(0, rem);
};

export const center = (s = "", len: number, fill = " "): string => {
  const sl = visLen(s);
  const l  = Math.floor((len - sl) / 2);
  const r  = len - sl - l;
  return repeatStr(fill, l) + s + repeatStr(fill, r);
};

export const ljust = (s = "", len: number, fill = " "): string => {
  const pad = len - visLen(s);
  return pad < 0 ? s.substring(0, len - 3) + "..." : s + repeatStr(fill, pad);
};

export const rjust = (s = "", len: number, fill = " "): string => {
  const pad = len - visLen(s);
  return pad < 0 ? s.substring(0, len - 3) + "..." : repeatStr(fill, pad) + s;
};

export type LayoutFn = (label?: string, filler?: string, width?: number) => string;

const _defaultHeader: LayoutFn = (string = "", filler = "=", width = 78) => {
  const rule = filler.repeat(width);
  if (!string) return rule;
  return `${rule}\n${center(`%ch${string}%cn`, width)}\n${rule}`;
};
const _defaultDivider: LayoutFn = (string = "", filler = "-", width = 78) => {
  const rule = filler.repeat(width);
  if (!string) return rule;
  return `\n%ch${string}%cn\n${rule}`;
};
const _defaultFooter: LayoutFn = (string = "", filler = "=", width = 78) => {
  const rule = filler.repeat(width);
  if (!string) return rule;
  return `${rule}\n${center(`%ch${string}%cn`, width)}\n${rule}`;
};

const _headerStack: LayoutFn[] = [_defaultHeader];
const _dividerStack: LayoutFn[] = [_defaultDivider];
const _footerStack: LayoutFn[] = [_defaultFooter];

export function registerHeader(fn: LayoutFn): void  { _headerStack.push(fn); }
export function registerDivider(fn: LayoutFn): void { _dividerStack.push(fn); }
export function registerFooter(fn: LayoutFn): void  { _footerStack.push(fn); }

export function unregisterHeader(fn: LayoutFn): void  { const i = _headerStack.lastIndexOf(fn);  if (i > 0) _headerStack.splice(i, 1); }
export function unregisterDivider(fn: LayoutFn): void { const i = _dividerStack.lastIndexOf(fn); if (i > 0) _dividerStack.splice(i, 1); }
export function unregisterFooter(fn: LayoutFn): void  { const i = _footerStack.lastIndexOf(fn);  if (i > 0) _footerStack.splice(i, 1); }

export const header  = (string = "", filler = "=", width = 78): string =>
  _headerStack[_headerStack.length - 1](string, filler, width);
export const divider = (string = "", filler = "-", width = 78): string =>
  _dividerStack[_dividerStack.length - 1](string, filler, width);
export const footer  = (string = "", filler = "=", width = 78): string =>
  _footerStack[_footerStack.length - 1](string, filler, width);

/** Test-only: drop all registered handlers. */
export function _clearFormatHandlers(): void {
  registry.clear();
}
