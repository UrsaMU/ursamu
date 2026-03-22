/**
 * ursamu-status — Connection status bar.
 *
 * Mounts in the `client.status-bar` slot. Shows a coloured dot and one-line
 * status text that updates in real-time as the WebSocket connects, disconnects,
 * reconnects, or when the user logs out.
 *
 * Listens for window events dispatched by client.js:
 *   ursamu:connected        → green "Connected"
 *   ursamu:disconnected     → orange "Disconnected — reconnecting…"
 *   ursamu:reconnecting     → orange "Reconnecting… (attempt N of 10)"
 *   ursamu:reconnect-failed → red "Disconnected"
 *   ursamu:logout           → grey "Offline"
 *
 * CSS custom properties:
 *   --status-font-size   Font size override (defaults to .75em)
 */

const STATES = {
  connecting:       { dot: "#f59e0b", text: "Connecting…" },
  connected:        { dot: "#22c55e", text: "Connected" },
  disconnected:     { dot: "#f59e0b", text: "Disconnected — reconnecting…" },
  reconnecting:     { dot: "#f59e0b", text: "" }, // text set dynamically
  reconnect_failed: { dot: "#ef4444", text: "Disconnected" },
  offline:          { dot: "#6b7280", text: "Offline" },
};

class UrsamuStatus extends HTMLElement {
  constructor() {
    super();
    // Bind handlers to stable references so removeEventListener works.
    this._onConnected      = ()  => this._setState("connected");
    this._onDisconnected   = ()  => this._setState("disconnected");
    this._onReconnecting   = (e) => this._setReconnecting(e.detail);
    this._onReconnectFailed = () => this._setState("reconnect_failed");
    this._onLogout         = ()  => this._setState("offline");
  }

  connectedCallback() {
    this.innerHTML = `
      <span class="status-dot"  aria-hidden="true"></span>
      <span class="status-text"></span>
    `;
    this._dot  = this.querySelector(".status-dot");
    this._text = this.querySelector(".status-text");
    this._applyStyles();

    window.addEventListener("ursamu:connected",       this._onConnected);
    window.addEventListener("ursamu:disconnected",    this._onDisconnected);
    window.addEventListener("ursamu:reconnecting",    this._onReconnecting);
    window.addEventListener("ursamu:reconnect-failed", this._onReconnectFailed);
    window.addEventListener("ursamu:logout",          this._onLogout);

    // Reflect current connection state if the component mounts after connect.
    if (window._ursamu_ws?.readyState === WebSocket.OPEN) {
      this._setState("connected");
    } else {
      this._setState("connecting");
    }
  }

  disconnectedCallback() {
    window.removeEventListener("ursamu:connected",       this._onConnected);
    window.removeEventListener("ursamu:disconnected",    this._onDisconnected);
    window.removeEventListener("ursamu:reconnecting",    this._onReconnecting);
    window.removeEventListener("ursamu:reconnect-failed", this._onReconnectFailed);
    window.removeEventListener("ursamu:logout",          this._onLogout);
  }

  _applyStyles() {
    Object.assign(this.style, {
      display:    "flex",
      alignItems: "center",
      gap:        "6px",
      padding:    "2px 8px",
    });
    this._dot.style.cssText = `
      width:        8px;
      height:       8px;
      border-radius: 50%;
      background:   #6b7280;
      flex-shrink:  0;
      transition:   background .3s;
    `;
    this._text.style.cssText = `
      color:     var(--fg-muted);
      font-size: var(--status-font-size, .75em);
    `;
  }

  _setState(key) {
    const s = STATES[key] ?? STATES.offline;
    this._dot.style.background  = s.dot;
    this._text.textContent       = s.text;
  }

  _setReconnecting({ attempt = 1, delay = 0 } = {}) {
    const secs = Math.round(delay / 1000);
    const dot  = STATES.reconnecting.dot;
    this._dot.style.background = dot;
    this._text.textContent = secs > 0
      ? `Reconnecting in ${secs}s… (attempt ${attempt} of ${10})`
      : `Reconnecting… (attempt ${attempt} of ${10})`;
  }
}

customElements.define("ursamu-status", UrsamuStatus);
