import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";
import { garble } from "./garble.ts";
import { emitLang } from "./hooks.ts";
import { getLang } from "./langStore.ts";
import type { LangDef } from "./schema.ts";

export async function readActive(
  o: IDBObj,
): Promise<string | undefined> {
  const langs = (o.state as Record<string, unknown>)?.languages as
    | Record<string, unknown>
    | undefined;
  const a = langs?.active;
  const ctx = {
    player: o,
    active: typeof a === "string" ? a.toLowerCase() : undefined,
  };
  await emitLang("language:get_active", ctx);
  return ctx.active;
}

export async function skillIn(
  o: IDBObj,
  name: string,
): Promise<number> {
  const langs = (o.state as Record<string, unknown>)?.languages as
    | Record<string, unknown>
    | undefined;
  const known = langs?.known as Record<string, unknown> | undefined;
  const v = known?.[name.toLowerCase()];
  let base = 0;
  if (typeof v === "number" && Number.isFinite(v)) {
    base = Math.max(0, Math.min(100, Math.floor(v)));
  }
  const ctx = {
    player: o,
    language: name.toLowerCase(),
    skill: base,
  };
  await emitLang("language:get_skill", ctx);
  return Math.max(0, Math.min(100, Math.floor(ctx.skill)));
}

export function fallbackDef(name: string): LangDef {
  return {
    schema: 1,
    name,
    mode: "phoneme",
    description: `Default generated language for ${name}`,
    onsets: [
      "b", "c", "d", "f", "g", "h", "j", "k", "l", "m", "n", "p",
      "r", "s", "t", "v", "w", "y",
    ],
    nuclei: ["a", "e", "i", "o", "u"],
    codas: ["t", "s", "n", "r", "m", ""],
    syllablePatterns: ["CV", "CVC"],
    wordLenWeights: [0, 1, 4, 3, 2, 1],
    capitalize: "first",
  };
}

export function langDefFor(active: string): LangDef {
  return getLang(active) ?? fallbackDef(active);
}

export function connectedListeners(u: IUrsamuSDK): IDBObj[] {
  return (u.here.contents ?? []).filter(
    (o: IDBObj) =>
      o.flags.has("connected") && o.id !== u.me.id,
  );
}

export async function maybeLearn(
  u: IUrsamuSDK,
  listener: IDBObj,
  active: string,
  skill: number,
): Promise<void> {
  if (skill >= 50 || Math.random() >= 0.10) return;
  const key = active.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!key) return;
  const newSkill = skill + 1;
  const state = listener.state as Record<string, unknown>;
  if (!state.languages || typeof state.languages !== "object") {
    state.languages = { known: {} };
  }
  const langs = state.languages as {
    known?: Record<string, number>;
  };
  if (!langs.known) langs.known = {};
  langs.known[key] = newSkill;
  await u.db.modify(listener.id, "$set", {
    [`data.languages.known.${key}`]: newSkill,
  });
}

export function renderQuoted(
  text: string,
  def: LangDef,
  skill: number,
): string {
  return text.replace(
    /"([^"]*)"/g,
    (_, inner: string) => `"${garble(inner, def, skill)}"`,
  );
}

export function speakerName(u: IUrsamuSDK): string {
  return u.util.displayName(u.me, u.me);
}

export function realityOf(u: IUrsamuSDK): string {
  return (u.me.state.reality as string | undefined) ?? "material";
}
