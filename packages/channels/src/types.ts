export interface IChannel {
  id: string;
  name: string;
  lock?: string;
  hidden?: boolean;
  header: string;
  alias?: string;
  masking?: boolean;
  owner?: string;
  logHistory?: boolean;
  historyLimit?: number;
  /**
   * When true, broadcast connect / disconnect / join / leave lines
   * on this channel. Never mirrored to Discord (no channel:message).
   */
  announce?: boolean;
  /**
   * When true, eligible players are auto-subscribed on login.
   * Default false — staff-created channels are opt-in via addcom.
   */
  autoJoin?: boolean;
}

export interface IChanMessage {
  id: string;
  chanId: string;
  chanName: string;
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
