/**
 * @module handlers/chan
 *
 * Handles worker messages for channel operations:
 *   chan:join, chan:leave, chan:list, chan:create, chan:destroy, chan:set, chan:history
 */
import { sessions, rooms, DBO } from "@ursamu/core";
import { dbojs, chans } from "../../world/dbobjs.ts";
import type { SDKContext } from "../sdk-service.ts";

/** Channel entry stored on a player object. */
export interface IChanEntry {
  id:      string;
  channel: string;
  alias:   string;
  active:  boolean;
}

interface IChanRecord {
  id: string;
  name: string;
  header: string;
  lock: string;
  hidden: boolean;
  owner: string;
  masking?: boolean;
  logHistory?: boolean;
  historyLimit?: number;
}

interface IChanHistoryRecord {
  id: string;
  chanId: string;
  playerName: string;
  message: string;
  timestamp: number;
}

const chanHistory = new DBO<IChanHistoryRecord>("chanHistory");

type Msg    = Record<string, unknown>;
type Worker = globalThis.Worker;
// deno-lint-ignore no-explicit-any
type AnyData = any;

function respond(worker: Worker, msgId: unknown, data: unknown): void {
  worker.postMessage({ type: "response", msgId, data });
}

export async function handleChanMessage(
  msg:     Msg,
  worker:  Worker,
  context: SDKContext | undefined,
): Promise<void> {
  const { type, msgId } = msg;

  if (type === "chan:join") {
    if (!msg.channel || !msg.alias || !context?.id) { respond(worker, msgId, null); return; }
    const en = await dbojs.queryOne({ id: context.id as string });
    if (en) {
      en.data ||= {};
      const chanList = ((en.data.channels as unknown[] || []) as IChanEntry[]);
      chanList.push({ id: crypto.randomUUID(), channel: msg.channel as string, alias: msg.alias as string, active: true });
      await dbojs.modify({ id: en.id }, "$set", { "data.channels": chanList } as AnyData);
      const session = sessions.getBySession(en.id);
      if (session) {
        rooms.join(session.socketId, `#chan:${msg.channel as string}`);
      }
    }
    respond(worker, msgId, null);
    return;
  }

  if (type === "chan:leave") {
    if (!msg.alias || !context?.id) { respond(worker, msgId, null); return; }
    const en = await dbojs.queryOne({ id: context.id as string });
    if (en) {
      en.data ||= {};
      const chanList = ((en.data.channels as unknown[] || []) as IChanEntry[]);
      const idx = chanList.findIndex(c => c.alias === msg.alias);
      if (idx !== -1) {
        const leavingChannel = chanList[idx].channel;
        chanList.splice(idx, 1);
        await dbojs.modify({ id: en.id }, "$set", { "data.channels": chanList } as AnyData);
        const session = sessions.getBySession(en.id);
        if (session) {
          rooms.leave(session.socketId, `#chan:${leavingChannel}`);
        }
      }
    }
    respond(worker, msgId, null);
    return;
  }

  if (type === "chan:list") {
    const list = await chans.query({});
    respond(worker, msgId, list);
    return;
  }

  if (type === "chan:create") {
    if (!msg.name) { respond(worker, msgId, null); return; }
    const name     = String(msg.name).toLowerCase().trim();
    const existing = await chans.queryOne({ name });
    if (existing) { respond(worker, msgId, { error: "Channel already exists." }); return; }
    const chan = await chans.create({
      id:     name,
      name,
      header: String(msg.header || `[${name.toUpperCase()}]`),
      lock:   String(msg.lock || ""),
      hidden: Boolean(msg.hidden),
      owner:  String(context?.id || ""),
    });
    respond(worker, msgId, chan);
    return;
  }

  if (type === "chan:destroy") {
    if (!msg.name) { respond(worker, msgId, null); return; }
    const name     = String(msg.name).toLowerCase().trim();
    const existing = await chans.queryOne({ name });
    if (!existing) { respond(worker, msgId, { error: "Channel not found." }); return; }
    await chans.delete({ name });
    respond(worker, msgId, { ok: true });
    return;
  }

  if (type === "chan:set") {
    if (!msg.name) { respond(worker, msgId, null); return; }
    const name     = String(msg.name).toLowerCase().trim();
    const existing = await chans.queryOne({ name });
    if (!existing) { respond(worker, msgId, { error: "Channel not found." }); return; }
    const updates: Record<string, unknown> = {};
    if (msg.header       !== undefined) updates.header       = msg.header;
    if (msg.lock         !== undefined) updates.lock         = msg.lock;
    if (msg.hidden       !== undefined) updates.hidden       = msg.hidden;
    if (msg.masking      !== undefined) updates.masking      = msg.masking;
    if (msg.logHistory   !== undefined) updates.logHistory   = msg.logHistory;
    if (msg.historyLimit !== undefined) updates.historyLimit = msg.historyLimit;
    await chans.modify({ name }, "$set", updates);
    respond(worker, msgId, { ok: true });
    return;
  }

  if (type === "chan:history") {
    const name = String(msg.name || "").toLowerCase().trim();
    if (!name) { respond(worker, msgId, []); return; }
    const chan = await chans.queryOne({ name });
    if (!chan) { respond(worker, msgId, { error: "Channel not found." }); return; }
    const limit = typeof msg.limit === "number" ? Math.max(msg.limit, 1) : 20;
    const all   = (await chanHistory.query({ chanId: chan.id } as AnyData)) as IChanHistoryRecord[];
    all.sort((a: IChanHistoryRecord, b: IChanHistoryRecord) => a.timestamp - b.timestamp);
    respond(worker, msgId, all.slice(-limit));
    return;
  }
}
