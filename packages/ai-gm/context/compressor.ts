import type {
  ICharSheet,
  IDowntimeAction,
  IFront,
  INPC,
  IOrg,
} from "./loader.ts";
import type { IGMExchange, IGMMemory, IGMReveal } from "../schema.ts";
import type { ILorePage } from "./loader.ts";
import type { IJob } from "ursamu/jobs";

// ─── Richer internal shapes (cast from loader minimal types at runtime) ────────
// These add explicit field declarations the loader omits; the index signature
// ([key: string]: unknown) on both sides makes them compatible at cast sites.

interface IHarm {
  boxes: boolean[];
  armor: number;
}

interface ICharSheetFull {
  id: string;
  playerId: string;
  name: string;
  playbookId: string;
  stats: { blood: number; heart: number; mind: number; spirit: number };
  harm: IHarm;
  corruption: { marks: number };
  circleStatus: {
    mortalis: number;
    night: number;
    power: number;
    wild: number;
  };
  debts: Array<{ direction: "owed" | "owes"; to: string; description: string }>;
  selectedMoves: string[];
  gear: string[];
  xp: number;
  [key: string]: unknown;
}

interface INPCFull {
  id: string;
  name: string;
  circle?: string;
  notes?: string;
  harm: IHarm;
  [key: string]: unknown;
}

interface IOrgFull {
  id: string;
  name: string;
  circle: string;
  description?: string;
  notes?: string;
  isPublic?: boolean;
  [key: string]: unknown;
}

interface IGrimPortent {
  triggered: boolean;
  text: string;
}

interface IFrontFull {
  id: string;
  name: string;
  description?: string;
  clockTicks: number;
  clockSize: number;
  grimPortents: IGrimPortent[];
  [key: string]: unknown;
}

interface IDowntimeActionFull {
  id: string;
  playerName: string;
  type: string;
  description: string;
  [key: string]: unknown;
}

// Inline: count marked harm boxes
function markedHarmCount(harm: IHarm): number {
  return harm.boxes.filter(Boolean).length;
}

// ─── SR4 character shape ──────────────────────────────────────────────────────

interface ISr4CharSheet {
  id: string;
  playerId: string;
  name: string;
  metatype?: string;
  attrs: Record<string, number>;
  skills?: Record<string, { rating: number; spec?: string }>;
  physicalDmg?: number;
  stunDmg?: number;
  karmaAvailable?: number;
  [key: string]: unknown;
}

function isSr4Char(c: ICharSheet): c is ICharSheet & ISr4CharSheet {
  return typeof (c as Record<string, unknown>)["attrs"] === "object" &&
    (c as Record<string, unknown>)["attrs"] !== null;
}

function formatSr4CharFull(c: ISr4CharSheet, inRoomIds: string[]): string {
  if (!inRoomIds.includes(c.playerId)) return "";
  const a = c.attrs;
  const body = a["Body"] ?? 0;
  const willpower = a["Willpower"] ?? 0;
  const physMax = Math.ceil(body / 2) + 8;
  const stunMax = Math.ceil(willpower / 2) + 8;
  const physFilled = c.physicalDmg ?? 0;
  const stunFilled = c.stunDmg ?? 0;
  const woundMod = -Math.floor((physFilled + stunFilled) / 3);
  const topSkills = Object.entries(c.skills ?? {})
    .sort((x, y) => y[1].rating - x[1].rating)
    .slice(0, 6)
    .map(([name, s]) => `${name} ${s.rating}${s.spec ? ` (${s.spec})` : ""}`)
    .join("  ");
  return [
    `${c.name} (${c.metatype ?? "Human"})`,
    `  Body ${a["Body"] ?? 0}  Agi ${a["Agility"] ?? 0}  Rea ${
      a["Reaction"] ?? 0
    }  Str ${a["Strength"] ?? 0}`,
    `  Cha ${a["Charisma"] ?? 0}  Int ${a["Intuition"] ?? 0}  Log ${
      a["Logic"] ?? 0
    }  Wil ${a["Willpower"] ?? 0}  Edge ${a["Edge"] ?? 0}`,
    `  Physical: ${physFilled}/${physMax}  Stun: ${stunFilled}/${stunMax}  Wound Mod: ${woundMod}`,
    topSkills ? `  Skills: ${topSkills}` : "",
    `  Karma: ${c.karmaAvailable ?? 0} available`,
  ].filter(Boolean).join("\n");
}

function formatSr4CharOneLiner(c: ISr4CharSheet): string {
  const physMax = Math.ceil((c.attrs["Body"] ?? 0) / 2) + 8;
  const stunMax = Math.ceil((c.attrs["Willpower"] ?? 0) / 2) + 8;
  const physFilled = c.physicalDmg ?? 0;
  const stunFilled = c.stunDmg ?? 0;
  return `${c.name} (${
    c.metatype ?? "Human"
  }) — phys ${physFilled}/${physMax}  stun ${stunFilled}/${stunMax}`;
}

