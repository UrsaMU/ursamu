/**
 * MOTD storage (multi-entry general + wizard scopes).
 */
import { DBO } from "@ursamu/core";

export interface IMotdEntry {
  id: string;
  scope: "general" | "wizard";
  order: number;
  text: string;
  setter: string;
  ts: number;
}

export const motdDb = new DBO<IMotdEntry>("mush.motd");
