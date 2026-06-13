import type { IGMConfig } from "../schema.ts";
import type { IGameSystem } from "../systems/interface.ts";
import {
  SOLO_GM_MOVE_PRINCIPLES,
  SOLO_GM_ORACLE_PRINCIPLES,
  SOLO_GM_PRINCIPLES,
} from "./solo_gm_text.ts";

// ─── Assembled context type (output of context/injector.ts) ──────────────────

export interface IAssembledContext {
  // Always-injected
  sceneDescription: string;
  scenePlayers: string; // formatted character blocks for in-room players
  activeFronts: string;
  recentExchanges: string;
  criticalMemories: string;
  chaosLevel: number;
  currentRound?: string;

  // Session cache
  allNpcs: string;
  allOrgs: string;
  loreSummary: string;
  openJobs: string;
  openDowntime: string;
  pendingReveals: string;
  campaignMemories: string;
}

// ─── Base system prompt assembler ─────────────────────────────────────────────

export function buildBasePrompt(
  config: IGMConfig,
  system: IGameSystem,
  context: IAssembledContext,
  graphSuffix: string,
): string {
  const parts: string[] = [];

  // 1. Persona
  parts.push(
    `You are ${config.persona.name}, the Game Master of a ${system.name} game.`,
    `Tone: ${config.persona.tone}`,
    `Style: ${config.persona.style}`,
    "",
  );

  // 2. Core system rules
  parts.push(system.coreRulesPrompt, "");

  // 3. Solo RPG Revolution principles
  parts.push(SOLO_GM_PRINCIPLES, "");

  // 4. Adjudication hints
  parts.push(system.adjudicationHint, "");
  parts.push(SOLO_GM_MOVE_PRINCIPLES, "");
  parts.push(SOLO_GM_ORACLE_PRINCIPLES, "");

  // 5. Hard/soft move palettes
  parts.push(
    "HARD MC MOVES (use on 6- or to escalate):",
    system.hardMoves.map((m) => `  - ${m}`).join("\n"),
    "",
    "SOFT MC MOVES (use to telegraph, create tension):",
    system.softMoves.map((m) => `  - ${m}`).join("\n"),
    "",
  );

  // 6. Active characters in scene
  if (context.scenePlayers) {
    parts.push(
      "ACTIVE CHARACTERS IN SCENE:",
      context.scenePlayers,
      "",
    );
  }

  // 7. Current scene
  if (context.sceneDescription) {
    parts.push(
      "CURRENT SCENE:",
      context.sceneDescription,
      "",
    );
  }

  // 8. Active fronts
  if (context.activeFronts) {
    parts.push(
      "ACTIVE FRONTS & CLOCKS:",
      context.activeFronts,
      "",
    );
  }

  // 9. All NPCs
  if (context.allNpcs) {
    parts.push(
      "KNOWN NPCS:",
      context.allNpcs,
      "",
    );
  }

  // 10. All orgs
  if (context.allOrgs) {
    parts.push(
      "CITY FACTIONS (ORGS):",
      context.allOrgs,
      "",
    );
  }

  // 11. Lore
  if (context.loreSummary) {
    parts.push(
      "WORLD LORE:",
      context.loreSummary,
      "",
    );
  }

  // 12. Campaign memories
  if (context.campaignMemories) {
    parts.push(
      "CAMPAIGN MEMORIES:",
      context.campaignMemories,
      "",
    );
  }

  // 13. Pending reveals
  if (context.pendingReveals) {
    parts.push(
      "PENDING REVEALS (fire when conditions are met):",
      context.pendingReveals,
      "",
    );
  }

  // 14. Open jobs + downtime
  if (context.openJobs) {
    parts.push("OPEN JOBS:", context.openJobs, "");
  }
  if (context.openDowntime) {
    parts.push("OPEN DOWNTIME ACTIONS:", context.openDowntime, "");
  }

  // 15. Recent session exchanges
  if (context.recentExchanges) {
    parts.push(
      "RECENT SESSION EXCHANGES:",
      context.recentExchanges,
      "",
    );
  }

  // 16. Critical memories
  if (context.criticalMemories) {
    parts.push(
      "CRITICAL MEMORIES (always keep in mind):",
      context.criticalMemories,
      "",
    );
  }

  // 17. Chaos factor
  parts.push(`CHAOS LEVEL: ${context.chaosLevel}/9`, "");

  // 18. Current round (if any)
  if (context.currentRound) {
    parts.push(
      "CURRENT ROUND SUMMARY:",
      context.currentRound,
      "",
    );
  }

  // 19. Graph-specific instructions
  parts.push(
    "YOUR TASK FOR THIS CALL:",
    graphSuffix,
  );

  // 20. OOC bracket reminder
  if (config.persona.oocBrackets) {
    parts.push(
      "",
      "Use [square brackets] for all out-of-character mechanical notes.",
    );
  }

  return parts.join("\n");
}
