import { Socket } from "../../deps.ts";

export interface UserSocket {
  id: string;
  uID?: string;
  cid?: string;
  channels?: Set<string>;
  join(room: string): Promise<void> | void;
  leave(room: string): Promise<void> | void;
  disconnect(close?: boolean): any;
  on(event: string, listener: (...args: any[]) => void): any;
}

export interface IMSocket extends Socket {
  id: string;
  uID?: string;
  cid?: string;
  channels?: Set<string>;
  join(room: string): Promise<void> | void;
  leave(room: string): Promise<void> | void;
}
