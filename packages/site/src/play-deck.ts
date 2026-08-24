/**
 * Utopia pinned-deck pin state. Browser port: public/js/play-deck.js.
 * Keep both in sync — tests import this file.
 */

export type PinSlot = "feed" | "week";

export type RulingFace =
  | "HOLDS"
  | "HITCH"
  | "FAILS"
  | "REVISED"
  | "";

export interface DeckStory {
  title: string;
  severity: number;
}

export interface Masthead {
  city: string;
  week: string;
  stories: DeckStory[];
}

export interface CrewPip {
  name: string;
  ready: boolean;
  cmd: string;
}

export interface DeckChip {
  id: string;
  label: string;
  cmd: string;
}

export interface DeckState {
  feed: unknown | null;
  week: unknown | null;
}

export const dockChips: readonly DeckChip[] = [
  { id: "plan", label: "PLAN", cmd: "+week" },
  { id: "job", label: "JOB", cmd: "+act take-job" },
  { id: "info", label: "INFO", cmd: "+act gather-information" },
  { id: "hack", label: "HACK", cmd: "+act hack" },
  { id: "low", label: "LOW", cmd: "+act lay-low" },
  { id: "more", label: "+", cmd: "+act" },
];

export function emptyDeck(): DeckState {
  return { feed: null, week: null };
}

export function layoutType(ui: unknown): string {
  if (!ui || typeof ui !== "object") return "";
  const meta = (ui as { meta?: { type?: unknown } }).meta;
  if (!meta || typeof meta.type !== "string") return "";
  return meta.type;
}

export function pinSlot(type: string): PinSlot | null {
  if (type === "utopia-feed") return "feed";
  if (type === "utopia-week") return "week";
  return null;
}

export function rememberPin(
  state: DeckState,
  ui: unknown,
): DeckState {
  const slot = pinSlot(layoutType(ui));
  if (!slot) return state;
  return { ...state, [slot]: ui };
}

export function pinsVisible(state: DeckState): boolean {
  return !!(state.feed || state.week);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object") return null;
  return v as Record<string, unknown>;
}

export function mastheadFromFeed(ui: unknown): Masthead {
  const empty: Masthead = { city: "", week: "", stories: [] };
  if (layoutType(ui) !== "utopia-feed") return empty;
  const rec = asRecord(ui);
  const meta = rec ? asRecord(rec.meta) : null;
  if (!meta) return empty;
  const city = String(meta.city ?? "");
  const week = meta.week == null ? "" : String(meta.week);
  const raw = Array.isArray(meta.stories) ? meta.stories : [];
  const stories: DeckStory[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    if (!row) continue;
    const sev = Number(row.severity);
    stories.push({
      title: String(row.title ?? ""),
      severity: Number.isFinite(sev) ? sev : 0,
    });
  }
  return { city, week, stories };
}

export function crewFromWeek(ui: unknown): CrewPip[] {
  if (layoutType(ui) !== "utopia-week") return [];
  const rec = asRecord(ui);
  const comps = rec && Array.isArray(rec.components)
    ? rec.components
    : [];
  const out: CrewPip[] = [];
  for (const c of comps) {
    const row = asRecord(c);
    if (!row || row.type !== "entity-list") continue;
    const items = Array.isArray(row.items) ? row.items : [];
    for (const it of items) {
      const ent = asRecord(it);
      if (!ent) continue;
      const action = asRecord(ent.action);
      const meta = String(ent.meta ?? "").toLowerCase();
      out.push({
        name: String(ent.label ?? ent.name ?? ""),
        ready: meta === "ready",
        cmd: action ? String(action.cmd ?? "") : "",
      });
    }
  }
  return out;
}

const FACES: Record<string, RulingFace> = {
  holds: "HOLDS",
  hitch: "HITCH",
  fails: "FAILS",
  revised: "REVISED",
};

export function rulingFace(ui: unknown): RulingFace {
  if (layoutType(ui) !== "utopia-ruling") return "";
  const rec = asRecord(ui);
  const meta = rec ? asRecord(rec.meta) : null;
  if (!meta) return "";
  const key = String(meta.result ?? "").toLowerCase();
  return FACES[key] ?? "";
}
