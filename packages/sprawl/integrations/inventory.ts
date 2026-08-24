/**
 * Soft hook: inventory:show
 * Stock inventory/inv/i — Sprawl chrome when enactor has a sheet.
 */
import { gameHooks } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { getChar } from "../engine/sheet-io.ts";
import { renderLoadoutView } from "../commands/gear.ts";

type InventoryShowCtx = {
  u: IUrsamuSDK;
  handled: boolean;
};

const onInventoryShow = async (
  ctx: InventoryShowCtx,
): Promise<void> => {
  if (!ctx?.u?.me) return;
  if (!getChar(ctx.u.me)) return;
  ctx.u.send(await renderLoadoutView(ctx.u));
  ctx.handled = true;
};

export function initInventoryHooks(): void {
  // deno-lint-ignore no-explicit-any
  (gameHooks as any).on("inventory:show", onInventoryShow);
}

export function removeInventoryHooks(): void {
  // deno-lint-ignore no-explicit-any
  (gameHooks as any).off("inventory:show", onInventoryShow);
}
