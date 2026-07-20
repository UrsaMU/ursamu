/**
 * Soft hook: inventory:show
 *
 * Stock mush `inventory`/`i` emits this so plugins can replace the
 * default contents listing. When the enactor has a CofD sheet, route
 * to +gear view instead.
 */
import { gameHooks } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { gearView } from "../commands/gear.ts";

type InventoryShowCtx = {
  u: IUrsamuSDK;
  handled: boolean;
};

const onInventoryShow = async (
  ctx: InventoryShowCtx,
): Promise<void> => {
  if (!ctx?.u?.me?.state?.cofd) return;
  await gearView(ctx.u, "");
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
