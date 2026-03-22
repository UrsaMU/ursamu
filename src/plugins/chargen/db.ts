import { DBO } from "../../services/Database/database.ts";

/** A chargen application record. */
export interface IChargenApp {
  id: string;           // e.g. "chargen_<playerId>"
  flags: string;        // "chargen"
  data: {
    playerId: string;
    status: "draft" | "pending" | "approved" | "rejected";
    fields: Record<string, string>;
    submittedAt?: number;
    reviewedAt?: number;
    reviewedBy?: string;
    notes?: string;
  };
}

/** Persistent store for all chargen applications. */
export const chargenApps: DBO<IChargenApp> = new DBO<IChargenApp>("server.chargen");

/** Get or create the chargen application for a player. */
export async function getOrCreateApp(playerId: string): Promise<IChargenApp> {
  const id = `chargen_${playerId}`;
  const existing = await chargenApps.queryOne({ id });
  if (existing) return existing as IChargenApp;

  const app: IChargenApp = {
    id,
    flags: "chargen",
    data: {
      playerId,
      status: "draft",
      fields: {},
    },
  };
  await chargenApps.create(app);
  return app;
}

/** Find a chargen application by player ID. */
export async function findAppByPlayer(playerId: string): Promise<IChargenApp | null> {
  const id = `chargen_${playerId}`;
  const result = await chargenApps.queryOne({ id });
  return (result as IChargenApp | undefined | false) || null;
}
