/**
 * @module handlers/format
 *
 * Bridges util:resolveFormat / util:resolveFormatOr messages from sandbox
 * scripts to the engine-side resolveFormat helpers.
 */
import { dbojs } from "../../world/dbobjs.ts";
import { hydrate } from "../../world/dbobjs.ts";
import {
  resolveFormat,
  resolveFormatOr,
  resolveGlobalFormat,
  resolveGlobalFormatOr,
} from "../../format/handlers.ts";
import type { IDBObj, IUrsamuSDK } from "../../commands/types.ts";

type Msg = Record<string, unknown>;

function respond(worker: Worker, msgId: unknown, data: unknown): void {
  worker.postMessage({ type: "response", msgId, data });
}

interface FormatMsg extends Msg {
  target:     { id: string };
  slot:       string;
  defaultArg: string;
  fallback?:  string;
  actorId?:   string;
  socketId?:  string;
}

async function buildBoundSDK(actorId: string | undefined, socketId: string | undefined): Promise<IUrsamuSDK> {
  const meRaw = actorId ? await dbojs.queryOne({ id: actorId }) : null;
  const me    = meRaw
    ? hydrate(meRaw) as IDBObj
    : { id: actorId ?? "", name: "", flags: new Set<string>(), state: {}, contents: [] } as unknown as IDBObj;

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
      get:   attrGet,
      set:   () => Promise.resolve(),
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

  const u = await buildBoundSDK(m.actorId, m.socketId);
  const tarRaw = await dbojs.queryOne({ id: m.target.id });
  if (!tarRaw) { respond(worker, msgId, null); return; }
  const target = hydrate(tarRaw) as IDBObj;

  const rawContents = await dbojs.query({ location: target.id });
  target.contents = rawContents.map((c) => hydrate(c) as IDBObj);

  const out = await resolveFormat(u, target, m.slot, m.defaultArg ?? "");
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

  const u = await buildBoundSDK(m.actorId, m.socketId);
  const tarRaw = await dbojs.queryOne({ id: m.target.id });
  if (!tarRaw) { respond(worker, msgId, m.fallback ?? ""); return; }
  const target = hydrate(tarRaw) as IDBObj;

  const rawContents = await dbojs.query({ location: target.id });
  target.contents = rawContents.map((c) => hydrate(c) as IDBObj);

  const out = await resolveFormatOr(u, target, m.slot, m.defaultArg ?? "", m.fallback ?? "");
  respond(worker, msgId, out);
}

export async function handleUtilResolveGlobalFormatMessage(
  msg:    Msg,
  worker: Worker,
): Promise<void> {
  const { msgId } = msg;
  const m = msg as FormatMsg;
  if (!m.slot) { respond(worker, msgId, null); return; }

  const u   = await buildBoundSDK(m.actorId, m.socketId);
  const out = await resolveGlobalFormat(u, m.slot, m.defaultArg ?? "");
  respond(worker, msgId, out);
}

export async function handleUtilResolveGlobalFormatOrMessage(
  msg:    Msg,
  worker: Worker,
): Promise<void> {
  const { msgId } = msg;
  const m = msg as FormatMsg;
  if (!m.slot) { respond(worker, msgId, m.fallback ?? ""); return; }

  const u   = await buildBoundSDK(m.actorId, m.socketId);
  const out = await resolveGlobalFormatOr(u, m.slot, m.defaultArg ?? "", m.fallback ?? "");
  respond(worker, msgId, out);
}
