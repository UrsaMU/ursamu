import { EventEmitter } from "node:events";

export interface Intent {
  name: string;
  actorId: string;
  targetId?: string;
  args: string[];
}

export const emitter = new EventEmitter();
