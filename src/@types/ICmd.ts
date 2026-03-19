import type { IUrsamuSDK } from "./UrsamuSDK.ts";

/** Describes a player-invocable in-game command. */
export interface ICmd {
  /** Unique command name used for help listings. */
  name: string;
  /** Short help text shown by the `help` command. */
  help?: string;
  /** Grouping label for the help index. */
  category?: string;
  /** When `true` the command is omitted from help listings. */
  hidden?: boolean;
  /** String prefix or regex that must match the player's input. */
  pattern: string | RegExp;
  /** Optional lock expression evaluated against the calling player. */
  lock?: string;
  /** The command implementation. Receives a full SDK context. */
  exec: (u: IUrsamuSDK) => void | Promise<void>;
}
