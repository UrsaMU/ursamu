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
 *   - "Featured" list (all featured:true wiki pages, all modes)
 *   - "In this section" siblings (wiki mode only)
 *
 * Right sidebar:
 *   - "On this page" TOC (scraped from rendered headings)
 *   - "Edit this page" staff link (wiki mode, authenticated staff only)
 *   - "Connect" panel (home/generic, non-staff — shows telnet address)
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
  var navList     = document.querySelector("[data-site-nav-list]");
  var skinLink    = document.querySelector("[data-site-skin]");
  var mainEl      = document.querySelector("[data-site-main]");
  var leftPanels  = document.querySelector("[data-site-left-panels]");
  var rightPanels = document.querySelector("[data-site-right-panels]");

  // ── Page mode ─────────────────────────────────────────────────────────────

  var pathname = window.location.pathname.replace(/\/+$/, "") || "/site";

  function detectMode() {
    if (pathname === "/site" || pathname === "/site/index.html") {
      return "home";
    }
    if (pathname === "/site/login" || pathname === "/site/login.html") {
      return "login";
    }
    if (pathname === "/site/profile" || pathname === "/site/profile.html") {
      return "profile";
    }
    if (pathname.startsWith("/site/wiki")) {
      return "wiki";
    }
    return "generic";
  }

  // "/site/wiki/lore/city" → "lore/city"
  function wikiPathFromUrl() {
    return pathname.replace(/^\/site\/wiki\/?/, "") || "";
  }

  var MODE     = detectMode();
  var WIKI_PATH = wikiPathFromUrl();

  // ── Config helpers ─────────────────────────────────────────────────────────

  var siteConfig = {};

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
    document.title = brandTitle;
    if (brand) brand.textContent = brandTitle;
    if (bannerTitle) {
      if (heroTitle) {
        bannerTitle.textContent = heroTitle;
        bannerTitle.hidden = false;
        bannerTitle.removeAttribute("hidden");
      } else {
        bannerTitle.textContent = "";
        bannerTitle.hidden = true;
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
    if (bannerImg) {
      if (bannerSrc) {
        bannerImg.src = bannerSrc;
        bannerImg.hidden = false;
        if (banner) banner.classList.add("has-image");
      } else {
        bannerImg.removeAttribute("src");
        bannerImg.hidden = true;
        if (banner) banner.classList.remove("has-image");
      }
    }

    // Compact: no banner image + no hero title → content under nav
    if (shell) {
      if (cfg.plainBg) shell.classList.add("is-plain");
      else shell.classList.remove("is-plain");
      if (!bannerSrc && !heroTitle) shell.classList.add("is-compact");
      else shell.classList.remove("is-compact");
    }

    if (Array.isArray(cfg.nav) && navList) {
      navList.innerHTML = "";
      for (var i = 0; i < cfg.nav.length; i++) {
        var item = cfg.nav[i];
        var li = document.createElement("li");
        var a  = document.createElement("a");
        a.href = String(item.href || "#");
        a.textContent = String(item.label || "Link");
        // Path wins over static active:true from config
        if (navHrefIsActive(item.href)) a.classList.add("is-active");
        li.appendChild(a);
        navList.appendChild(li);
      }
    }
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

  function inlineMarkdown(text) {
    // Wikilinks [[target|label]] or [[target]] — resolve to real links
    text = text.replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      function (_, target, label) {
        var t   = target.trim();
        var lbl = label ? label.trim() : (wikiIndex[t] ? wikiIndex[t].title : t);
        return '<a href="/site/wiki/' + esc(t) + '">' + esc(lbl) + "</a>";
      }
    );
    // Bold+italic
    text = text.replace(/\*\*\*(.+?)\*\*\*/g, function (_, t) {
      return "<strong><em>" + esc(t) + "</em></strong>";
    });
    text = text.replace(/\*\*(.+?)\*\*/g, function (_, t) {
      return "<strong>" + esc(t) + "</strong>";
    });
    text = text.replace(/\*(.+?)\*/g, function (_, t) {
      return "<em>" + esc(t) + "</em>";
    });
    // Inline code
    text = text.replace(/`([^`]+)`/g, function (_, t) {
      return "<code>" + esc(t) + "</code>";
    });
    // Markdown links
    text = text.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      function (_, lbl, url) {
        return '<a href="' + esc(url) + '">' + esc(lbl) + "</a>";
      }
    );
    return text;
  }

  function renderMarkdown(md) {
    var lines    = md.split(/\r?\n/);
    var html     = "";
    var inList   = false;
    var listTag  = "";
    var inPara   = false;
    var inTable  = false;
    var tableRows = []; // array of string[] (one per row)

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
        html += "<th>" + inlineMarkdown(headers[h]) + "</th>";
      }
      html += "</tr>\n</thead>\n<tbody>\n";
      for (var r = 1; r < tableRows.length; r++) {
        html += "<tr>";
        var cells = tableRows[r];
        for (var c = 0; c < cells.length; c++) {
          html += "<td>" + inlineMarkdown(cells[c]) + "</td>";
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

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

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
          inlineMarkdown(hText) + "</h" + level + ">\n";
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
          inlineMarkdown(bqMatch[1]) + "</p></blockquote>\n";
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
        html += "<li>" + inlineMarkdown(ulMatch[1]) + "</li>\n";
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
        html += "<li>" + inlineMarkdown(olMatch[1]) + "</li>\n";
        continue;
      }

      // ── Paragraph ──────────────────────────────────────────────────
      closeList();
      if (!inPara) { html += "<p>"; inPara = true; } else { html += " "; }
      html += inlineMarkdown(line);
    }
    closePara(); closeList(); flushTable();
    return html;
  }

  // ── Main content injection ─────────────────────────────────────────────────

  function injectArticle(page) {
    if (!mainEl) return;
    var bodyHtml = renderMarkdown(String(page.body || ""));
    if (!bodyHtml.trim()) return;
    var title = String(page.title || "").trim();
    var inner = "<section class=\"site-section\">";
    if (title) {
      inner += "<h2 class=\"site-section__title\">" + esc(title) + "</h2>" +
        "<div class=\"site-rule site-rule--image\" role=\"presentation\"></div>";
    }
    inner += "<div class=\"site-section__body\">" + bodyHtml + "</div></section>";
    inner += "<footer class=\"site-footer\" id=\"footer\">" +
      "<div class=\"site-rule site-rule--image\" role=\"presentation\"></div>" +
      "<p>Powered by <a href=\"https://github.com/UrsaMU/ursamu\"" +
      " target=\"_blank\" rel=\"noopener\">UrsaMU</a></p></footer>";
    mainEl.innerHTML = inner;
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
      "<a href=\"/site/wiki/" + esc(p.path) + "\"" +
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
    if (MODE === "login") {
      if (leftAside) leftAside.style.display = "none";
      if (rightAside) rightAside.style.display = "none";
      if (banner) banner.style.display = "none";
      if (shell) shell.classList.add("is-mode-no-hero");
      if (mainEl) {
        mainEl.style.margin = "0 auto";
        mainEl.style.maxWidth = "440px";
        mainEl.style.minHeight = "calc(100vh - var(--site-nav-h) - 4rem)";
        mainEl.style.display = "flex";
        mainEl.style.flexDirection = "column";
        mainEl.style.justifyContent = "center";
        mainEl.style.alignItems = "center";
      }
    } else if (MODE === "profile") {
      if (leftAside) leftAside.style.display = "none";
      if (rightAside) rightAside.style.display = "none";
      if (banner) banner.style.display = "none";
      if (shell) shell.classList.add("is-mode-no-hero");
      if (mainEl) {
        mainEl.style.margin = "0 auto";
        mainEl.style.maxWidth = "600px";
        mainEl.style.minHeight = "";
        mainEl.style.display = "";
        mainEl.style.flexDirection = "";
        mainEl.style.justifyContent = "";
        mainEl.style.alignItems = "";
      }
    } else {
      if (leftAside) leftAside.style.display = "";
      if (rightAside) rightAside.style.display = "";
      if (banner) banner.style.display = "";
      if (shell) shell.classList.remove("is-mode-no-hero");
      if (mainEl) {
        mainEl.style.margin = "";
        mainEl.style.maxWidth = "";
        mainEl.style.minHeight = "";
        mainEl.style.display = "";
        mainEl.style.flexDirection = "";
        mainEl.style.justifyContent = "";
        mainEl.style.alignItems = "";
      }
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
        var href = it.href || (it.path ? "/site/wiki/" + it.path : "#");
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
        href: "/site/wiki/" + p.path,
        current: p.path === WIKI_PATH,
      });
    }
    return items;
  }

  function renderLeft(pages) {
    if (!leftPanels || MODE === "login" || MODE === "profile") return;
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

    // Fallback when no template (should be rare)
    var html = "";
    if (MODE === "wiki" && siblings.length) {
      var currentPg = wikiIndex[WIKI_PATH];
      var secItems = currentPg
        ? [currentPg].concat(siblings)
        : siblings;
      var sectionName = (WIKI_PATH || "").split("/")[0] || "Section";
      var label = sectionName.charAt(0).toUpperCase() +
        sectionName.slice(1);
      html += menuSection(label, secItems);
    }
    if (featured.length) {
      html += menuSection("Featured", featured);
    }
    leftPanels.innerHTML = html || "";
  }

  // ── Right sidebar ──────────────────────────────────────────────────────────

  function buildToc() {
    if (!mainEl) return [];
    var headings = mainEl.querySelectorAll("h2, h3");
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

  var STAFF_FLAGS = ["wizard", "admin", "superuser", "builder"];
  var currentAuthMode = "login"; // "login" | "register"

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
          flags: flags,
          location: me.location || "",
          avatar: me.avatar || "",
          isStaff: isStaff,
        };
      })
      .catch(function () { return null; });
  }

  function doSignOut() {
    try { sessionStorage.removeItem("ursamu.webAdmin.token"); } catch (_) {}
    try { localStorage.removeItem("ursamu.webAdmin.token"); } catch (_) {}
    window.location.href = "/site/";
  }

  function safeNextPath(raw) {
    var n = String(raw || "").trim();
    if (!n || n.charAt(0) !== "/" || n.indexOf("//") === 0) return "/site/";
    if (n.indexOf("/site") !== 0 && n.indexOf("/admin") !== 0) {
      return "/site/";
    }
    return n;
  }

  function updateNavUser(user) {
    var existingNavUser = document.getElementById("nav-user-item");
    if (existingNavUser) existingNavUser.remove();

    if (!navList) return;
    var li = document.createElement("li");
    li.id = "nav-user-item";
    li.className = "site-nav-user-item";

    if (user) {
      // Compact account control — no full profile page
      var wrap = document.createElement("div");
      wrap.className = "site-nav-account";

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "site-nav-user-link site-nav-account-toggle";
      btn.setAttribute("aria-haspopup", "true");
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-controls", "site-nav-account-menu");

      if (user.avatar) {
        var img = document.createElement("img");
        img.src = user.avatar;
        img.className = "site-nav-avatar";
        img.alt = "";
        btn.appendChild(img);
      } else {
        var init = document.createElement("span");
        init.className = "site-nav-avatar-initial";
        init.textContent = user.name.charAt(0).toUpperCase();
        btn.appendChild(init);
      }

      var nameSpan = document.createElement("span");
      nameSpan.className = "site-nav-username";
      nameSpan.textContent = user.name;
      btn.appendChild(nameSpan);

      var menu = document.createElement("div");
      menu.id = "site-nav-account-menu";
      menu.className = "site-nav-account-menu";
      menu.hidden = true;
      menu.setAttribute("role", "menu");

      if (user.isStaff) {
        var staffA = document.createElement("a");
        staffA.href = "/admin/";
        staffA.className = "site-nav-account-item";
        staffA.setAttribute("role", "menuitem");
        staffA.textContent = "Staff console";
        menu.appendChild(staffA);
      }

      var outBtn = document.createElement("button");
      outBtn.type = "button";
      outBtn.className = "site-nav-account-item site-nav-account-signout";
      outBtn.setAttribute("role", "menuitem");
      outBtn.textContent = "Sign out";
      outBtn.addEventListener("click", function () {
        doSignOut();
      });
      menu.appendChild(outBtn);

      function setOpen(open) {
        menu.hidden = !open;
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        wrap.classList.toggle("is-open", open);
      }

      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        setOpen(menu.hidden);
      });

      document.addEventListener("click", function () {
        setOpen(false);
      });
      menu.addEventListener("click", function (e) {
        e.stopPropagation();
      });

      wrap.appendChild(btn);
      wrap.appendChild(menu);
      li.appendChild(wrap);
    } else {
      var loginA = document.createElement("a");
      loginA.href = "/site/login";
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
      var innerHtml = "<section class=\"site-section\" style=\"width:100%;display:flex;flex-direction:column;align-items:center;\">" +
        "<h2 class=\"site-section__title\">" + (user ? "Account" : (currentAuthMode === "register" ? "Register" : "Sign In")) + "</h2>" +
        "<div class=\"site-rule site-rule--image\" role=\"presentation\" style=\"width:100%;max-width:400px;\"></div>" +
        "<div class=\"site-section__body\" style=\"width:100%;display:flex;justify-content:center;\">";

      if (user) {
        // Already signed in — no profile page; useful actions only
        innerHtml += "<div class=\"site-auth-card\" style=\"text-align:center;\">" +
          "<p>Signed in as <strong>" + esc(user.name) + "</strong>.</p>" +
          "<div class=\"site-profile-actions\" style=\"justify-content:center;margin-top:1rem;\">" +
          "<a href=\"/site/\" class=\"site-auth-submit\" style=\"display:inline-flex;align-items:center;justify-content:center;text-decoration:none;padding:0 1.25rem;width:auto;\">Continue to site</a>";
        if (user.isStaff) {
          innerHtml += "<a href=\"/admin/\" class=\"site-auth-logout\" style=\"display:inline-flex;align-items:center;justify-content:center;text-decoration:none;\">Staff console</a>";
        }
        innerHtml += "<button type=\"button\" class=\"site-auth-logout\" id=\"page-logout-link\">Sign out</button>" +
          "</div></div>";
      } else {
        var isReg = (currentAuthMode === "register");
        innerHtml += "<div class=\"site-auth-card\" style=\"width:100%;margin:0.5rem 0 0;\">" +
          "<div class=\"site-auth-tabs\">" +
          "<button type=\"button\" class=\"site-auth-tab" + (isReg ? "" : " is-active") + "\" id=\"tab-login\">Sign In</button>" +
          "<button type=\"button\" class=\"site-auth-tab" + (isReg ? " is-active" : "") + "\" id=\"tab-register\">Register</button>" +
          "</div>" +
          "<form class=\"site-auth-form\" id=\"site-auth-form\">" +
          "<div class=\"site-auth-field\">" +
          "<label class=\"site-auth-label\" for=\"auth-username\">Username</label>" +
          "<input type=\"text\" id=\"auth-username\" class=\"site-auth-input\" autocomplete=\"username\" required />" +
          "</div>" +
          "<div class=\"site-auth-field" + (isReg ? "" : " site-hidden") + "\" id=\"auth-email-group\">" +
          "<label class=\"site-auth-label\" for=\"auth-email\">Email</label>" +
          "<input type=\"email\" id=\"auth-email\" class=\"site-auth-input\" autocomplete=\"email\"" + (isReg ? " required" : "") + " />" +
          "</div>" +
          "<div class=\"site-auth-field\">" +
          "<label class=\"site-auth-label\" for=\"auth-password\">Password</label>" +
          "<input type=\"password\" id=\"auth-password\" class=\"site-auth-input\" autocomplete=\"current-password\" required />" +
          "</div>" +
          "<div class=\"site-auth-error site-hidden\" id=\"auth-error\"></div>" +
          "<button type=\"submit\" class=\"site-auth-submit\" id=\"auth-submit-btn\">" + (isReg ? "Create Account" : "Sign In") + "</button>" +
          "</form></div>";
      }

      innerHtml += "</div></section>";

      mainEl.innerHTML = innerHtml;
      wireAuthEvents(user);
    } else if (MODE === "profile") {
      // Legacy /site/profile — redirect home (account lives in nav menu)
      window.location.replace("/site/");
      return;
    }
  }

  function renderRight(user) {
    if (!rightPanels || MODE === "login" || MODE === "profile") return;
    var html = "";

    // TOC
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

    // Connect panel
    var telnet = String((siteConfig && siteConfig.telnet) || "").trim();
    if (telnet) {
      html += "<section class=\"site-menu menu\">" +
        "<h2 class=\"site-menu__title\">Connect</h2>" +
        "<ul class=\"site-menu__list\">" +
        "<li><a href=\"telnet://" + esc(telnet) + "\">" + esc(telnet) + "</a></li>" +
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
              updateNavUser(u);
              var params = new URLSearchParams(window.location.search);
              var next = safeNextPath(params.get("next") || "/site/");
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

  function wireSearch(pages) {
    var form  = document.getElementById("search");
    var input = document.getElementById("site-q");
    if (!form || !input) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var q = (input.value || "").trim().toLowerCase();
      if (!q) return;
      var hits = pages.filter(function (p) {
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
        window.location.href = "/site/wiki/" + hits[0].path;
        return;
      }
      // Multiple results — navigate to wiki index with query
      window.location.href = "/site/wiki/?q=" + encodeURIComponent(q);
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

  // ── Boot sequence ──────────────────────────────────────────────────────────

  var cfgUrl = root.getAttribute("data-site-config") || "/site/config.json";

  // 1. Config
  var configPromise = fetch(cfgUrl, { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (cfg) {
      var htmlSkin = root.getAttribute("data-skin");
      if (htmlSkin && htmlSkin !== "custom" && (!cfg || !cfg.skinCss)) {
        cfg = Object.assign({}, cfg || {}, { skin: htmlSkin });
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

  // 3. Main content
  var articlePromise;
  if (MODE === "wiki" && WIKI_PATH) {
    // Individual wiki article
    articlePromise = fetch(
      "/api/v1/wiki/" + encodeURIComponent(WIKI_PATH),
      { credentials: "same-origin" }
    )
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (page) {
        if (page && page.body) injectArticle(page);
        return page;
      })
      .catch(function () { return null; });
  } else if (MODE === "home") {
    // Featured → home wiki page → static welcome (never leave "Loading…")
    articlePromise = fetch("/api/v1/wiki/featured", {
      credentials: "same-origin",
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (page) {
        if (page && page.body) return page;
        return fetch("/api/v1/wiki/home", { credentials: "same-origin" })
          .then(function (r2) { return r2.ok ? r2.json() : null; });
      })
      .then(function (page) {
        if (page && page.body) {
          injectArticle(page);
          return page;
        }
        if (mainEl) {
          injectArticle({
            title: "Welcome",
            body: "Welcome to the game wiki.\n\n" +
              "Browse **Wiki** in the nav, or ask staff to mark a page " +
              "`featured: true` for the home article.",
          });
        }
        return null;
      })
      .catch(function () {
        if (mainEl) {
          injectArticle({
            title: "Welcome",
            body: "Welcome. The wiki could not be loaded right now.",
          });
        }
        return null;
      });
  } else {
    articlePromise = Promise.resolve(null);
  }

  // 4. Auth probe
  var authPromise = probeAuth();

  // 5. Once article + list + config are ready, wire up sidebars
  Promise.all([listPromise, articlePromise, configPromise])
    .then(function (results) {
      var pages = results[0];
      wireSearch(pages);
      updateSidebarAndBannerVisibility();
      renderLeft(pages);
      return authPromise.then(function (user) {
        updateNavUser(user);
        if (MODE === "login" || MODE === "profile") {
          injectSpecialPage(user);
        }
        renderRight(user);
        wireScrollSpy();
      });
    });

})();
