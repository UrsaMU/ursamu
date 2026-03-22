/**
 * client.js — UrsaMU web client bootstrap
 *
 * Responsibilities:
 *   1. Auth state (localStorage token, /api/v1/me validation)
 *   2. Login form interaction
 *   3. Apply server theme from /api/v1/config to CSS custom properties
 *   4. Fetch /api/v1/ui-manifest and mount web components into slots
 *   5. WebSocket lifecycle (connect, typed message dispatch, reconnect, logout)
 *
 * Message protocol (outbound):
 *   { type: "cmd",  data: "<command string>" }  — player command
 *   { data: { cid } }                           — session restore (legacy sidecar)
 *
 * Message protocol (inbound):
 *   { msg, room, ... }  — server state payloads dispatched as ursamu:message
 *
 * Custom events emitted on window:
 *   ursamu:connected       { ws }
 *   ursamu:disconnected    (no detail)
 *   ursamu:reconnecting    { attempt, delay }
 *   ursamu:reconnect-failed (no detail)
 *   ursamu:logout          (no detail)
 *   ursamu:message         { msg?, room?, ... }
 *
 * This file is intentionally framework-free — edit it like a normal JS file.
 */

// ── Auth helpers ──────────────────────────────────────────────────────────────

const getToken   = ()  => localStorage.getItem("ursamu_token");
const setToken   = (t) => localStorage.setItem("ursamu_token", t);
const clearToken = ()  => localStorage.removeItem("ursamu_token");

// ── Theme ─────────────────────────────────────────────────────────────────────

/**
 * Fetch /api/v1/config and apply theme colours as CSS custom properties.
 * Also sets the page title and login screen title from game.name.
 * Non-fatal — missing config leaves the CSS-file defaults in place.
 */
async function applyConfig() {
  try {
    const { game, theme } = await fetch("/api/v1/config").then((r) => r.json());

    if (game?.name) {
      document.title = game.name;
      const el = document.getElementById("game-title");
      if (el) el.textContent = game.name;
    }

    if (theme) {
      const root = document.documentElement;
      const map  = {
        "--bg":           theme.background,
        "--bg-secondary": theme.surface,
        "--fg":           theme.text,
        "--fg-muted":     theme.muted,
        "--accent":       theme.primary,
        "--border":       theme.glassBorder,
      };
      for (const [prop, val] of Object.entries(map)) {
        if (val) root.style.setProperty(prop, val);
      }
    }
  } catch { /* non-fatal */ }
}

// ── Slot assembly ─────────────────────────────────────────────────────────────

/**
 * Fetch the UI manifest for `token` (or unauthenticated) and mount each
 * registered web component into its matching [data-slot] container.
 * Safe to call multiple times — containers are cleared before re-mounting.
 */
async function mountSlots(token) {
  const headers  = token ? { Authorization: `Bearer ${token}` } : {};
  const manifest = await fetch("/api/v1/ui-manifest", { headers })
    .then((r) => r.json())
    .catch(() => ({ slots: {} }));

  for (const [slot, components] of Object.entries(manifest.slots ?? {})) {
    const container = document.querySelector(`[data-slot="${slot}"]`);
    if (!container) continue;
    container.innerHTML = "";
    for (const comp of [...components].sort((a, b) => a.order - b.order)) {
      try {
        await import(comp.script);
        container.appendChild(document.createElement(comp.element));
      } catch (err) {
        console.warn(`[ursamu] Failed to mount ${comp.element}:`, err);
      }
    }
  }
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

let _ws               = null;
let _reconnectAttempt = 0;
let _reconnectTimer   = null;
let _intentionalLogout = false;

const MAX_RECONNECT  = 10;
const RECONNECT_BASE = 1_000;   // 1 s
const RECONNECT_CAP  = 30_000;  // 30 s

/** Exponential backoff delay capped at RECONNECT_CAP. */
function reconnectDelay(attempt) {
  return Math.min(RECONNECT_BASE * (2 ** (attempt - 1)), RECONNECT_CAP);
}

/**
 * Schedule a reconnect attempt unless the user intentionally logged out
 * or a reconnect is already pending.
 */
function scheduleReconnect() {
  if (_intentionalLogout)    return;  // user logged out — do not reconnect
  if (_reconnectTimer !== null) return; // already scheduled

  window._ursamu_ws = null;
  window.dispatchEvent(new CustomEvent("ursamu:disconnected"));

  _reconnectAttempt++;

  if (_reconnectAttempt > MAX_RECONNECT) {
    window.dispatchEvent(new CustomEvent("ursamu:reconnect-failed"));
    return;
  }

  const delay = reconnectDelay(_reconnectAttempt);
  window.dispatchEvent(new CustomEvent("ursamu:reconnecting", {
    detail: { attempt: _reconnectAttempt, delay },
  }));

  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    const token = getToken();
    if (token) connectWS(token);
  }, delay);
}

