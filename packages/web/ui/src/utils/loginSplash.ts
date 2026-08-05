/**
 * Web /play connect splash — markdown or sanitized HTML.
 * Parity with packages/site/public/js/play.js renderSplash.
 * Staff-only edit; strip script/handlers for defense in depth.
 */

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STRUCTURAL_TAG_RE =
  /<\/?(?:p|h[1-6]|img|table|ul|ol|li|section|article|figure|br|hr)\b/i;

const ANY_HTML_TAG_RE =
  /<\/?(?:div|p|h[1-6]|img|table|thead|tbody|tr|th|td|ul|ol|li|section|article|header|footer|main|aside|nav|figure|figcaption|blockquote|pre|code|br|hr|span|center|strong|em|b|i|u|a|small|sub|sup)\b/i;

/**
 * True when content looks like HTML rather than plain markdown.
 * Outer-only wrappers like center around markdown → not HTML.
 */
export function looksLikeHtml(raw: string): boolean {
  const t = String(raw ?? "").trim();
  if (!t) return false;
  if (/^<!DOCTYPE\s/i.test(t)) return true;
  const inner = t
    .replace(/^<(center|div)(?:\s[^>]*)?>/i, "")
    .replace(/<\/(center|div)>\s*$/i, "")
    .trim();
  const probe = inner || t;
  if (
    /^(#{1,3}\s|[-*]\s|\*\*)/m.test(probe) &&
    !STRUCTURAL_TAG_RE.test(probe)
  ) {
    return false;
  }
  return ANY_HTML_TAG_RE.test(t);
}

const ALLOWED = new Set([
  "div",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "span",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "small",
  "sub",
  "sup",
  "br",
  "hr",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "figure",
  "figcaption",
  "blockquote",
  "code",
  "pre",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "center",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "aside",
  "nav",
]);

const VOID = new Set(["br", "hr", "img"]);

function safeUrl(raw: string, kind: "href" | "src"): string | null {
  const u = String(raw ?? "").trim();
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

function cleanAttrs(el: Element, tag: string): string {
  const parts: string[] = [];
  const cls = el.getAttribute("class");
  if (cls && /^[a-zA-Z0-9 _:-]+$/.test(cls)) {
    parts.push(`class="${cls.replace(/"/g, "")}"`);
  }
  if (tag === "a") {
    const href = safeUrl(el.getAttribute("href") ?? "", "href");
    if (href) {
      parts.push(`href="${href.replace(/"/g, "&quot;")}"`);
      parts.push('rel="noopener noreferrer"');
      const tgt = el.getAttribute("target");
      if (tgt === "_blank" || tgt === "_self") {
        parts.push(`target="${tgt}"`);
      }
    }
    const title = el.getAttribute("title");
    if (title) {
      parts.push(`title="${esc(title)}"`);
    }
  }
  if (tag === "img") {
    const src = safeUrl(el.getAttribute("src") ?? "", "src");
    if (!src) return "";
    parts.push(`src="${src.replace(/"/g, "&quot;")}"`);
    const alt = el.getAttribute("alt") ?? "";
    parts.push(`alt="${esc(alt)}"`);
    parts.push('loading="lazy"');
  }
  return parts.length ? " " + parts.join(" ") : "";
}

function serialize(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return esc(String(node.textContent ?? ""));
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (!ALLOWED.has(tag)) {
    let inner = "";
    for (const child of Array.from(el.childNodes)) {
      inner += serialize(child);
    }
    return inner;
  }
  if (tag === "img") {
    const attrs = cleanAttrs(el, tag);
    if (!attrs) return "";
    return `<img${attrs}>`;
  }
  if (VOID.has(tag)) {
    return `<${tag}${cleanAttrs(el, tag)}>`;
  }
  let inner = "";
  for (const child of Array.from(el.childNodes)) {
    inner += serialize(child);
  }
  return `<${tag}${cleanAttrs(el, tag)}>${inner}</${tag}>`;
}

function sanitizeLoginHtmlFallback(src: string): string {
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

/**
 * Sanitize staff HTML for the connect splash.
 */
export function sanitizeLoginHtml(raw: string): string {
  const src = String(raw ?? "");
  if (!src.trim()) return "";
  if (typeof DOMParser === "undefined") {
    return sanitizeLoginHtmlFallback(src);
  }
  try {
    const doc = new DOMParser().parseFromString(
      `<div id="ursamu-splash-root">${src}</div>`,
      "text/html",
    );
    const root = doc.getElementById("ursamu-splash-root") ??
      doc.body?.querySelector?.("#ursamu-splash-root") ??
      doc.body;
    if (!root) return sanitizeLoginHtmlFallback(src);
    const wrap = root.id === "ursamu-splash-root"
      ? root
      : root.querySelector?.("#ursamu-splash-root") ?? root;
    let out = "";
    for (const child of Array.from(wrap.childNodes)) {
      out += serialize(child);
    }
    return out;
  } catch {
    return sanitizeLoginHtmlFallback(src);
  }
}

function safeHref(url: string): string | null {
  return safeUrl(url, "href");
}

function inlineMd(text: string): string {
  let s = esc(text);
  s = s.replace(
    /\*\*\*(.+?)\*\*\*/g,
    "<strong><em>$1</em></strong>",
  );
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_m, alt: string, url: string) => {
      const href = safeHref(url);
      if (!href) return alt;
      return `<img src="${esc(href)}" alt="${esc(alt)}" ` +
        `loading="lazy">`;
    },
  );
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, lbl: string, url: string) => {
      const href = safeHref(url);
      if (!href) return lbl;
      return `<a href="${esc(href)}" rel="noopener">` +
        `${lbl}</a>`;
    },
  );
  return s;
}

