/**
 * Public player game client — chat UI (output + bottom input).
 *
 * Wire format: telnet ANSI (and leftover %c). Never trust engine HTML —
 * core used to wordWrap after HTML and shred style='…' into visible text.
 *
 * Colors: classic 216-color web-safe palette (same idea as monikerToHtml).
 */
(function (global) {
  "use strict";

  var MAX_MSG = 400;
  var messages = [];
  var socket = null;
  var status = "idle";
  var rootEl = null;
  var PLAY_JS_VER = "20260805btngrow";
  /** Stick to bottom unless the user scrolls up. */
  var stickBottom = true;
  var STICK_PX = 48;
  /** UI mounted on /play (false while SPA is elsewhere). */
  var playVisible = false;
  /** Keep trying WS after first successful login to /play. */
  var wantLive = false;
  var reconnectTimer = null;
  var reconnectAttempt = 0;
  /**
   * True after the first successful WS open this page load.
   * Later connects use ?reconnect=true so the engine skips the
   * full connect splash and only says "Reconnected."
   */
  var wasLive = false;
  var didInitialLook = false;
  var msgSeq = 0;
  /**
   * Unread while not autoscrolling (scrolled up or left /play).
   * unreadStartId = first new msg id; null = caught up.
   */
  var unreadCount = 0;
  var unreadStartId = null;
  var lastUnreadId = null;

  /** Web-safe 16-color primaries (lowercase hex for CSS class names). */
  var FG_LETTER = {
    x: "#000000",
    r: "#ff0000",
    g: "#00cc00",
    y: "#ffff00",
    b: "#0000ff",
    m: "#ff00ff",
    c: "#00ffff",
    w: "#ffffff",
  };

  var FG_SGR = {
    30: "#000000",
    31: "#ff0000",
    32: "#00cc00",
    33: "#ffff00",
    34: "#0000ff",
    35: "#ff00ff",
    36: "#00ffff",
    37: "#ffffff",
  };

  var BG_LETTER = {
    X: "#000000",
    R: "#ff0000",
    G: "#00cc00",
    Y: "#ffff00",
    B: "#0000ff",
    M: "#ff00ff",
    C: "#00ffff",
    W: "#ffffff",
  };

  var BG_SGR = {
    40: "#000000",
    41: "#ff0000",
    42: "#00cc00",
    43: "#ffff00",
    44: "#0000ff",
    45: "#ff00ff",
    46: "#00ffff",
    47: "#ffffff",
  };

  /** Named CSS colors the old engine html subs emitted. */
  var NAMED = {
    black: "#000000",
    grey: "#808080",
    gray: "#808080",
    red: "#ff0000",
    green: "#00cc00",
    yellow: "#ffff00",
    blue: "#0000ff",
    magenta: "#ff00ff",
    cyan: "#00ffff",
    white: "#ffffff",
  };

  function token() {
    try {
      return sessionStorage.getItem("ursamu.webAdmin.token") || "";
    } catch (_) {
      return "";
    }
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function webSafeChannel(n) {
    var steps = [0, 51, 102, 153, 204, 255];
    var best = 0;
    var bestD = Math.abs(n - 0);
    for (var i = 0; i < steps.length; i++) {
      var d = Math.abs(n - steps[i]);
      if (d < bestD) {
        best = steps[i];
        bestD = d;
      }
    }
    return best;
  }

  /** Snap #rrggbb or rgb(r,g,b) to web-safe hex. */
  function toWebSafe(color) {
    if (!color) return null;
    var c = String(color).trim().toLowerCase();
    if (c === "inherit" || c === "transparent") return null;
    if (NAMED[c]) return NAMED[c];

    var hex = c.match(/^#?([0-9a-f]{6})$/i);
    if (hex) {
      var h = hex[1];
      var r = webSafeChannel(parseInt(h.slice(0, 2), 16));
      var g = webSafeChannel(parseInt(h.slice(2, 4), 16));
      var b = webSafeChannel(parseInt(h.slice(4, 6), 16));
      var p = function (n) {
        return n.toString(16).padStart(2, "0");
      };
      return "#" + p(r) + p(g) + p(b);
    }

    var rgb = c.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
    if (rgb) {
      var r2 = webSafeChannel(+rgb[1]);
      var g2 = webSafeChannel(+rgb[2]);
      var b2 = webSafeChannel(+rgb[3]);
      var p2 = function (n) {
        return n.toString(16).padStart(2, "0");
      };
      return "#" + p2(r2) + p2(g2) + p2(b2);
    }

    // Unknown name — leave as-is only if it looks safe
    if (/^[a-z]+$/i.test(c) && NAMED[c]) return NAMED[c];
    return null;
  }

  /**
   * Peel *engine* HTML only (span/b/i/br). Do NOT strip MUSH text like
   * `<CG>` exit aliases or other angle-bracket content — those must
   * remain and be escaped as &lt; &gt; by the plain-text flush.
   */
  function htmlToMarkers(s) {
    if (!/<span\b|<\/span>|<br\b|<\/?[bi]>|style\s*=/i.test(s)) {
      return s;
    }

    var out = s;

    out = out.replace(/&nbsp;/gi, " ");
    // Decode entities only when recovering engine HTML paths
    out = out.replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&").replace(/&quot;/g, '"');

    out = out.replace(/<br\s*\/?>/gi, "\n");
    out = out.replace(/<\/span>/gi, "\u001b[0m");
    out = out.replace(/<\/?[bi]>/gi, "");

    // Full <span style="...">
    out = out.replace(
      /<span\b[^>]*\bstyle\s*=\s*['"]([^'"]*)['"][^>]*>/gi,
      function (_m, style) {
        return styleToEsc(style);
      },
    );
    // Bare <span ...> without style (drop tag, keep text)
    out = out.replace(/<\/?span\b[^>]*>/gi, "");

    // Orphan style='...' >  (span tag eaten by wrap/sanitize)
    out = out.replace(
      /\bstyle\s*=\s*['"]([^'"]*)['"]\s*>/gi,
      function (_m, style) {
        return styleToEsc(style);
      },
    );

    // Only strip other known engine containers — never generic <Alias>
    out = out.replace(/<\/?(?:div|pre|font)(?:\s[^>]*)?>/gi, "");

    return out;
  }

  function styleToEsc(style) {
    var st = String(style || "");
    if (/color\s*:\s*inherit/i.test(st) ||
      /background-color\s*:\s*inherit/i.test(st) &&
        !/color\s*:\s*#|color\s*:\s*[a-z]/i.test(
          st.replace(/background-color\s*:\s*inherit/i, ""),
        )
    ) {
      // pure reset
      if (/inherit/i.test(st) && !/color\s*:\s*(?!inherit)[^;]+/i.test(st)) {
        return "\u001b[0m";
      }
    }

    var col = null;
    var m = st.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
    if (m) col = m[1].trim();

    if (!col || /^inherit$/i.test(col)) {
      return "\u001b[0m";
    }

    var hex = toWebSafe(col);
    if (!hex) return "\u001b[0m";

    // Emit truecolor ANSI; tokenizer snaps to web-safe again
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return "\u001b[38;2;" + r + ";" + g + ";" + b + "m";
  }

  function applySgr(style, params) {
    var next = Object.assign({}, style);
    if (!params.length) params = ["0"];
    for (var i = 0; i < params.length; i++) {
      var p = params[i];
      var n = parseInt(p, 10);
      if (p === "0" || n === 0) {
        next = {};
        continue;
      }
      if (n === 1) {
        next.bold = true;
        continue;
      }
      if (n === 3) {
        next.italic = true;
        continue;
      }
      if (n === 4) {
        next.underline = true;
        continue;
      }
      if (n === 22) {
        delete next.bold;
        continue;
      }
      if (n === 23) {
        delete next.italic;
        continue;
      }
      if (n === 24) {
        delete next.underline;
        continue;
      }
      if (n === 38 && params[i + 1] === "2" && i + 4 < params.length) {
        var hex = toWebSafe(
          "rgb(" + params[i + 2] + "," + params[i + 3] + "," +
            params[i + 4] + ")",
        );
        if (hex) next.color = hex;
        i += 4;
        continue;
      }
      if (n === 48 && params[i + 1] === "2" && i + 4 < params.length) {
        var hexb = toWebSafe(
          "rgb(" + params[i + 2] + "," + params[i + 3] + "," +
            params[i + 4] + ")",
        );
        if (hexb) next.bg = hexb;
        i += 4;
        continue;
      }
      if (n === 38 || n === 48) {
        if (params[i + 1] === "5") i += 2;
        continue;
      }
      if (FG_SGR[n]) {
        next.color = FG_SGR[n];
        continue;
      }
      if (BG_SGR[n]) {
        next.bg = BG_SGR[n];
      }
    }
    return next;
  }

  /**
   * ANSI + MUSH %c / truecolor / legacy HTML → closed web-safe spans.
   * Never leaves %c, ESC, or style= debris visible.
   */
  function mushToHtml(raw) {
    if (raw == null) return "";
    var s = htmlToMarkers(String(raw));

    s = s.replace(/%r/gi, "\n").replace(/%t/gi, "\t")
      .replace(/%b/gi, " ");

    var style = {};
    var parts = [];
    var buf = "";

    /** Hex → class suffix (no #); CSP-safe (no inline style=). */
    function hexClass(hex) {
      if (!hex) return "";
      return String(hex).replace(/^#/, "").toLowerCase();
    }

    function flush() {
      if (!buf) return;
      var text = esc(buf);
      buf = "";
      var cls = ["mush-text"];
      if (style.color) {
        var fc = hexClass(style.color);
        if (fc) cls.push("mush-fg-" + fc);
      }
      if (style.bg) {
        var bc = hexClass(style.bg);
        if (bc) cls.push("mush-bg-" + bc);
      }
      if (style.bold) cls.push("mush-bold");
      if (style.underline) cls.push("mush-u");
      if (style.italic) cls.push("mush-i");
      if (cls.length > 1) {
        parts.push(
          '<span class="' + cls.join(" ") + '">' + text + "</span>",
        );
      } else {
        parts.push(text);
      }
    }

    // deno-lint-ignore no-control-regex
    var re =
      /\u001b\[([0-9;]*)m|%c([nNrRgGyYbBmMcCwWxXhHuUiI])|%c<#([0-9a-fA-F]{6})>|<#([0-9a-fA-F]{6})>|%x([nNrRgGyYbBmMcCwWxXhHuUiI])/g;
    var last = 0;
    var m;
    while ((m = re.exec(s)) !== null) {
      if (m.index > last) {
        buf += s.slice(last, m.index);
        flush();
      }
      last = m.index + m[0].length;

      if (m[1] != null && m[0].charAt(0) === "\u001b") {
        flush();
        var params = m[1] === "" ? ["0"] : m[1].split(";");
        style = applySgr(style, params);
        continue;
      }

      if (m[3] || m[4]) {
        flush();
        var hx = toWebSafe("#" + (m[3] || m[4]));
        if (hx) {
          style = Object.assign({}, style, { color: hx });
        }
        continue;
      }

      var code = String(m[2] || m[5] || "").toLowerCase();
      var rawCode = m[2] || m[5] || "";
      flush();
      if (code === "n") {
        style = {};
        continue;
      }
      if (code === "h") {
        style = Object.assign({}, style, { bold: true });
        continue;
      }
      if (code === "u") {
        style = Object.assign({}, style, { underline: true });
        continue;
      }
      if (code === "i") {
        style = Object.assign({}, style, { italic: true });
        continue;
      }
      if (
        rawCode.length === 1 &&
        rawCode === rawCode.toUpperCase() &&
        BG_LETTER[rawCode]
      ) {
        style = Object.assign({}, style, { bg: BG_LETTER[rawCode] });
        continue;
      }
      if (FG_LETTER[code]) {
        style = Object.assign({}, style, { color: FG_LETTER[code] });
      }
    }
    if (last < s.length) {
      buf += s.slice(last);
      flush();
    }

    // Strip any unparsed codes left in plain text runs only.
    // Do NOT strip style= from the spans we just built.
    // deno-lint-ignore no-control-regex
    return parts.join("")
      .replace(/%c[nNrRgGyYbBmMcCwWxXhHuUiI]/g, "")
      .replace(/%x[nNrRgGyYbBmMcCwWxXhHuUiI]/g, "")
      .replace(/\u001b\[[0-9;]*m/g, "");
  }

  function hasLayout(data) {
    if (!data || typeof data !== "object") return false;
    var ui = data.ui;
    return !!(ui && typeof ui === "object" &&
      (Array.isArray(ui.components) || ui.type === "layout"));
  }

  function cellHtml(v) {
    if (v == null) return "";
    return mushToHtml(String(v));
  }

  /**
   * Connect splash may be markdown or staff HTML.
   * Detect real tags (not MUSH <CG> style tokens).
   * Outer-only wrappers like <center> around markdown → markdown.
   */
  function looksLikeHtml(raw) {
    var t = String(raw ?? "").trim();
    if (!t) return false;
    if (/^<!DOCTYPE\s/i.test(t)) return true;
    // Peel single outer center/div wrapper for detection
    var inner = t
      .replace(/^<(center|div)(?:\s[^>]*)?>/i, "")
      .replace(/<\/(center|div)>\s*$/i, "")
      .trim();
    var probe = inner || t;
    // Markdown-first body inside a wrapper → not full HTML
    if (
      /^(#{1,3}\s|[-*]\s|\*\*)/m.test(probe) &&
      !/<\/?(?:p|h[1-6]|img|table|ul|ol|li|section|article|figure|br|hr)\b/i
        .test(probe)
    ) {
      return false;
    }
    return /<\/?(?:div|p|h[1-6]|img|table|thead|tbody|tr|th|td|ul|ol|li|section|article|header|footer|main|aside|nav|figure|figcaption|blockquote|pre|code|br|hr|span|center|strong|em|b|i|u|a|small|sub|sup)\b/i
      .test(t);
  }

  var LOGIN_HTML_ALLOWED = {
    div: 1, p: 1, h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1,
    span: 1, strong: 1, b: 1, em: 1, i: 1, u: 1, small: 1,
    sub: 1, sup: 1, br: 1, hr: 1, ul: 1, ol: 1, li: 1, a: 1,
    img: 1, figure: 1, figcaption: 1, blockquote: 1, code: 1,
    pre: 1, table: 1, thead: 1, tbody: 1, tr: 1, th: 1, td: 1,
    center: 1, section: 1, article: 1, header: 1, footer: 1,
    main: 1, aside: 1, nav: 1,
  };
  var LOGIN_HTML_VOID = { br: 1, hr: 1, img: 1 };

  function safeSplashUrl(raw, kind) {
    var u = String(raw || "").trim();
    if (!u) return null;
    if (/^\s*javascript:/i.test(u) || /^\s*vbscript:/i.test(u)) {
      return null;
    }
    if (/^\s*data:/i.test(u)) {
      if (kind !== "src") return null;
      if (!/^\s*data:image\/(png|jpe?g|gif|webp);/i.test(u)) {
        return null;
      }
      return u;
    }
    return u;
  }

  /**
   * Staff HTML allowlist — strips script, style attrs, handlers,
   * and javascript: URLs. CSP also blocks inline style and script.
   */
  function sanitizeLoginHtml(raw) {
    var src = String(raw ?? "");
    if (!src.trim()) return "";
    if (typeof DOMParser === "undefined") {
      return src
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, "")
        .replace(
          /\shref\s*=\s*("|')\s*(javascript|vbscript|data):[^"']*\1/gi,
          "",
        )
        .replace(
          /\ssrc\s*=\s*("|')\s*(javascript|vbscript):[^"']*\1/gi,
          "",
        );
    }
    var doc = new DOMParser().parseFromString(
      '<div id="ursamu-splash-root">' + src + "</div>",
      "text/html",
    );
    var root = doc.getElementById("ursamu-splash-root");
    if (!root) return "";

    function cleanAttrs(el, tag) {
      var parts = [];
      var cls = el.getAttribute("class");
      if (cls && /^[a-zA-Z0-9 _:-]+$/.test(cls)) {
        parts.push('class="' + cls.replace(/"/g, "") + '"');
      }
      if (tag === "a") {
        var href = safeSplashUrl(el.getAttribute("href") || "", "href");
        if (href) {
          parts.push('href="' + href.replace(/"/g, "&quot;") + '"');
          parts.push('rel="noopener noreferrer"');
          var tgt = el.getAttribute("target");
          if (tgt === "_blank" || tgt === "_self") {
            parts.push('target="' + tgt + '"');
          }
        }
        var title = el.getAttribute("title");
        if (title) {
          parts.push('title="' + esc(title) + '"');
        }
      }
      if (tag === "img") {
        var isrc = safeSplashUrl(el.getAttribute("src") || "", "src");
        if (!isrc) return null;
        parts.push('src="' + isrc.replace(/"/g, "&quot;") + '"');
        parts.push('alt="' + esc(el.getAttribute("alt") || "") + '"');
        parts.push('loading="lazy"');
      }
      return parts.length ? " " + parts.join(" ") : "";
    }

    function serialize(node) {
      if (node.nodeType === 3) {
        return esc(node.textContent || "");
      }
      if (node.nodeType !== 1) return "";
      var el = node;
      var tag = el.tagName.toLowerCase();
      if (!LOGIN_HTML_ALLOWED[tag]) {
        var keep = "";
        for (var i = 0; i < el.childNodes.length; i++) {
          keep += serialize(el.childNodes[i]);
        }
        return keep;
      }
      if (tag === "img") {
        var ia = cleanAttrs(el, tag);
        if (ia == null) return "";
        return "<img" + ia + ">";
      }
      if (LOGIN_HTML_VOID[tag]) {
        return "<" + tag + cleanAttrs(el, tag) + ">";
      }
      var inner = "";
      for (var j = 0; j < el.childNodes.length; j++) {
        inner += serialize(el.childNodes[j]);
      }
      return "<" + tag + cleanAttrs(el, tag) + ">" + inner +
        "</" + tag + ">";
    }

    var out = "";
    for (var k = 0; k < root.childNodes.length; k++) {
      out += serialize(root.childNodes[k]);
    }
    return out;
  }

  function renderHtml(raw) {
    return '<div class="play-md play-md--html">' +
      sanitizeLoginHtml(raw) + "</div>";
  }

  /** Auto markdown vs HTML for connect splash content. */
  function renderSplash(content) {
    var s = typeof content === "string" ? content : "";
    // <center>…markdown…</center> → md + center class (CSP-safe)
    var cm = s.trim().match(
      /^<center(?:\s[^>]*)?>\s*([\s\S]*?)\s*<\/center>$/i,
    );
    if (cm && !looksLikeHtml(cm[1])) {
      var inner = renderMarkdown(cm[1]);
      return inner.replace(
        'class="play-md"',
        'class="play-md play-md--center"',
      );
    }
    if (looksLikeHtml(s)) return renderHtml(s);
    return renderMarkdown(s);
  }

  /**
   * Safe subset of markdown for login splash / layout blocks.
   * Escape first, then wrap — CSP-safe (no inline style=).
   */
  function renderMarkdown(md) {
    var lines = String(md ?? "").split(/\r?\n/);
    var html = "";
    var inList = false;
    var inPara = false;

    function closePara() {
      if (inPara) {
        html += "</p>";
        inPara = false;
      }
    }
    function closeList() {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
    }
    function safeHref(url) {
      var u = String(url).trim();
      if (!u) return null;
      if (/^\s*javascript:/i.test(u) || /^\s*data:/i.test(u)) {
        return null;
      }
      return u;
    }
    function inlineMd(text) {
      var s = esc(text);
      s = s.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
      s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
      s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
      // Images before links
      s = s.replace(
        /!\[([^\]]*)\]\(([^)]+)\)/g,
        function (_m, alt, url) {
          var href = safeHref(url);
          if (!href) return alt;
          return '<img src="' + esc(href) + '" alt="' +
            esc(alt) + '" loading="lazy">';
        },
      );
      s = s.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        function (_m, lbl, url) {
          var href = safeHref(url);
          if (!href) return lbl;
          return '<a href="' + esc(href) + '" rel="noopener">' +
            lbl + "</a>";
        },
      );
      return s;
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var t = line.trim();
      if (!t) {
        closePara();
        closeList();
        continue;
      }
      var hm = t.match(/^(#{1,3})\s+(.+)$/);
      if (hm) {
        closePara();
        closeList();
        var lvl = hm[1].length;
        html += "<h" + lvl + ' class="play-md__h">' +
          inlineMd(hm[2]) + "</h" + lvl + ">";
        continue;
      }
      if (/^[-*]\s+/.test(t)) {
        closePara();
        if (!inList) {
          html += '<ul class="play-md__list">';
          inList = true;
        }
        html += "<li>" + inlineMd(t.replace(/^[-*]\s+/, "")) +
          "</li>";
        continue;
      }
      // Block image on its own line
      var im = t.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (im) {
        closePara();
        closeList();
        var href = safeHref(im[2]);
        if (href) {
          html += '<img src="' + esc(href) + '" alt="' +
            esc(im[1]) + '" loading="lazy">';
        }
        continue;
      }
      closeList();
      if (!inPara) {
        html += '<p class="play-md__p">';
        inPara = true;
      } else {
        html += "<br />";
      }
      // MUSH colors if present; else full inline md (links/bold/imgs)
      if (/%c/i.test(t) || /%[rtn]/i.test(t)) {
        html += mushToHtml(t);
      } else {
        html += inlineMd(t);
      }
    }
    closePara();
    closeList();
    return '<div class="play-md">' + html + "</div>";
  }

  function actionCmd(item) {
    var a = item && item.action;
    if (!a || typeof a !== "object") return "";
    return String(a.cmd || "").trim();
  }

  /** Attr-safe encoding (quotes). */
  function escAttr(s) {
    return esc(s).replace(/'/g, "&#39;");
  }

  /** Interactive control — click sends data-play-cmd as game input. */
  function renderActionBtn(item) {
    var cmd = actionCmd(item);
    var label = cellHtml(item.label || item.title || cmd);
    // Show <CG> with real angle brackets (escaped for HTML)
    var badge = item.badge
      ? '<span class="play-action__badge" aria-hidden="true">' +
        "&lt;" + esc(String(item.badge)) + "&gt;</span>"
      : "";
    if (!cmd) {
      return '<span class="play-action play-action--static">' +
        badge + '<span class="play-action__label">' + label +
        "</span></span>";
    }
    var tip = cmd;
    var dbref = item.dbref
      ? '<span class="play-action__dbref">(' +
        esc(String(item.dbref)) + ")</span>"
      : "";
    return '<button type="button" class="play-action" ' +
      'data-play-cmd="' + escAttr(cmd) + '" title="' +
      escAttr(tip) + '" aria-label="' + escAttr(tip) + '">' +
      badge +
      '<span class="play-action__label">' + label + "</span>" +
      dbref +
      "</button>";
  }

  /**
   * Character/thing row — in-game columns:
   *   name(+dbref) | role/flag | idle | short-desc
   * Role is its own column (config roleTags). Name is capped.
   */
  function renderEntityRow(item) {
    var cmd = actionCmd(item);
    var tag = cmd ? "button" : "div";
    var attrs = cmd
      ? ' type="button" class="play-entity" data-play-cmd="' +
        escAttr(cmd) + '" title="' + escAttr(cmd) +
        '" aria-label="' + escAttr(cmd) + '"'
      : ' class="play-entity play-entity--static"';
    var html = "<" + tag + attrs + ">";

    // Col 1: name + optional staff dbref
    html += '<div class="play-entity__name-col">';
    html += '<span class="play-entity__name">' +
      cellHtml(item.label || "") + "</span>";
    if (item.dbref) {
      html += '<span class="play-entity__dbref">(' +
        esc(String(item.dbref)) + ")</span>";
    }
    html += "</div>";

    // Col 2: staff/role flag (own column — may be empty)
    html += '<div class="play-entity__role-col">';
    if (item.role) {
      html += '<span class="play-entity__role">' +
        cellHtml(item.role) + "</span>";
    }
    html += "</div>";

    // Col 3: idle
    html += '<div class="play-entity__meta">' +
      cellHtml(item.meta || "") + "</div>";

    // Col 4: short-desc
    html += '<div class="play-entity__sub">' +
      cellHtml(item.sublabel || "") + "</div>";

    html += "</" + tag + ">";
    return html;
  }

  /** Dot row for sheet attrs/skills (● filled / ○ empty). */
  function renderDots(value, maxDots) {
    maxDots = Math.max(1, Math.min(10, Number(maxDots) || 5));
    var n = Math.max(0, Math.min(maxDots, Number(value) || 0));
    var html = '<span class="play-dots" aria-hidden="true">';
    for (var i = 1; i <= maxDots; i++) {
      html += '<span class="play-dot' +
        (i <= n ? " is-on" : "") + '"></span>';
    }
    return html + "</span>";
  }

  /**
   * Stat columns: Attributes / Skills blocks.
   * c.columns = [{ title, rows: [{ label, value, max }] }]
   */
  function renderStatCols(c) {
    var cols = Array.isArray(c.columns) ? c.columns : [];
    var html = '<section class="play-layout__section play-stat-cols">';
    if (c.title) {
      html += '<h3 class="play-layout__section-title">' +
        esc(String(c.title)) + "</h3>";
    }
    html += '<div class="play-stat-cols__grid" data-cols="' +
      Math.min(3, Math.max(1, cols.length)) + '">';
    for (var i = 0; i < cols.length; i++) {
      var col = cols[i] || {};
      html += '<div class="play-stat-cols__col">';
      if (col.title) {
        html += '<p class="play-stat-cols__title">' +
          esc(String(col.title)) + "</p>";
      }
      var rows = Array.isArray(col.rows) ? col.rows : [];
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r] || {};
        var val = Number(row.value) || 0;
        var maxD = Number(row.max) || 5;
        html += '<div class="play-stat-row">' +
          '<span class="play-stat-row__label">' +
          esc(String(row.label || "")) + "</span>" +
          renderDots(val, maxD) +
          '<span class="play-stat-row__num">' + val +
          "</span></div>";
      }
      html += "</div>";
    }
    html += "</div></section>";
    return html;
  }

  /**
   * Health / willpower track.
   * c.kinds = "empty"|"bash"|"leth"|"agg"|"wp-on"|"wp-off"
   */
  function renderTrackRow(c) {
    var label = String(c.label || "");
    var kinds = Array.isArray(c.kinds) ? c.kinds : [];
    var meta = c.meta != null ? String(c.meta) : "";
    var html = '<div class="play-track-row">' +
      '<span class="play-track-row__label">' + esc(label) +
      "</span>" +
      '<span class="play-track" role="img" aria-label="' +
      escAttr(label + (meta ? " " + meta : "")) + '">';
    for (var i = 0; i < kinds.length; i++) {
      var k = String(kinds[i] || "empty");
      if (k === "wp-on" || k === "wp-off") {
        html += '<span class="play-wbox' +
          (k === "wp-on" ? " is-on" : "") +
          '" aria-hidden="true"></span>';
      } else {
        var mark = "";
        if (k === "bash") mark = "/";
        else if (k === "leth") mark = "✕";
        else if (k === "agg") mark = "★";
        html += '<span class="play-hbox play-hbox--' +
          esc(k) + '" aria-hidden="true">' + mark + "</span>";
      }
    }
    html += "</span>";
    if (meta) {
      html += '<span class="play-track-row__meta">' +
        esc(meta) + "</span>";
    }
    html += "</div>";
    return html;
  }

  function renderLayout(ui) {
    var comps = Array.isArray(ui.components) ? ui.components : [];
    var metaType = ui.meta && ui.meta.type
      ? String(ui.meta.type)
      : "";
    var html = '<div class="play-layout' +
      (metaType ? " play-layout--" + esc(metaType) : "") +
      '">';
    for (var i = 0; i < comps.length; i++) {
      var c = comps[i] || {};
      var t = String(c.type || "");
      if (t === "header") {
        html += '<header class="play-layout__header"><h2 class="' +
          'play-layout__title">' +
          cellHtml(c.title || c.content || "") +
          "</h2></header>";
      } else if (t === "markdown" || t === "html") {
        // Auto md/html (and center+md hybrids) via renderSplash
        html += renderSplash(
          typeof c.content === "string" ? c.content : "",
        );
      } else if (t === "text") {
        html += '<div class="play-layout__text">' +
          cellHtml(c.content || "") + "</div>";
      } else if (t === "media" && c.url) {
        html += '<figure class="play-layout__media">' +
          '<img src="' + esc(String(c.url)) + '" alt="' +
          esc(String(c.alt || "")) +
          '" loading="lazy" /></figure>';
      } else if (t === "entity-list") {
        html += '<section class="play-layout__section">';
        if (c.title) {
          html += '<h3 class="play-layout__section-title">' +
            esc(String(c.title)) + "</h3>";
        }
        html += '<div class="play-entity-list">';
        var ents = Array.isArray(c.items) ? c.items : [];
        for (var ei = 0; ei < ents.length; ei++) {
          html += renderEntityRow(ents[ei] || {});
        }
        html += "</div></section>";
      } else if (t === "actions") {
        html += '<section class="play-layout__section">';
        if (c.title) {
          html += '<h3 class="play-layout__section-title">' +
            esc(String(c.title)) + "</h3>";
        }
        var cols = 2;
        if (c.content && typeof c.content === "object" &&
          c.content.columns) {
          cols = Math.max(1, Math.min(3, Number(c.content.columns) || 2));
        }
        var acts = Array.isArray(c.items) ? c.items : [];
        if (acts.length === 1) cols = 1;
        else if (acts.length >= 5 && cols < 3) cols = 3;
        html += '<div class="play-actions play-actions--cols-' +
          cols + '">';
        for (var ai = 0; ai < acts.length; ai++) {
          html += renderActionBtn(acts[ai] || {});
        }
        html += "</div></section>";
      } else if (t === "table" && Array.isArray(c.content)) {
        html += '<table class="play-layout__table"><tbody>';
        for (var r = 0; r < c.content.length; r++) {
          var row = c.content[r];
          html += "<tr>";
          var cells = Array.isArray(row) ? row : [row];
          for (var ci = 0; ci < cells.length; ci++) {
            html += "<td>" + cellHtml(cells[ci]) + "</td>";
          }
          html += "</tr>";
        }
        html += "</tbody></table>";
      } else if (t === "stat-cols") {
        html += renderStatCols(c);
      } else if (t === "track-row") {
        html += renderTrackRow(c);
      } else if (t === "list") {
        html += '<section class="play-layout__section">';
        if (c.title) {
          html += '<h3 class="play-layout__section-title">' +
            esc(String(c.title)) + "</h3>";
        }
        var items = Array.isArray(c.content)
          ? c.content
          : [c.content];
        html += '<ul class="play-layout__list">';
        for (var li = 0; li < items.length; li++) {
          html += "<li>" + cellHtml(items[li]) + "</li>";
        }
        html += "</ul></section>";
      } else if (t === "panel") {
        html += '<section class="play-layout__panel">';
        if (c.title) {
          html += '<h3 class="play-layout__panel-title">' +
            esc(String(c.title)) + "</h3>";
        }
        html += '<div class="play-layout__panel-body">' +
          cellHtml(
            typeof c.content === "string"
              ? c.content
              : JSON.stringify(c.content),
          ) +
          "</div></section>";
      } else if (typeof c.content === "string") {
        html += '<div class="play-pre">' +
          mushToHtml(c.content) + "</div>";
      }
    }
    html += "</div>";
    return html;
  }

  function isNearBottom(el) {
    if (!el) return true;
    var gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    return gap <= STICK_PX;
  }

  function scrollOutputToBottom(el) {
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  function bindOutputScroll(out) {
    if (!out || out._playScrollBound) return;
    out._playScrollBound = true;
    out.addEventListener("scroll", function () {
      stickBottom = isNearBottom(out);
      if (stickBottom) {
        markAllRead();
      } else {
        maybeClearUnreadByScroll(out);
      }
    }, { passive: true });
  }

  /** True when the player is watching live output (bottom + on /play). */
  function isActivelyReading() {
    if (!playVisible || !stickBottom) return false;
    try {
      if (document.hidden) return false;
    } catch (_) { /* ignore */ }
    return true;
  }

  function playHrefMatch(href) {
    var h = String(href || "");
    try {
      if (h.indexOf("http") === 0) {
        h = new URL(h, location.href).pathname;
      }
    } catch (_) { /* ignore */ }
    return h === "/play" ||
      h.indexOf("/play/") === 0 ||
      h === "/site/play" ||
      h.indexOf("/site/play/") === 0 ||
      /\/play\/?$/.test(h);
  }

  /** Nav badge: dot + count on the Play link. */
  function updatePlayNavBadge() {
    var list = document.querySelector("[data-site-nav-list]");
    if (!list) return;
    var links = list.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (!playHrefMatch(a.getAttribute("href"))) continue;
      a.classList.add("site-nav__play-link");
      var badge = a.querySelector(".site-nav__badge");
      if (unreadCount <= 0) {
        a.classList.remove("has-unread");
        if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
        continue;
      }
      a.classList.add("has-unread");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "site-nav__badge";
        badge.setAttribute("aria-hidden", "true");
        a.appendChild(badge);
      }
      badge.textContent = unreadCount > 99
        ? "99+"
        : String(unreadCount);
      a.setAttribute(
        "aria-label",
        "Play, " + unreadCount + " new",
      );
    }
    try {
      document.dispatchEvent(new CustomEvent("siteplay:unread", {
        detail: { count: unreadCount },
      }));
    } catch (_) { /* ignore */ }
  }

  function markAllRead() {
    if (unreadCount === 0 && unreadStartId == null) {
      updatePlayNavBadge();
      return;
    }
    var had = unreadCount > 0 || unreadStartId != null;
    unreadCount = 0;
    unreadStartId = null;
    lastUnreadId = null;
    updatePlayNavBadge();
    if (had && playVisible) renderMessages();
  }

  /**
   * Clear unread once the last new post is scrolled into the
   * bottom of the output viewport (chat "caught up").
   */
  function maybeClearUnreadByScroll(out) {
    if (!out || unreadStartId == null || !lastUnreadId) return;
    var last = out.querySelector(
      '[data-msg-id="' + lastUnreadId + '"]',
    );
    if (!last) return;
    var er = last.getBoundingClientRect();
    var or = out.getBoundingClientRect();
    // Reached = last new post's bottom is at/above viewport bottom
    if (er.bottom <= or.bottom + 12) {
      markAllRead();
    }
  }

  function renderNewDivider() {
    return '<div class="play-new-divider" id="play-new-divider" ' +
      'role="separator" aria-label="New messages">' +
      '<span class="play-new-divider__line" aria-hidden="true">' +
      "</span>" +
      '<span class="play-new-divider__label">New</span>' +
      '<span class="play-new-divider__line" aria-hidden="true">' +
      "</span></div>";
  }

  /** Layout controls: data-play-cmd → send as game input. */
  function bindOutputActions(out) {
    if (!out || out._playActionBound) return;
    out._playActionBound = true;
    out.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var el = t.closest("[data-play-cmd]");
      if (!el || !out.contains(el)) return;
      var cmd = el.getAttribute("data-play-cmd");
      if (!cmd) return;
      ev.preventDefault();
      ev.stopPropagation();
      sendCmd(cmd);
    });
  }

  function formatChatTime(ts) {
    var d = new Date(typeof ts === "number" ? ts : Date.now());
    if (isNaN(d.getTime())) d = new Date();
    var h = d.getHours();
    var m = d.getMinutes();
    var hh = h < 10 ? "0" + h : String(h);
    var mm = m < 10 ? "0" + m : String(m);
    return hh + ":" + mm;
  }

  function initialFromName(name) {
    var plain = String(name || "?")
      .replace(/%c[a-zA-Z]/gi, "")
      .replace(/<#[0-9a-fA-F]{6}>/g, "")
      .replace(/%[nrtbR]/g, "")
      .trim();
    return plain ? plain.charAt(0).toUpperCase() : "?";
  }

  /** Chat bubble: one avatar · name · time · message */
  function renderChat(ui) {
    var kind = String(ui.kind || "say");
    var oocMode = String(ui.oocMode || "");
    var name = String(ui.name || "Someone");
    var text = String(ui.text || "");
    var avatar = ui.avatar ? String(ui.avatar) : "";
    var time = formatChatTime(ui.at);
    var nameHtml = mushToHtml(name);
    var textHtml = mushToHtml(text);
    var initial = esc(initialFromName(name));
    var isOoc = kind === "ooc";
    var isPose = kind === "pose" || kind === "semi" ||
      (isOoc && (oocMode === "pose" || oocMode === "semi"));
    // Single avatar slot — img OR fallback, never both
    var avHtml = avatar
      ? '<img class="play-chat__avatar" src="' +
        escAttr(avatar) + '" alt="" loading="lazy" ' +
        'referrerpolicy="no-referrer" data-fallback="' +
        initial + '" />'
      : '<span class="play-chat__avatar-fallback">' +
        initial + "</span>";
    var bodyClass = "play-chat__text";
    if (isPose) bodyClass += " play-chat__text--pose";
    if (isOoc) bodyClass += " play-chat__text--ooc";
    var tag = ui.tag
      ? String(ui.tag)
      : (isOoc ? "OOC" : "");
    var tagHtml = tag
      ? '<span class="play-chat__tag" aria-label="' +
        escAttr(tag) + '">' + esc(tag) + "</span>"
      : "";
    // OOC say: show quoted-ish body; pose: action only
    var bodyInner = textHtml;
    if (isOoc && oocMode === "say" && text) {
      bodyInner = mushToHtml('"' + text + '"');
    }
    return '<div class="play-chat play-chat--' + esc(kind) +
      (isOoc ? " play-chat--ooc" : "") + '">' +
      '<div class="play-chat__av">' + avHtml + "</div>" +
      '<div class="play-chat__main">' +
      '<div class="play-chat__meta">' +
      tagHtml +
      '<span class="play-chat__name">' + nameHtml + "</span>" +
      '<time class="play-chat__time" datetime="' +
      esc(String(ui.at || "")) + '">' + esc(time) + "</time>" +
      "</div>" +
      '<div class="' + bodyClass + '">' + bodyInner +
      "</div></div></div>";
  }

  function isChatUi(data) {
    return !!(data && data.ui && data.ui.type === "chat");
  }

  function isCmdEcho(data) {
    return !!(data && data.ui && data.ui.type === "cmd-echo");
  }

  /** Faded command input (server: addCmd echo !== false). */
  function renderCmdEcho(ui) {
    var text = String(ui.text || "").trim();
    if (!text) return "";
    // Plain escaped text — no MUSH colors (stays muted/faded).
    return '<div class="play-cmd-echo" aria-hidden="true">' +
      '<span class="play-cmd-echo__gt">&gt;</span>' +
      '<span class="play-cmd-echo__text">' +
      esc(text) +
      "</span></div>";
  }

  function renderMessages() {
    var out = rootEl && rootEl.querySelector(".play-output");
    if (!out) return;
    bindOutputScroll(out);
    bindOutputActions(out);
    var shouldStick = stickBottom || isNearBottom(out);
    var prevTop = out.scrollTop;
    var prevH = out.scrollHeight;

    if (!messages.length) {
      out.innerHTML =
        '<p class="play-output__empty">Connecting to the world…</p>';
      if (shouldStick) scrollOutputToBottom(out);
      return;
    }
    // Divider only when not autoscrolling / have unread
    var showNew = !shouldStick && unreadStartId != null;
    var html = "";
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      if (showNew && m._id === unreadStartId) {
        html += renderNewDivider();
      }
      html += '<div class="play-msg" data-msg-id="' +
        esc(String(m._id || "")) + '">';
      if (isCmdEcho(m.data)) {
        html += renderCmdEcho(m.data.ui);
      } else if (isChatUi(m.data)) {
        html += renderChat(m.data.ui);
      } else if (hasLayout(m.data)) {
        html += renderLayout(m.data.ui);
      } else if (m.msg) {
        html += '<div class="play-pre">' +
          mushToHtml(m.msg) + "</div>";
      }
      html += "</div>";
    }
    out.innerHTML = html;
    // Broken avatar → replace with one fallback circle (CSP-safe)
    var avs = out.querySelectorAll(".play-chat__avatar");
    for (var ai = 0; ai < avs.length; ai++) {
      (function (img) {
        function toFallback() {
          var fb = document.createElement("span");
          fb.className = "play-chat__avatar-fallback";
          fb.textContent = img.getAttribute("data-fallback") ||
            "?";
          if (img.parentNode) {
            img.parentNode.replaceChild(fb, img);
          }
        }
        if (img.complete && img.naturalWidth === 0) {
          toFallback();
          return;
        }
        img.addEventListener("error", toFallback);
      })(avs[ai]);
    }
    if (shouldStick) {
      scrollOutputToBottom(out);
      stickBottom = true;
    } else {
      // Keep viewport anchored when history grows above
      var delta = out.scrollHeight - prevH;
      out.scrollTop = prevTop + (delta > 0 ? delta : 0);
    }
  }

  function setStatus(s) {
    status = s;
    var el = rootEl && rootEl.querySelector(".play-root__status");
    if (!el) return;
    el.textContent = s;
    el.className = "play-root__status" +
      (s === "open" ? " is-open" : "") +
      (s === "error" ? " is-error" : "");
    var inp = rootEl.querySelector(".play-prompt__input");
    var btn = rootEl.querySelector(".play-prompt__send");
    var dis = s !== "open";
    if (inp) inp.disabled = dis;
    if (btn) btn.disabled = dis;
  }

  function setError(msg) {
    var el = rootEl && rootEl.querySelector(".play-error");
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = msg;
  }

  function push(m) {
    m = m || {};
    m._id = ++msgSeq;
    messages.push(m);
    if (messages.length > MAX_MSG) {
      var dropped = messages.length - MAX_MSG;
      messages = messages.slice(-MAX_MSG);
      if (unreadStartId != null) {
        var still = false;
        for (var di = 0; di < messages.length; di++) {
          if (messages[di]._id === unreadStartId) {
            still = true;
            break;
          }
        }
        if (!still) {
          unreadStartId = messages.length
            ? messages[0]._id
            : null;
          unreadCount = Math.max(0, unreadCount - dropped);
          if (!unreadStartId) {
            unreadCount = 0;
            lastUnreadId = null;
          }
        }
      }
    }

    if (isActivelyReading()) {
      // Live at bottom — consume immediately, no badge/divider
      unreadCount = 0;
      unreadStartId = null;
      lastUnreadId = null;
    } else {
      if (unreadStartId == null) unreadStartId = m._id;
      lastUnreadId = m._id;
      unreadCount += 1;
    }
    updatePlayNavBadge();

    if (playVisible) renderMessages();
  }

  function wsUrl() {
    var proto = location.protocol === "https:" ? "wss:" : "ws:";
    var base;
    if (location.protocol === "https:") {
      base = proto + "//" + location.host + "/ws";
    } else {
      var host = location.hostname;
      var port = 4202;
      try {
        var cfg = global.__SITE_CFG__;
        if (cfg && cfg.server) {
          port = Number(cfg.server.wsPort || cfg.server.ws || 4202);
        }
      } catch (_) { /* ignore */ }
      if (String(port) === String(location.port || "80")) {
        base = proto + "//" + location.host + "/ws";
      } else {
        base = proto + "//" + host + ":" + port;
      }
    }
    var q = ["clientType=web"];
    if (wasLive) q.push("reconnect=true");
    return base + "?" + q.join("&");
  }

  function fetchWsPort(cb) {
    fetch("/api/v1/config")
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        if (data && data.server) {
          global.__SITE_CFG__ = data;
        }
        cb();
      })
      .catch(function () {
        cb();
      });
  }

  function clearReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect() {
    if (!wantLive) return;
    clearReconnect();
    reconnectAttempt += 1;
    var delay = Math.min(
      30000,
      1000 * Math.pow(1.6, Math.min(reconnectAttempt, 10)),
    );
    setStatus("connecting");
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function connect() {
    var t = token();
    if (!t) {
      setStatus("error");
      setError("Sign in to play.");
      return;
    }
    wantLive = true;
    // Stay on existing open/connecting socket
    if (socket) {
      var rs = socket.readyState;
      if (rs === 0 || rs === 1) {
        if (rs === 1) setStatus("open");
        return;
      }
      try {
        socket.close();
      } catch (_) { /* ignore */ }
      socket = null;
    }
    setStatus("connecting");
    setError("");
    fetchWsPort(function () {
      if (!wantLive) return;
      try {
        socket = new WebSocket(wsUrl());
      } catch (e) {
        setStatus("error");
        setError(String(e && e.message || e));
        scheduleReconnect();
        return;
      }
      socket.onopen = function () {
        var isReconnect = wasLive;
        reconnectAttempt = 0;
        setStatus("open");
        socket.send(JSON.stringify({ type: "auth", token: t }));
        // Mark live after first open so later WS dials are reconnects
        wasLive = true;
        // Server skips connect splash when ?reconnect=true; show a
        // short line here (mush ≥1.0.29 also sends one — keep client
        // notice until that pin is live, then drop if it doubles).
        if (isReconnect) {
          push({
            msg: "Game> Reconnected.",
            at: Date.now(),
          });
        }
        // Initial look only once per live session
        if (!didInitialLook) {
          didInitialLook = true;
          setTimeout(function () {
            if (socket && socket.readyState === 1) {
              socket.send(JSON.stringify({ msg: "look" }));
            }
          }, 200);
        }
      };
      socket.onmessage = function (ev) {
        try {
          var payload = JSON.parse(String(ev.data));
          var ui = payload.data && payload.data.ui;
          // Server asked play client to open Character tab
          if (
            ui &&
            (ui.type === "navigate" ||
              (ui.meta && ui.meta.type === "navigate"))
          ) {
            var dest = ui.path || ui.href ||
              (ui.meta && (ui.meta.path || ui.meta.href)) ||
              "";
            if (
              !dest ||
              /chargen/i.test(String(dest)) ||
              String(ui.to || "").toLowerCase() === "chargen"
            ) {
              goToChargen();
              return;
            }
            try {
              if (global.SiteShell &&
                global.SiteShell.navigate) {
                global.SiteShell.navigate(String(dest));
                return;
              }
            } catch (_) { /* ignore */ }
            window.location.href = String(dest);
            return;
          }
          if (
            payload.msg != null ||
            (payload.data && Object.keys(payload.data).length)
          ) {
            push({
              msg: payload.msg,
              data: payload.data,
            });
          }
        } catch (_) {
          push({ msg: String(ev.data) });
        }
      };
      socket.onerror = function () {
        setStatus("error");
        if (playVisible) setError("Connection error");
      };
      socket.onclose = function () {
        setStatus("closed");
        socket = null;
        if (wantLive) scheduleReconnect();
      };
    });
  }

  /** Server layout navigate → Character (optional deep-link only). */
  function goToChargen() {
    var p = location.pathname || "";
    var path = (p === "/site" || p.indexOf("/site/") === 0)
      ? "/site/chargen"
      : "/chargen";
    try {
      if (global.SiteShell && typeof global.SiteShell.navigate ===
        "function") {
        global.SiteShell.navigate(path);
        return;
      }
    } catch (_) { /* fall through */ }
    try {
      window.location.assign(path);
    } catch (_) {
      window.location.href = path;
    }
  }

  /**
   * Send as typed. Server defaults unmatched bare text to `say`
   * after registered commands / exits / $patterns (see addCmd).
   * Pose shortcuts (: ; " ') and say/pose already match engine cmds.
   * +cg runs in the play terminal (no client redirect).
   */
  /**
   * No client-side "> …" echo. Server sends faded cmd-echo when
   * addCmd({ echo: true }) (default). say/pose use echo: false.
   */
  function sendCmd(line) {
    var t = String(line || "").trim();
    if (!t) return;
    if (!socket || socket.readyState !== 1) return;
    socket.send(JSON.stringify({ msg: t }));
  }

  function mount(mainEl) {
    if (!mainEl) return;
    playVisible = true;
    wantLive = true;

    mainEl.innerHTML =
      '<div class="play-root" id="play-root" data-play-js="' +
      PLAY_JS_VER + '">' +
      '<span class="play-root__status" aria-live="polite">idle</span>' +
      '<p class="play-error" hidden></p>' +
      '<div class="play-output" role="log" aria-live="polite" ' +
      'aria-relevant="additions"></div>' +
      '<hr class="play-prompt-rule" aria-hidden="true" />' +
      '<form class="play-prompt" id="play-form" autocomplete="off">' +
      '<label class="visually-hidden" for="play-cmd">Command</label>' +
      '<textarea id="play-cmd" class="play-prompt__input" ' +
      'name="cmd" rows="1" spellcheck="false" autocomplete="off" ' +
      'placeholder="Say something…  :pose  or a command" ' +
      'disabled></textarea>' +
      '<button type="submit" class="play-prompt__send" disabled>' +
      "SEND</button>" +
      "</form></div>";

    rootEl = document.getElementById("play-root");
    // Keep message history across SPA navigations
    // Unread: land on divider (not forced to bottom)
    if (unreadCount > 0) stickBottom = false;
    else stickBottom = true;
    setStatus(status);
    renderMessages();
    updatePlayNavBadge();

    if (unreadCount > 0) {
      // Jump to the New divider so context is clear
      setTimeout(function () {
        var out = rootEl &&
          rootEl.querySelector(".play-output");
        var div = out &&
          out.querySelector("#play-new-divider");
        if (div && out) {
          try {
            div.scrollIntoView({ block: "center" });
          } catch (_) {
            out.scrollTop = Math.max(0, div.offsetTop - 40);
          }
          stickBottom = false;
        }
      }, 30);
    }

    var form = document.getElementById("play-form");
    var inp = form && form.querySelector(".play-prompt__input");

    /** Grow textarea with content; shrink output (flex). Cap 300px. */
    var INPUT_MIN_H = 55;
    var INPUT_MAX_H = 300;

    function resizeInput() {
      if (!inp) return;
      // Collapse first so scrollHeight reflects content, not prior height
      inp.style.height = "0px";
      var needed = inp.scrollHeight;
      var h = Math.min(Math.max(needed, INPUT_MIN_H), INPUT_MAX_H);
      inp.style.height = h + "px";
      // Scroll inside field once past the max
      inp.style.overflowY = needed > INPUT_MAX_H ? "auto" : "hidden";
    }

    if (form && inp) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var v = inp.value;
        inp.value = "";
        resizeInput();
        sendCmd(v);
        inp.focus();
      });
      inp.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          if (form.requestSubmit) form.requestSubmit();
          else {
            form.dispatchEvent(
              new Event("submit", { cancelable: true }),
            );
          }
        }
      });
      inp.addEventListener("input", resizeInput);
      // Width changes reflow wrap → remeasure height (not the
      // textarea itself — setting height would loop the observer)
      if (typeof ResizeObserver !== "undefined" && form) {
        try {
          var lastW = 0;
          var ro = new ResizeObserver(function (entries) {
            var w = entries[0] && entries[0].contentRect
              ? entries[0].contentRect.width
              : 0;
            if (Math.abs(w - lastW) < 1) return;
            lastW = w;
            resizeInput();
          });
          ro.observe(form);
        } catch (_) { /* ignore */ }
      }
      window.addEventListener("resize", resizeInput);
    }

    // Reuse live socket; only connect when needed
    connect();
    if (inp) {
      setTimeout(function () {
        try {
          inp.focus();
          resizeInput();
        } catch (_) { /* ignore */ }
      }, 100);
    }
  }

  /**
   * Leave /play UI but keep the WebSocket + history so activity
   * can badge the nav until the player returns.
   */
  function unmount() {
    playVisible = false;
    // Leaving view counts as not reading — new traffic is unread
    stickBottom = false;
    rootEl = null;
    updatePlayNavBadge();
  }

  /** Full teardown (logout / hard leave). */
  function destroy() {
    wantLive = false;
    playVisible = false;
    clearReconnect();
    didInitialLook = false;
    if (socket) {
      try {
        socket.close();
      } catch (_) { /* ignore */ }
      socket = null;
    }
    rootEl = null;
    messages = [];
    msgSeq = 0;
    unreadCount = 0;
    unreadStartId = null;
    lastUnreadId = null;
    stickBottom = true;
    status = "idle";
    updatePlayNavBadge();
  }

  global.SitePlay = {
    mount: mount,
    unmount: unmount,
    destroy: destroy,
    connect: connect,
    sendCmd: sendCmd,
    getUnread: function () { return unreadCount; },
    refreshBadge: updatePlayNavBadge,
    mushToHtml: mushToHtml,
    looksLikeHtml: looksLikeHtml,
    sanitizeLoginHtml: sanitizeLoginHtml,
    renderSplash: renderSplash,
    version: PLAY_JS_VER,
  };
})(typeof window !== "undefined" ? window : globalThis);
