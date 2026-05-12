/**
 * @module sandbox-handlers-format
 *
 * Bridges `util:resolveFormat` / `util:resolveFormatOr` messages from sandbox
 * scripts to the engine-side `resolveFormat` helper.
 *
 * Closes the gap from v2.3.0/v2.3.1: those releases exported `resolveFormat`
 * from `mod.ts` (usable by native commands + external plugin TS code) but did
 * not plumb it through `u.util.*`, so sandbox scripts (system/scripts/*.ts)
 * could not consult format-attribute overrides.
 */
import type { IDBObj, IUrsamuSDK } from "../../@types/UrsamuSDK.ts";
import type { FormatSlot } from "../../utils/formatHandlers.ts";

type Msg = Record<string, unknown>;

function respond(worker: Worker, msgId: unknown, data: unknown): void {
  worker.postMessage({ type: "response", msgId, data });
}

interface FormatMsg extends Msg {
  target:     { id: string };
  slot:       string;
  defaultArg: string;
  fallback?:  string;
  // Identity carried from the sandbox so we can rebuild a thin `u` object
  // for `resolveFormat` (it reads u.me.id, u.socketId, u.attr.get).
  actorId?:  string;
  socketId?: string;
}

async function buildBoundSDK(actorId: string | undefined, socketId: string | undefined): Promise<IUrsamuSDK> {
  const { dbojs }  = await import("../Database/index.ts");
  const { hydrate } = await import("../../utils/evaluateLock.ts");
  const meRaw = actorId ? await dbojs.queryOne({ id: actorId }) : null;
  const me    = meRaw
    ? hydrate(meRaw as unknown as Parameters<typeof hydrate>[0]) as IDBObj
    : { id: actorId ?? "", name: "", flags: new Set<string>(), state: {}, contents: [] } as unknown as IDBObj;

  // Minimal u stub: resolveFormat only reads u.me.id, u.socketId, u.attr.get.
  // Plugin handlers receive this same u — they get a real attr accessor.
  const attrGet = async (id: string, name: string): Promise<string | null> => {
    const obj = await dbojs.queryOne({ id });
    if (!obj) return null;
    const attrs = (obj.data?.attributes as Array<{ name: string; value: string }> | undefined) || [];
    const found = attrs.find((a) => a.name.toUpperCase() === name.toUpperCase());
    return found?.value ?? null;
  };

  return {
    me,
    socketId,
    attr: {
      get: attrGet,
      set: () => Promise.resolve(),
      clear: () => Promise.resolve(false),
    },
  } as unknown as IUrsamuSDK;
}

export async function handleUtilResolveFormatMessage(
  msg:    Msg,
  worker: Worker,
): Promise<void> {
  const { msgId } = msg;
  const m = msg as FormatMsg;
  if (!m.target?.id || !m.slot) { respond(worker, msgId, null); return; }

  const { resolveFormat } = await import("../../utils/resolveFormat.ts");
  const { dbojs }         = await import("../Database/index.ts");
  const { hydrate }       = await import("../../utils/evaluateLock.ts");

  const u = await buildBoundSDK(m.actorId, m.socketId);
  const tarRaw = await dbojs.queryOne({ id: m.target.id });
  if (!tarRaw) { respond(worker, msgId, null); return; }
  const target = hydrate(tarRaw as unknown as Parameters<typeof hydrate>[0]) as IDBObj;

  const out = await resolveFormat(u, target, m.slot as FormatSlot, m.defaultArg ?? "");
  respond(worker, msgId, out);
}

export async function handleUtilResolveFormatOrMessage(
  msg:    Msg,
  worker: Worker,
): Promise<void> {
  const { msgId } = msg;
  const m = msg as FormatMsg;
  if (!m.target?.id || !m.slot) {
    respond(worker, msgId, m.fallback ?? "");
    return;
  }

  const { resolveFormatOr } = await import("../../utils/resolveFormat.ts");
  const { dbojs }           = await import("../Database/index.ts");
  const { hydrate }         = await import("../../utils/evaluateLock.ts");

  const u = await buildBoundSDK(m.actorId, m.socketId);
  const tarRaw = await dbojs.queryOne({ id: m.target.id });
  if (!tarRaw) { respond(worker, msgId, m.fallback ?? ""); return; }
  const target = hydrate(tarRaw as unknown as Parameters<typeof hydrate>[0]) as IDBObj;

  const out = await resolveFormatOr(
    u, target, m.slot as FormatSlot, m.defaultArg ?? "", m.fallback ?? "",
  );
  respond(worker, msgId, out);
}