/** Open a WebSocket connection authenticated with `token`. */
function connectWS(token) {
  _intentionalLogout = false;

  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws    = new WebSocket(`${proto}//${location.host}?token=${encodeURIComponent(token)}&client=web`);
  _ws         = ws;

  ws.addEventListener("open", () => {
    // Reset reconnect state on successful connection
    _reconnectAttempt = 0;
    clearTimeout(_reconnectTimer);
    _reconnectTimer   = null;

    window._ursamu_ws = ws;
    window.dispatchEvent(new CustomEvent("ursamu:connected", { detail: { ws } }));
  });

  ws.addEventListener("message", (e) => {
    try {
      const data = JSON.parse(e.data);
      window.dispatchEvent(new CustomEvent("ursamu:message", { detail: data }));
    } catch {
      window.dispatchEvent(new CustomEvent("ursamu:message", { detail: { msg: e.data } }));
    }
  });

  // Both close and error trigger reconnect; scheduleReconnect is idempotent.
  ws.addEventListener("close", scheduleReconnect);
  ws.addEventListener("error", scheduleReconnect);
}

// ── Visibility helpers ────────────────────────────────────────────────────────

const showLogin  = () => {
  document.getElementById("login-screen").hidden = false;
  document.getElementById("game-client").hidden  = true;
};

const showClient = () => {
  document.getElementById("login-screen").hidden = true;
  document.getElementById("game-client").hidden  = false;
};

// ── Login form ────────────────────────────────────────────────────────────────

async function handleLogin(e) {
  e.preventDefault();
  const btn    = document.getElementById("login-btn");
  const errEl  = document.getElementById("login-error");
  const name   = document.getElementById("login-name").value.trim();
  const pass   = document.getElementById("login-password").value;

  errEl.textContent = "";
  btn.disabled = true;

  try {
    const res  = await fetch("/api/v1/auth/login", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ username: name, password: pass }),
    });
    const body = await res.json();

    if (!res.ok) {
      errEl.textContent = body.error ?? "Login failed.";
      return;
    }

    setToken(body.token);
    await mountSlots(body.token);
    showClient();
    connectWS(body.token);
  } catch {
    errEl.textContent = "Connection error. Is the server running?";
  } finally {
    btn.disabled = false;
  }
}

// ── Logout ────────────────────────────────────────────────────────────────────

/**
 * Any component can dispatch `ursamu:logout` on window to sign out.
 * Example:  window.dispatchEvent(new CustomEvent("ursamu:logout"))
 */
window.addEventListener("ursamu:logout", async () => {
  // Set flag BEFORE closing so scheduleReconnect no-ops on the close event.
  _intentionalLogout = true;
  clearTimeout(_reconnectTimer);
  _reconnectTimer   = null;
  _reconnectAttempt = 0;

  clearToken();
  if (_ws) { _ws.close(); _ws = null; }
  window._ursamu_ws = null;
  document.querySelectorAll("[data-slot]").forEach((el) => { el.innerHTML = ""; });
  showLogin();
  // Re-mount lock="" components (e.g. nav items visible to guests)
  await mountSlots(null);
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function bootstrap() {
  await applyConfig();

  document.getElementById("login-form").addEventListener("submit", handleLogin);

  const token = getToken();
  if (!token) {
    showLogin();
    await mountSlots(null); // mount any lock="" components (nav links, etc.)
    return;
  }

  // Validate stored token is still accepted before mounting the game client.
  const ok = await fetch("/api/v1/me", { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.ok)
    .catch(() => false);

  if (!ok) {
    clearToken();
    showLogin();
    await mountSlots(null);
    return;
  }

  await mountSlots(token);
  showClient();
  connectWS(token);
}

bootstrap();
