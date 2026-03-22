/**
 * ursamu-input — Command input bar.
 *
 * Sends typed commands over the shared WebSocket (window._ursamu_ws).
 * Listens for `ursamu:connected` in case it mounts before the WS opens.
 *
 * Features:
 *   - Up/Down arrow key history (last 100 commands)
 *   - Picks up an already-connected WS if mounted after connection opens
 *   - Auto-focuses the input field on mount
 *
 * CSS custom properties:
 *   --input-bg         Field background  (defaults to var(--bg-secondary))
 *   --input-fg         Field text color  (defaults to var(--fg))
 *   --input-btn-bg     Send button color (defaults to var(--accent))
 */

class UrsamuInput extends HTMLElement {
  constructor() {
    super();
    this._ws        = null;
    this._history   = [];
    this._histIdx   = -1;
    this._onConnect = (e) => { this._ws = e.detail.ws; };
  }

  connectedCallback() {
    this.innerHTML = `
      <form class="input-form">
        <input  type="text" class="input-field" placeholder="Enter command…" autocomplete="off" spellcheck="false" />
        <button type="submit" class="input-btn">Send</button>
      </form>
    `;
    this._field = this.querySelector(".input-field");
    this._form  = this.querySelector(".input-form");
    this._applyStyles();

    window.addEventListener("ursamu:connected", this._onConnect);

    // Pick up an already-open connection (component mounted after connect event)
    if (window._ursamu_ws) this._ws = window._ursamu_ws;

    this._form.addEventListener("submit", (e) => { e.preventDefault(); this._send(); });
    this._field.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp")   { e.preventDefault(); this._histNav(1);  }
      if (e.key === "ArrowDown") { e.preventDefault(); this._histNav(-1); }
    });

    this._field.focus();
  }

  disconnectedCallback() {
    window.removeEventListener("ursamu:connected", this._onConnect);
  }

  _applyStyles() {
    const form  = this._form;
    const field = this._field;
    const btn   = this.querySelector(".input-btn");

    form.style.cssText = `
      display:    flex;
      gap:        4px;
      padding:    4px 8px;
      background: var(--bg-secondary);
    `;
    field.style.cssText = `
      flex:        1;
      background:  var(--input-bg,  var(--bg-secondary));
      border:      1px solid var(--border);
      color:       var(--input-fg,  var(--fg));
      font-family: var(--font);
      font-size:   var(--font-size);
      padding:     .4rem .6rem;
      outline:     none;
    `;
    field.addEventListener("focus", () => { field.style.borderColor = "var(--accent)"; });
    field.addEventListener("blur",  () => { field.style.borderColor = "var(--border)"; });
    btn.style.cssText = `
      background:  var(--input-btn-bg, var(--accent));
      border:      none;
      color:       #000;
      font-family: var(--font);
      font-size:   var(--font-size);
      padding:     .4rem .8rem;
      cursor:      pointer;
      font-weight: bold;
    `;
  }

  _send() {
    const val = this._field.value;
    if (!val.trim() || !this._ws) return;
    this._ws.send(JSON.stringify({ type: "cmd", data: val }));
    if (!this._history.length || this._history[0] !== val) {
      this._history.unshift(val);
      if (this._history.length > 100) this._history.pop();
    }
    this._histIdx   = -1;
    this._field.value = "";
  }

  _histNav(dir) {
    this._histIdx = Math.max(-1, Math.min(this._history.length - 1, this._histIdx + dir));
    this._field.value = this._histIdx >= 0 ? this._history[this._histIdx] : "";
    // Move cursor to end
    const len = this._field.value.length;
    this._field.setSelectionRange(len, len);
  }
}

customElements.define("ursamu-input", UrsamuInput);
