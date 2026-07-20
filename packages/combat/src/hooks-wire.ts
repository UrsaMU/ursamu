/**
 * Wire combat:decide to the engine gameHooks bus.
 */
import { setCombatDecideEmitter } from "./brains.ts";

let _wired = false;

/** Call from plugin init with gameHooks from @ursamu/mush. */
export function wireCombatDecideHook(
  // deno-lint-ignore no-explicit-any
  gameHooks: { emit: (...a: any[]) => unknown },
): void {
  setCombatDecideEmitter(async (ctx) => {
    await gameHooks.emit("combat:decide", ctx);
  });
  _wired = true;
}

export function unwireCombatDecideHook(): void {
  setCombatDecideEmitter(null);
  _wired = false;
}

export function isCombatDecideHookWired(): boolean {
  return _wired;
}