// ─── Generic fallback for unrecognised char shapes ────────────────────────────
// Renders all top-level scalar (string/number/boolean) fields, skipping
// infrastructure fields that carry no narrative value for the GM.

const INFRA_FIELDS = new Set([
  "id",
  "playerId",
  "_id",
  "location",
  "contents",
  "flags",
  "state",
  "createdAt",
  "updatedAt",
]);

function formatGenericCharFull(c: ICharSheet): string {
  const lines = [`${c.name}`];
  for (const [k, v] of Object.entries(c)) {
    if (INFRA_FIELDS.has(k)) continue;
    if (k === "name") continue;
    if (
      typeof v === "string" || typeof v === "number" || typeof v === "boolean"
    ) {
      lines.push(`  ${k}: ${v}`);
    } else if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      // Flatten one level of nested objects (e.g. attrs, stats)
      const pairs = Object.entries(v as Record<string, unknown>)
        .filter(([, val]) => typeof val === "number" || typeof val === "string")
        .map(([key, val]) => `${key} ${val}`)
        .join("  ");
      if (pairs) lines.push(`  ${k}: ${pairs}`);
    }
  }
  return lines.join("\n");
}

function formatGenericCharOneLiner(c: ICharSheet): string {
  const status = c.status ?? c.chargenState ?? "unknown";
  return `${c.name} — status: ${status}`;
}

// Inline: render a clock as a filled/empty bar
function clockBar(ticks: number, size: number): string {
  const filled = Math.min(ticks, size);
  return "[" + "#".repeat(filled) + ".".repeat(size - filled) + "]" +
    ` ${filled}/${size}`;
}

// ─── Size thresholds (characters) ────────────────────────────────────────────

const THRESHOLDS = {
  loreFullText: 60, // max lore pages to include with full body
  npcOneLiner: 80, // above this many NPCs, use one-liners only
  exchangeVerbatim: 15, // keep last N exchanges verbatim
  memoryFull: 40, // above this many memories, summarize older ones
} as const;

// ─── Formatters ───────────────────────────────────────────────────────────────

function isUrbanShadowsChar(c: ICharSheet): boolean {
  const u = c as unknown as ICharSheetFull;
  return typeof u.harm === "object" && u.harm !== null &&
    Array.isArray(u.harm.boxes) &&
    typeof u.corruption === "object" && u.corruption !== null &&
    typeof u.stats === "object" && u.stats !== null &&
    typeof u.circleStatus === "object" && u.circleStatus !== null &&
    Array.isArray(u.debts) &&
    Array.isArray(u.selectedMoves);
}

export function formatCharactersFull(
  chars: ICharSheet[],
  inRoomIds: string[],
): string {
  if (!chars.length) return "None.";
  const inRoom = chars.filter((c) => inRoomIds.includes(c.playerId));
  if (!inRoom.length) return "None.";
  return inRoom
    .map((c) => {
      if (isSr4Char(c)) return formatSr4CharFull(c, [c.playerId]);
      if (isUrbanShadowsChar(c)) {
        const u = c as unknown as ICharSheetFull;
        const harmCount = markedHarmCount(u.harm);
        const corrupt = u.corruption.marks;
        const debts = u.debts.length
          ? u.debts.map((d) =>
            d.direction === "owed" ? `${d.to} owes them` : `owes ${d.to}`
          ).join(", ")
          : "none";
        return [
          `${u.name} (${u.playbookId})`,
          `  Stats: blood ${u.stats.blood}  heart ${u.stats.heart}  mind ${u.stats.mind}  spirit ${u.stats.spirit}`,
          `  Harm: ${harmCount}/5  Armor: ${u.harm.armor}  Corruption: ${corrupt}/5`,
          `  Circles: mortalis ${u.circleStatus.mortalis}  night ${u.circleStatus.night}  power ${u.circleStatus.power}  wild ${u.circleStatus.wild}`,
          `  Debts: ${debts}`,
          `  Moves: ${u.selectedMoves.join(", ") || "none"}`,
          `  XP: ${u.xp}/5`,
        ].join("\n");
      }
      return formatGenericCharFull(c);
    })
    .filter(Boolean)
    .join("\n\n");
}

export function formatCharactersOneLiner(chars: ICharSheet[]): string {
  if (!chars.length) return "None.";
  return chars
    .map((c) => {
      if (isSr4Char(c)) return formatSr4CharOneLiner(c);
      if (isUrbanShadowsChar(c)) {
        const u = c as unknown as ICharSheetFull;
        const harmCount = markedHarmCount(u.harm);
        return `${u.name} (${u.playbookId}) — harm ${harmCount}/5  corruption ${u.corruption.marks}/5`;
      }
      return formatGenericCharOneLiner(c);
    })
    .join("\n");
}

