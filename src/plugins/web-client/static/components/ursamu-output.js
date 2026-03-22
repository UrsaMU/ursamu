/**
 * ursamu-output — Main game output pane.
 *
 * Listens for `ursamu:message` events on `window` (dispatched by client.js)
 * and renders each incoming payload as styled HTML.
 *
 * Handles:
 *   { msg: "text" }                          — plain message line
 *   { room: { name, desc, exits, players } } — room description block
 *   { msg: "...", room: {...} }               — message + room together
 *
 * MUSH color codes are rendered as CSS-class spans (v2):
 *   %ch → bold      %cn → reset (close spans)
 *   %cr → red       %cg → green    %cy → yellow
 *   %cb → blue      %cm → magenta  %cc → cyan
 *   %cw → white     %cx → dark     %cu → underline    %ci → italic
 *   %r/%R → newline   %t/%T → tab   %b/%B → space
 * All plain-text portions are HTML-escaped before insertion (XSS safe).
 *
 * CSS custom properties (set on the element or :root):
 *   --output-bg        Background (defaults to var(--bg))
 *   --output-fg        Text color  (defaults to var(--fg))
 *   --output-font      Font        (defaults to var(--font))
 *   --output-font-size Font size   (defaults to var(--font-size))
 *
 * MUSH colour palette can be overridden via CSS variables — see style.css.
 */

// ── MUSH → HTML conversion ────────────────────────────────────────────────────

/**
 * Maps a lowercase MUSH colour/style code character to a CSS class name.
 * 'n' is handled separately (it closes all open spans).
 */
const MUSH_CLASS = {
  h: "mu-bold",
  u: "mu-ul",
  i: "mu-it",
  r: "mu-red",
  g: "mu-grn",
  y: "mu-yel",
  b: "mu-blu",
  m: "mu-mag",
  c: "mu-cyn",
  w: "mu-wht",
  x: "mu-blk",
};

/** Escape a plain-text string for safe insertion into innerHTML. */
function escHtml(s) {
  return s
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;");
}

/**
 * Convert a MUSH-encoded string to safe HTML.
 *
 * All text segments are HTML-escaped before wrapping.
 * MUSH codes become <span class="mu-*"> … </span> pairs.
 * %cn closes all open spans at once.
 * ANSI escape sequences are stripped silently.
 */
function mushToHtml(str) {
  if (typeof str !== "string") return escHtml(String(str));

  // Tokenise: split on MUSH codes and ANSI escapes, keeping the delimiters.
  const tokens = str.split(/(%c[a-zA-Z]|%[rRtTbBnN]|\x1b\[[0-9;]*m)/);

  let html  = "";
  let depth = 0; // number of currently open <span> tags

  for (const tok of tokens) {
    if (!tok) continue;

    if (/^%c[a-zA-Z]$/.test(tok)) {
      const code = tok[2].toLowerCase();

      if (code === "n") {
        // %cn — reset: close all open spans
        html  += "</span>".repeat(depth);
        depth  = 0;
      } else {
        const cls = MUSH_CLASS[code];
        if (cls) {
          html  += `<span class="${cls}">`;
          depth++;
        }
        // Unknown code letters are silently dropped.
      }
    } else if (/^%[rR]$/.test(tok)) {
      html += "\n";
    } else if (/^%[tT]$/.test(tok)) {
      html += "\t";
    } else if (/^%[bB]$/.test(tok)) {
      html += " ";
    } else if (/^%[nN]$/.test(tok) || /^\x1b/.test(tok)) {
      // %n (player-name placeholder) and ANSI escapes — silently drop
    } else {
      html += escHtml(tok);
    }
  }

  // Close any spans that were never explicitly reset with %cn.
  html += "</span>".repeat(depth);

  return html;
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

/** Append a single output line to the scroll container. */
function appendLine(container, text, className) {
  const line = document.createElement("div");
  line.className = "output-line" + (className ? " " + className : "");
  // mushToHtml HTML-escapes all text — safe to assign via innerHTML.
  line.innerHTML = mushToHtml(text);
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

// ── Web component ─────────────────────────────────────────────────────────────

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
