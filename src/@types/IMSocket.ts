export interface UserSocket {
  id: string;
  uID?: string;
  cid?: string;
  channels?: Set<string>;
  clientType?: string;
  join(room: string): Promise<void> | void;
  leave(room: string): Promise<void> | void;
  disconnect(close?: boolean): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

export interface IMSocket extends UserSocket {
  id: string;
  uID?: string;
  cid?: string;
  channels?: Set<string>;
  join(room: string): Promise<void> | void;
  leave(room: string): Promise<void> | void;
}
