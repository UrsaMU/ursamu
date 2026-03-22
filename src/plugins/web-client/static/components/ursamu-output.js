/**
 * ursamu-output — Main game output pane.
 *
 * Listens for `ursamu:message` events on `window` (dispatched by client.js)
 * and renders each incoming IState object as text.
 *
 * Handles:
 *   { msg: "text" }                          — plain message line
 *   { room: { name, desc, exits, players } } — room description block
 *   { msg: "...", room: {...} }               — message + room together
 *
 * MUSH color codes (%ch, %cn, %cr, etc.) and raw ANSI escapes are stripped
 * for v1. HTML rendering of color codes is planned for v2.
 *
 * CSS custom properties (set on the element or :root):
 *   --output-bg        Background (defaults to var(--bg))
 *   --output-fg        Text color  (defaults to var(--fg))
 *   --output-font      Font        (defaults to var(--font))
 *   --output-font-size Font size   (defaults to var(--font-size))
 */

/** Strip MUSH substitution codes and raw ANSI escapes from a string. */
function stripMush(str) {
  if (typeof str !== "string") return String(str);
  return str
    .replace(/\x1b\[[0-9;]*m/g, "")   // ANSI CSI sequences
    .replace(/%c[a-zA-Z]/g,    "")    // MUSH color codes: %ch %cn %cr etc.
    .replace(/%[rR]/g,         "\n")  // %r / %R → newline
    .replace(/%[tT]/g,         "\t")  // %t / %T → tab
    .replace(/%[bB]/g,         " ")   // %b / %B → space
    .replace(/%[nN]/g,         "");   // %n / %N → strip (player name placeholder)
}

/** Append a single text line to the scroll container. */
function appendLine(container, text, className) {
  const line = document.createElement("div");
  line.className = "output-line" + (className ? " " + className : "");
  line.textContent = stripMush(text);
  container.appendChild(line);
  container.scrollTop = container.scrollHeight;
}

/** Render an IState room block into the scroll container. */
function renderRoom(container, room) {
  appendLine(container, room.name ?? "",  "output-room-name");
  appendLine(container, room.desc ?? "",  "output-room-desc");
  if (room.exits?.length) {
    appendLine(container, "Exits: " + room.exits.join("  "), "output-room-exits");
  }
}

class UrsamuOutput extends HTMLElement {
  constructor() {
    super();
    this._onMessage = this._onMessage.bind(this);
  }

  connectedCallback() {
    this.innerHTML = `<div class="output-scroll"></div>`;
    this._scroll   = this.querySelector(".output-scroll");
    this._applyStyles();
    window.addEventListener("ursamu:message", this._onMessage);
  }

  disconnectedCallback() {
    window.removeEventListener("ursamu:message", this._onMessage);
  }

  _applyStyles() {
    Object.assign(this.style, {
      display:  "block",
      height:   "100%",
      overflow: "hidden",
    });
    const scroll = this._scroll;
    scroll.style.cssText = `
      height:       100%;
      overflow-y:   scroll;
      padding:      8px;
      background:   var(--output-bg,    var(--bg));
      color:        var(--output-fg,    var(--fg));
      font-family:  var(--output-font,  var(--font));
      font-size:    var(--output-font-size, var(--font-size));
      line-height:  1.5;
      white-space:  pre-wrap;
      scrollbar-width: thin;
      scrollbar-color: var(--border) transparent;
    `;
  }

  _onMessage(e) {
    const data = e.detail;
    if (data.msg)  appendLine(this._scroll, data.msg);
    if (data.room) renderRoom(this._scroll, data.room);
  }
}

customElements.define("ursamu-output", UrsamuOutput);
