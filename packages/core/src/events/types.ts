export interface CoreHookMap {
  "engine:ready":  ()                                                    => void | Promise<void>;
  "session:open":  (e: { socketId: string })                             => void | Promise<void>;
  "session:close": (e: { socketId: string; sessionId: string | null })   => void | Promise<void>;
  "session:auth":  (e: { socketId: string; sessionId: string })          => void | Promise<void>;
}
