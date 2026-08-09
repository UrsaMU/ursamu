/**
 * object:open / object:use / object:close — D&D chests & altars.
 */
import { gameHooks, type IDBObj, type IUrsamuSDK } from
  "@ursamu/ursamu";
import { openDndChest } from "../commands/chest-open.ts";
import { useDndProp } from "../commands/prop-use.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

type ActionEvt = {
  u: IUrsamuSDK;
  actor: IDBObj;
  thing: IDBObj;
  handled?: boolean;
};

function dndOf(o: IDBObj): Any {
  return (o.state as Any)?.dnd;
}

async function onOpen(e: ActionEvt): Promise<void> {
  if (!e?.thing || !e.u) return;
  const d = dndOf(e.thing);
  if (!d || d.type !== "chest") return;
  e.handled = true;
  const r = await openDndChest(e.u, e.thing);
  if (!r.ok && r.message) e.u.send(r.message);
}

async function onUse(e: ActionEvt): Promise<void> {
  if (!e?.thing || !e.u) return;
  const d = dndOf(e.thing);
  if (!d) return;
  if (d.type !== "altar" && d.type !== "campfire") return;
  e.handled = true;
  const r = await useDndProp(e.u, e.thing);
  if (!r.ok && r.message) e.u.send(r.message);
}

async function onClose(e: ActionEvt): Promise<void> {
  if (!e?.thing || !e.u) return;
  const d = dndOf(e.thing);
  if (!d || d.type !== "chest") return;
  e.handled = true;
  if (!d.opened) {
    e.u.send("It is already closed.");
    return;
  }
  // Once looted, closing is cosmetic only
  e.u.send(
    "You close it, but the treasure is already gone.",
  );
}

export function initObjectActionHooks(): void {
  // deno-lint-ignore no-explicit-any
  const h = gameHooks as any;
  h.on?.("object:open", onOpen);
  h.on?.("object:use", onUse);
  h.on?.("object:close", onClose);
}

export function removeObjectActionHooks(): void {
  // deno-lint-ignore no-explicit-any
  const h = gameHooks as any;
  h.off?.("object:open", onOpen);
  h.off?.("object:use", onUse);
  h.off?.("object:close", onClose);
}
