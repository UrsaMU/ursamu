import { DBO } from "ursamu";
import type {
  IGMConfig,
  IGMExchange,
  IGMMemory,
  IGMReveal,
  IGMRound,
  IGMSession,
} from "./schema.ts";

export const gmConfig = new DBO<IGMConfig>("server.gm.config");
export const gmSessions = new DBO<IGMSession>("server.gm.sessions");
export const gmExchanges = new DBO<IGMExchange>("server.gm.exchanges");
export const gmMemory = new DBO<IGMMemory>("server.gm.memory");
export const gmReveals = new DBO<IGMReveal>("server.gm.reveals");
export const gmRounds = new DBO<IGMRound>("server.gm.rounds");
// server.gm.custom_systems is managed by systems/store.ts
