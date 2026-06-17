import type { IGMConfig, IGMRound } from "../schema.ts";
import type { IGameSystem } from "../systems/interface.ts";
import type { IRoomContext, ISessionSnapshot } from "./loader.ts";
import type { ILorePage } from "./loader.ts";
import type { IGMExchange } from "../schema.ts";
import type { IAssembledContext } from "../prompts/base.ts";
import { buildBasePrompt } from "../prompts/base.ts";
import {
  formatCharactersFull,
  formatCharactersOneLiner,
  formatCriticalMemories,
  formatFronts,
  formatLore,
  formatMemories,
  formatNpcs,
  formatOpenDowntime,
  formatOpenJobs,
  formatOrgs,
  formatRecentExchanges,
  formatReveals,
} from "./compressor.ts";

export interface IInjectOptions {
  config: IGMConfig;
  system: IGameSystem;
  snapshot: ISessionSnapshot;
  roomCtx: IRoomContext;
  lorePages: ILorePage[];
  recentExchanges: IGMExchange[];
  currentRound?: IGMRound;
  graphSuffix: string;
  inRoomPlayerIds: string[];
}

function formatRound(round: IGMRound): string {
  const lines: string[] = [
    `Room: ${round.roomId}  Status: ${round.status}`,
  ];
  for (const c of round.contributions) {
    if (c.ready) {
      const text = c.summary ?? c.poses.join(" / ");
      lines.push(`  ${c.playerName}: ${text}`);
    } else {
      lines.push(`  ${c.playerName}: (has not posed this round)`);
    }
  }
  return lines.join("\n");
}

function formatScene(roomCtx: IRoomContext): string {
  if (!roomCtx.scene) return "(no scene set)";
  const title = roomCtx.scene.title ? `${roomCtx.scene.title}\n` : "";
  return `${title}${roomCtx.scene.description}`;
}

export function buildInjectedPrompt(opts: IInjectOptions): string {
  const {
    config,
    system,
    snapshot,
    roomCtx,
    lorePages,
    recentExchanges,
    currentRound,
    graphSuffix,
    inRoomPlayerIds,
  } = opts;

  // Build assembled context object
  const context: IAssembledContext = {
    sceneDescription: formatScene(roomCtx),
    scenePlayers: formatCharactersFull(roomCtx.playersInRoom, inRoomPlayerIds),
    activeFronts: formatFronts(snapshot.fronts),
    recentExchanges: formatRecentExchanges(recentExchanges),
    criticalMemories: formatCriticalMemories(snapshot.memories),
    chaosLevel: config.chaosLevel,
    currentRound: currentRound ? formatRound(currentRound) : undefined,
    allNpcs: formatNpcs(snapshot.npcs),
    allOrgs: formatOrgs(snapshot.orgs),
    loreSummary: formatLore(lorePages),
    openJobs: formatOpenJobs(snapshot.openJobs),
    openDowntime: formatOpenDowntime(snapshot.openDowntime),
    pendingReveals: formatReveals(snapshot.reveals),
    campaignMemories: formatMemories(snapshot.memories),
  };

  return buildBasePrompt(config, system, context, graphSuffix);
}

// Convenience: full character list (off-screen players) as one-liners
export function buildOffScreenCharacters(
  snapshot: ISessionSnapshot,
  inRoomIds: string[],
): string {
  const offScreen = snapshot.characters.filter((c) =>
    !inRoomIds.includes(c.playerId)
  );
  if (!offScreen.length) return "";
  return "OFF-SCREEN CHARACTERS:\n" + formatCharactersOneLiner(offScreen);
}