export function formatNpcs(npcs: INPC[]): string {
  if (!npcs.length) return "None.";
  const useFull = npcs.length <= THRESHOLDS.npcOneLiner;
  return (npcs as unknown as INPCFull[])
    .map((n) => {
      const harmCount = markedHarmCount(n.harm);
      if (useFull) {
        return `${n.name}${
          n.circle ? ` [${n.circle}]` : ""
        } — harm ${harmCount}/5` +
          (n.notes ? `\n  Notes: ${n.notes}` : "");
      }
      return `${n.name}${
        n.circle ? ` [${n.circle}]` : ""
      } — harm ${harmCount}/5${n.notes ? ` (${n.notes.slice(0, 60)}...)` : ""}`;
    })
    .join("\n");
}

export function formatOrgs(orgs: IOrg[]): string {
  if (!orgs.length) return "None.";
  return (orgs as unknown as IOrgFull[])
    .map((o) => {
      const desc = o.description ? `\n  ${o.description.slice(0, 120)}` : "";
      const notes = o.notes
        ? `\n  [Staff notes: ${o.notes.slice(0, 120)}]`
        : "";
      return `${o.name} [${o.circle}]${
        o.isPublic ? "" : " (hidden)"
      }${desc}${notes}`;
    })
    .join("\n");
}

export function formatFronts(fronts: IFront[]): string {
  if (!fronts.length) return "None active.";
  return (fronts as unknown as IFrontFull[])
    .map((f) => {
      const bar = clockBar(f.clockTicks, f.clockSize);
      const portents = f.grimPortents
        .map((p) => `  ${p.triggered ? "[*]" : "[ ]"} ${p.text}`)
        .join("\n");
      return [
        `${f.name} — ${bar}`,
        f.description ? `  ${f.description}` : "",
        portents,
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

export function formatMemories(memories: IGMMemory[]): string {
  if (!memories.length) return "None.";
  const permanent = memories.filter((m) => m.priority === "permanent");
  const normal = memories.filter((m) => m.priority === "normal");

  const parts: string[] = [];
  for (const m of permanent) {
    parts.push(
      `[PERMANENT] ${m.body}${
        m.resurface !== undefined ? ` [resurface: session ${m.resurface}]` : ""
      }`,
    );
  }

  const normalToShow = normal.slice(-THRESHOLDS.memoryFull);
  for (const m of normalToShow) {
    parts.push(
      `[${m.type}] ${m.body}${
        m.resurface !== undefined ? ` [resurface: session ${m.resurface}]` : ""
      }`,
    );
  }
  if (normal.length > THRESHOLDS.memoryFull) {
    parts.unshift(
      `(${
        normal.length - THRESHOLDS.memoryFull
      } older memories omitted -- use search_session_history tool for details)`,
    );
  }
  return parts.join("\n");
}

export function formatCriticalMemories(memories: IGMMemory[]): string {
  const crit = memories.filter((m) => m.priority === "permanent");
  if (!crit.length) return "";
  return crit.map((m) => `- ${m.body}`).join("\n");
}

export function formatReveals(reveals: IGMReveal[]): string {
  if (!reveals.length) return "None pending.";
  return reveals
    .map((r) => `"${r.title}": ${r.secret}\n  Trigger: ${r.triggerCondition}`)
    .join("\n\n");
}

export function formatLore(pages: ILorePage[]): string {
  if (!pages.length) return "None.";
  if (pages.length <= THRESHOLDS.loreFullText) {
    return pages
      .map((p) =>
        `[${p.path}] ${p.title}${p.body ? `\n  ${p.body.slice(0, 200)}` : ""}`
      )
      .join("\n");
  }
  // Too many pages: title + first line only
  return pages
    .map((p) => `[${p.path}] ${p.title}`)
    .join("\n") +
    `\n(${pages.length} total lore entries -- use get_wiki_page tool for full text)`;
}

export function formatOpenJobs(openJobs: IJob[]): string {
  if (!openJobs.length) return "None.";
  return openJobs
    .map((j) =>
      `#${j.number} [${j.status}] ${j.title} (${j.submitterName ?? "unknown"})`
    )
    .join("\n");
}

export function formatOpenDowntime(actions: IDowntimeAction[]): string {
  if (!actions.length) return "None.";
  return (actions as unknown as IDowntimeActionFull[])
    .map((a) => `${a.playerName}: [${a.type}] ${a.description}`)
    .join("\n");
}

export function formatRecentExchanges(exchanges: IGMExchange[]): string {
  if (!exchanges.length) return "None.";
  const recent = exchanges.slice(-THRESHOLDS.exchangeVerbatim);
  return recent
    .map((e) => {
      const who = e.playerName ? `${e.playerName}: ` : "";
      return `[${e.type}] ${who}${e.input}\n  -> ${e.output.slice(0, 300)}`;
    })
    .join("\n\n");
}
