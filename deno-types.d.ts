// Type definitions for Deno API
declare namespace Deno {
  export interface StatOptions {
    recursive?: boolean;
  }
  
  export function mkdirSync(path: string, options?: StatOptions): void;
  export function readTextFileSync(path: string): string;
  export function writeTextFileSync(path: string, data: string): void;
  
  export namespace errors {
    export class NotFound extends Error {}
    export class AlreadyExists extends Error {}
  }
} 