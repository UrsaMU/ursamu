// ─── GM Plugin Commands ────────────────────────────────────────────────────────
//
// +gm                      — show GM status
// +gm/config               — show current config
// +gm/config/model <model> — set Gemini model
// +gm/config/apikey <key>  — set Google API key
// +gm/config/mode <auto|hybrid> — set GM mode
// +gm/config/chaos <1-9>   — set chaos factor
// +gm/config/system <id>  — switch active game system
// +gm/config/chars <collection> — set character sheet DBO collection
// +gm/watch <roomId>       — add room to watched list
// +gm/unwatch <roomId>     — remove room from watched list
// +gm/ignore <playerId>    — add player to ignore list
// +gm/unignore <playerId>  — remove player from ignore list
// +gm/go                   — manually trigger round adjudication in current room
// +gm/session/open <label> — open a new GM session
// +gm/session/close        — close current GM session
// +gm/reload               — force context cache reload
// +gm/oracle <question>    — ask the GM oracle a yes/no question
// +gm/move <move>=<total>  — adjudicate a completed move roll
// +gm/scene/publish <text> — broadcast a GM narration draft to the current room
// +gm/ingest              — manually trigger book ingestion
// +gm/ingest/status       — show current ingestion job status
// +gm/ingest/transcript <jobId> — export setup conversation
// +gm/ingest/review <jobId>/<itemId>=<value> — resolve uncertain item
// +gm/ingest/review <jobId>/<itemId>/skip    — accept AI suggestion
// +gm/ingest/approve <jobId> — commit the system
// +gm/ingest/reject  <jobId> — cancel ingestion
// +gm/config/booksdir <path> — set books folder path

import { addCmd } from "ursamu/app";
import { loadConfig, saveConfig } from "./providers.ts";
import { sessionCache } from "./context/cache.ts";
import { isValidChaosLevel, isValidMode } from "./schema.ts";
import { gmSessions } from "./db.ts";
import type { IGMSession } from "./schema.ts";
import { getGameSystem, getGameSystemNames } from "./systems/index.ts";
import { gmIngestionJobs } from "./ingestion/db.ts";
import { commitSystem, resolveItem } from "./ingestion/reviewer.ts";
import { creditPlayer, getLedger, getWallet } from "./monetization/credits.ts";
import { getPlan, getPlans } from "./monetization/plans.ts";
import type { IPaymentAdapter } from "./monetization/interface.ts";
import {
  formatJournalEntry,
  getJournalEntries,
  getJournalEntry,
} from "./social/journal.ts";
import {
  formatSpotlights,
  getSpotlights,
  recordSpotlight,
} from "./social/spotlight.ts";
import {
  activatePersona,
  createPersona,
  deactivatePersona,
  deletePersona,
  formatPersonas,
  getPersonasForPlayer,
} from "./social/persona.ts";

// ─── Payment adapter (set by index.ts) ───────────────────────────────────────
let _paymentAdapter: IPaymentAdapter | null = null;
export function registerPaymentAdapter(adapter: IPaymentAdapter): void {
  _paymentAdapter = adapter;
}

// ─── Ingest command callbacks (set by index.ts) ───────────────────────────────
type IngestFn = () => Promise<void>;
let _ingestCallback: IngestFn | null = null;
export function registerIngestCallback(fn: IngestFn): void {
  _ingestCallback = fn;
}

// ─── Session close callback (set by index.ts) ─────────────────────────────────
type SessionCloseFn = (
  sessionId: string,
  sessionLabel: string,
) => Promise<void>;
let _sessionCloseCallback: SessionCloseFn | null = null;
export function registerSessionCloseCallback(fn: SessionCloseFn): void {
  _sessionCloseCallback = fn;
}

type ModelFactory = () =>
  import("@langchain/google-genai").ChatGoogleGenerativeAI;
