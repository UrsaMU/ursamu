/**
 * @ursamu/site — shell behavior, wiki reader, and context sidebars.
 *
 * Page modes (detected from pathname):
 *   home    /site/ or /site/index.html
 *   wiki    /site/wiki/<path>
 *   generic anything else under /site/
 *
 * Left sidebar:
 *   - Search box (static HTML)
 *   - Left menu (Figma): Featured, then Related (section siblings)
 *   - Home main content = wiki path "home" (not featured)
 * Wiki chrome: bgImage → home-height + theme bg; else compact
 *
 * Right sidebar:
 *   - "On this page" TOC (scraped from rendered headings)
 *   - "Edit this page" staff link (wiki mode, authenticated staff only)
 *   - Telnet host under hero title when title + plugins.site.telnet
 */

(function () {

  // ── DOM handles ────────────────────────────────────────────────────────────

  var root        = document.documentElement;
  var siteNav     = document.querySelector("[data-site-nav]");
  var shell       = document.querySelector("[data-site-shell]");
  var brand       = document.querySelector("[data-site-brand]");
  var bannerTitle = document.querySelector("[data-site-banner-title]");
  var bannerImg   = document.querySelector("[data-site-banner-img]");
  var banner      = document.querySelector("[data-site-banner]");
  var bannerConnect = document.querySelector("[data-site-banner-connect]");
  var navList     = document.querySelector("[data-site-nav-list]");
  var navToggle   = document.querySelector("[data-site-nav-toggle]");
  var skinLink    = document.querySelector("[data-site-skin]");
  var mainEl      = document.querySelector("[data-site-main]");
  var leftPanels  = document.querySelector("[data-site-left-panels]");
  var rightPanels = document.querySelector("[data-site-right-panels]");

  // ── Page mode ─────────────────────────────────────────────────────────────

  // Support mount /site and serveRoot apex (court.ursamu.io/)
  // Recomputed on SPA navigations via refreshPathname().
  var pathname = "/";

  function refreshPathname() {
    pathname = window.location.pathname.replace(/\/+$/, "") || "/";
    if (pathname === "") pathname = "/";
  }
  refreshPathname();

  function detectMode() {
    if (
      pathname === "/" ||
      pathname === "/site" ||
      pathname === "/site/index.html"
    ) {
      return "home";
    }
    if (
      pathname === "/login" ||
      pathname === "/site/login" ||
      pathname === "/site/login.html"
    ) {
      return "login";
    }
    if (
      pathname === "/profile" ||
      pathname === "/site/profile" ||
      pathname === "/site/profile.html"
    ) {
      return "profile";
    }
    if (
      pathname.startsWith("/wiki") ||
      pathname.startsWith("/site/wiki")
    ) {
      return "wiki";
    }
    if (
      pathname.startsWith("/help") ||
      pathname.startsWith("/site/help")
    ) {
      return "help";
    }
    if (
      pathname.startsWith("/chargen") ||
      pathname.startsWith("/site/chargen")
    ) {
      return "chargen";
    }
    if (
      pathname.startsWith("/play") ||
      pathname.startsWith("/site/play")
    ) {
      return "play";
    }
    return "generic";
  }

  // Alias used by SPA route loader
  function modeFromUrl() {
    return detectMode();
  }

  // "/wiki/lore" or "/site/wiki/lore" → "lore"
  function wikiPathFromUrl() {
    return pathname.replace(/^\/(?:site\/)?wiki\/?/, "") || "";
  }

  // "/help/mail" or "/site/help/mail" → "mail" (topic path)
  function helpPathFromUrl() {
    return pathname.replace(/^\/(?:site\/)?help\/?/, "") || "";
  }

  /** ?section=channel — side-nav filter (avoids clash with topic names). */
  function helpSectionFromUrl() {
    try {
      return String(
        new URLSearchParams(window.location.search).get("section") ||
          "",
      ).trim();
    } catch (_) {
      return "";
    }
  }

  /** Public path prefix for in-app links ("" at apex, "/site" under mount). */
  function publicBase() {
    if (pathname === "/" || pathname === "/login" ||
      pathname === "/profile" || pathname.startsWith("/wiki") ||
      pathname.startsWith("/help") ||
      pathname.startsWith("/chargen") ||
      pathname.startsWith("/play")) {
      return "";
    }
    return "/site";
  }
  var PUB = publicBase();

  function refreshPub() {
    PUB = publicBase();
  }

  function pubPath(sub) {
    sub = String(sub || "").replace(/^\/+/, "");
    if (!sub) return PUB ? PUB + "/" : "/";
    return (PUB || "") + "/" + sub;
  }
  function wikiHref(path) {
    var rest = String(path || "").replace(/^\/+/, "");
    return pubPath(rest ? "wiki/" + rest : "wiki/");
  }
  function helpHref(topic) {
    var rest = String(topic || "").replace(/^\/+/, "");
    return pubPath(rest ? "help/" + rest : "help/");
  }

  /** Section filter link: /help/?section=channel */
  function helpSectionHref(section) {
    var base = helpHref("");
    var params = [];
    var sec = String(section || "").trim();
    if (sec) params.push("section=" + encodeURIComponent(sec));
    var q = helpQueryFromUrl();
    if (!q) {
      try {
        var inp = document.getElementById("site-q");
        if (inp && inp.value) q = String(inp.value).trim();
      } catch (_) { /* ignore */ }
    }
    if (q) params.push("q=" + encodeURIComponent(q));
    if (!params.length) return base;
    return base + "?" + params.join("&");
  }

  /**
   * Encode a wiki path for /api/v1/wiki/<path>.
   * Keep "/" separators — encodeURIComponent whole-path turns them
   * into %2F and the API 404s nested pages (lore/city).
   */
  function encodeWikiApiPath(path) {
    return String(path || "")
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/");
  }

  var MODE     = detectMode();
  var WIKI_PATH = wikiPathFromUrl();
  var HELP_PATH = helpPathFromUrl();
  /** Wiki frontmatter bgImage (default false). Home uses site settings. */
  var pageBgImage = false;
  /** Cached GET /api/v1/help payload. */
  var helpIndex = null;
  var helpIndexPromise = null;

  // ── Config helpers ─────────────────────────────────────────────────────────

  var siteConfig = {};

  /**
   * Shell chrome: home height vs compact (no title height).
   * - home + wiki: Figma hero (top bg + banner offset)
   * - help / login / profile: compact under nav
   */
  function applyShellChrome() {
    if (!shell) return;
    var cfg = siteConfig || {};
    var heroMode = MODE === "home" || MODE === "wiki";
    var compactMode = MODE === "login" || MODE === "profile" ||
      MODE === "help" || MODE === "chargen" || MODE === "play";

    if (heroMode) {
      if (cfg.plainBg) shell.classList.add("is-plain");
      else shell.classList.remove("is-plain");
    } else if (compactMode) {
      shell.classList.add("is-plain");
    } else if (cfg.plainBg) {
      shell.classList.add("is-plain");
    } else {
      shell.classList.remove("is-plain");
    }

    if (compactMode) {
      shell.classList.add("is-compact");
      shell.classList.add("is-mode-no-hero");
    } else if (heroMode) {
      // Same home-height hero chrome (title / offset / bg)
      shell.classList.remove("is-mode-no-hero");
      var bSrc = String(cfg.bannerImage || "").trim();
      var hTitle = String(cfg.title || "").trim();
      if (!bSrc && !hTitle) shell.classList.add("is-compact");
      else shell.classList.remove("is-compact");
    } else {
      shell.classList.remove("is-compact");
      shell.classList.remove("is-mode-no-hero");
    }
  }

  function setSkinHref(href) {
    if (!skinLink || !href) return;
    if (skinLink.getAttribute("href") === href) return;
    skinLink.setAttribute("href", href);
  }

  /** Match nav href to current path (Home ≠ login). */
  function normalizeNavPath(raw) {
    var p = String(raw || "").split("?")[0].split("#")[0].trim();
    if (!p || p === "#") return "";
    if (p.slice(-11) === "/index.html") {
      p = p.slice(0, -11) || "/";
    }
    if (p.length > 1 && p.charAt(p.length - 1) === "/") {
      p = p.slice(0, -1);
    }
    return p || "/";
  }

  function navHrefIsActive(href) {
    var h = normalizeNavPath(href);
    var p = pathname;
    if (!h || h === "#") return false;
    if (h === p) return true;
    // Bare /site must not match /site/login — only deeper roots
    var depth = h.split("/").filter(Boolean).length;
    if (depth >= 2 && p.indexOf(h + "/") === 0) return true;
    return false;
  }

  function applyConfig(cfg) {
    if (!cfg || typeof cfg !== "object") return;
    siteConfig = cfg;

    var heroTitle = String(cfg.title || "").trim();
    var brandTitle = heroTitle || "UrsaMU";
    var logoSrc = String(cfg.logoImage || "").trim();
    // Nav brand: optional logo image + title; document title set per-mode
    if (brand) {
      // Logo always goes to public home (/ at apex, /site/ when mounted)
      brand.setAttribute("href", pubPath(""));
      if (logoSrc) {
        brand.classList.add("has-logo");
        brand.innerHTML =
          '<img class="site-nav__brand-logo" src="' +
          esc(logoSrc) + '" alt="' + esc(brandTitle) +
          '" decoding="async" />';
      } else {
        brand.classList.remove("has-logo");
        brand.textContent = brandTitle;
      }
    }

    var href  = String(cfg.skinHref || cfg.skinCss || "").trim();
    var named = String(cfg.skin || "default").trim();
    if (href) {
      setSkinHref(href);
    } else if (named.startsWith("/") || named.startsWith("http")) {
      setSkinHref(named);
    } else if (named) {
      setSkinHref("/site/css/skins/" + named + ".css");
    }

    if (named && !cfg.skinCss) {
      root.setAttribute("data-skin", named);
    } else if (cfg.skinCss) {
      root.setAttribute("data-skin", "custom");
    }

    var bannerSrc = String(cfg.bannerImage || "").trim();
    // Figma: home + wiki share full hero; help stays compact
    var showHero = MODE === "home" || MODE === "wiki";
    if (bannerImg) {
      if (showHero && bannerSrc) {
        bannerImg.src = bannerSrc;
        bannerImg.hidden = false;
        if (banner) banner.classList.add("has-image");
      } else {
        bannerImg.removeAttribute("src");
        bannerImg.hidden = true;
        if (banner) banner.classList.remove("has-image");
      }
    }
    if (bannerTitle) {
      if (showHero && heroTitle) {
        bannerTitle.textContent = heroTitle;
        bannerTitle.hidden = false;
        bannerTitle.removeAttribute("hidden");
      } else {
        bannerTitle.textContent = "";
        bannerTitle.hidden = true;
      }
    }
    // Connect under title on home only (Figma wiki has logo, not host)
    var telnetHost = String((cfg && cfg.telnet) || "").trim();
    if (bannerConnect) {
      if (MODE === "home" && heroTitle && telnetHost) {
        bannerConnect.textContent = telnetHost;
        bannerConnect.href = "telnet://" + telnetHost;
        bannerConnect.hidden = false;
        bannerConnect.removeAttribute("hidden");
      } else {
        bannerConnect.textContent = "";
        bannerConnect.removeAttribute("href");
        bannerConnect.hidden = true;
      }
    }
    document.title = brandTitle;
    applyShellChrome();

    renderTopNav(currentUser);
  }

  /** Rebuild top nav from cfg.nav using require + auth. */
  function renderTopNav(user) {
    if (!navList || !siteConfig || !Array.isArray(siteConfig.nav)) {
      return;
    }
    navList.innerHTML = "";
    for (var i = 0; i < siteConfig.nav.length; i++) {
      var item = siteConfig.nav[i];
      if (!navRequireMet(item.require, user)) continue;
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = String(item.href || "#");
      a.textContent = String(item.label || "Link");
      if (item.id) li.setAttribute("data-nav-id", String(item.id));
      if (navHrefIsActive(item.href)) a.classList.add("is-active");
      li.appendChild(a);
      navList.appendChild(li);
    }
    // Re-apply Play unread badge after nav rebuild
    try {
      if (globalThis.SitePlay && globalThis.SitePlay.refreshBadge) {
        globalThis.SitePlay.refreshBadge();
      }
    } catch (_) { /* ignore */ }
  }

  // ── Minimal markdown renderer ──────────────────────────────────────────────

  // Shared wiki page list — keyed by path for wikilink resolution.
  var wikiIndex = {};  // path → { title, path }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function slug(text) {
    return String(text)
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  }

  /**
   * Page-local image refs → API URL.
   * Authors write: ![crest](crest.png)
   * Also: _assets/crest.png  ./crest.png
   * Absolute /http(s) left as-is.
   */
  function resolveImageSrc(src, pagePath) {
    var raw = String(src || "").trim();
    if (!raw) return null;
    if (/^\s*javascript:/i.test(raw) || /^\s*data:/i.test(raw)) {
      return null;
    }
    if (/^https?:\/\//i.test(raw) || raw.charAt(0) === "/") {
      return raw;
    }
    var ref = raw.replace(/^\.\//, "");
    if (ref.indexOf("_assets/") === 0) {
      ref = ref.slice("_assets/".length);
    }
    // basename + safe chars only
    ref = ref.replace(/^.*[/\\]/, "").toLowerCase();
    ref = ref.replace(/\s+/g, "-").replace(/[^a-z0-9._-]+/g, "");
    if (!/^[a-z0-9][a-z0-9._-]*\.(png|jpe?g|gif|webp|svg)$/i
      .test(ref)) {
      return null;
    }
    var page = String(pagePath || "").replace(/^\/+|\/+$/g, "");
    if (!page) return null;
    return "/api/v1/wiki/" + page.split("/").map(encodeURIComponent)
      .join("/") + "/_assets/" + encodeURIComponent(ref);
  }

  /**
   * Inline markdown. Escape HTML first so help placeholders like
   * <alias> never become tags; protect rich spans via tokens.
   */
  function inlineMarkdown(text, pagePath) {
    text = String(text || "");
    var pg = pagePath || "";
    var tokens = [];
    function hold(html) {
      tokens.push(html);
      return "\x00" + (tokens.length - 1) + "\x00";
    }

    // Wikilinks [[target|label]]
    text = text.replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      function (_, target, label) {
        var t = target.trim();
        var lbl = label
          ? label.trim()
          : (wikiIndex[t] ? wikiIndex[t].title : t);
        return hold(
          '<a href="' + wikiHref(t) + '">' + esc(lbl) + "</a>",
        );
      },
    );
    // Images ![alt](url)
    text = text.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      function (_, alt, url) {
        var src = resolveImageSrc(url, pg);
        if (!src) return hold(esc(alt || ""));
        return hold(
          '<img src="' + esc(src) + '" alt="' +
            esc(alt || "") + '" loading="lazy">',
        );
      },
    );
    // Markdown links [lbl](url)
    text = text.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      function (_, lbl, url) {
        return hold(
          '<a href="' + esc(url) + '">' + esc(lbl) + "</a>",
        );
      },
    );
    // Inline code
    text = text.replace(/`([^`]+)`/g, function (_, t) {
      return hold("<code>" + esc(t) + "</code>");
    });

    // Escape the rest (fixes <alias> in help)
    text = esc(text);

    // Bold / italic on escaped plain text
    text = text.replace(/\*\*\*(.+?)\*\*\*/g, function (_, t) {
      return "<strong><em>" + t + "</em></strong>";
    });
    text = text.replace(/\*\*(.+?)\*\*/g, function (_, t) {
      return "<strong>" + t + "</strong>";
    });
    text = text.replace(/\*(.+?)\*/g, function (_, t) {
      return "<em>" + t + "</em>";
    });

    // Restore held HTML
    text = text.replace(/\x00(\d+)\x00/g, function (_, n) {
      return tokens[Number(n)] || "";
    });
    return text;
  }

  function renderMarkdown(md, pagePath) {
    var lines    = md.split(/\r?\n/);
    var html     = "";
    var inList   = false;
    var listTag  = "";
    var inPara   = false;
    var inTable  = false;
    var tableRows = []; // array of string[] (one per row)
    var pg = pagePath || "";

    function closePara() {
      if (inPara) { html += "</p>\n"; inPara = false; }
    }
    function closeList() {
      if (inList) {
        html += "</" + listTag + ">\n";
        inList = false; listTag = "";
      }
    }
    function flushTable() {
      if (!tableRows.length) { inTable = false; return; }
      html += "<table>\n<thead>\n<tr>";
      var headers = tableRows[0];
      for (var h = 0; h < headers.length; h++) {
        html += "<th>" + inlineMarkdown(headers[h], pg) + "</th>";
      }
      html += "</tr>\n</thead>\n<tbody>\n";
      for (var r = 1; r < tableRows.length; r++) {
        html += "<tr>";
        var cells = tableRows[r];
        for (var c = 0; c < cells.length; c++) {
          html += "<td>" + inlineMarkdown(cells[c], pg) + "</td>";
        }
        html += "</tr>\n";
      }
      html += "</tbody>\n</table>\n";
      tableRows = [];
      inTable = false;
    }
    function parseRow(line) {
      // "| a | b |" → ["a", "b"]
      return line.replace(/^\||\|$/g, "").split("|").map(function (c) {
        return c.trim();
      });
    }
    function isSepRow(line) {
      return /^\|[\s\-:|]+\|$/.test(line.replace(/\s/g, ""));
    }

    var inCode = false;
    var codeBuf = [];

    function flushCode() {
      if (!inCode) return;
      html += "<pre><code>" + esc(codeBuf.join("\n")) +
        "</code></pre>\n";
      codeBuf = [];
      inCode = false;
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      // ── Fenced code ────────────────────────────────────────────────
      if (/^```/.test(line)) {
        closePara(); closeList();
        if (inTable) flushTable();
        if (inCode) {
          flushCode();
        } else {
          inCode = true;
          codeBuf = [];
        }
        continue;
      }
      if (inCode) {
        codeBuf.push(line);
        continue;
      }

      // ── Table rows ─────────────────────────────────────────────────
      if (/^\|/.test(line)) {
        closePara(); closeList();
        inTable = true;
        if (!isSepRow(line)) {
          tableRows.push(parseRow(line));
        }
        continue;
      }
      if (inTable) { flushTable(); }

      // ── Blank line ─────────────────────────────────────────────────
      if (!line.trim()) { closePara(); closeList(); continue; }

      // ── Headings ───────────────────────────────────────────────────
      var hMatch = line.match(/^(#{1,6})\s+(.*)/);
      if (hMatch) {
        closePara(); closeList();
        var level = hMatch[1].length;
        var hText = hMatch[2];
        var hId   = slug(hText);
        html += "<h" + level + ' id="' + esc(hId) + '">' +
          inlineMarkdown(hText, pg) + "</h" + level + ">\n";
        continue;
      }

      // ── Horizontal rule ────────────────────────────────────────────
      if (/^[-*_]{3,}\s*$/.test(line)) {
        closePara(); closeList();
        html += "<hr>\n";
        continue;
      }

      // ── Blockquote ─────────────────────────────────────────────────
      var bqMatch = line.match(/^>\s?(.*)/);
      if (bqMatch) {
        closePara(); closeList();
        html += "<blockquote><p>" +
          inlineMarkdown(bqMatch[1], pg) + "</p></blockquote>\n";
        continue;
      }

      // ── Unordered list ─────────────────────────────────────────────
      var ulMatch = line.match(/^[-*+]\s+(.*)/);
      if (ulMatch) {
        closePara();
        if (!inList || listTag !== "ul") {
          closeList();
          html += "<ul>\n"; inList = true; listTag = "ul";
        }
        html += "<li>" + inlineMarkdown(ulMatch[1], pg) + "</li>\n";
        continue;
      }

      // ── Ordered list ───────────────────────────────────────────────
      var olMatch = line.match(/^\d+\.\s+(.*)/);
      if (olMatch) {
        closePara();
        if (!inList || listTag !== "ol") {
          closeList();
          html += "<ol>\n"; inList = true; listTag = "ol";
        }
        html += "<li>" + inlineMarkdown(olMatch[1], pg) + "</li>\n";
        continue;
      }

      // ── Paragraph (each line = own para if prior closed) ──────────
      closeList();
      if (!inPara) {
        html += "<p>";
        inPara = true;
      } else if (MODE === "help") {
        // Help SYNTAX blocks keep hard line breaks
        html += "<br>\n";
      } else {
        // Wiki prose: join soft-wrapped lines with a space
        html += " ";
      }
      html += inlineMarkdown(line, pg);
    }
    flushCode();
    closePara(); closeList(); flushTable();
    return html;
  }

  // ── Main content injection ─────────────────────────────────────────────────

  function setDocumentTitle(pageTitle) {
    var siteName = String(
      (siteConfig && siteConfig.title) || "",
    ).trim() || "UrsaMU";
    var t = String(pageTitle || "").trim();
    document.title = t ? (t + " · " + siteName) : siteName;
  }

  function articleFooterHtml() {
    return "<footer class=\"site-footer\" id=\"footer\">" +
      "<div class=\"site-rule site-rule--image\" role=\"presentation\"></div>" +
      "<p>Powered by <a href=\"https://github.com/UrsaMU/ursamu\"" +
      " target=\"_blank\" rel=\"noopener\">UrsaMU</a></p></footer>";
  }

  function injectArticle(page) {
    if (!mainEl || !page) return;
    var pagePath = String(page.path || WIKI_PATH || "").trim();
    // Home content is wiki path "home"
    if (!pagePath && MODE === "home") pagePath = "home";
    var bodyHtml = renderMarkdown(
      String(page.body || ""),
      pagePath,
    );
    var title = String(page.title || page.path || "").trim();
    if (!bodyHtml.trim() && !title) return;
    // Wiki uses Figma home-height hero; optional bgImage kept for API
    if (MODE === "wiki") {
      pageBgImage = page.bgImage !== false;
      if (siteConfig && Object.keys(siteConfig).length) {
        applyConfig(siteConfig);
      } else {
        applyShellChrome();
      }
    }
    setDocumentTitle(title);
    var inner = "<section class=\"site-section\">";
    if (title) {
      inner += "<h2 class=\"site-section__title\">" + esc(title) + "</h2>" +
        "<div class=\"site-rule site-rule--image\" role=\"presentation\"></div>";
    }
    inner += "<div class=\"site-section__body\">" +
      (bodyHtml.trim() || "<p><em>No content.</em></p>") +
      "</div></section>";
    inner += articleFooterHtml();
    mainEl.innerHTML = inner;
  }

  /** Wiki index (/wiki/) or directory listing — table, not card list. */
  function injectWikiListing(opts) {
    if (!mainEl) return;
    opts = opts || {};
    // Index / directories still use Figma hero chrome
    pageBgImage = true;
    if (MODE === "wiki") {
      if (siteConfig && Object.keys(siteConfig).length) {
        applyConfig(siteConfig);
      } else {
        applyShellChrome();
      }
    }
    var title = String(opts.title || "Wiki").trim();
    var items = Array.isArray(opts.items) ? opts.items : [];
    setDocumentTitle(title);
    var body = "";
    if (!items.length) {
      body = "<p>No pages yet.</p>";
    } else {
      var hasMeta = false;
      for (var m = 0; m < items.length; m++) {
        if (items[m].date || items[m].author ||
          (items[m].tags && items[m].tags.length) ||
          items[m].chars != null) {
          hasMeta = true;
          break;
        }
      }
      body = "<div class=\"site-wiki-table-wrap\">" +
        "<table class=\"site-wiki-table\">" +
        "<thead><tr>" +
        "<th scope=\"col\">Title</th>" +
        "<th scope=\"col\">Path</th>" +
        "<th scope=\"col\">Type</th>";
      if (hasMeta) {
        body += "<th scope=\"col\">Updated</th>" +
          "<th scope=\"col\">Tags</th>";
      }
      body += "<th scope=\"col\"><span class=\"site-sr-only\">" +
        "Open</span></th>" +
        "</tr></thead><tbody>";
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var p = String(it.path || "").trim();
        if (!p) continue;
        var lbl = String(it.title || p).trim();
        var isDir = it.type === "directory";
        var kind = isDir ? "Section" : "Page";
        var tags = Array.isArray(it.tags)
          ? it.tags.map(String).join(", ")
          : "";
        body += "<tr>" +
          "<td><a href=\"" + wikiHref(p) + "\">" +
          esc(lbl) + "</a></td>" +
          "<td><code>" + esc(p) + "</code></td>" +
          "<td class=\"site-wiki-type muted\">" + esc(kind) +
          "</td>";
        if (hasMeta) {
          body += "<td class=\"muted\">" +
            esc(String(it.date || "—")) + "</td>" +
            "<td class=\"muted\">" +
            esc(tags || "—") + "</td>";
        }
        body += "<td class=\"site-wiki-open\">" +
          "<a class=\"site-wiki-open-link\" href=\"" +
          wikiHref(p) + "\">Open</a></td>" +
          "</tr>";
      }
      body += "</tbody></table></div>";
    }
    mainEl.innerHTML =
      "<section class=\"site-section\">" +
      "<h2 class=\"site-section__title\">" + esc(title) + "</h2>" +
      "<div class=\"site-rule site-rule--image\" role=\"presentation\"></div>" +
      "<div class=\"site-section__body\">" + body + "</div></section>" +
      articleFooterHtml();
  }

  function injectNotFound(path) {
    injectArticle({
      title: "Not found",
      body: "No wiki page at `" + String(path || "") + "`.\n\n" +
        "[Browse the wiki](" + wikiHref("") + ").",
    });
  }

  function injectLoadingState(title) {
    if (!mainEl) return;
    var t = String(title || "Loading").trim();
    setDocumentTitle(t);
    // Theme-neutral skeleton: widths only (colors from CSS tokens)
    mainEl.innerHTML =
      "<section class=\"site-section site-section--loading\" " +
      "aria-busy=\"true\" aria-live=\"polite\">" +
      "<h2 class=\"site-section__title\">" + esc(t) + "</h2>" +
      "<div class=\"site-rule site-rule--image\" role=\"presentation\"></div>" +
      "<div class=\"site-section__body site-loading-skeleton\" " +
      "role=\"status\">" +
      "<span class=\"site-sr-only\">Loading content…</span>" +
      "<div class=\"site-skeleton-line site-skeleton-line--w72\"></div>" +
      "<div class=\"site-skeleton-line site-skeleton-line--w94\"></div>" +
      "<div class=\"site-skeleton-line site-skeleton-line--w58\"></div>" +
      "<div class=\"site-skeleton-line site-skeleton-line--w81\"></div>" +
      "</div></section>" +
      articleFooterHtml();
  }

  // ── Wiki article index helper ──────────────────────────────────────────────

  function buildIndex(pages) {
    wikiIndex = {};
    for (var i = 0; i < pages.length; i++) {
      var p = pages[i];
      wikiIndex[p.path] = p;
    }
  }

  function wikiLinkHtml(p) {
    var isCurrent = (p.path === WIKI_PATH);
    return "<li" + (isCurrent ? " class=\"is-current\"" : "") + ">" +
      "<a href=\"" + wikiHref(p.path) + "\"" +
      (isCurrent ? " aria-current=\"page\"" : "") + ">" +
      esc(p.title || p.path) + "</a></li>";
  }

  function menuSection(title, items) {
    if (!items.length) return "";
    var html = "<section class=\"site-menu menu\">" +
      "<h2 class=\"site-menu__title\">" + esc(title) + "</h2>" +
      "<ul class=\"site-menu__list\">";
    for (var i = 0; i < items.length; i++) {
      html += wikiLinkHtml(items[i]);
    }
    html += "</ul></section>";
    return html;
  }

  var leftAside  = document.getElementById("left");
  var rightAside = document.getElementById("right");

  function updateSidebarAndBannerVisibility() {
    // Layout chrome (bg height) is applyShellChrome; this is asides + banner.
    // Prefer classes over inline styles (CSP blocks style= attributes).
    if (shell) {
      shell.classList.toggle("is-mode-login", MODE === "login");
      shell.classList.toggle("is-mode-profile", MODE === "profile");
    }
    if (MODE === "login") {
      if (leftAside) leftAside.hidden = true;
      if (rightAside) rightAside.hidden = true;
      if (banner) banner.hidden = true;
      applyShellChrome();
    } else if (MODE === "profile") {
      if (leftAside) leftAside.hidden = true;
      if (rightAside) rightAside.hidden = true;
      if (banner) banner.hidden = true;
      applyShellChrome();
    } else if (MODE === "wiki") {
      if (leftAside) leftAside.hidden = false;
      if (rightAside) rightAside.hidden = false;
      // Figma wiki: full hero banner (same as home)
      if (banner) banner.hidden = false;
      applyShellChrome();
    } else if (MODE === "help") {
      if (leftAside) leftAside.hidden = false;
      if (rightAside) rightAside.hidden = false;
      if (banner) banner.hidden = true;
      applyShellChrome();
    } else if (MODE === "chargen") {
      if (leftAside) leftAside.hidden = false;
      if (rightAside) rightAside.hidden = false;
      if (banner) banner.hidden = true;
      applyShellChrome();
    } else if (MODE === "play") {
      // Figma client frame: nav + side rails + main chat column
      if (leftAside) leftAside.hidden = false;
      if (rightAside) rightAside.hidden = false;
      if (banner) banner.hidden = true;
      applyShellChrome();
    } else {
      // home / generic
      if (leftAside) leftAside.hidden = false;
      if (rightAside) rightAside.hidden = false;
      if (banner) banner.hidden = false;
      applyShellChrome();
    }
  }

  // ── Left sidebar ───────────────────────────────────────────────────────────

  /** Expand leftMenu template (parity with packages/site menu.ts). */
  function expandLeftMenu(template, blocks) {
    var BLOCK_LINE = /^\s*\[\[([a-z][a-z0-9_-]*)(?::([^\]]*))?\]\]\s*$/i;
    var HEADING = /^\s*##\s+(.+?)\s*$/;
    var UL_ITEM = /^\s*[-*+]\s+(.+?)\s*$/;
    var MD_LINK = /^\[([^\]]+)\]\(([^)]+)\)\s*$/;
    var lines = String(template || "").split(/\r?\n/);
    var html = "";
    var pendingTitle = null;
    var staticItems = [];

    function renderItems(items) {
      if (!items || !items.length) return "";
      var out = "<ul class=\"site-menu__list\">";
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var cur = it.current ? " class=\"is-current\"" : "";
        var aria = it.current ? " aria-current=\"page\"" : "";
        var href = it.href || (it.path ? wikiHref(it.path) : "#");
        var label = it.label || it.title || it.path || "Link";
        out += "<li" + cur + "><a href=\"" + esc(href) + "\"" + aria + ">" +
          esc(label) + "</a></li>";
      }
      out += "</ul>";
      return out;
    }

    function renderSection(title, bodyHtml) {
      if (!bodyHtml || !String(bodyHtml).trim()) return "";
      return "<section class=\"site-menu menu\">" +
        "<h2 class=\"site-menu__title\">" + esc(title) + "</h2>" +
        bodyHtml + "</section>";
    }

    function flushStatic() {
      if (!staticItems.length) return;
      var body = renderItems(staticItems);
      if (pendingTitle) {
        html += renderSection(pendingTitle, body);
        pendingTitle = null;
      } else {
        html += "<section class=\"site-menu menu\">" + body +
          "</section>";
      }
      staticItems = [];
    }

    function emitBlock(name, arg) {
      var key = String(name).toLowerCase();
      var keyed = (arg != null && arg !== "")
        ? (blocks[key + ":" + arg] || blocks[key])
        : blocks[key];
      if (!keyed) {
        pendingTitle = null;
        return;
      }
      var body = "";
      if (keyed.html && String(keyed.html).trim()) {
        body = keyed.html;
      } else if (keyed.items && keyed.items.length) {
        body = renderItems(keyed.items);
      }
      if (!String(body).trim()) {
        pendingTitle = null;
        return;
      }
      if (pendingTitle) {
        html += renderSection(pendingTitle, body);
        pendingTitle = null;
      } else if (/^\s*<section\b/i.test(body)) {
        html += body;
      } else {
        html += "<section class=\"site-menu menu\">" + body +
          "</section>";
      }
    }

    for (var li = 0; li < lines.length; li++) {
      var line = lines[li];
      var bm = line.match(BLOCK_LINE);
      if (bm) {
        flushStatic();
        emitBlock(bm[1], bm[2] ? bm[2].trim() : undefined);
        continue;
      }
      var hm = line.match(HEADING);
      if (hm) {
        flushStatic();
        pendingTitle = hm[1].trim();
        continue;
      }
      var um = line.match(UL_ITEM);
      if (um) {
        var content = um[1].trim();
        var lm = content.match(MD_LINK);
        if (lm) {
          staticItems.push({ label: lm[1], href: lm[2] });
        } else {
          staticItems.push({ label: content, href: "#" });
        }
        continue;
      }
      if (!line.trim()) {
        flushStatic();
      }
    }
    flushStatic();
    return html;
  }

  function pagesToMenuItems(list) {
    var items = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      items.push({
        label: p.title || p.path,
        href: wikiHref(p.path),
        current: p.path === WIKI_PATH,
      });
    }
    return items;
  }

  function renderLeft(pages) {
    if (!leftPanels || MODE === "login" || MODE === "profile") {
      return;
    }

    // Help mode owns the left rail (sections + topics)
    if (MODE === "help") {
      renderHelpLeft();
      return;
    }

    // Character (/chargen): left rail filled by chargen.js
    // (Sheet | Reference | Rules | +cg help). Placeholder until boot.
    if (MODE === "chargen") {
      if (leftPanels) {
        leftPanels.innerHTML =
          "<section class=\"site-menu menu\">" +
          "<h2 class=\"site-menu__title\">Character</h2>" +
          "<ul class=\"site-menu__list\">" +
          "<li class=\"is-current\"><a href=\"" +
          pubPath("chargen") +
          "\" aria-current=\"page\">Sheet</a></li>" +
          "<li><a href=\"" + pubPath("chargen") +
          "#reference\">Reference</a></li>" +
          "<li><a href=\"" + wikiHref("rules/chargen") +
          "\">Rules</a></li>" +
          "<li><a href=\"" + helpHref("chargen") +
          "\">+cg help</a></li>" +
          "</ul></section>";
      }
      return;
    }

    var featured = pages.filter(function (p) {
      return p.featured && !p.draft;
    });

    var siblings = [];
    if (MODE === "wiki" && WIKI_PATH) {
      var section = WIKI_PATH.split("/")[0];
      siblings = pages.filter(function (p) {
        return !p.draft &&
          p.path !== WIKI_PATH &&
          p.path.split("/")[0] === section;
      });
    }

    // Built-in blocks + plugin menuBlocks from config
    var blocks = Object.assign({}, siteConfig.menuBlocks || {});
    if (featured.length) {
      blocks.featured = { items: pagesToMenuItems(featured) };
    }
    if (MODE === "wiki" && (siblings.length || wikiIndex[WIKI_PATH])) {
      var current = wikiIndex[WIKI_PATH];
      var sectionItems = current
        ? [current].concat(siblings)
        : siblings;
      blocks.section = { items: pagesToMenuItems(sectionItems) };
    }

    var template = siteConfig.leftMenu;
    if (template && String(template).trim()) {
      leftPanels.innerHTML = expandLeftMenu(template, blocks) || "";
      return;
    }

    // Fallback when no template (should be rare) — Figma order
    var html = "";
    if (featured.length) {
      html += menuSection("Featured", featured);
    }
    if (MODE === "wiki" && (siblings.length || wikiIndex[WIKI_PATH])) {
      var currentPg = wikiIndex[WIKI_PATH];
      var secItems = currentPg
        ? [currentPg].concat(siblings)
        : siblings;
      html += menuSection("Related", secItems);
    }
    leftPanels.innerHTML = html || "";
  }

  // ── Right sidebar ──────────────────────────────────────────────────────────

  function buildToc() {
    if (!mainEl) return [];
    // Body headings only — skip page H1 (.site-section__title)
    var headings = mainEl.querySelectorAll(
      ".site-section__body h2, .site-section__body h3",
    );
    var items = [];
    for (var i = 0; i < headings.length; i++) {
      var h = headings[i];
      // Assign id if missing
      if (!h.id) h.id = slug(h.textContent || "");
      items.push({ id: h.id, text: h.textContent || "", level: h.tagName });
    }
    return items;
  }

  // ── Auth & Account system ──────────────────────────────────────────────────

  var STAFF_FLAGS = ["wizard", "admin", "superuser", "builder", "staff", "storyteller"];
  var currentAuthMode = "login"; // "login" | "register"
  /** @type {null | { id: string, flags: string[], isStaff: boolean }} */
  var currentUser = null;

  /**
   * Nav require gate (mirrors siteNavRequireMet on the server).
   * Plugins/config set item.require.
   */
  function navRequireMet(require, user) {
    var r = String(require || "").trim().toLowerCase();
    if (!r || r === "public" || r === "any" || r === "all") {
      return true;
    }
    if (!user) return false;
    if (
      r === "connected" ||
      r === "logged-in" ||
      r === "logged_in" ||
      r === "auth"
    ) {
      return true;
    }
    var flags = (user.flags || []).map(function (f) {
      return String(f).toLowerCase().trim();
    });
    if (
      r === "staff" ||
      r === "connected staff" ||
      r === "connected admin+" ||
      r === "connected admin" ||
      r === "connected wizard" ||
      r.indexOf("perm(admin)") === 0 ||
      r.indexOf("perm(staff)") === 0 ||
      r.indexOf("perm(wizard)") === 0
    ) {
      return flags.some(function (f) {
        return STAFF_FLAGS.indexOf(f) !== -1;
      });
    }
    var fm = r.match(/^flag\(\s*([a-z0-9_-]+)\s*\)$/i);
    if (fm) return flags.indexOf(fm[1].toLowerCase()) !== -1;
    if (/^[a-z][a-z0-9_-]*$/i.test(r)) {
      return flags.indexOf(r) !== -1;
    }
    return false;
  }

  function probeAuth() {
    var token = "";
    try {
      token = sessionStorage.getItem("ursamu.webAdmin.token") || "";
    } catch (_) {}

    if (!token) return Promise.resolve(null);

    return fetch("/api/v1/me", {
      headers: { "Authorization": "Bearer " + token },
      credentials: "same-origin",
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (me) {
        if (!me || !me.id) return null;
        var flags = Array.isArray(me.flags) ? me.flags : [];
        var isStaff = STAFF_FLAGS.some(function (f) {
          return flags.indexOf(f) !== -1;
        });
        return {
          id: me.id,
          name: me.name || me.moniker || "Player",
          moniker: me.moniker || "",
          monikerHtml: me.monikerHtml || "",
          flags: flags,
          location: me.location || "",
          avatar: me.avatar || "",
          isStaff: isStaff,
        };
      })
      .catch(function () { return null; });
  }

  function doSignOut() {
    try {
      if (globalThis.SitePlay && globalThis.SitePlay.destroy) {
        globalThis.SitePlay.destroy();
      }
    } catch (_) { /* ignore */ }
    try { sessionStorage.removeItem("ursamu.webAdmin.token"); } catch (_) {}
    try { localStorage.removeItem("ursamu.webAdmin.token"); } catch (_) {}
    try { bustHelpIndex(); } catch (_) { /* defined later */ }
    window.location.href = pubPath("");
  }

  function safeNextPath(raw) {
    var n = String(raw || "").trim();
    if (!n || n.charAt(0) !== "/" || n.indexOf("//") === 0) {
      return pubPath("");
    }
    // Allow public SPA routes + admin after login
    var ok =
      n === "/" ||
      n.indexOf("/site") === 0 ||
      n.indexOf("/admin") === 0 ||
      n.indexOf("/chargen") === 0 ||
      n.indexOf("/play") === 0 ||
      n.indexOf("/wiki") === 0 ||
      n.indexOf("/help") === 0 ||
      n.indexOf("/login") === 0;
    if (!ok) return pubPath("");
    return n;
  }

  function isDemoQuery() {
    try {
      return new URLSearchParams(location.search).get("demo") ===
        "1";
    } catch (_) {
      return false;
    }
  }

  /**
   * Strongest nav.require matching this path (from config/plugins).
   * Chargen defaults to connected even if nav omitted.
   */
  function requireForPath(path) {
    var p = normalizeNavPath(path);
    var nav = (siteConfig && siteConfig.nav) || [];
    var best = "";
    var bestLen = -1;
    for (var i = 0; i < nav.length; i++) {
      var item = nav[i];
      if (!item) continue;
      var req = String(item.require || "").trim();
      if (!req) continue;
      var h = normalizeNavPath(item.href || "");
      if (!h || h === "#") continue;
      var match = h === p || p.indexOf(h + "/") === 0;
      if (!match) continue;
      if (h.length >= bestLen) {
        bestLen = h.length;
        best = req;
      }
    }
    if (
      !best &&
      (p === "/chargen" ||
        p.indexOf("/chargen/") === 0 ||
        p === "/site/chargen" ||
        p.indexOf("/site/chargen/") === 0)
    ) {
      best = "connected";
    }
    // /play requires site login first (redirect to /login?next=/play).
    if (
      !best &&
      (p === "/play" ||
        p.indexOf("/play/") === 0 ||
        p === "/site/play" ||
        p.indexOf("/site/play/") === 0)
    ) {
      best = "connected";
    }
    return best;
  }

  function redirectToLogin() {
    var next = encodeURIComponent(
      window.location.pathname +
        window.location.search +
        window.location.hash,
    );
    window.location.replace(
      pubPath("login") + "?next=" + next,
    );
  }

  /** Enforce nav.require for the current route. */
  function guardRouteAccess(user) {
    if (isDemoQuery()) return true;
    var req = requireForPath(pathname);
    if (navRequireMet(req, user)) return true;
    if (!user) {
      redirectToLogin();
      return false;
    }
    if (mainEl) {
      mainEl.innerHTML =
        "<section class=\"site-section\">" +
        "<h2 class=\"site-section__title\">Permission denied</h2>" +
        "<div class=\"site-rule site-rule--image\" " +
        "role=\"presentation\"></div>" +
        "<p>You do not have access to this page.</p>" +
        "<p><a href=\"" + pubPath("") + "\">Home</a></p>" +
        "</section>";
    }
    return false;
  }

  /** True when hamburger drawer is active (≤1024). */
  function isMobileNav() {
    try {
      return window.matchMedia("(max-width: 1024px)").matches;
    } catch (_) {
      return window.innerWidth <= 1024;
    }
  }

  /** One document listener for desktop account dropdown close. */
  var accountDocClose = null;

  function updateNavUser(user) {
    var existingNavUser = document.getElementById("nav-user-item");
    if (existingNavUser) existingNavUser.remove();
    if (accountDocClose) {
      document.removeEventListener("click", accountDocClose);
      accountDocClose = null;
    }

    if (!navList) return;
    var li = document.createElement("li");
    li.id = "nav-user-item";
    li.className = "site-nav-user-item";

    if (user) {
      // Desktop: compact dropdown. Mobile drawer: always-expanded
      // rows (no nested menu — easier thumbs).
      var wrap = document.createElement("div");
      wrap.className = "site-nav-account";

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "site-nav-user-link site-nav-account-toggle";
      btn.setAttribute("aria-haspopup", "true");
      btn.setAttribute("aria-controls", "site-nav-account-menu");

      if (user.avatar) {
        var img = document.createElement("img");
        img.src = user.avatar;
        img.className = "site-nav-avatar";
        img.alt = "";
        img.referrerPolicy = "no-referrer";
        img.onerror = function () {
          var fb = document.createElement("span");
          fb.className = "site-nav-avatar-initial";
          fb.textContent = user.name.charAt(0).toUpperCase();
          if (img.parentNode) img.parentNode.replaceChild(fb, img);
        };
        btn.appendChild(img);
      } else {
        var init = document.createElement("span");
        init.className = "site-nav-avatar-initial";
        init.textContent = user.name.charAt(0).toUpperCase();
        btn.appendChild(init);
      }

      var nameSpan = document.createElement("span");
      nameSpan.className = "site-nav-username";
      if (user.monikerHtml) {
        nameSpan.innerHTML = user.monikerHtml;
      } else {
        nameSpan.textContent = user.moniker || user.name;
      }
      btn.appendChild(nameSpan);

      var menu = document.createElement("div");
      menu.id = "site-nav-account-menu";
      menu.className = "site-nav-account-menu";
      menu.setAttribute("role", "menu");

      if (user.isStaff) {
        var staffA = document.createElement("a");
        staffA.href = "/admin/";
        staffA.className = "site-nav-account-item";
        staffA.setAttribute("role", "menuitem");
        staffA.textContent = "Staff console";
        staffA.addEventListener("click", function () {
          setNavOpen(false);
        });
        menu.appendChild(staffA);
      }

      var outBtn = document.createElement("button");
      outBtn.type = "button";
      outBtn.className = "site-nav-account-item site-nav-account-signout";
      outBtn.setAttribute("role", "menuitem");
      outBtn.textContent = "Sign out";
      outBtn.addEventListener("click", function () {
        setNavOpen(false);
        doSignOut();
      });
      menu.appendChild(outBtn);

      function setOpen(open) {
        // Drawer: always expanded (CSS also forces display).
        if (isMobileNav()) {
          menu.hidden = false;
          btn.setAttribute("aria-expanded", "true");
          wrap.classList.add("is-open");
          return;
        }
        menu.hidden = !open;
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        wrap.classList.toggle("is-open", open);
      }

      // Initial state
      setOpen(false);

      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (isMobileNav()) return;
        setOpen(menu.hidden);
      });

      accountDocClose = function (e) {
        if (isMobileNav()) return;
        if (wrap.contains(e.target)) return;
        setOpen(false);
      };
      document.addEventListener("click", accountDocClose);

      menu.addEventListener("click", function (e) {
        // Keep desktop menu open until item handles it; stop
        // document close from firing on the same tap.
        e.stopPropagation();
      });

      wrap.appendChild(btn);
      wrap.appendChild(menu);
      li.appendChild(wrap);

      // If drawer already open on rebuild, expand account block
      if (isMobileNav()) setOpen(true);
    } else {
      var loginA = document.createElement("a");
      loginA.href = pubPath("login");
      loginA.className = "site-nav-login-link" +
        (MODE === "login" ? " is-active" : "");
      loginA.textContent = "Sign in";
      li.appendChild(loginA);
    }

    navList.appendChild(li);
  }

  function injectSpecialPage(user) {
    if (!mainEl) return;

    if (MODE === "login") {
      // Same gate layout as /admin login (full-viewport card)
      var brand = String(
        (siteConfig && siteConfig.title) || "UrsaMU",
      ).trim() || "UrsaMU";
      var isReg = currentAuthMode === "register";
      var html = "<div class=\"site-gate\" data-site-gate>";

      if (user) {
        html += "<div class=\"site-gate-card\">" +
          "<header>" +
          "<p class=\"site-gate-kicker\">" + esc(brand) + "</p>" +
          "<h1>Signed in</h1>" +
          "<p class=\"site-gate-lede\">Signed in as <strong>" +
          esc(user.name) + "</strong>.</p>" +
          "</header>" +
          "<div class=\"site-gate-actions\">" +
          "<a class=\"site-gate-btn site-gate-btn--primary\" href=\"" +
          pubPath("") + "\">Continue to site</a>";
        if (user.isStaff) {
          html += "<a class=\"site-gate-btn\" href=\"/admin/\">" +
            "Staff console</a>";
        }
        html += "<button type=\"button\" class=\"site-gate-btn\" " +
          "id=\"page-logout-link\">Sign out</button>" +
          "</div></div>";
      } else {
        html += "<div class=\"site-gate-card\">" +
          "<header>" +
          "<p class=\"site-gate-kicker\">" + esc(brand) +
          " · Web</p>" +
          "<h1>" + (isReg ? "Create account" : "Sign in") +
          "</h1>" +
          "<p class=\"site-gate-lede\">" +
          (isReg
            ? "Register a player name to join the game and " +
              "use Character on the site."
            : "Sign in with your game account — same credentials " +
              "as telnet and the staff console.") +
          "</p>" +
          "</header>" +
          "<div class=\"site-auth-tabs\" role=\"tablist\">" +
          "<button type=\"button\" class=\"site-auth-tab" +
          (isReg ? "" : " is-active") +
          "\" id=\"tab-login\" role=\"tab\">Sign in</button>" +
          "<button type=\"button\" class=\"site-auth-tab" +
          (isReg ? " is-active" : "") +
          "\" id=\"tab-register\" role=\"tab\">Register</button>" +
          "</div>" +
          "<form class=\"site-auth-form\" id=\"site-auth-form\">" +
          "<div class=\"site-auth-field\">" +
          "<label class=\"site-auth-label\" for=\"auth-username\">" +
          "Username</label>" +
          "<input type=\"text\" id=\"auth-username\" " +
          "class=\"site-auth-input\" name=\"username\" " +
          "autocomplete=\"username\" required maxlength=\"64\" " +
          "autocapitalize=\"none\" spellcheck=\"false\" />" +
          "</div>" +
          "<div class=\"site-auth-field" +
          (isReg ? "" : " site-hidden") +
          "\" id=\"auth-email-group\">" +
          "<label class=\"site-auth-label\" for=\"auth-email\">" +
          "Email</label>" +
          "<input type=\"email\" id=\"auth-email\" " +
          "class=\"site-auth-input\" name=\"email\" " +
          "autocomplete=\"email\"" +
          (isReg ? " required" : "") + " />" +
          "</div>" +
          "<div class=\"site-auth-field\">" +
          "<label class=\"site-auth-label\" for=\"auth-password\">" +
          "Password</label>" +
          "<input type=\"password\" id=\"auth-password\" " +
          "class=\"site-auth-input\" name=\"password\" " +
          "autocomplete=\"" +
          (isReg ? "new-password" : "current-password") +
          "\" required maxlength=\"128\" />" +
          "</div>" +
          "<div class=\"site-auth-error site-hidden\" " +
          "id=\"auth-error\" role=\"alert\"></div>" +
          "<button type=\"submit\" class=\"site-auth-submit\" " +
          "id=\"auth-submit-btn\">" +
          (isReg ? "Create account" : "Sign in") +
          "</button>" +
          "</form></div>";
      }

      html += "</div>";
      mainEl.innerHTML = html;
      wireAuthEvents(user);
    } else if (MODE === "profile") {
      // Legacy /site/profile — redirect home (account lives in nav)
      window.location.replace(pubPath(""));
      return;
    }
  }

  function renderRight(user) {
    if (!rightPanels || MODE === "login" || MODE === "profile") {
      return;
    }
    // Chargen owns the right rail (draft sheet summary)
    if (MODE === "chargen") return;

    var html = "";

    // TOC (wiki + help topics)
    var toc = buildToc();
    if (toc.length) {
      html += "<section class=\"site-menu menu\">" +
        "<h2 class=\"site-menu__title\">On this page</h2>" +
        "<ul class=\"site-menu__list\">";
      for (var i = 0; i < toc.length; i++) {
        var cls = toc[i].level === "H3" ? " class=\"toc-sub\"" : "";
        html += "<li" + cls + "><a href=\"#" + esc(toc[i].id) + "\">" +
          esc(toc[i].text) + "</a></li>";
      }
      html += "</ul></section>";
    }

    // Edit panel (wiki mode + staff)
    if (MODE === "wiki" && WIKI_PATH && user && user.isStaff) {
      var editUrl = "/admin/#/wiki/" + encodeURIComponent(WIKI_PATH);
      var histUrl = "/api/v1/wiki/" + encodeURIComponent(WIKI_PATH) + "/history";
      html += "<section class=\"site-menu menu\">" +
        "<h2 class=\"site-menu__title\">Edit</h2>" +
        "<ul class=\"site-menu__list\">" +
        "<li><a href=\"" + esc(editUrl) + "\">Edit this page</a></li>" +
        "<li><a href=\"" + esc(histUrl) + "\">Page history</a></li>" +
        "</ul></section>";
    }

    rightPanels.innerHTML = html;
  }

  function wireAuthEvents(user) {
    var logoutBtn = document.getElementById("profile-logout-btn") ||
      document.getElementById("page-logout-link");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function (e) {
        e.preventDefault();
        doSignOut();
      });
    }

    var tabLogin = document.getElementById("tab-login");
    var tabRegister = document.getElementById("tab-register");
    var authForm = document.getElementById("site-auth-form");

    if (tabLogin && tabRegister) {
      tabLogin.addEventListener("click", function () {
        if (currentAuthMode !== "login") {
          currentAuthMode = "login";
          injectSpecialPage(user);
        }
      });
      tabRegister.addEventListener("click", function () {
        if (currentAuthMode !== "register") {
          currentAuthMode = "register";
          injectSpecialPage(user);
        }
      });
    }

    if (authForm) {
      authForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var userInput = document.getElementById("auth-username");
        var passInput = document.getElementById("auth-password");
        var emailInput = document.getElementById("auth-email");
        var errDiv = document.getElementById("auth-error");
        var submitBtn = document.getElementById("auth-submit-btn");

        if (!userInput || !passInput || !errDiv || !submitBtn) return;

        var username = userInput.value.trim();
        var password = passInput.value;
        var email = emailInput ? emailInput.value.trim() : "";

        errDiv.classList.add("site-hidden");
        errDiv.textContent = "";
        submitBtn.disabled = true;

        var isReg = (currentAuthMode === "register");
        var endpoint = isReg ? "/api/v1/register" : "/api/v1/login";
        var payload = { username: username, password: password };
        if (isReg) payload.email = email;

        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "same-origin",
        })
          .then(function (r) {
            return r.json().then(function (d) {
              return { ok: r.ok, status: r.status, data: d };
            });
          })
          .then(function (res) {
            submitBtn.disabled = false;
            if (!res.ok || !res.data || !res.data.token) {
              errDiv.textContent = (res.data && res.data.error) ? res.data.error : "Authentication failed.";
              errDiv.classList.remove("site-hidden");
              return;
            }
            try {
              sessionStorage.setItem("ursamu.webAdmin.token", res.data.token);
            } catch (_) {}
            probeAuth().then(function (u) {
              currentUser = u;
              renderTopNav(u);
              updateNavUser(u);
              var params = new URLSearchParams(window.location.search);
              var next = safeNextPath(params.get("next") || pubPath(""));
              window.location.href = next;
            });
          })
          .catch(function () {
            submitBtn.disabled = false;
            errDiv.textContent = "Network error. Please try again.";
            errDiv.classList.remove("site-hidden");
          });
      });
    }
  }

  // ── Search wiring ──────────────────────────────────────────────────────────

  /** Placeholder + label for the single left search (wiki vs help). */
  function updateSearchChrome() {
    var input = document.getElementById("site-q");
    var label = document.querySelector('label[for="site-q"]');
    if (!input) return;
    if (MODE === "help") {
      input.placeholder = "Search help…";
      input.setAttribute("aria-label", "Search help");
      if (label) label.textContent = "Search help";
    } else {
      input.placeholder = "Search wiki…";
      input.setAttribute("aria-label", "Search wiki");
      if (label) label.textContent = "Search wiki";
    }
  }

  function helpQueryFromUrl() {
    try {
      return String(
        new URLSearchParams(window.location.search).get("q") || "",
      ).trim();
    } catch (_) {
      return "";
    }
  }

  /** Latest wiki page list for search (updated each route). */
  var searchPages = [];
  var searchWired = false;

  function wireSearch(pages) {
    var form  = document.getElementById("search");
    var input = document.getElementById("site-q");
    if (!form || !input) return;
    searchPages = Array.isArray(pages) ? pages : [];
    updateSearchChrome();

    // Prefill from ?q= on help; clear stale help query on wiki
    if (MODE === "help") {
      var hq = helpQueryFromUrl();
      if (hq) input.value = hq;
    } else if (MODE === "wiki" || MODE === "home") {
      try {
        var wq = String(
          new URLSearchParams(window.location.search).get("q") ||
            "",
        ).trim();
        if (wq) input.value = wq;
      } catch (_) { /* ignore */ }
    }

    if (searchWired) return;
    searchWired = true;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var q = (input.value || "").trim().toLowerCase();
      if (!q) {
        if (MODE === "help") {
          window.location.href = helpSectionHref(
            helpSectionFromUrl(),
          );
        }
        return;
      }

      // Help mode — filter topic list via ?q=
      if (MODE === "help") {
        var sec = helpSectionFromUrl();
        var base = helpSectionHref(sec);
        var join = base.indexOf("?") >= 0 ? "&" : "?";
        window.location.href = base + join + "q=" +
          encodeURIComponent(q);
        return;
      }

      var hits = searchPages.filter(function (p) {
        return !p.draft && (
          (p.title || "").toLowerCase().includes(q) ||
          (p.path  || "").toLowerCase().includes(q) ||
          (p.tags  || []).some(function (t) {
            return String(t).toLowerCase().includes(q);
          })
        );
      });
      if (!hits.length) {
        alert("No pages match \"" + q + "\".");
        return;
      }
      if (hits.length === 1) {
        window.location.href = wikiHref(hits[0].path);
        return;
      }
      window.location.href = pubPath("wiki/") + "?q=" +
        encodeURIComponent(q);
    });
  }

  // ── Scroll nav + TOC spy ───────────────────────────────────────────────────

  var threshold = 100;
  function onScroll() {
    if (!siteNav) return;
    siteNav.classList.toggle("is-scrolled", window.scrollY > threshold);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /** Highlight right-rail TOC links for headings in view (optional). */
  function wireScrollSpy() {
    if (!mainEl || !rightPanels) return;
    var links = rightPanels.querySelectorAll('a[href^="#"]');
    if (!links.length) return;
    var heads = [];
    for (var i = 0; i < links.length; i++) {
      var id = (links[i].getAttribute("href") || "").slice(1);
      var el = id ? document.getElementById(id) : null;
      if (el) heads.push({ el: el, link: links[i] });
    }
    if (!heads.length || typeof IntersectionObserver === "undefined") return;
    var obs = new IntersectionObserver(function (entries) {
      for (var j = 0; j < entries.length; j++) {
        if (!entries[j].isIntersecting) continue;
        var t = entries[j].target;
        for (var k = 0; k < heads.length; k++) {
          heads[k].link.classList.toggle(
            "is-active",
            heads[k].el === t,
          );
        }
      }
    }, { rootMargin: "-20% 0px -60% 0px", threshold: 0 });
    for (var h = 0; h < heads.length; h++) obs.observe(heads[h].el);
  }


  // ── Mobile hamburger nav ─────────────────────────────────────────────────

  function setNavOpen(open) {
    if (!siteNav) return;
    siteNav.classList.toggle("is-open", !!open);
    if (navToggle) {
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
      navToggle.setAttribute(
        "aria-label",
        open ? "Close menu" : "Open menu",
      );
    }
    document.body.classList.toggle("site-nav-open", !!open);
    // Mobile drawer: keep account actions expanded (no nested menu)
    if (open && isMobileNav()) {
      var acct = document.querySelector(".site-nav-account");
      var menu = document.getElementById("site-nav-account-menu");
      var tog = document.querySelector(".site-nav-account-toggle");
      if (menu) menu.hidden = false;
      if (acct) acct.classList.add("is-open");
      if (tog) tog.setAttribute("aria-expanded", "true");
    }
  }

  function isNavOpen() {
    return !!(siteNav && siteNav.classList.contains("is-open"));
  }

  function wireNavMenu() {
    if (!siteNav || !navToggle) return;

    navToggle.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      setNavOpen(!isNavOpen());
    });

    // Close when a nav link is chosen (SPA + full load)
    if (navList) {
      navList.addEventListener("click", function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        // Account toggle is desktop-only; ignore in drawer
        if (t.closest(".site-nav-account-toggle")) return;
        // Account actions close the drawer themselves
        if (t.closest(".site-nav-account-item")) return;
        var a = t.closest("a");
        if (!a) return;
        setNavOpen(false);
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isNavOpen()) setNavOpen(false);
    });

    // Tap dimmed backdrop (shell::after is not clickable — use body)
    document.addEventListener("click", function (e) {
      if (!isNavOpen()) return;
      var t = e.target;
      if (siteNav.contains(t)) return;
      setNavOpen(false);
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 1024 && isNavOpen()) setNavOpen(false);
    });
  }

  // ── Boot sequence ──────────────────────────────────────────────────────────

  wireNavMenu();

  var cfgUrl = root.getAttribute("data-site-config") || "/site/config.json";

  // 1. Config
  var configPromise = fetch(cfgUrl, { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (cfg) {
      // Server config wins. Only fall back to HTML data-skin when the
      // config request failed or omitted skin entirely — never overwrite
      // a live theme with a stale injected data-skin (cached HTML).
      if (
        cfg &&
        !cfg.skin &&
        !cfg.skinCss &&
        !cfg.skinHref
      ) {
        var htmlSkin = root.getAttribute("data-skin");
        if (htmlSkin && htmlSkin !== "custom") {
          cfg = Object.assign({}, cfg, { skin: htmlSkin });
        }
      }
      applyConfig(cfg || {});
      return cfg || {};
    })
    .catch(function () {
      var htmlSkin = root.getAttribute("data-skin");
      if (htmlSkin && htmlSkin !== "custom") applyConfig({ skin: htmlSkin });
      return {};
    });

  // 2. Wiki list (all modes — needed for left sidebar and wikilink resolution)
  var listPromise = fetch("/api/v1/wiki", { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (pages) {
      if (!Array.isArray(pages)) return [];
      buildIndex(pages);
      return pages;
    })
    .catch(function () { return []; });

  // 3. Auth probe
  var authPromise = probeAuth();

  // ── Public help browser (/help, /help/<topic>) ───────────────────────────

  function helpAuthHeaders() {
    var headers = {};
    try {
      var tok = sessionStorage.getItem("ursamu.webAdmin.token") ||
        "";
      if (tok) {
        headers["Authorization"] = "Bearer " + tok;
      }
    } catch (_) { /* private mode */ }
    return headers;
  }

  /** Drop cached index (login/logout changes staff visibility). */
  function bustHelpIndex() {
    helpIndex = null;
    helpIndexPromise = null;
  }

  function fetchHelpIndex() {
    if (helpIndex) return Promise.resolve(helpIndex);
    if (helpIndexPromise) return helpIndexPromise;
    helpIndexPromise = fetch("/api/v1/help", {
      credentials: "same-origin",
      headers: helpAuthHeaders(),
    })
      .then(function (r) {
        return r.ok ? r.json() : { sections: [], topics: [] };
      })
      .then(function (data) {
        helpIndex = {
          sections: Array.isArray(data.sections) ? data.sections : [],
          topics: Array.isArray(data.topics) ? data.topics : [],
          staff: data.staff === true,
        };
        return helpIndex;
      })
      .catch(function () {
        helpIndex = { sections: [], topics: [], staff: false };
        return helpIndex;
      });
    return helpIndexPromise;
  }

  function stripMushCodes(s) {
    return String(s || "")
      .replace(/%c[hn]/gi, "")
      .replace(/%c[a-z]/gi, "")
      .replace(/%x[0-9a-fA-F]{6}/g, "")
      .replace(/%[rR]/g, "\n")
      .replace(/%t/gi, "  ")
      .replace(/%b/gi, " ")
      .replace(/%[a-zA-Z]/g, "");
  }

  /**
   * Help text → markdown for renderMarkdown.
   * Preserves line breaks, SYNTAX labels, indented examples.
   * Angle brackets stay literal (inlineMarkdown escapes them).
   */
  function helpBodyToMarkdown(raw) {
    var t = stripMushCodes(String(raw || ""))
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/^\uFEFF/, "")
      .trim();
    if (!t) return "";

    // Drop leading +TOPIC title (shown as page H1)
    t = t.replace(/^\+[^\n]+\n+/, "");

    var lines = t.split("\n");
    var out = [];
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      var trimmed = line.trim();

      if (!trimmed) {
        out.push("");
        i++;
        continue;
      }

      // ALL-CAPS section labels → ## headings
      if (
        /^[A-Z][A-Z0-9 /+._-]{1,48}$/.test(trimmed) &&
        !/[@+#`]/.test(trimmed)
      ) {
        out.push("");
        out.push("## " + trimmed);
        out.push("");
        i++;
        continue;
      }

      // Indented example block → fenced code
      if (/^(?:  |\t)\S/.test(line)) {
        var code = [];
        while (i < lines.length) {
          var L = lines[i];
          if (!L.trim()) {
            if (
              i + 1 < lines.length &&
              /^(?:  |\t)\S/.test(lines[i + 1])
            ) {
              code.push("");
              i++;
              continue;
            }
            break;
          }
          if (!/^(?:  |\t)/.test(L)) break;
          code.push(L.replace(/^(?:  |\t)/, ""));
          i++;
        }
        out.push("```");
        out.push(code.join("\n"));
        out.push("```");
        out.push("");
        continue;
      }

      out.push(trimmed);
      // Separate lines so command syntax does not collapse
      out.push("");
      i++;
    }

    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function helpTopicByName(name) {
    if (!helpIndex || !helpIndex.topics) return null;
    var want = String(name || "").toLowerCase();
    for (var i = 0; i < helpIndex.topics.length; i++) {
      var t = helpIndex.topics[i];
      if (String(t.name || "").toLowerCase() === want) return t;
    }
    // tag / alias match
    for (var j = 0; j < helpIndex.topics.length; j++) {
      var e = helpIndex.topics[j];
      var tags = Array.isArray(e.tags) ? e.tags : [];
      for (var k = 0; k < tags.length; k++) {
        if (String(tags[k]).toLowerCase() === want) return e;
      }
    }
    return null;
  }

  function helpTopicsInSection(section) {
    if (!helpIndex || !helpIndex.topics) return [];
    var sec = String(section || "").toLowerCase();
    return helpIndex.topics.filter(function (t) {
      return String(t.section || "").toLowerCase() === sec;
    }).sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name));
    });
  }

  function helpActiveSection() {
    // Explicit side-nav filter wins
    var qSec = helpSectionFromUrl();
    if (qSec) return qSec;
    if (!HELP_PATH) return "";
    var topic = helpTopicByName(HELP_PATH);
    if (topic) return String(topic.section || "");
    return "";
  }

  function renderHelpLeft() {
    if (!leftPanels) return;
    // Single search is #site-q (wiki box → help placeholder)
    updateSearchChrome();
    var q = helpQueryFromUrl().toLowerCase();
    var siteQ = document.getElementById("site-q");
    if (siteQ && q && !siteQ.value) siteQ.value = q;

    var activeSec = helpActiveSection();
    var sections = (helpIndex && helpIndex.sections) || [];
    var html = "";

    // Side rail = section filters only (search is the top box)
    html += "<section class=\"site-menu menu\">" +
      "<h2 class=\"site-menu__title\">Sections</h2>" +
      "<ul class=\"site-menu__list\">";
    var filterSec = helpSectionFromUrl();
    html += "<li" +
      (!HELP_PATH && !filterSec ? " class=\"is-current\"" : "") +
      "><a href=\"" + helpSectionHref("") + "\">All topics</a></li>";
    for (var s = 0; s < sections.length; s++) {
      var secName = sections[s];
      var isCur = !HELP_PATH &&
        String(secName).toLowerCase() ===
          String(filterSec || activeSec).toLowerCase() &&
        !!filterSec;
      if (HELP_PATH && helpTopicByName(HELP_PATH) &&
        String(activeSec).toLowerCase() ===
          String(secName).toLowerCase()) {
        isCur = true;
      }
      if (q) {
        var secHits = helpTopicsInSection(secName).filter(
          function (t) {
            var name = String(t.name || "").toLowerCase();
            var body = String(t.content || "").toLowerCase();
            return name.indexOf(q) !== -1 ||
              body.indexOf(q) !== -1;
          },
        ).length;
        if (!secHits &&
          String(secName).toLowerCase().indexOf(q) === -1) {
          continue;
        }
      }
      var n = helpTopicsInSection(secName).length;
      html += "<li" + (isCur ? " class=\"is-current\"" : "") +
        "><a href=\"" + helpSectionHref(secName) + "\">" +
        esc(secName) +
        " <span class=\"site-help-count\">" + n +
        "</span></a></li>";
    }
    html += "</ul></section>";

    leftPanels.innerHTML = html;
  }

  function filterHelpTopics(topics, q) {
    q = String(q || "").trim().toLowerCase();
    if (!q) return topics;
    return topics.filter(function (t) {
      var name = String(t.name || "").toLowerCase();
      var sec = String(t.section || "").toLowerCase();
      var body = String(t.content || "").toLowerCase();
      return name.indexOf(q) !== -1 ||
        sec.indexOf(q) !== -1 ||
        body.indexOf(q) !== -1;
    });
  }

  /**
   * Flat topic list — Figma/wiki-style data table.
   * One Topic column only (no Section / Open chrome).
   */
  function injectHelpTopicList(opts) {
    if (!mainEl) return;
    opts = opts || {};
    var title = String(opts.title || "Help").trim();
    var topics = Array.isArray(opts.topics) ? opts.topics.slice() : [];
    var q = helpQueryFromUrl();
    topics = filterHelpTopics(topics, q);
    topics.sort(function (a, b) {
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    setDocumentTitle(title);

    var body = "";
    if (!topics.length) {
      body = q
        ? "<p>No help topics match \"" + esc(q) + "\".</p>"
        : "<p>No help topics match.</p>";
    } else {
      body = "<table>" +
        "<thead><tr>" +
        "<th scope=\"col\">Topic</th>" +
        "</tr></thead><tbody>";
      for (var i = 0; i < topics.length; i++) {
        var t = topics[i];
        var name = String(t.name || "").trim();
        if (!name) continue;
        body += "<tr><td><a href=\"" + helpHref(name) + "\">" +
          esc(name) + "</a></td></tr>";
      }
      body += "</tbody></table>";
    }

    var crumb = opts.crumb
      ? "<p class=\"site-help-crumb\">" + opts.crumb + "</p>"
      : "";
    mainEl.innerHTML =
      "<section class=\"site-section\">" + crumb +
      "<h2 class=\"site-section__title\">" + esc(title) + "</h2>" +
      "<div class=\"site-rule site-rule--image\" " +
      "role=\"presentation\"></div>" +
      "<div class=\"site-section__body\">" + body +
      "</div></section>" + articleFooterHtml();
    if (rightPanels) rightPanels.innerHTML = "";
  }

  /** /help/ — every visible topic. */
  function injectHelpIndex() {
    if (!mainEl || !helpIndex) return;
    var all = helpIndex.topics || [];
    injectHelpTopicList({
      title: "Help",
      topics: all,
    });
  }

  /** Side-nav section filter. */
  function injectHelpSection(section) {
    if (!mainEl) return;
    var topics = helpTopicsInSection(section);
    injectHelpTopicList({
      title: section,
      topics: topics,
      crumb: "<a href=\"" + helpHref("") + "\">Help</a> / " +
        esc(section),
    });
  }

  function injectHelpTopic(entry) {
    if (!mainEl || !entry) return;
    var title = String(entry.name || HELP_PATH || "Help");
    setDocumentTitle(title + " · Help");
    var md = helpBodyToMarkdown(entry.content || "");
    var bodyHtml = renderMarkdown(md, "");
    if (!bodyHtml.trim()) {
      bodyHtml = "<p><em>No detailed help for this topic.</em></p>";
    }
    var sec = String(entry.section || "");
    var crumb = "<p class=\"site-help-crumb\">" +
      "<a href=\"" + helpHref("") + "\">Help</a>";
    if (sec) {
      crumb += " / <a href=\"" + helpSectionHref(sec) + "\">" +
        esc(sec) + "</a>";
    }
    crumb += " / " + esc(title) + "</p>";
    mainEl.innerHTML =
      "<section class=\"site-section\">" + crumb +
      "<h2 class=\"site-section__title\">" + esc(title) +
      "</h2>" +
      "<div class=\"site-rule site-rule--image\" " +
      "role=\"presentation\"></div>" +
      "<div class=\"site-section__body site-help-body\">" +
      bodyHtml +
      "</div></section>" + articleFooterHtml();
    // TOC into right rail
    if (rightPanels) {
      var toc = buildToc();
      var rh = "";
      if (toc.length) {
        rh += "<section class=\"site-menu menu\">" +
          "<h2 class=\"site-menu__title\">On this page</h2>" +
          "<ul class=\"site-menu__list\">";
        for (var i = 0; i < toc.length; i++) {
          var cls = toc[i].level === "H3" ? " class=\"toc-sub\"" : "";
          rh += "<li" + cls + "><a href=\"#" +
            esc(toc[i].id) + "\">" +
            esc(toc[i].text) + "</a></li>";
        }
        rh += "</ul></section>";
      }
      rightPanels.innerHTML = rh;
    }
  }

  function injectHelpNotFound(path) {
    injectArticle({
      title: "Help not found",
      body: "No help topic at `" + String(path || "") + "`.\n\n" +
        "[Browse all help](" + helpHref("") + ").",
    });
    if (rightPanels) rightPanels.innerHTML = "";
  }

  function loadHelpRoute() {
    var filterSec = helpSectionFromUrl();
    injectLoadingState(
      HELP_PATH || filterSec || "Help",
    );
    return fetchHelpIndex().then(function () {
      // List view: all topics or ?section= filter
      if (!HELP_PATH) {
        if (filterSec) {
          // Resolve canonical section casing from index
          var secCanon = filterSec;
          var secs = (helpIndex && helpIndex.sections) || [];
          for (var i = 0; i < secs.length; i++) {
            if (String(secs[i]).toLowerCase() ===
              filterSec.toLowerCase()) {
              secCanon = secs[i];
              break;
            }
          }
          injectHelpSection(secCanon);
        } else {
          injectHelpIndex();
        }
        return null;
      }
      // Topic page
      return fetch(
        "/api/v1/help/" +
          encodeURIComponent(HELP_PATH).replace(/%2F/gi, "/"),
        {
          credentials: "same-origin",
          headers: helpAuthHeaders(),
        },
      )
        .then(function (r) {
          if (!r.ok) return null;
          return r.json();
        })
        .then(function (data) {
          if (data && data.entry) {
            injectHelpTopic(data.entry);
            return data.entry;
          }
          injectHelpNotFound(HELP_PATH);
          return null;
        })
        .catch(function () {
          injectHelpNotFound(HELP_PATH);
          return null;
        });
    });
  }

  /** /chargen — guided stepper FE (loads chargen.js once). */
  var chargenScriptPromise = null;
  function loadChargenRoute() {
    injectLoadingState("Character");
    function boot() {
      if (globalThis.SiteChargen && globalThis.SiteChargen.boot) {
        return globalThis.SiteChargen.boot();
      }
      return Promise.resolve(null);
    }
    if (globalThis.SiteChargen) return boot();
    if (!chargenScriptPromise) {
      chargenScriptPromise = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = "/site/js/chargen.js?v=20260806nowipe";
        s.async = true;
        s.onload = function () { resolve(true); };
        s.onerror = function () {
          reject(new Error("chargen.js failed to load"));
        };
        document.head.appendChild(s);
      });
    }
    return chargenScriptPromise.then(boot).catch(function () {
      if (mainEl) {
        mainEl.innerHTML =
          "<section class=\"site-section\"><p>Could not load " +
          "character page. Refresh and try again.</p>" +
          "</section>";
      }
      return null;
    });
  }

  /** /play — chat-style game client (output + bottom input). */
  var playScriptPromise = null;
  function ensurePlayCss() {
    if (!document.getElementById("site-play-css")) {
      var link = document.createElement("link");
      link.id = "site-play-css";
      link.rel = "stylesheet";
      link.href = "/site/css/play.css?v=20260806bq";
      document.head.appendChild(link);
    }
    // Separate file: CSP blocks inline style=; classes live here.
    if (!document.getElementById("site-play-palette-css")) {
      var pal = document.createElement("link");
      pal.id = "site-play-palette-css";
      pal.rel = "stylesheet";
      pal.href = "/site/css/play-palette.css?v=20260805btngrow";
      document.head.appendChild(pal);
    }
  }
  function loadPlayRoute() {
    injectLoadingState("Play");
    ensurePlayCss();
    if (shell) shell.classList.add("is-mode-play");
    function playFail(detail) {
      if (mainEl) {
        mainEl.innerHTML =
          "<section class=\"site-section\"><p>Could not load " +
          "the play client. Refresh and try again.</p>" +
          (detail
            ? "<p class=\"muted\"><code>" + esc(detail) +
              "</code></p>"
            : "") +
          "</section>";
      }
      return null;
    }
    function boot() {
      if (globalThis.SitePlay && globalThis.SitePlay.mount) {
        globalThis.SitePlay.mount(mainEl);
        return true;
      }
      return playFail("SitePlay missing after play.js load");
    }
    // Public connect client — do not wait on auth probe.
    if (globalThis.SitePlay) {
      return Promise.resolve(boot());
    }
    if (!playScriptPromise) {
      playScriptPromise = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = "/site/js/play.js?v=20260806bq";
        s.async = true;
        s.onload = function () { resolve(true); };
        s.onerror = function () {
          reject(new Error("play.js failed to load"));
        };
        document.head.appendChild(s);
      });
    }
    return playScriptPromise.then(boot).catch(function (err) {
      playScriptPromise = null;
      return playFail(err && err.message ? err.message : "load error");
    });
  }

  // 4. Route loader & SPA navigation
  function loadCurrentRoute() {
    setNavOpen(false);
    refreshPathname();
    refreshPub();
    WIKI_PATH = wikiPathFromUrl();
    HELP_PATH = helpPathFromUrl();
    MODE = modeFromUrl();
    // Default compact until wiki article with bgImage loads
    pageBgImage = false;
    if (siteConfig && Object.keys(siteConfig).length) {
      applyConfig(siteConfig);
    }
    updateSidebarAndBannerVisibility();

    var articlePromise;
    // Leave play mode class when navigating away — keep WS alive
    if (shell && MODE !== "play") {
      shell.classList.remove("is-mode-play");
      if (globalThis.SitePlay && globalThis.SitePlay.unmount) {
        try {
          globalThis.SitePlay.unmount();
        } catch (_) { /* ignore */ }
      }
    }
    if (MODE === "chargen") {
      // Auth gate before loading chargen FE (nav.require + default)
      articlePromise = authPromise.then(function (user) {
        currentUser = user;
        if (!guardRouteAccess(user)) return null;
        return loadChargenRoute();
      });
    } else if (MODE === "play") {
      // Auth required — guests go to /login?next=/play
      articlePromise = authPromise.then(function (user) {
        currentUser = user;
        if (!guardRouteAccess(user)) return null;
        return loadPlayRoute();
      });
    } else if (MODE === "help") {
      articlePromise = loadHelpRoute();
    } else if (MODE === "wiki" && WIKI_PATH) {
      var slug = WIKI_PATH.split("/").pop().replace(/[-_]/g, " ");
      var loadTitle = slug
        ? (slug.charAt(0).toUpperCase() + slug.slice(1))
        : "Wiki";
      injectLoadingState(loadTitle);

      // Wait for wiki index so [[wikilinks]] resolve titles
      articlePromise = listPromise.then(function () {
        return fetch(
          "/api/v1/wiki/" + encodeWikiApiPath(WIKI_PATH),
          { credentials: "same-origin" },
        )
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (page) {
            if (!page) {
              injectNotFound(WIKI_PATH);
              return null;
            }
            if (
              page.type === "directory" &&
              Array.isArray(page.children)
            ) {
              injectWikiListing({
                title: page.title || page.path || WIKI_PATH,
                items: page.children,
              });
              return page;
            }
            if (page.body != null || page.title) {
              injectArticle(page);
              return page;
            }
            injectNotFound(WIKI_PATH);
            return page;
          })
          .catch(function () {
            injectNotFound(WIKI_PATH);
            return null;
          });
      });
    } else if (MODE === "wiki" && !WIKI_PATH) {
      injectLoadingState("Wiki");
      articlePromise = listPromise.then(function (pages) {
        var items = (pages || []).slice().sort(function (a, b) {
          return String(a.path || "").localeCompare(
            String(b.path || ""),
          );
        });
        // Optional ?q= filter on index
        var iq = "";
        try {
          iq = String(
            new URLSearchParams(window.location.search).get("q") ||
              "",
          ).trim().toLowerCase();
        } catch (_) { /* ignore */ }
        if (iq) {
          items = items.filter(function (p) {
            return (
              String(p.title || "").toLowerCase().indexOf(iq) !==
                -1 ||
              String(p.path || "").toLowerCase().indexOf(iq) !==
                -1 ||
              (p.tags || []).some(function (t) {
                return String(t).toLowerCase().indexOf(iq) !== -1;
              })
            );
          });
        }
        injectWikiListing({ title: "Wiki", items: items });
        return { title: "Wiki", items: items };
      });
    } else if (MODE === "home") {
      // Home main column = wiki path "home" only.
      // featured:true pages are left-menu links, not the homepage body.
      injectLoadingState("Home");
      articlePromise = listPromise.then(function () {
        return fetch("/api/v1/wiki/home", {
          credentials: "same-origin",
        })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (page) {
            if (page && page.body) {
              injectArticle(page);
              return page;
            }
            if (mainEl) {
              injectArticle({
                title: "Welcome",
                body: "Welcome to the game.\n\n" +
                  "Edit the wiki page **home** for this content, " +
                  "or browse **Wiki** in the nav. Mark pages " +
                  "**Featured** to list them in the left menu " +
                  "(separate from home).",
              });
            }
            return null;
          })
          .catch(function () {
            if (mainEl) {
              injectArticle({
                title: "Welcome",
                body:
                  "Welcome. The wiki could not be loaded right now.",
              });
            }
            return null;
          });
      });
    } else {
      articlePromise = Promise.resolve(null);
    }

    return Promise.all([listPromise, articlePromise, configPromise])
      .then(function (results) {
        var pages = results[0];
        updateSearchChrome();
        wireSearch(pages);
        updateSidebarAndBannerVisibility();
        renderLeft(pages);
        return authPromise.then(function (user) {
          currentUser = user;
          renderTopNav(user);
          updateNavUser(user);
          // Auth-gated SPAs enforce earlier; others after content load
          if (
            MODE !== "chargen" &&
            MODE !== "play" &&
            !guardRouteAccess(user)
          ) {
            return;
          }
          if (MODE === "login" || MODE === "profile") {
            injectSpecialPage(user);
          }
          renderRight(user);
          wireScrollSpy();
        });
      });
  }

  // Intercept internal wiki links for instant SPA navigation without full reloads
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (!a) return;
    var href = a.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || a.target === "_blank") return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    var targetUrl;
    try { targetUrl = new URL(href, window.location.href); } catch (_) { return; }
    if (targetUrl.origin !== window.location.origin) return;

    var p = targetUrl.pathname;
    if (
      p.startsWith("/wiki") ||
      p.startsWith("/site/wiki") ||
      p.startsWith("/help") ||
      p.startsWith("/site/help") ||
      p.startsWith("/chargen") ||
      p.startsWith("/site/chargen") ||
      p.startsWith("/play") ||
      p.startsWith("/site/play") ||
      p === "/site/" ||
      p === "/site" ||
      p === "/"
    ) {
      e.preventDefault();
      if (
        window.location.pathname + window.location.search ===
          targetUrl.pathname + targetUrl.search
      ) {
        return;
      }
      window.history.pushState({}, "", targetUrl.href);
      loadCurrentRoute();
    }
  });

  window.addEventListener("popstate", function () {
    loadCurrentRoute();
  });

  /**
   * SPA navigate helper (play client +cg → Character tab).
   * Same-origin path only.
   */
  function siteNavigate(path) {
    var href = String(path || "").trim();
    if (!href) return;
    var targetUrl;
    try {
      targetUrl = new URL(href, window.location.href);
    } catch (_) {
      return;
    }
    if (targetUrl.origin !== window.location.origin) {
      window.location.href = href;
      return;
    }
    if (
      window.location.pathname + window.location.search ===
        targetUrl.pathname + targetUrl.search
    ) {
      loadCurrentRoute();
      return;
    }
    window.history.pushState({}, "", targetUrl.href);
    loadCurrentRoute();
  }

  globalThis.SiteShell = globalThis.SiteShell || {};
  globalThis.SiteShell.navigate = siteNavigate;

  // Initial route load
  loadCurrentRoute();

})();
