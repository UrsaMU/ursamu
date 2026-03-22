/**
 * ursamu-who — Online players list (sidebar).
 *
 * Polls GET /api/v1/players/online every 30 seconds and on connect.
 * Reads the Bearer token from localStorage ("ursamu_token").
 *
 * Response shape expected: Array<{ id, name, moniker, location }>
 *
 * CSS custom properties:
 *   --who-header-color  Section header text color (defaults to var(--accent))
 */

class UrsamuWho extends HTMLElement {
  constructor() {
    super();
    this._interval  = null;
    this._onConnect = () => this._refresh();
  }

  connectedCallback() {
    this.innerHTML = `
      <div class="who-header">Online</div>
      <div class="who-list"></div>
    `;
    this._list = this.querySelector(".who-list");
    this._applyStyles();

    window.addEventListener("ursamu:connected", this._onConnect);
    this._refresh();
    this._interval = setInterval(() => this._refresh(), 30_000);
  }

  disconnectedCallback() {
    window.removeEventListener("ursamu:connected", this._onConnect);
    clearInterval(this._interval);
  }

  _applyStyles() {
    const header = this.querySelector(".who-header");
    header.style.cssText = `
      color:          var(--who-header-color, var(--accent));
      font-size:      .8em;
      text-transform: uppercase;
      letter-spacing: 1px;
      padding:        4px 0 6px;
      border-bottom:  1px solid var(--border);
      margin-bottom:  4px;
    `;
  }

  async _refresh() {
    const token = localStorage.getItem("ursamu_token");
    if (!token) return;

    try {
      const players = await fetch("/api/v1/players/online", {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json());

      this._list.innerHTML = Array.isArray(players)
        ? players.map((p) => this._renderPlayer(p)).join("")
        : "";
    } catch { /* network error — keep stale list */ }
  }

  _renderPlayer(p) {
    const display = p.moniker ?? p.name ?? "Unknown";
    return `<div class="who-player" title="#${p.id}">${this._esc(display)}</div>`;
  }

  /** Escape HTML to prevent XSS from player-supplied names. */
  _esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

customElements.define("ursamu-who", UrsamuWho);
