/**
 * Soft hook: object:use — consume Sprawl Thing charges.
 */
import { gameHooks } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import { isSprawlItem } from "../engine/items.ts";
import { applyUseEffect } from "../engine/use-effect.ts";

type ActionEvt = {
  u: IUrsamuSDK;
  actor: IDBObj;
  thing: IDBObj;
  handled?: boolean;
};

const onObjectUse = async (e: ActionEvt): Promise<void> => {
  if (!e?.thing || !e.u || !e.actor) return;
  if (!isSprawlItem(e.thing)) return;
  e.handled = true;
  const r = await applyUseEffect(e.u, e.actor, e.thing);
  if (r.message) e.u.send(r.message);
};

export function initObjectUseHooks(): void {
  // deno-lint-ignore no-explicit-any
  (gameHooks as any).on?.("object:use", onObjectUse);
}

export function removeObjectUseHooks(): void {
  // deno-lint-ignore no-explicit-any
  (gameHooks as any).off?.("object:use", onObjectUse);
}
