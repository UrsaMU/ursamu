// ─── ai-gm cross-plugin gameHooks type declarations ──────────────────────────
//
// Declares payload types for events emitted by peer plugins.
// Import these when you need to type-assert an `as never` gameHooks payload.

/** Payload from @ursamu/shadowrun-plugin's shadowrun:roll event. */
export interface ISrRollEvent {
  playerId: string;
  playerName: string;
  roomId: string;
  pool: number;
  hits: number;
  glitch: boolean;
  critGlitch: boolean;
  edgeUsed: boolean;
  threshold?: number;
  success?: boolean;
}

/**
 * Payload from shadowrun:register — a system object shaped like
 * IStoredGameSystem that can be passed directly to registerGameSystem().
 */
export interface ISrSystemRegisterEvent {
  // deno-lint-ignore no-explicit-any
  system: Record<string, any>;
}
