export interface IChannel {
  id: string;
  name: string;
  lock?: string;
  hidden?: boolean;
  header: string;
  alias?: string;
  masking?: boolean;
  owner?: string;
  /** When `true`, messages are persisted to channel history. Default: `false`. */
  logHistory?: boolean;
  /** Maximum number of messages to retain. Oldest messages are pruned. Default: `500`. */
  historyLimit?: number;
}

/** A single persisted channel message (stored when `IChannel.logHistory` is `true`). */
export interface IChanMessage {
  id: string;
  /** Matches `IChannel.id`. */
  chanId: string;
  playerId: string;
  playerName: string;
  message: string;
  timestamp: number;
}

export interface IChanEntry {
  id: string;
  channel: string;
  alias: string;
  mask?: string;
  title?: string;
  active: boolean;
}
