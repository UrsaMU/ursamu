/**
 * Chargen shared event bus.
 *
 * The engine exports this bus. The external chargen plugin emits to it;
 * other plugins (e.g. discord-plugin) subscribe without a direct dependency
 * on the chargen plugin.
 */
import { EventEmitter } from "node:events";

export interface IChargenApp {
  id: string;
  data: {
    playerId:    string;
    reviewedBy?: string;
    notes?:      string;
    [key: string]: unknown;
  };
}

export interface ChargenHookMap {
  "chargen:submitted": (app: IChargenApp) => void | Promise<void>;
  "chargen:approved":  (app: IChargenApp) => void | Promise<void>;
  "chargen:rejected":  (app: IChargenApp) => void | Promise<void>;
}

class ChargenHooks extends EventEmitter {
  override on<K extends keyof ChargenHookMap>(event: K, listener: ChargenHookMap[K]): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }
  override off<K extends keyof ChargenHookMap>(event: K, listener: ChargenHookMap[K]): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }
  override emit<K extends keyof ChargenHookMap>(event: K, ...args: Parameters<ChargenHookMap[K]>): boolean {
    return super.emit(event, ...args);
  }
}

export const chargenHooks: ChargenHooks = new ChargenHooks();
