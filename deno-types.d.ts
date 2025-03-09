// Type definitions for Deno API
declare namespace Deno {
  export interface StatOptions {
    recursive?: boolean;
  }
  
  export function mkdirSync(path: string, options?: StatOptions): void;
  export function readTextFileSync(path: string): string;
  export function writeTextFileSync(path: string, data: string): void;
  export function mkdir(path: string, options?: StatOptions): Promise<void>;
  export function openKv(path: string): Promise<Kv>;
  export function exit(code?: number): never;
  
  export const args: string[];
  
  export interface Kv {
    get(key: KvKey): Promise<any>;
    set(key: KvKey, value: any): Promise<any>;
    delete(key: KvKey): Promise<void>;
    list(options: { prefix: KvKey }): AsyncIterable<{ key: KvKey; value: any }>;
  }
  
  export type KvKey = Array<string | number | boolean>;
  
  export namespace errors {
    export class NotFound extends Error {}
    export class AlreadyExists extends Error {}
  }
} 