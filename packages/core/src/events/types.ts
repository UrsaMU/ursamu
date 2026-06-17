export interface CoreHookMap {
  "engine:ready":  ()                                                    => void | Promise<void>;
  "session:open":  (e: { socketId: string })                             => void | Promise<void>;
  "session:close": (e: { socketId: string; sessionId: string | null; actorId?: string | null })   => void | Promise<void>;
  "session:auth":  (e: { socketId: string; sessionId: string })          => void | Promise<void>;
  // Allow dynamic plugins/subpackages to define custom events without ambient declarations
  // deno-lint-ignore no-explicit-any
  [key: string]: (...args: any[]) => any;
}