let _modelFactory: ModelFactory | null = null;
export function registerModelFactory(fn: ModelFactory): void {
  _modelFactory = fn;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type UC = {
  me: { id: string; flags: Set<string>; name?: string };
  here: unknown;
  send: (msg: string) => void;
  cmd: { args: string[]; switches?: string[] };
};

function isStaff(u: UC): boolean {
  return (
    u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser")
  );
}

function roomId(u: UC): string {
  return ((u.here as { id?: string })?.id) ?? "";
}

const H = "%ch";
const N = "%cn";

// ─── +gm ─────────────────────────────────────────────────────────────────────

addCmd({
  name: "+gm",
  category: "GM",
  help: "+gm  --  Show the AI GM status and configuration summary.",
  pattern: /^\+gm$/i,
  exec: async (u: UC) => {
    const cfg = await loadConfig();
    // LOW-01: non-staff see a minimal public view — no room/player surveillance data
    if (!isStaff(u)) {
      u.send(
        `${H}--- AI GM Status ---${N}\n  System: ${cfg.systemId}  Mode: ${cfg.mode}`,
      );
      return;
    }
    const cached = sessionCache.isLoaded();
    const loadedAt = sessionCache.loadedAt();
    const lines = [
      `${H}--- AI GM Status ---${N}`,
      `  Model:     ${cfg.model}`,
      `  System:    ${cfg.systemId}`,
      `  Mode:      ${cfg.mode}`,
      `  Chaos:     ${cfg.chaosLevel}`,
      `  Watched:   ${
        cfg.watchedRooms.length ? cfg.watchedRooms.join(", ") : "(none)"
      }`,
      `  Ignored:   ${
        cfg.ignoredPlayers.length ? cfg.ignoredPlayers.join(", ") : "(none)"
      }`,
      `  Cache:     ${
        cached
          ? `loaded (${
            loadedAt ? new Date(loadedAt).toISOString() : "unknown"
          })`
          : "not loaded"
      }`,
      `  Autoframe: ${cfg.autoframe ? "on" : "off"}`,
      `  Greet:     ${cfg.greet ? "on" : "off"}`,
      `  Timeout:   ${cfg.roundTimeoutSeconds}s`,
      `  BooksDir:  ${cfg.booksDir}`,
    ];
    u.send(lines.join("\n"));
  },
});

// ─── +gm/config ──────────────────────────────────────────────────────────────

addCmd({
  name: "+gm/config",
  category: "GM",
  help: "+gm/config  --  Show full GM configuration.",
  pattern: /^\+gm\/config$/i,
  exec: async (u: UC) => {
    if (!isStaff(u)) {
      u.send(`${H}+gm/config:${N}  Staff only.`);
      return;
    }
    const cfg = await loadConfig();
    const apiKeyStatus = Deno.env.get("GOOGLE_API_KEY")
      ? "***set***"
      : "(not set — add GOOGLE_API_KEY to .env)";
    const display = { ...cfg, GOOGLE_API_KEY: apiKeyStatus };
    u.send(`${H}--- GM Config ---${N}\n${JSON.stringify(display, null, 2)}`);
  },
});

addCmd({
  name: "+gm/config/model",
  category: "GM",
  help:
    "+gm/config/model <model>  --  Set the Gemini model (e.g. gemini-2.0-flash-latest).",
  pattern: /^\+gm\/config\/model\s+(.+)$/i,
  exec: async (u: UC) => {
    if (!isStaff(u)) {
      u.send(`${H}+gm/config/model:${N}  Staff only.`);
      return;
    }
    const model = u.cmd.args[0]?.trim();
    if (!model) {
      u.send(`${H}+gm/config/model:${N}  Usage: +gm/config/model <model>`);
      return;
    }
    await saveConfig({ model });
    u.send(`${H}+gm/config/model:${N}  Model set to: ${model}`);
  },
});

addCmd({
  name: "+gm/config/mode",
  category: "GM",
  help:
    "+gm/config/mode <auto|hybrid>  --  auto: GM responds automatically; hybrid: staff-triggered only.",
  pattern: /^\+gm\/config\/mode\s+(\w+)$/i,
  exec: async (u: UC) => {
    if (!isStaff(u)) {
      u.send(`${H}+gm/config/mode:${N}  Staff only.`);
      return;
    }
    const mode = u.cmd.args[0]?.trim().toLowerCase();
    if (!mode || !isValidMode(mode)) {
      u.send(`${H}+gm/config/mode:${N}  Must be 'auto' or 'hybrid'.`);
      return;
    }
    await saveConfig({ mode });
    u.send(`${H}+gm/config/mode:${N}  Mode set to: ${mode}`);
  },
});

addCmd({
  name: "+gm/config/chaos",
  category: "GM",
  help:
    "+gm/config/chaos <1-9>  --  Set the Mythic GME chaos factor (1=controlled, 9=chaotic).",
  pattern: /^\+gm\/config\/chaos\s+(\d)$/i,
  exec: async (u: UC) => {
    if (!isStaff(u)) {
      u.send(`${H}+gm/config/chaos:${N}  Staff only.`);
      return;
    }
    const n = parseInt(u.cmd.args[0] ?? "", 10);
    if (!isValidChaosLevel(n)) {
      u.send(`${H}+gm/config/chaos:${N}  Must be a number 1-9.`);
      return;
    }
    await saveConfig({ chaosLevel: n });
    u.send(`${H}+gm/config/chaos:${N}  Chaos level set to ${n}.`);
  },
});

addCmd({
  name: "+gm/config/system",
  category: "GM",
  help:
    "+gm/config/system <id>  --  Switch the active game system. Use +gm/config to list available systems.",
  pattern: /^\+gm\/config\/system\s+(.+)$/i,
  exec: async (u: UC) => {
    if (!isStaff(u)) {
      u.send(`${H}+gm/config/system:${N}  Staff only.`);
      return;
    }
    const id = u.cmd.args[0]?.trim();
    if (!id) {
      const names = getGameSystemNames().join(", ");
      u.send(`${H}+gm/config/system:${N}  Available systems: ${names}`);
      return;
    }
    const sys = getGameSystem(id);
    if (sys.id !== id) {
      const names = getGameSystemNames().join(", ");
      u.send(
        `${H}+gm/config/system:${N}  Unknown system "${id}". Available: ${names}`,
      );
      return;
    }
    // If the system declares a charCollection, adopt it automatically.
    // Explicit +gm/config/chars overrides take precedence later if the admin sets one.
    const configUpdate: { systemId: string; charCollection?: string } = {
      systemId: id,
    };
    if (sys.charCollection) {
      configUpdate.charCollection = sys.charCollection;
      sessionCache.setCharCollection(sys.charCollection);
    }
    await saveConfig(configUpdate);
    const collectionNote = sys.charCollection
      ? `  Character collection → ${sys.charCollection}`
      : "";
    u.send(
      `${H}+gm/config/system:${N}  Active system set to: ${sys.name}.${collectionNote}`,
    );
  },
});

// ─── +gm/config/chars ────────────────────────────────────────────────────────

/**
 * Validates a DBO collection name.
 * Must be one or more lowercase alphanumeric segments separated by dots.
 * Examples of valid names: "server.playbooks", "shadowrun.chars", "mygame.sheets"
 */
function isValidCollectionName(s: string): boolean {
  return /^[a-z0-9]+(\.[a-z0-9]+)*$/.test(s);
}

addCmd({
  name: "+gm/config/chars",
  category: "GM",
  help:
    `+gm/config/chars <collection>  --  Set the DBO collection the GM reads for character sheets.

  <collection>   Dot-separated DBO name, e.g. shadowrun.chars or server.playbooks.
                 Changes take effect immediately without a restart.

Examples:
  +gm/config/chars shadowrun.chars     Point GM at the Shadowrun character collection.
  +gm/config/chars server.playbooks    Restore Urban Shadows default collection.`,
  pattern: /^\+gm\/config\/chars\s+(.+)$/i,
  exec: async (u: UC) => {
    if (!isStaff(u)) {
      u.send(`${H}+gm/config/chars:${N}  Staff only.`);
      return;
    }
    const raw = u.cmd.args[0]?.trim().toLowerCase();
    if (!raw) {
      u.send(`${H}+gm/config/chars:${N}  Usage: +gm/config/chars <collection>`);
      return;
    }
    if (!isValidCollectionName(raw)) {
      u.send(
        `${H}+gm/config/chars:${N}  Invalid collection name. Use lowercase alphanumeric segments separated by dots (e.g. shadowrun.chars).`,
      );
      return;
    }
    await saveConfig({ charCollection: raw });
    // Hot-swap the live cache — no restart needed.
    sessionCache.setCharCollection(raw);
    u.send(`${H}+gm/config/chars:${N}  Character collection set to: ${raw}`);
  },
});

// ─── +gm/watch / +gm/unwatch ─────────────────────────────────────────────────

addCmd({
  name: "+gm/watch",
  category: "GM",
  help: "+gm/watch  --  Add the current room to the GM's watched room list.",
  pattern: /^\+gm\/watch$/i,
  exec: async (u: UC) => {
    if (!isStaff(u)) {
      u.send(`${H}+gm/watch:${N}  Staff only.`);
      return;
    }
    const rid = roomId(u);
    if (!rid) {
      u.send(`${H}+gm/watch:${N}  Cannot determine room.`);
      return;
    }
    const cfg = await loadConfig();
    if (cfg.watchedRooms.includes(rid)) {
      u.send(`${H}+gm/watch:${N}  Room ${rid} is already watched.`);
      return;
    }
    await saveConfig({ watchedRooms: [...cfg.watchedRooms, rid] });
    u.send(`${H}+gm/watch:${N}  Room ${rid} added to watch list.`);
  },
});

addCmd({
  name: "+gm/unwatch",
  category: "GM",
  help:
    "+gm/unwatch  --  Remove the current room from the GM's watched room list.",
  pattern: /^\+gm\/unwatch$/i,
  exec: async (u: UC) => {
    if (!isStaff(u)) {
      u.send(`${H}+gm/unwatch:${N}  Staff only.`);
      return;
    }
    const rid = roomId(u);
    const cfg = await loadConfig();
    if (!cfg.watchedRooms.includes(rid)) {
      u.send(`${H}+gm/unwatch:${N}  Room ${rid} is not on the watch list.`);
      return;
    }
    await saveConfig({
      watchedRooms: cfg.watchedRooms.filter((r) => r !== rid),
    });
    u.send(`${H}+gm/unwatch:${N}  Room ${rid} removed from watch list.`);
  },
});

// ─── +gm/ignore / +gm/unignore ───────────────────────────────────────────────

addCmd({
  name: "+gm/ignore",
  category: "GM",
  help:
    "+gm/ignore <playerId>  --  Prevent the GM from responding to a specific player.",
  pattern: /^\+gm\/ignore\s+(.+)$/i,
  exec: async (u: UC) => {
    if (!isStaff(u)) {
      u.send(`${H}+gm/ignore:${N}  Staff only.`);
      return;
    }
    const pid = u.cmd.args[0]?.trim();
    if (!pid) {
      u.send(`${H}+gm/ignore:${N}  Usage: +gm/ignore <playerId>`);
      return;
    }
    const cfg = await loadConfig();
    if (!cfg.ignoredPlayers.includes(pid)) {
      await saveConfig({ ignoredPlayers: [...cfg.ignoredPlayers, pid] });
    }
    u.send(`${H}+gm/ignore:${N}  Player ${pid} ignored.`);
  },
});

addCmd({
  name: "+gm/unignore",
  category: "GM",
  help: "+gm/unignore <playerId>  --  Remove a player from the GM ignore list.",
  pattern: /^\+gm\/unignore\s+(.+)$/i,
  exec: async (u: UC) => {
    if (!isStaff(u)) {
      u.send(`${H}+gm/unignore:${N}  Staff only.`);
      return;
    }
    const pid = u.cmd.args[0]?.trim();
    if (!pid) {
      u.send(`${H}+gm/unignore:${N}  Usage: +gm/unignore <playerId>`);
      return;
    }
    const cfg = await loadConfig();
    await saveConfig({
      ignoredPlayers: cfg.ignoredPlayers.filter((p) => p !== pid),
    });
    u.send(`${H}+gm/unignore:${N}  Player ${pid} removed from ignore list.`);
  },
});

// ─── +gm/session/open ─────────────────────────────────────────────────────────

addCmd({
  name: "+gm/session/open",
  category: "GM",
  help: "+gm/session/open <label>  --  Open a new GM session.",
  pattern: /^\+gm\/session\/open\s+(.+)$/i,
  exec: async (u: UC) => {
    if (!isStaff(u)) {
      u.send(`${H}+gm/session/open:${N}  Staff only.`);
      return;
    }
    const label = u.cmd.args[0]?.trim();
    if (!label) {
      u.send(`${H}+gm/session/open:${N}  Usage: +gm/session/open <label>`);
      return;
    }

    // Close any currently open session
    const existing = await gmSessions.query(
      {
        status: "open",
      } as Parameters<typeof gmSessions.query>[0],
    ) as IGMSession[];
    for (const s of existing) {
      await gmSessions.modify(
        { id: s.id } as Parameters<typeof gmSessions.modify>[0],
        "$set",
        {
          status: "closed",
          closedAt: Date.now(),
          closedBy: u.me.id,
          closedByName: (u.me as { name?: string }).name ?? u.me.id,
        },
      );
    }

    const sess: Omit<IGMSession, "id"> = {
      label,
      status: "open",
      openedBy: u.me.id,
      openedByName: (u.me as { name?: string }).name ?? u.me.id,
      openedAt: Date.now(),
      exchangeCount: 0,
    };
    const created = await gmSessions.create(
      sess as Parameters<typeof gmSessions.create>[0],
    ) as IGMSession;
    sessionCache.invalidateAll();
    u.send(
      `${H}+gm/session/open:${N}  Session "${label}" opened (id: ${created.id}).`,
    );
  },
});

addCmd({
  name: "+gm/session/close",
  category: "GM",
  help: "+gm/session/close  --  Close the current GM session.",
  pattern: /^\+gm\/session\/close$/i,
  exec: async (u: UC) => {
    if (!isStaff(u)) {
      u.send(`${H}+gm/session/close:${N}  Staff only.`);
      return;
    }
    const existing = await gmSessions.query(
      {
        status: "open",
      } as Parameters<typeof gmSessions.query>[0],
    ) as IGMSession[];

    if (!existing.length) {
      u.send(`${H}+gm/session/close:${N}  No open session.`);
      return;
    }

    for (const s of existing) {
      await gmSessions.modify(
        { id: s.id } as Parameters<typeof gmSessions.modify>[0],
        "$set",
        {
          status: "closed",
          closedAt: Date.now(),
          closedBy: u.me.id,
          closedByName: (u.me as { name?: string }).name ?? u.me.id,
        },
      );
      // Fire journal generation + Discord event (non-blocking)
      _sessionCloseCallback?.(s.id, s.label).catch((e) =>
        console.warn("[GM] Session close callback error:", e)
      );
    }
    u.send(`${H}+gm/session/close:${N}  Session closed.`);
  },
});

// ─── +gm/reload ──────────────────────────────────────────────────────────────

addCmd({
  name: "+gm/reload",
  category: "GM",
  help: "+gm/reload  --  Force the GM context cache to reload on next use.",
  pattern: /^\+gm\/reload$/i,
  exec: (u: UC) => {
    if (!isStaff(u)) {
      u.send(`${H}+gm/reload:${N}  Staff only.`);
      return;
    }
    sessionCache.invalidateAll();
    u.send(
      `${H}+gm/reload:${N}  Context cache invalidated. Will reload on next GM action.`,
    );
  },
});

// ─── +gm/go ──────────────────────────────────────────────────────────────────
// Manually triggers round adjudication. The actual graph invocation is done
// in index.ts by the gmGo() function which is registered here as a callback.

let _gmGoCallback: ((roomId: string, staffId: string) => void) | null = null;

export function registerGmGoCallback(
  fn: (roomId: string, staffId: string) => void,
): void {
  _gmGoCallback = fn;
}

addCmd({
  name: "+gm/go",
  category: "GM",
  help:
    "+gm/go  --  Manually trigger GM adjudication for the current room's open round.",
  pattern: /^\+gm\/go$/i,
  exec: (u: UC) => {
    if (!isStaff(u)) {
      u.send(`${H}+gm/go:${N}  Staff only.`);
      return;
    }
    const rid = roomId(u);
    if (!rid) {
      u.send(`${H}+gm/go:${N}  Cannot determine room.`);
      return;
    }
    if (!_gmGoCallback) {
      u.send(`${H}+gm/go:${N}  GM not initialised.`);
      return;
    }
    u.send(`${H}+gm/go:${N}  Triggering adjudication for room ${rid}...`);
    _gmGoCallback(rid, u.me.id);
  },
});

// ─── +gm/oracle ──────────────────────────────────────────────────────────────

let _oracleCallback:
  | ((
    playerId: string,
    question: string,
    probability: string,
    roomId: string,
  ) => void)
  | null = null;

export function registerOracleCallback(
  fn: (
    playerId: string,
    question: string,
    probability: string,
    roomId: string,
  ) => void,
): void {
  _oracleCallback = fn;
}

addCmd({
  name: "+gm/oracle",
  category: "GM",
  help:
    "+gm/oracle[/<probability>] <question>  --  Ask the GM oracle a yes/no question.\n" +
    "  Probability switches: certain, very-likely, likely, 50-50, unlikely, very-unlikely, impossible\n" +
    "  Default: 50-50\n" +
    "  Example: +gm/oracle/likely Does Vex know about the deal?",
  pattern: /^\+gm\/oracle(?:\/([a-z-]+))?\s+(.+)$/i,
  exec: (u: UC) => {
    // HIGH-02: staff-only — oracle fires full LLM + tools, open to all = DoS + info leak
    if (!isStaff(u)) {
      u.send(`${H}+gm/oracle:${N}  Staff only.`);
      return;
    }
    const probability = (u.cmd.args[0] ?? "50-50").toLowerCase();
    const question = u.cmd.args[1]?.trim();
    if (!question) {
      u.send(`${H}+gm/oracle:${N}  Usage: +gm/oracle[/probability] <question>`);
      return;
    }
    if (!_oracleCallback) {
      u.send(`${H}+gm/oracle:${N}  GM not initialised.`);
      return;
    }
    const rid = roomId(u);
    u.send(`${H}[GM oracle consulting the city...]${N}`);
    _oracleCallback(u.me.id, question, probability, rid);
  },
});

// ─── +gm/scene/publish ───────────────────────────────────────────────────────
// Broadcasts a GM narration (typically an edited draft from +gm/scene:set) to
// everyone in the staff member's current room.

let _scenePublishCallback:
  | ((roomId: string, message: string) => void)
  | null = null;

export function registerScenePublishCallback(
  fn: (roomId: string, message: string) => void,
): void {
  _scenePublishCallback = fn;
}

addCmd({
  name: "+gm/scene/publish",
  category: "GM",
  help:
    "+gm/scene/publish <text>  --  Broadcast a GM narration to the current room.\n" +
    "  Use after receiving a [GM DRAFT] page from scene:set to broadcast the\n" +
    "  (optionally edited) narration to all players in the room.",
  pattern: /^\+gm\/scene\/publish\s+(.+)$/is,
  exec: (u: UC) => {
    if (!isStaff(u)) {
      u.send(`${H}+gm/scene/publish:${N}  Staff only.`);
      return;
    }
    const text = u.cmd.args[0]?.trim();
    if (!text) {
      u.send(`${H}+gm/scene/publish:${N}  Usage: +gm/scene/publish <text>`);
      return;
    }
    if (!_scenePublishCallback) {
      u.send(`${H}+gm/scene/publish:${N}  GM not initialised.`);
      return;
    }
    const rid = roomId(u);
    if (!rid) {
      u.send(`${H}+gm/scene/publish:${N}  Cannot determine room.`);
      return;
    }
    _scenePublishCallback(rid, text);
    u.send(`${H}+gm/scene/publish:${N}  Narration broadcast to room ${rid}.`);
  },
});

// ─── +gm/move ────────────────────────────────────────────────────────────────

let _moveCallback:
  | ((
    playerId: string,
    moveName: string,
    total: number,
    roomId: string,
  ) => void)
  | null = null;

export function registerMoveCallback(
  fn: (
    playerId: string,
    moveName: string,
    total: number,
    roomId: string,
  ) => void,
): void {
  _moveCallback = fn;
}

addCmd({
  name: "+gm/move",
  category: "GM",
  help:
    "+gm/move <move name>=<total>  --  Submit a completed move roll for GM adjudication.\n" +
    "  Example: +gm/move Go Aggro=9",
  pattern: /^\+gm\/move\s+(.+)=(\d+)$/i,
  exec: (u: UC) => {
    // HIGH-02: staff-only — move adjudication fires full LLM + tools
    if (!isStaff(u)) {
      u.send(`${H}+gm/move:${N}  Staff only.`);
      return;
    }
    const moveName = u.cmd.args[0]?.trim();
    const total = parseInt(u.cmd.args[1] ?? "", 10);
    if (!moveName || isNaN(total)) {
      u.send(`${H}+gm/move:${N}  Usage: +gm/move <move name>=<total>`);
      return;
    }
    if (!_moveCallback) {
      u.send(`${H}+gm/move:${N}  GM not initialised.`);
      return;
    }
    const rid = roomId(u);
    u.send(`${H}[GM adjudicating ${moveName} (${total})...]${N}`);
    _moveCallback(u.me.id, moveName, total, rid);
  },
});

// ─── +gm/config/booksdir ─────────────────────────────────────────────────────

addCmd({
  name: "+gm/config/booksdir",
  category: "GM",
  help:
    "+gm/config/booksdir <path>  --  Set the folder the GM watches for game book files.",
  pattern: /^\+gm\/config\/booksdir\s+(.+)$/i,
  exec: async (u: UC) => {
    if (!isStaff(u)) {
      u.send(`${H}+gm/config/booksdir:${N}  Staff only.`);
      return;
    }
    const rawPath = u.cmd.args[0]?.trim();
    if (!rawPath) {
      u.send(`${H}+gm/config/booksdir:${N}  Usage: +gm/config/booksdir <path>`);
      return;
    }
    // CRIT-02: restrict to server root — no path traversal outside cwd
    const { resolve } = await import("@std/path");
    const serverRoot = Deno.cwd();
    const resolved = resolve(rawPath);
    if (!resolved.startsWith(serverRoot + "/") && resolved !== serverRoot) {
      u.send(
        `${H}+gm/config/booksdir:${N}  Path must be within the server root (${serverRoot}).`,
      );
      return;
    }
    await saveConfig({ booksDir: resolved });
    u.send(`${H}+gm/config/booksdir:${N}  Books directory set to: ${resolved}`);
  },
});

// ─── +gm/ingest ──────────────────────────────────────────────────────────────

addCmd({
  name: "+gm/ingest",
  category: "GM",
  help:
    "+gm/ingest  --  Manually trigger ingestion of all files in the books directory.",
  pattern: /^\+gm\/ingest$/i,
  exec: async (u: UC) => {
    if (!isStaff(u)) {
      u.send(`${H}+gm/ingest:${N}  Staff only.`);
      return;
    }
    if (!_ingestCallback) {
      u.send(`${H}+gm/ingest:${N}  GM not initialised.`);
      return;
    }
    // MED-01: prevent concurrent/rapid-fire ingestion runs
    const active = await gmIngestionJobs.queryOne(
      {
        phase: { $in: ["queued", "extracting", "analyzing", "reviewing"] },
      } as Parameters<typeof gmIngestionJobs.queryOne>[0],
    );
    if (active) {
      u.send(
        `${H}+gm/ingest:${N}  Ingestion already in progress (job: ${
          (active as { id: string }).id
        }).`,
      );
      return;
    }
    u.send(
      `${H}+gm/ingest:${N}  Starting ingestion... check the AI-GM board for progress.`,
    );
    // MED-06: log full error server-side; show generic message to avoid leaking internals
    _ingestCallback().catch((err) => {
      console.error("[GM ingest error]", err);
      u.send(
        `${H}+gm/ingest:${N}  Ingestion failed. Check server logs for details.`,
      );
    });
  },
});

addCmd({
  name: "+gm/ingest/status",
  category: "GM",
  help:
    "+gm/ingest/status  --  Show the current or most recent ingestion job status.",
  pattern: /^\+gm\/ingest\/status$/i,
  exec: async (u: UC) => {
    if (!isStaff(u)) {
      u.send(`${H}+gm/ingest/status:${N}  Staff only.`);
      return;
    }
    const jobs = await gmIngestionJobs.all();
    if (!jobs.length) {
      u.send(`${H}+gm/ingest/status:${N}  No ingestion jobs found.`);
      return;
    }
    const job = (jobs as unknown as {
      startedAt: string;
      id: string;
      phase: string;
      files: string[];
      uncertainItems: { resolved: boolean }[];
      error?: string;
    }[])
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    const resolved = job.uncertainItems.filter((i) => i.resolved).length;
    u.send(
      `${H}Job ${job.id}:${N} ${job.phase} | Files: ${
        job.files.join(", ")
      } | ` +
        `Items: ${resolved}/${job.uncertainItems.length} resolved` +
        // MED-06: truncate error field — never expose stack traces or internal paths
        (job.error
          ? ` | Error: ${String(job.error).split("\n")[0].slice(0, 200)}`
          : ""),
    );
  },
});

addCmd({
  name: "+gm/ingest/transcript",
  category: "GM",
  help:
    "+gm/ingest/transcript <jobId>  --  Display the full setup conversation for an ingestion job.",
  pattern: /^\+gm\/ingest\/transcript\s+(\S+)$/i,
  exec: async (u: UC) => {
    if (!isStaff(u)) {
      u.send(`${H}+gm/ingest/transcript:${N}  Staff only.`);
      return;
    }
    const jobId = u.cmd.args[0]?.trim();
    const job = await gmIngestionJobs.queryOne({ id: jobId }) as {
      exchanges: {
        role: string;
        adminName?: string;
        message: string;
        timestamp: string;
      }[];
    } | null;
    if (!job) {
      u.send(`${H}+gm/ingest/transcript:${N}  Job not found: ${jobId}`);
      return;
    }
    if (!job.exchanges.length) {
      u.send(
        `${H}+gm/ingest/transcript:${N}  No conversation recorded for this job.`,
      );
      return;
    }
    u.send(`${H}--- Ingestion Transcript: ${jobId} ---${N}`);
    for (const ex of job.exchanges) {
      const who = ex.role === "gm" ? "[GM]" : `[${ex.adminName ?? "Admin"}]`;
      u.send(`${who} ${ex.message}`);
    }
  },
});

addCmd({
  name: "+gm/ingest/review",
  category: "GM",
  help:
    "+gm/ingest/review <jobId>/<itemId>=<value>  --  Resolve an uncertain item.\n" +
    "  Use /skip instead of =<value> to accept the AI suggestion.",
  pattern: /^\+gm\/ingest\/review\s+(\S+)\/(\S+?)(?:=(.+)|\/skip)$/i,
  exec: async (u: UC) => {
    if (!isStaff(u)) {
      u.send(`${H}+gm/ingest/review:${N}  Staff only.`);
      return;
    }
    if (!_modelFactory) {
      u.send(`${H}+gm/ingest/review:${N}  GM not initialised.`);
      return;
    }
    const jobId = u.cmd.args[0]?.trim();
    const itemId = u.cmd.args[1]?.trim();
    const value = u.cmd.args[2]?.trim() ?? null; // null = skip
    const job = await gmIngestionJobs.queryOne({ id: jobId });
    if (!job) {
      u.send(`${H}+gm/ingest/review:${N}  Job not found: ${jobId}`);
      return;
    }
    const model = _modelFactory();
    const reply = await resolveItem(
      job as Parameters<typeof resolveItem>[0],
      itemId,
      value,
      u.me.id,
      u.me.name ?? "Admin",
      model,
    );
    u.send(reply);
  },
});

addCmd({
  name: "+gm/ingest/approve",
  category: "GM",
  help:
    "+gm/ingest/approve <jobId>  --  Approve and activate the ingested game system.",
  pattern: /^\+gm\/ingest\/approve\s+(\S+)$/i,
  exec: async (u: UC) => {
    if (!isStaff(u)) {
      u.send(`${H}+gm/ingest/approve:${N}  Staff only.`);
      return;
    }
    const jobId = u.cmd.args[0]?.trim();
    const job = await gmIngestionJobs.queryOne({ id: jobId });
    if (!job) {
      u.send(`${H}+gm/ingest/approve:${N}  Job not found: ${jobId}`);
      return;
    }
    // LOW-05: only approvable when in review phase with a valid draft
    if ((job as { phase: string }).phase !== "reviewing") {
      u.send(
        `${H}+gm/ingest/approve:${N}  Job is not awaiting review (phase: ${
          (job as { phase: string }).phase
        }).`,
      );
      return;
    }
    const result = await commitSystem(
      job as Parameters<typeof commitSystem>[0],
      u.me.id,
      u.me.name ?? "Admin",
    );
    u.send(result);
  },
});

addCmd({
  name: "+gm/ingest/reject",
  category: "GM",
  help: "+gm/ingest/reject <jobId>  --  Cancel an ingestion job.",
  pattern: /^\+gm\/ingest\/reject\s+(\S+)$/i,
  exec: async (u: UC) => {
    if (!isStaff(u)) {
      u.send(`${H}+gm/ingest/reject:${N}  Staff only.`);
      return;
    }
    const jobId = u.cmd.args[0]?.trim();
    const job = await gmIngestionJobs.queryOne({ id: jobId }) as {
      phase: string;
    } | null;
    if (!job) {
      u.send(`${H}+gm/ingest/reject:${N}  Job not found: ${jobId}`);
      return;
    }
    await gmIngestionJobs.update(
      { id: jobId },
      {
        ...(job as object),
        phase: "failed",
        error: "Rejected by admin.",
      } as unknown as import("./ingestion/schema.ts").IIngestionJob,
    );
    u.send(`${H}+gm/ingest/reject:${N}  Job ${jobId} cancelled.`);
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// MONETIZATION COMMANDS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── +gm/credits ─────────────────────────────────────────────────────────────

addCmd({
  name: "+gm/credits",
  category: "GM",
  help:
    "+gm/credits  --  Show your current GM credit balance and recent history.",
  pattern: /^\+gm\/credits$/i,
  exec: async (u: UC) => {
    const wallet = await getWallet(u.me.id);
    const history = await getLedger(u.me.id, 5);
    const lines = [
      `${H}--- GM Credits: ${u.me.name ?? u.me.id} ---${N}`,
      `  Balance:      ${wallet.balance} credit(s)`,
      `  Total earned: ${wallet.totalEarned}`,
      `  Total spent:  ${wallet.totalSpent}`,
    ];
    if (wallet.subscriptionPlan) {
      lines.push(
        `  Plan:         ${wallet.subscriptionPlan} (${
          wallet.subscriptionStatus ?? "unknown"
        })`,
      );
    }
    if (history.length) {
      lines.push(``, `${H}Recent:${N}`);
      for (const e of history) {
        const sign = e.delta > 0 ? "+" : "";
        const ts = new Date(e.createdAt).toISOString().slice(0, 10);
        lines.push(`  ${ts}  ${sign}${e.delta}  ${e.reason}`);
      }
    }
    lines.push(``, `  Buy more with: +gm/credits/buy <amount>`);
    u.send(lines.join("\n"));
  },
});

addCmd({
  name: "+gm/credits/buy",
  category: "GM",
  help:
    "+gm/credits/buy <amount>  --  Purchase GM credits. Generates a payment link.",
  pattern: /^\+gm\/credits\/buy\s+(\d+)$/i,
  exec: async (u: UC) => {
    if (!_paymentAdapter) {
      u.send(
        `${H}+gm/credits/buy:${N}  Payment not configured on this server.`,
      );
      return;
    }
    const amount = parseInt(u.cmd.args[0] ?? "", 10);
    if (isNaN(amount) || amount < 1 || amount > 10000) {
      u.send(`${H}+gm/credits/buy:${N}  Amount must be 1–10000.`);
      return;
    }
    const priceUsd = amount * 0.05; // $0.05 per credit default
    try {
      const result = await _paymentAdapter.createCreditCheckout(
        u.me.id,
        amount,
        priceUsd,
        `${
          Deno.env.get("GAME_URL") ?? "http://localhost:4200"
        }/credits/success`,
        `${Deno.env.get("GAME_URL") ?? "http://localhost:4200"}/credits/cancel`,
      );
      u.send(
        `${H}+gm/credits/buy:${N}  Visit this link to complete payment:\n  ${result.url}`,
      );
    } catch {
      u.send(
        `${H}+gm/credits/buy:${N}  Payment system unavailable. Try again later.`,
      );
    }
  },
});

addCmd({
  name: "+gm/credits/grant",
  category: "GM",
  help:
    "+gm/credits/grant <playerId> <amount>  --  Staff: grant credits to a player.",
  pattern: /^\+gm\/credits\/grant\s+(\S+)\s+(\d+)$/i,
  exec: async (u: UC) => {
    if (!isStaff(u)) {
      u.send(`${H}+gm/credits/grant:${N}  Staff only.`);
      return;
    }
    const pid = u.cmd.args[0]?.trim();
    const amount = parseInt(u.cmd.args[1] ?? "", 10);
    if (!pid || isNaN(amount) || amount < 1) {
      u.send(
        `${H}+gm/credits/grant:${N}  Usage: +gm/credits/grant <playerId> <amount>`,
      );
      return;
    }
    const newBalance = await creditPlayer(pid, amount, "admin_grant", {
      grantedBy: u.me.id,
    });
    u.send(
      `${H}+gm/credits/grant:${N}  Granted ${amount} credit(s) to ${pid}. New balance: ${newBalance}.`,
    );
  },
});

// ─── +gm/sub ──────────────────────────────────────────────────────────────────

addCmd({
  name: "+gm/sub",
  category: "GM",
  help: "+gm/sub  --  Show your subscription status.",
  pattern: /^\+gm\/sub$/i,
  exec: async (u: UC) => {
    const wallet = await getWallet(u.me.id);
    if (!wallet.subscriptionPlan) {
      u.send(
        `${H}+gm/sub:${N}  No active subscription.\n` +
          `  See plans with: +gm/sub/plans\n` +
          `  Subscribe with: +gm/sub/start <planId>`,
      );
      return;
    }
    const plan = getPlan(wallet.subscriptionPlan);
    u.send(
      `${H}--- GM Subscription ---${N}\n` +
        `  Plan:    ${plan?.name ?? wallet.subscriptionPlan}\n` +
        `  Status:  ${wallet.subscriptionStatus ?? "unknown"}\n` +
        `  Credits: ${wallet.balance} remaining\n` +
        `  Cancel:  +gm/sub/cancel`,
    );
  },
});

addCmd({
  name: "+gm/sub/plans",
  category: "GM",
  help: "+gm/sub/plans  --  List available subscription plans.",
  pattern: /^\+gm\/sub\/plans$/i,
  exec: (u: UC) => {
    const plans = getPlans();
    const lines = [`${H}--- GM Subscription Plans ---${N}`];
    for (const p of plans) {
      const price = p.priceUsd === 0 ? "Free" : `$${p.priceUsd.toFixed(2)}/mo`;
      lines.push(
        ``,
        `${H}${p.name}${N} (id: ${p.id})  ${price}`,
        `  ${p.description}`,
        `  ${p.creditsPerMonth} credits/month`,
        `  Features: ${p.features.join(", ")}`,
        `  Subscribe: +gm/sub/start ${p.id}`,
      );
    }
    u.send(lines.join("\n"));
  },
});

addCmd({
  name: "+gm/sub/start",
  category: "GM",
  help:
    "+gm/sub/start <planId>  --  Start a subscription. Generates a payment link.",
  pattern: /^\+gm\/sub\/start\s+(\S+)$/i,
  exec: async (u: UC) => {
    const planId = u.cmd.args[0]?.trim();
    const plan = planId ? getPlan(planId) : undefined;
    if (!plan) {
      const ids = getPlans().map((p) => p.id).join(", ");
      u.send(`${H}+gm/sub/start:${N}  Unknown plan. Available: ${ids}`);
      return;
    }
    if (plan.priceUsd === 0) {
      // Free tier — just grant credits
      const wallet = await getWallet(u.me.id);
      if (wallet.subscriptionPlan === plan.id) {
        u.send(
          `${H}+gm/sub/start:${N}  You are already on the ${plan.name} plan.`,
        );
        return;
      }
      await creditPlayer(
        u.me.id,
        plan.creditsPerMonth,
        "subscription_renewal",
        {
          planId: plan.id,
        },
      );
      u.send(
        `${H}+gm/sub/start:${N}  Enrolled in ${plan.name}. ` +
          `${plan.creditsPerMonth} credits added to your balance.`,
      );
      return;
    }
    if (!_paymentAdapter) {
      u.send(`${H}+gm/sub/start:${N}  Payment not configured on this server.`);
      return;
    }
    try {
      const result = await _paymentAdapter.createSubscriptionCheckout(
        u.me.id,
        plan,
        `${Deno.env.get("GAME_URL") ?? "http://localhost:4200"}/sub/success`,
        `${Deno.env.get("GAME_URL") ?? "http://localhost:4200"}/sub/cancel`,
      );
      u.send(
        `${H}+gm/sub/start:${N}  Visit this link to subscribe to ${plan.name}:\n  ${result.url}`,
      );
    } catch {
      u.send(
        `${H}+gm/sub/start:${N}  Payment system unavailable. Try again later.`,
      );
    }
  },
});

addCmd({
  name: "+gm/sub/cancel",
  category: "GM",
  help: "+gm/sub/cancel  --  Cancel your current subscription.",
  pattern: /^\+gm\/sub\/cancel$/i,
  exec: async (u: UC) => {
    const wallet = await getWallet(u.me.id);
    if (!wallet.subscriptionId) {
      u.send(`${H}+gm/sub/cancel:${N}  No active subscription to cancel.`);
      return;
    }
    if (!_paymentAdapter) {
      u.send(`${H}+gm/sub/cancel:${N}  Payment not configured on this server.`);
      return;
    }
    try {
      await _paymentAdapter.cancelSubscription(wallet.subscriptionId);
      u.send(
        `${H}+gm/sub/cancel:${N}  Subscription cancelled. ` +
          `Your remaining ${wallet.balance} credit(s) are still available.`,
      );
    } catch {
      u.send(
        `${H}+gm/sub/cancel:${N}  Cancellation failed. Try again or contact an admin.`,
      );
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SOCIAL COMMANDS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── +gm/journal ──────────────────────────────────────────────────────────────

addCmd({
  name: "+gm/journal",
  category: "GM",
  help: "+gm/journal  --  List recent campaign journal entries.",
  pattern: /^\+gm\/journal$/i,
  exec: async (u: UC) => {
    const entries = await getJournalEntries(5);
    if (!entries.length) {
      u.send(
        `${H}+gm/journal:${N}  No journal entries yet. Close a session to generate one.`,
      );
      return;
    }
    const lines = [`${H}--- Campaign Journal ---${N}`];
    for (const e of entries) {
      const date = new Date(e.createdAt).toISOString().slice(0, 10);
      lines.push(`  ${e.id}  ${e.sessionLabel} (${date})`);
    }
    lines.push(``, `  Read with: +gm/journal/read <id>`);
    u.send(lines.join("\n"));
  },
});

addCmd({
  name: "+gm/journal/read",
  category: "GM",
  help: "+gm/journal/read <id>  --  Display a journal entry.",
  pattern: /^\+gm\/journal\/read\s+(\S+)$/i,
  exec: async (u: UC) => {
    const id = u.cmd.args[0]?.trim();
    const entry = id ? await getJournalEntry(id) : null;
    if (!entry) {
      u.send(`${H}+gm/journal/read:${N}  Entry not found: ${id}`);
      return;
    }
    u.send(formatJournalEntry(entry));
  },
});

// ─── +gm/spotlight ────────────────────────────────────────────────────────────

addCmd({
  name: "+gm/spotlight",
  category: "GM",
  help:
    "+gm/spotlight [<playerId>]  --  Show spotlight moments (optionally for one player).",
  pattern: /^\+gm\/spotlight(?:\s+(\S+))?$/i,
  exec: async (u: UC) => {
    const pid = u.cmd.args[0]?.trim();
    const entries = await getSpotlights({ playerId: pid, limit: 10 });
    u.send(
      `${H}--- Spotlights${pid ? ` (${pid})` : ""} ---${N}\n` +
        formatSpotlights(entries),
    );
  },
});

addCmd({
  name: "+gm/spotlight/mark",
  category: "GM",
  help:
    "+gm/spotlight/mark <playerId> <description>  --  Staff: manually mark a spotlight moment.",
  pattern: /^\+gm\/spotlight\/mark\s+(\S+)\s+(.+)$/i,
  exec: async (u: UC) => {
    if (!isStaff(u)) {
      u.send(`${H}+gm/spotlight/mark:${N}  Staff only.`);
      return;
    }
    const pid = u.cmd.args[0]?.trim();
    const description = u.cmd.args[1]?.trim();
    if (!pid || !description) {
      u.send(
        `${H}+gm/spotlight/mark:${N}  Usage: +gm/spotlight/mark <playerId> <description>`,
      );
      return;
    }
    const entry = await recordSpotlight(pid, pid, description, "moment", {
      createdBy: "staff",
    });
    u.send(`${H}+gm/spotlight/mark:${N}  Spotlight recorded (${entry.id}).`);
  },
});

// ─── +gm/persona ──────────────────────────────────────────────────────────────

addCmd({
  name: "+gm/persona",
  category: "GM",
  help: "+gm/persona  --  List your registered personas.",
  pattern: /^\+gm\/persona$/i,
  exec: async (u: UC) => {
    const personas = await getPersonasForPlayer(u.me.id);
    u.send(
      `${H}--- Personas: ${u.me.name ?? u.me.id} ---${N}\n` +
        formatPersonas(personas) +
        `\n\n  Create:   +gm/persona/new <name>` +
        `\n  Activate: +gm/persona/use <id>` +
        `\n  Clear:    +gm/persona/clear`,
    );
  },
});

addCmd({
  name: "+gm/persona/new",
  category: "GM",
  help: "+gm/persona/new <name>[=<description>]  --  Register a new persona.",
  pattern: /^\+gm\/persona\/new\s+(.+)$/i,
  exec: async (u: UC) => {
    const raw = u.cmd.args[0]?.trim() ?? "";
    const [name, ...descParts] = raw.split("=");
    const description = descParts.join("=").trim() || undefined;
    if (!name.trim()) {
      u.send(
        `${H}+gm/persona/new:${N}  Usage: +gm/persona/new <name>[=<description>]`,
      );
      return;
    }
    try {
      const p = await createPersona(u.me.id, name.trim(), description);
      u.send(
        `${H}+gm/persona/new:${N}  Persona "${p.name}" created (id: ${p.id}).`,
      );
    } catch (err) {
      u.send(`${H}+gm/persona/new:${N}  ${(err as Error).message}`);
    }
  },
});

addCmd({
  name: "+gm/persona/use",
  category: "GM",
  help:
    "+gm/persona/use <id>  --  Activate a persona (the GM will use this name).",
  pattern: /^\+gm\/persona\/use\s+(\S+)$/i,
  exec: async (u: UC) => {
    const id = u.cmd.args[0]?.trim();
    const p = id ? await activatePersona(u.me.id, id) : null;
    if (!p) {
      u.send(`${H}+gm/persona/use:${N}  Persona not found: ${id}`);
      return;
    }
    u.send(`${H}+gm/persona/use:${N}  Now playing as "${p.name}".`);
  },
});

addCmd({
  name: "+gm/persona/clear",
  category: "GM",
  help:
    "+gm/persona/clear  --  Deactivate your current persona (revert to player name).",
  pattern: /^\+gm\/persona\/clear$/i,
  exec: async (u: UC) => {
    await deactivatePersona(u.me.id);
    u.send(`${H}+gm/persona/clear:${N}  Persona cleared.`);
  },
});

addCmd({
  name: "+gm/persona/delete",
  category: "GM",
  help: "+gm/persona/delete <id>  --  Delete a persona.",
  pattern: /^\+gm\/persona\/delete\s+(\S+)$/i,
  exec: async (u: UC) => {
    const id = u.cmd.args[0]?.trim();
    const ok = id ? await deletePersona(u.me.id, id) : false;
    if (!ok) {
      u.send(`${H}+gm/persona/delete:${N}  Persona not found: ${id}`);
      return;
    }
    u.send(`${H}+gm/persona/delete:${N}  Persona deleted.`);
  },
});
