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