/** Play-parity markdown → .play-md HTML. */
export function renderLoginMarkdown(md: string): string {
  const lines = String(md ?? "").split(/\r?\n/);
  let html = "";
  let inList = false;
  let inPara = false;

  const closePara = () => {
    if (inPara) {
      html += "</p>";
      inPara = false;
    }
  };
  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      closePara();
      closeList();
      continue;
    }
    const hm = t.match(/^(#{1,3})\s+(.+)$/);
    if (hm) {
      closePara();
      closeList();
      const lvl = hm[1]!.length;
      html += `<h${lvl} class="play-md__h">` +
        inlineMd(hm[2]!) + `</h${lvl}>`;
      continue;
    }
    if (/^[-*]\s+/.test(t)) {
      closePara();
      if (!inList) {
        html += '<ul class="play-md__list">';
        inList = true;
      }
      html += "<li>" +
        inlineMd(t.replace(/^[-*]\s+/, "")) +
        "</li>";
      continue;
    }
    const im = t.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (im) {
      closePara();
      closeList();
      const href = safeHref(im[2]!);
      if (href) {
        html += `<img src="${esc(href)}" alt="${
          esc(im[1]!)
        }" loading="lazy">`;
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
    html += inlineMd(t);
  }
  closePara();
  closeList();
  return `<div class="play-md">${html}</div>`;
}

export function renderLoginHtml(raw: string): string {
  return '<div class="play-md play-md--html">' +
    sanitizeLoginHtml(raw) + "</div>";
}

/**
 * Auto markdown vs HTML — matches site play.js renderSplash.
 */
export function renderSplash(content: string): string {
  const s = typeof content === "string" ? content : "";
  const cm = s.trim().match(
    /^<center(?:\s[^>]*)?>\s*([\s\S]*?)\s*<\/center>$/i,
  );
  if (cm && !looksLikeHtml(cm[1]!)) {
    const inner = renderLoginMarkdown(cm[1]!);
    return inner.replace(
      'class="play-md"',
      'class="play-md play-md--center"',
    );
  }
  if (looksLikeHtml(s)) return renderLoginHtml(s);
  return renderLoginMarkdown(s);
}

/** Active public skin stylesheet path. */
export function resolveSiteSkinHref(
  skin: string,
  skinCss: string,
): string {
  const custom = String(skinCss ?? "").trim();
  if (custom) {
    if (custom.startsWith("/site/") && !custom.includes("?")) {
      return `${custom}?v=admin-preview`;
    }
    return custom;
  }
  const named = String(skin ?? "default").trim() || "default";
  if (named.startsWith("/") || /^https?:\/\//i.test(named)) {
    return named;
  }
  return `/site/css/skins/${named}.css?v=admin-preview`;
}

export type LoginPreviewOpts = {
  content: string;
  skin?: string;
  skinCss?: string;
  /** Origin for absolute CSS URLs (window.location.origin). */
  origin?: string;
};

/**
 * Full HTML document for iframe preview — site tokens + skin + play.
 */
export function buildLoginPreviewSrcdoc(
  opts: LoginPreviewOpts,
): string {
  const origin = String(opts.origin ?? "").replace(/\/$/, "");
  const abs = (path: string) => {
    if (/^https?:\/\//i.test(path)) return path;
    const p = path.startsWith("/") ? path : `/${path}`;
    return origin ? `${origin}${p}` : p;
  };
  const skinHref = abs(
    resolveSiteSkinHref(opts.skin ?? "default", opts.skinCss ?? ""),
  );
  const sheets = [
    abs("/site/css/reset.css?v=admin-preview"),
    abs("/site/css/tokens.css?v=admin-preview"),
    abs("/site/css/components.css?v=admin-preview"),
    abs("/site/css/play.css?v=admin-preview"),
    skinHref,
  ];
  const links = sheets
    .map((h) =>
      `<link rel="stylesheet" href="${esc(h)}">`
    )
    .join("\n");
  const body = renderSplash(opts.content || "");
  const skinName = String(opts.skin ?? "default")
    .replace(/[^a-zA-Z0-9_-]/g, "") || "default";

  return `<!DOCTYPE html>
<html lang="en" data-skin="${esc(skinName)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${links}
<style>
  html, body {
    margin: 0;
    min-height: 100%;
    background: var(--site-bg, #020201);
    color: var(--site-text, #eee);
  }
  body {
    padding: 1rem 1.25rem;
    box-sizing: border-box;
  }
  .play-layout--login {
    width: 100%;
    max-width: 100%;
  }
</style>
</head>
<body>
<div class="play-layout play-layout--login">
${body}
</div>
</body>
</html>`;
}
