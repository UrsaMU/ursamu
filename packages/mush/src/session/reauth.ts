/**
 * Reauth / reconnect policy after a server restart.
 *
 * When JWT auto-reauth cannot restore a logged-in session, clients must be
 * disconnected with a clear message — not left half-connected (TCP up, no
 * actorId, welcome skipped because reconnect=true).
 */

/** Shown when JWT verify fails or the player no longer exists. */
export const REAUTH_FAIL_MSG =
  "%chGame>%cn Session expired. Please connect again.";

/** Shown when the WS comes back but the telnet bridge has no token. */
export const RESTART_NO_TOKEN_MSG =
  "%chGame>%cn Server restarted. Please connect again.";

/** Shown only after the engine confirms auth:true. */
export const REAUTH_OK_MSG =
  "%chGame>%cn Server is back! Reconnected.";

/**
 * How long to wait for auth:true before dropping the telnet link.
 * Long enough for a slow main boot after @restart (plugins + help scan).
 */
export const REAUTH_TIMEOUT_MS = 45_000;

export type ReconnectOpenAction =
  | { action: "auth"; token: string }
  | { action: "disconnect"; notice: string }
  | { action: "flush" };

/**
 * Decide what the telnet bridge should do when the engine WS opens.
 * Pure — no I/O.
 *
 * Important: a transient WS failure *before* login also sets isReconnecting.
 * Never-authenticated clients must stay on the link (flush), not be dropped —
 * otherwise fresh telnet dial-ins die as soon as the engine WS comes up.
 * Only previously authenticated sessions without a token are force-dropped.
 */
export function decideReconnectOpen(opts: {
  isReconnecting: boolean;
  sessionToken?: string;
  /** True if this telnet link had a logged-in player (cid/token). */
  wasAuthenticated?: boolean;
}): ReconnectOpenAction {
  if (!opts.isReconnecting) return { action: "flush" };
  if (opts.sessionToken) {
    return { action: "auth", token: opts.sessionToken };
  }
  if (opts.wasAuthenticated) {
    return { action: "disconnect", notice: RESTART_NO_TOKEN_MSG };
  }
  // Pre-login WS blip — keep the TCP session; engine will send welcome.
  return { action: "flush" };
}

export type EngineAuthPayload = {
  auth?: boolean;
  quit?: boolean;
  cid?: string;
  token?: string;
};

export type EngineAuthClientAction =
  | { action: "restored"; cid?: string }
  | { action: "disconnect" }
  | { action: "none" };

/**
 * Interpret structured data from an engine WS frame during/after reauth.
 * Pure — no I/O.
 */
export function decideEngineAuthFrame(
  data: EngineAuthPayload | undefined,
): EngineAuthClientAction {
  if (!data) return { action: "none" };
  if (data.quit === true || data.auth === false) {
    return { action: "disconnect" };
  }
  if (data.auth === true) {
    return { action: "restored", cid: data.cid };
  }
  return { action: "none" };
}
