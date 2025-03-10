import { Socket } from "../../deps.ts";

export interface IMSocket extends Socket {
  id: string;
  cid?: string;
  channels?: Set<string>;
  
  // Add missing socket methods
  on(event: string, listener: (...args: any[]) => void): this;
  join(room: string): this;
  disconnect(close?: boolean): this;
}
