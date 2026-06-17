// ─── GM Plugin Schemas ────────────────────────────────────────────────────────

// ─── Config ───────────────────────────────────────────────────────────────────

export type GMMode = "auto" | "hybrid";
export type LateJoinPolicy = "include" | "ignore";

export interface IGMPersona {
  name: string; // "The City"
  tone: string; // "noir, dark urban fantasy, morally grey"
  style: string; // "terse, visceral, PbtA fiction-first"
  oocBrackets: boolean; // whether to use [OOC: ...] notation
}

export interface IGMConfig {
  id: "singleton"; // only one config record
  provider: "google"; // only google for now
  model: string; // "gemini-2.0-flash-latest"
  temperature: number; // 0.0–1.0, default 0.8
  systemId: string; // "urban-shadows" — active game system
  mode: GMMode; // "auto" | "hybrid"
  persona: IGMPersona;
  watchedRooms: string[]; // roomIds the GM monitors
  ignoredPlayers: string[]; // playerIds the GM ignores
  autoframe: boolean; // auto-frame rooms on player entry
  greet: boolean; // page players on login with session summary
  lateJoins: LateJoinPolicy;
  roundTimeoutSeconds: number; // default 300
  autoPublishLore: boolean; // auto-publish lore entries on creation
  loreWebhookUrl?: string; // POST here when lore is published
  chaosLevel: number; // 1–9 (Mythic GME chaos factor)
  booksDir: string; // folder to watch for game book files
  charCollection: string; // DBO collection for character sheets (default: "server.playbooks")
  updatedAt: number;
}

export const DEFAULT_PERSONA: IGMPersona = {
  name: "The City",
  tone: "noir, dark urban fantasy, morally ambiguous, dangerous",
  style: "terse, visceral, PbtA fiction-first, present tense, second person",
  oocBrackets: true,
};

export const DEFAULT_CONFIG: IGMConfig = {
  id: "singleton",
  provider: "google",
  model: "gemini-2.0-flash-latest",
  temperature: 0.8,
  systemId: "generic",
  mode: "auto",
  persona: DEFAULT_PERSONA,
  watchedRooms: [],
  ignoredPlayers: [],
  autoframe: true,
  greet: true,
  lateJoins: "include",
  roundTimeoutSeconds: 300,
  autoPublishLore: false,
  chaosLevel: 5,
  booksDir: "./books",
  charCollection: "server.playbooks",
  updatedAt: 0,
};

// ─── Campaign Memory ───────────────────────────────────────────────────────────

export type MemoryType =
  | "plot"
  | "npc-state"
  | "world-state"
  | "player-note"
  | "consequence";
export type MemoryPriority = "normal" | "permanent";

export interface IGMMemory {
  id: string;
  type: MemoryType;
  priority: MemoryPriority;
  body: string; // "Vex allied with the Spire after session 3"
  tags: string[]; // ["npc:vex", "org:spire", "session:3"]
  resurface?: number; // session count to resurface consequence (optional)
  createdAt: number;
  updatedAt: number;
  embedding?: number[];
}

// ─── Reveal Queue ─────────────────────────────────────────────────────────────

export interface IGMReveal {
  id: string;
  title: string; // "Vex's true allegiance"
  secret: string; // what to reveal
  triggerCondition: string; // natural language: "when any player investigates the warehouse"
  firedAt?: number;
  fired: boolean;
  createdBy: string;
  createdAt: number;
}

// ─── Sessions & Exchanges ─────────────────────────────────────────────────────

export type ExchangeType =
  | "pose"
  | "oracle"
  | "move"
  | "job"
  | "downtime"
  | "narration"
  | "world-event"
  | "roll"
  | "session-summary";

export interface IGMExchange {
  id: string;
  type: ExchangeType;
  roomId?: string;
  playerId?: string;
  playerName?: string;
  input: string;
  output: string;
  toolsUsed: string[];
  timestamp: number;
  embedding?: number[];
}

export interface IGMSession {
  id: string;
  label: string;
  status: "open" | "closed";
  openedBy: string;
  openedByName: string;
  openedAt: number;
  closedAt?: number;
  closedBy?: string;
  closedByName?: string;
  exchangeCount: number;
}

// ─── Rounds ───────────────────────────────────────────────────────────────────

export type RoundStatus = "open" | "summarizing" | "adjudicating" | "closed";

export interface IGMContribution {
  playerId: string;
  playerName: string;
  poses: string[]; // raw poses/says in order
  summary?: string; // AI-compressed if multiple poses
  ready: boolean; // posted at least once
}

export interface IGMRound {
  id: string;
  sessionId: string;
  roomId: string;
  status: RoundStatus;
  expectedPlayers: string[]; // IDs of players when round opened
  contributions: IGMContribution[];
  openedAt: number;
  timeoutAt: number;
  closedAt?: number;
}

// ─── Type Guards ──────────────────────────────────────────────────────────────

export function isValidMode(s: string): s is GMMode {
  return s === "auto" || s === "hybrid";
}

export function isValidLateJoinPolicy(s: string): s is LateJoinPolicy {
  return s === "include" || s === "ignore";
}

export function isValidMemoryType(s: string): s is MemoryType {
  return ["plot", "npc-state", "world-state", "player-note", "consequence"]
    .includes(s);
}

export function isValidChaosLevel(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 9;
}
