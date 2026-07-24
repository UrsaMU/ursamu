import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import { emitLang } from "./hooks.ts";

export interface PlayerLangs {
  known: Record<string, number>;
  active?: string;
}

export function getPlayerLangs(dbo: IDBObj): PlayerLangs {
  const raw = (dbo.state as Record<string, unknown>)?.languages;
  if (!raw || typeof raw !== "object") return { known: {} };
  const r = raw as Record<string, unknown>;
  const known: Record<string, number> = {};
  if (r.known && typeof r.known === "object") {
    for (const [k, v] of Object.entries(r.known as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) {
        known[safeKey(k)] = clampSkill(v);
      }
    }
  }
  const active =
    typeof r.active === "string" ? r.active.toLowerCase() : undefined;
  return { known, active };
}

export function skillIn(dbo: IDBObj, langName: string): number {
  return getPlayerLangs(dbo).known[langName.toLowerCase()] ?? 0;
}

export function clampSkill(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.floor(n)));
}

function safeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function mirrorLocal(dbo: IDBObj): PlayerLangs {
  const state = dbo.state as Record<string, unknown>;
  const langs = getPlayerLangs(dbo);
  state.languages = langs;
  return langs;
}

export async function setSkill(
  u: IUrsamuSDK,
  dbo: IDBObj,
  langName: string,
  skill: number,
): Promise<void> {
  const key = safeKey(langName);
  if (!key) return;
  const value = clampSkill(skill);
  const langs = mirrorLocal(dbo);
  langs.known[key] = value;
  await u.db.modify(dbo.id, "$set", {
    [`data.languages.known.${key}`]: value,
  });
  await emitLang("language:skill_changed", {
    player: dbo,
    language: key,
    skill: value,
  });
}

export async function setActive(
  u: IUrsamuSDK,
  dbo: IDBObj,
  langName: string | null,
): Promise<void> {
  const langs = mirrorLocal(dbo);
  if (langName === null) {
    delete langs.active;
    await u.db.modify(dbo.id, "$unset", { "data.languages.active": "" });
    await emitLang("language:active_changed", {
      player: dbo,
      active: null,
    });
    return;
  }
  const key = safeKey(langName);
  if (!key) return;
  langs.active = key;
  await u.db.modify(dbo.id, "$set", { "data.languages.active": key });
  await emitLang("language:active_changed", {
    player: dbo,
    active: key,
  });
}
