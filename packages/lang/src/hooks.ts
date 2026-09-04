/**
 * Typed payload shapes for language plugin gameHooks events.
 *
 * JSR forbids `declare module` / GameHookMap merging in published
 * packages. Consumers type listeners with these interfaces instead:
 *
 *   import type { LangGetSkillCtx } from "@ursamu/lang-plugin";
 *   gameHooks.on("language:get_skill", (ctx: LangGetSkillCtx) => {
 *     ctx.skill = 100;
 *   });
 */
import { gameHooks } from "@ursamu/mush";
import type { IDBObj } from "@ursamu/mush";

export interface LangGetActiveCtx {
  player: IDBObj;
  active?: string;
}

export interface LangGetSkillCtx {
  player: IDBObj;
  language: string;
  skill: number;
}

export interface LangGetKnownCtx {
  player: IDBObj;
  known: Record<string, number>;
}

export interface LangSkillChangedEvent {
  player: IDBObj;
  language: string;
  skill: number;
}

export interface LangActiveChangedEvent {
  player: IDBObj;
  active: string | null;
}

/** Emit a language hook without fighting engine GameHookMap typing. */
export async function emitLang(
  event: "language:get_active",
  payload: LangGetActiveCtx,
): Promise<void>;
export async function emitLang(
  event: "language:get_skill",
  payload: LangGetSkillCtx,
): Promise<void>;
export async function emitLang(
  event: "language:get_known",
  payload: LangGetKnownCtx,
): Promise<void>;
export async function emitLang(
  event: "language:skill_changed",
  payload: LangSkillChangedEvent,
): Promise<void>;
export async function emitLang(
  event: "language:active_changed",
  payload: LangActiveChangedEvent,
): Promise<void>;
export async function emitLang(
  event: string,
  payload: unknown,
): Promise<void> {
  // deno-lint-ignore no-explicit-any
  await (gameHooks as any).emit(event, payload);
}
