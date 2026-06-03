/**
 * Bridge: re-exports all database collections from @ursamu/mush (which uses @ursamu/core's DBO).
 */
export interface IUserFunc {
  id: string;
  name: string;
  code: string;
  owner?: string;
  ownerId?: string;
}
export { DBO } from "@ursamu/core";
export type { Query } from "@ursamu/core";
export {
  dbojs, counters, chans, texts, scenes, chanHistory, Obj,
} from "@ursamu/mush";
export type { IDBOBJ } from "@ursamu/mush";

// Additional named collections used by plugins still in src/
import { DBO as _DBO } from "@ursamu/core";
export const events        = new _DBO<{ id: string } & Record<string, unknown>>("server.events");
export const serverTags    = new _DBO<{ id: string } & Record<string, unknown>>("server.tags");
export const playerTags    = new _DBO<{ id: string } & Record<string, unknown>>("server.ltags");
export const zoneMemberships = new _DBO<{ id: string } & Record<string, unknown>>("server.zones");
export const userFuncs     = new _DBO<IUserFunc>("server.userfuncs");
