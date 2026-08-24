/**
 * Cyberpunk RED web chargen — parity with in-game +chargen.
 * API: /api/v1/cpr/chargen/*
 */
(function (global) {
  "use strict";

  var API = "/api/v1/cpr/chargen";
  var SHEET_API = "/api/v1/cpr/sheet";
  var META_API = "/api/v1/cpr/meta";
  var AUTH_KEY = "ursamu.webAdmin.token";

  var state = null;
  var meta = null;
  var catalogs = {
    lifepath: null,
    /** stageKey → { items: [...] } for path hub */
    lifepathByStage: {},
    skills: null,
    chrome: null,
    gear: null,
  };
  var busy = false;
  var mainEl = null;
  var lastRoll = null;
  /** Pending skill ranks (absolute) — flushed as one batch POST. */
  var skillPending = {};
  var skillFlushTimer = null;
  /** Pending stat values — flushed as sequential sets, one refresh. */
  var statPending = {};
  var statFlushTimer = null;
  /** Chrome catalog category tab (session-local). */
  var chromeCatTab = "";
  /** Gear catalog tab: suggested | weapons | armor. */
  var gearCatTab = "";
  /** Min concept notes length (server may override via notesMin). */
  var NOTES_MIN = 80;
  /**
   * Approved sheet section on /chargen (deep browse).
   * overview | stats | skills | chrome | combat | economy | path
   */
  var liveSheetView = "overview";
  var LIVE_VIEWS = [
    { id: "overview", label: "Overview" },
    { id: "stats", label: "Stats" },
    { id: "skills", label: "Skills" },
    { id: "chrome", label: "Chrome" },
    { id: "gear", label: "Gear" },
    { id: "combat", label: "Combat" },
    { id: "economy", label: "Economy" },
    { id: "path", label: "Lifepath" },
  ];

  /**
   * Engine stages (full flow). Progress UI collapses lifepath into
   * one phase with sub-dots so the bar stays readable.
   */
  var UI_STAGES = [
    { key: "method", short: "Method", name: "Method", phase: "method" },
    { key: "role_select", short: "Role", name: "Role", phase: "role" },
    {
      key: "lifepath_cultural", short: "Origin",
      name: "Cultural Origin", phase: "path",
    },
    {
      key: "lifepath_personality", short: "Look",
      name: "Personality", phase: "path",
    },
    {
      key: "lifepath_motivations", short: "Drive",
      name: "Motivations", phase: "path",
    },
    {
      key: "lifepath_family", short: "Family",
      name: "Family", phase: "path",
    },
    {
      key: "lifepath_friends", short: "Allies",
      name: "Friends", phase: "path",
    },
    {
      key: "lifepath_enemies", short: "Foes",
      name: "Enemies", phase: "path",
    },
    {
      key: "lifepath_events", short: "Events",
      name: "Life Events", phase: "path",
    },
    {
      key: "lifepath_role", short: "Role LP",
      name: "Role Events", phase: "path",
    },
    { key: "stats", short: "Stats", name: "Stats", phase: "stats" },
    { key: "skills", short: "Skills", name: "Skills", phase: "skills" },
    {
      key: "lifestyle", short: "Life",
      name: "Lifestyle", phase: "lifestyle",
    },
    {
      key: "cyberware", short: "Chrome",
      name: "Cyberware", phase: "chrome",
    },
    {
      key: "equipment", short: "Gear",
      name: "Equipment", phase: "gear",
    },
    { key: "review", short: "Review", name: "Review", phase: "review" },
  ];

  /** Top-level progress pills (8 max — not 16). */
  var UI_PHASES = [
    { id: "method", short: "Method", name: "Method" },
    { id: "role", short: "Role", name: "Role" },
    { id: "path", short: "Path", name: "Lifepath" },
    { id: "stats", short: "Stats", name: "Stats" },
    { id: "skills", short: "Skills", name: "Skills" },
    { id: "lifestyle", short: "Life", name: "Lifestyle" },
    { id: "chrome", short: "Chrome", name: "Cyberware" },
    { id: "gear", short: "Gear", name: "Equipment" },
    { id: "review", short: "Review", name: "Review" },
  ];

  var PATH_STAGES = UI_STAGES.filter(function (s) {
    return s.phase === "path";
  });

  var STAT_KEYS = [
    "int", "ref", "dex", "tech", "cool",
    "will", "luck", "move", "body", "emp",
  ];

  var LIFESTYLES = [
    { slug: "kibble", name: "Kibble" },
    { slug: "generic_prepak", name: "Generic Prepak" },
    { slug: "streetrat", name: "Street Rat" },
    { slug: "good_prepak", name: "Good Prepak" },
    { slug: "fresh_food", name: "Fresh Food" },
    { slug: "moderate", name: "Moderate" },
    { slug: "corporate", name: "Corporate" },
    { slug: "luxury", name: "Luxury" },
  ];

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function token() {
    try {
      var s = sessionStorage.getItem(AUTH_KEY) || "";
      if (s) return s;
    } catch (_) { /* ignore */ }
    try {
      var l = localStorage.getItem(AUTH_KEY) || "";
      if (l) {
        try { sessionStorage.setItem(AUTH_KEY, l); } catch (_) {}
        return l;
      }
    } catch (_) { /* ignore */ }
    return "";
  }

  function authHeaders() {
    var h = { "Content-Type": "application/json" };
    var t = token();
    if (t) h.Authorization = "Bearer " + t;
    return h;
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function titleCase(s) {
    return String(s || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, function (c) {
        return c.toUpperCase();
      });
  }

  function draft() {
    return (state && state.draft) || {};
  }

  function stageIndex(stage) {
    var s = String(stage || "method");
    for (var i = 0; i < UI_STAGES.length; i++) {
      if (UI_STAGES[i].key === s) return i;
    }
    if (s === "complete") return UI_STAGES.length - 1;
    return 0;
  }

  function isLifepath(key) {
    return String(key || "").indexOf("lifepath_") === 0;
  }

  function stageMetaAt(idx) {
    return UI_STAGES[idx] || UI_STAGES[0];
  }

  function phaseIndexForStage(stageKey) {
    var meta = null;
    for (var i = 0; i < UI_STAGES.length; i++) {
      if (UI_STAGES[i].key === stageKey) {
        meta = UI_STAGES[i];
        break;
      }
    }
    var pid = (meta && meta.phase) || "method";
    for (var p = 0; p < UI_PHASES.length; p++) {
      if (UI_PHASES[p].id === pid) return p;
    }
    return 0;
  }

  function pathSubIndex(stageKey) {
    for (var i = 0; i < PATH_STAGES.length; i++) {
      if (PATH_STAGES[i].key === stageKey) return i;
    }
    return 0;
  }

  async function api(method, path, body) {
    var res = await fetch(API + path, {
      method: method,
      credentials: "same-origin",
      headers: authHeaders(),
      body: body != null ? JSON.stringify(body) : undefined,
    });
    var data = {};
    try {
      data = await res.json();
    } catch (_) { /* empty */ }
    if (res.status === 401) {
      var err = new Error("Unauthorized");
      err.status = 401;
      throw err;
    }
    if (!res.ok) {
      var e2 = new Error(data.error || ("HTTP " + res.status));
      e2.status = res.status;
      e2.data = data;
      throw e2;
    }
    return data;
  }

  async function loadMeta() {
    if (meta) return meta;
    try {
      var r = await fetch(META_API, { credentials: "same-origin" });
      if (r.ok) meta = await r.json();
    } catch (_) { /* ignore */ }
    meta = meta || {
      roles: [
        "rockerboy", "solo", "netrunner", "medtech", "tech",
        "media", "exec", "lawman", "fixer", "nomad",
      ],
      methods: ["streetrat", "edgerunner", "complete"],
    };
    return meta;
  }

  async function loadOptions(topic, extra) {
    var q = "topic=" + encodeURIComponent(topic);
    if (extra) {
      Object.keys(extra).forEach(function (k) {
        q += "&" + encodeURIComponent(k) + "=" +
          encodeURIComponent(extra[k]);
      });
    }
    var r = await fetch(API + "/options?" + q, {
      credentials: "same-origin",
    });
    if (!r.ok) return null;
    return r.json();
  }

  function setMsg(el, text, isErr) {
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = text;
    el.className = isErr ? "cg-error" : "cg-ok";
  }

  var cssReadyPromise = null;

  /** Inject stylesheets; resolve when chargen.css is applied. */
  function ensureCss() {
    var shell = qs(".site-shell");
    if (shell) shell.classList.add("is-mode-chargen");

    function whenLinkReady(link) {
      return new Promise(function (resolve) {
        if (!link) {
          resolve();
          return;
        }
        // Already applied (cached or previously loaded)
        try {
          if (link.sheet) {
            resolve();
            return;
          }
        } catch (_) { /* cross-origin oddities */ }
        var done = false;
        function finish() {
          if (done) return;
          done = true;
          resolve();
        }
        link.addEventListener("load", finish);
        link.addEventListener("error", finish);
        // Cached sheets sometimes never fire load
        setTimeout(finish, 120);
      });
    }

    function ensureLink(id, href) {
      var el = document.getElementById(id);
      if (el && el.tagName === "LINK") {
        if (el.getAttribute("href") !== href) {
          el.setAttribute("href", href);
        }
        return el;
      }
      var link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
      return link;
    }

    var cgHref = "/site/css/chargen.css?v=20260811hub2";
    var sheetHref = "/site/css/cpr-sheet.css?v=20260811theme";
    var cgLink = ensureLink("site-chargen-css", cgHref);
    ensureLink("site-cpr-sheet-css", sheetHref);

    // Always wait on the current link (href may have been bumped)
    cssReadyPromise = whenLinkReady(cgLink);
    return cssReadyPromise;
  }

  function helpPath(topic) {
    return "/help/" + (topic || "chargen");
  }

  function wikiPath(path) {
    return "/wiki/" + String(path || "").replace(/^\/+/, "");
  }

  /**
   * Site left rail (the Character menu).
   * Approved → deep sheet sections; draft → wizard chrome.
   * site.js calls this from renderLeft so it is not overwritten.
   */
  function paintLeft() {
    var left = qs("[data-site-left-panels]");
    if (!left) return;
    var approved = !!(state &&
      (state.complete ||
        (draft() && draft().chargenComplete)));

    if (approved) {
      var html =
        '<section class="site-menu menu" ' +
        'aria-label="Character sheet">' +
        '<h2 class="site-menu__title">Character</h2>' +
        '<ul class="site-menu__list">';
      LIVE_VIEWS.forEach(function (v) {
        var cur = v.id === liveSheetView;
        html +=
          "<li" + (cur ? ' class="is-current"' : "") + ">" +
          '<a href="#sheet-' + esc(v.id) + '" ' +
          'data-cpr-sheet-view="' + esc(v.id) + '"' +
          (cur ? ' aria-current="page"' : "") +
          ">" + esc(v.label) + "</a></li>";
      });
      html +=
        "</ul></section>" +
        '<section class="site-menu menu">' +
        '<h2 class="site-menu__title">Also</h2>' +
        '<ul class="site-menu__list">' +
        '<li><a href="/play">Play</a></li>' +
        '<li><a href="' + esc(helpPath("sheet")) +
        '">+sheet help</a></li>' +
        '<li><a href="' + esc(wikiPath("rules/chargen")) +
        '">Rules</a></li>' +
        "</ul></section>";
      left.innerHTML = html;
      left.querySelectorAll("[data-cpr-sheet-view]").forEach(
        function (a) {
          a.onclick = function (ev) {
            if (ev && ev.preventDefault) ev.preventDefault();
            liveSheetView =
              a.getAttribute("data-cpr-sheet-view") ||
              "overview";
            // Re-render body only; paintLeft keeps left current
            if (state) renderMain(state);
          };
        },
      );
      return;
    }

    // Draft / pending / gate
    left.innerHTML =
      '<section class="site-menu menu">' +
      '<h2 class="site-menu__title">Character</h2>' +
      '<ul class="site-menu__list">' +
      '<li class="is-current">' +
      '<a href="/chargen" aria-current="page">Sheet</a></li>' +
      "<li><a href=\"" + esc(wikiPath("rules/chargen")) +
      "\">Rules</a></li>" +
      "<li><a href=\"" + esc(helpPath("chargen")) +
      "\">+cg help</a></li>" +
      "</ul></section>";
  }

  /** @deprecated name kept for call sites */
  function paintLiveLeft() {
    paintLeft();
  }

  /** Compact right-rail runner card (not a full sheet dump). */
  function renderRunnerCard(opts) {
    opts = opts || {};
    var d = draft();
    var s = d.stats || {};
    var role = titleCase(d.role || "");
    var method = titleCase(d.chargenMethod || "");
    var nChrome = (d.cyberware || []).length;
    var loadout = (d.roleData && d.roleData.startingGear) || [];
    var nGear = loadout.length;
    var hpMax = d.hp && d.hp.max != null ? d.hp.max : null;
    var eb = d.eurodollars != null ? d.eurodollars : null;
    var hl = d.humanityLoss != null ? d.humanityLoss : 0;
    var empty = !d.role && !d.chargenMethod && !opts.force;

    var html = '<aside class="cg-runner" aria-label="Draft">';
    html += '<header class="cg-runner__head">';
    if (empty) {
      html += '<p class="cg-runner__role">Runner</p>' +
        '<p class="cg-runner__method">Not started</p>';
    } else {
      html += '<p class="cg-runner__role">' +
        esc(role || "—") + "</p>";
      if (method) {
        html += '<p class="cg-runner__method">' +
          esc(method) + "</p>";
      }
    }
    html += "</header>";

    if (!empty) {
      html += '<dl class="cg-runner__metrics">';
      if (hpMax != null) {
        html += '<div><dt>HP</dt><dd>' + esc(String(hpMax)) +
          "</dd></div>";
      }
      if (eb != null) {
        html += '<div><dt>EB</dt><dd>' +
          esc(String(eb).replace(/\B(?=(\d{3})+(?!\d))/g, ",")) +
          "</dd></div>";
      }
      html += '<div><dt>HL</dt><dd>' + esc(String(hl)) +
        "</dd></div>";
      html += '<div><dt>Chrome</dt><dd>' +
        esc(String(nChrome)) + "</dd></div>";
      html += "</dl>";

      var hasStats = STAT_KEYS.some(function (k) {
        return s[k] != null;
      });
      if (hasStats) {
        html += '<ul class="cg-runner__stats" aria-label="Stats">';
        STAT_KEYS.forEach(function (k) {
          var v = s[k] != null ? s[k] : "—";
          html += "<li><span>" + esc(k.toUpperCase()) +
            "</span><strong>" + esc(String(v)) +
            "</strong></li>";
        });
        html += "</ul>";
      }

      // Skills — budget summary only (full list is the stage)
      var sk = d.skills || {};
      var skN = 0;
      var skBad = 0;
      Object.keys(sk).forEach(function (k) {
        var rv = Number(sk[k]);
        if (rv > 0) skN++;
        if (
          d.chargenMethod === "edgerunner" &&
          rv > 0 && (rv < 2 || rv > 6)
        ) {
          skBad++;
        }
      });
      if (skN > 0 || d.chargenSkillPool != null) {
        var methodSk = String(d.chargenMethod || "");
        var skPool = d.chargenSkillPool;
        var spent = null;
        if (methodSk === "streetrat") {
          spent = null;
        } else if (skPool != null) {
          spent = Math.max(0, 86 - Number(skPool));
        }
        html +=
          '<div class="cg-runner__skills-wrap">' +
          '<p class="cg-runner__section">Skills</p>' +
          '<dl class="cg-runner__skill-sum" ' +
          'aria-label="Skill points">';
        if (methodSk === "streetrat") {
          html +=
            "<div><dt>Package</dt><dd>" +
            esc(String(skN)) + " set</dd></div>";
        } else {
          html +=
            "<div><dt>Spent</dt><dd>" +
            (spent != null
              ? esc(String(spent)) + " / 86"
              : "—") +
            "</dd></div>" +
            "<div><dt>Left</dt><dd>" +
            (skPool != null
              ? esc(String(skPool))
              : "—") +
            "</dd></div>" +
            "<div><dt>Ranks</dt><dd>" +
            esc(String(skN)) +
            "</dd></div>";
          if (skBad > 0) {
            html +=
              '<div class="is-bad"><dt>Invalid</dt><dd>' +
              esc(String(skBad)) +
              " (2–6)</dd></div>";
          }
        }
        html += "</dl></div>";
      }

      if (nGear > 0 || nChrome > 0) {
        html += '<p class="cg-runner__foot">';
        if (nGear > 0) {
          html += "<span>" + nGear + " gear</span>";
        }
        if (nChrome > 0) {
          html += (nGear > 0 ? " · " : "") +
            "<span>" + nChrome + " chrome</span>";
        }
        html += "</p>";
      }
    } else {
      html += '<p class="cg-runner__empty">Start chargen to ' +
        "fill this card.</p>";
    }

    html +=
      '<nav class="cg-runner__links" aria-label="Shortcuts">' +
      '<a href="/play">Play</a>' +
      '<a href="/help/chargen">Help</a>' +
      "</nav></aside>";
    return html;
  }

  /** Post-approval right rail — live vitals strip. */
  function renderStreetReadyCard() {
    var d = draft();
    var role = titleCase(d.role || "Edgerunner");
    var rank = d.roleRank != null ? d.roleRank : 4;
    return (
      '<aside class="cg-ready cg-ready--vitals" aria-label="Vitals">' +
      '<header class="cg-ready__head">' +
      '<p class="cg-ready__kicker">Vitals</p>' +
      '<p class="cg-ready__role">' + esc(role) + "</p>" +
      '<p class="cg-ready__sub">Rank ' + esc(String(rank)) +
      " · <span class=\"cg-ready__ok\">Approved</span></p>" +
      "</header>" +
      renderVitalsPanel(d, { compact: true }) +
      '<p class="cg-ready__section">In-game</p>' +
      "<ul class=\"cg-ready__tips\">" +
      "<li><code>+sheet</code> compact strip</li>" +
      "<li><code>+score</code> combat line</li>" +
      "<li>Left: deep sheet sections</li>" +
      "</ul></aside>"
    );
  }

  function paintRight() {
    var right = qs("[data-site-right-panels]");
    if (!right) return;
    if (!state || state.needAuth) {
      right.innerHTML = renderRunnerCard({ force: true });
      return;
    }
    if (state.complete || draft().chargenComplete) {
      right.innerHTML = renderStreetReadyCard();
      return;
    }
    if (state.pending || draft().chargenStatus === "pending") {
      right.innerHTML =
        '<aside class="cg-ready" aria-label="Pending">' +
        '<header class="cg-ready__head">' +
        '<p class="cg-ready__kicker">Status</p>' +
        '<p class="cg-ready__role">Pending</p>' +
        '<p class="cg-ready__sub">Staff review in progress</p>' +
        "</header>" +
        '<p class="cg-ready__lead">Play unlocks when staff ' +
        "approves your sheet.</p>" +
        '<div class="cg-ready__actions">' +
        '<button type="button" class="cg-btn" data-cpr-refresh>' +
        "Refresh status</button>" +
        "</div></aside>";
      return;
    }
    if (!state.started) {
      right.innerHTML = renderRunnerCard({ force: true });
      return;
    }
    right.innerHTML = renderRunnerCard();
  }

  /** First engine stage key for a phase id. */
  function firstStageForPhase(phaseId) {
    for (var i = 0; i < UI_STAGES.length; i++) {
      if (UI_STAGES[i].phase === phaseId) return UI_STAGES[i].key;
    }
    return "method";
  }

  async function goToStage(stageKey) {
    var key = String(stageKey || "").trim();
    if (!key) return;
    lastRoll = null;
    await setField("stage", key);
    await refresh();
  }

  function renderStepper(curIdx) {
    var stage = stageMetaAt(curIdx);
    var phaseIdx = phaseIndexForStage(stage.key);
    var html =
      '<nav class="cg-progress" aria-label="Chargen progress">' +
      '<ol class="cg-stepper cg-stepper--phases">';

    UI_PHASES.forEach(function (ph, i) {
      var cls = "cg-stepper__item";
      if (i < phaseIdx) cls += " is-done";
      if (i === phaseIdx) cls += " is-current";
      var target = firstStageForPhase(ph.id);
      // Clickable jump — skip walking every lifepath beat
      html +=
        '<li class="' + cls + '">' +
        '<button type="button" class="cg-stepper__btn" ' +
        'data-cpr-goto-stage="' + esc(target) + '" ' +
        'title="Go to ' + esc(ph.name) + '">' +
        '<span class="cg-stepper__num">' + (i + 1) +
        "</span>" +
        '<span class="cg-stepper__label">' +
        esc(ph.short) +
        "</span></button></li>";
    });
    html += "</ol>";

    // Path hub owns its own checklist — no second progress strip
    html += "</nav>";
    return html;
  }

  /** Compact chips of path so far (not a wall of paragraphs). */
  function lpTrailHtml(currentStage) {
    var lp = draft().lifepath || {};
    var chips = [];
    function add(label, val) {
      if (val == null || val === "") return;
      chips.push({ label: label, val: String(val) });
    }
    add("Origin", lp.culturalOrigin);
    add("Lang", lp.language);
    add("Look", lp.personality);
    add("Goal", lp.lifeGoal);
    add("Family", lp.familyBackground);
    add("Crisis", lp.familyCrisis);
    if (lp.friends && lp.friends.length) {
      add("Allies", lp.friends.length + " friend(s)");
    } else if (lp._friendCount === 0) {
      add("Allies", "none");
    }
    if (lp.enemies && lp.enemies.length) {
      add("Foes", lp.enemies.length + " enemy(ies)");
    } else if (lp._enemyCount === 0) {
      add("Foes", "none");
    }
    if (lp.lifeEvents && lp.lifeEvents.length) {
      add("Events", lp.lifeEvents.length);
    }
    if (lp.roleEvents && lp.roleEvents.length) {
      add("Role", lp.roleEvents.length);
    }
    if (!chips.length) return "";
    var html =
      '<div class="cg-lp-trail" data-cpr-lp-trail ' +
      'aria-label="Path so far">';
    chips.forEach(function (c) {
      html +=
        '<span class="cg-lp-trail__chip" title="' +
        esc(c.val) + '">' +
        '<span class="cg-lp-trail__k">' + esc(c.label) +
        "</span> " +
        '<span class="cg-lp-trail__v">' + esc(c.val) +
        "</span></span>";
    });
    html += "</div>";
    void currentStage;
    return html;
  }

  /** Current section result panel. */
  function lpResultHtml(stageKey) {
    var lp = draft().lifepath || {};
    var rows = [];
    var title = "This section";

    if (lastRoll && lastRoll.summary) {
      title = lastRoll.roll === "bundle" || lastRoll.roll == null
        ? "Bundle result"
        : "Rolled " + lastRoll.roll;
      var sm = lastRoll.summary;
      Object.keys(sm).forEach(function (k) {
        var v = sm[k];
        if (v == null || v === "") return;
        if (Array.isArray(v)) {
          v.forEach(function (item, i) {
            if (typeof item === "object" && item) {
              rows.push({
                k: titleCase(k) + " " + (i + 1),
                v: item.description || JSON.stringify(item),
              });
            } else {
              rows.push({
                k: titleCase(k) + " " + (i + 1),
                v: String(item),
              });
            }
          });
        } else if (typeof v === "object") {
          rows.push({ k: titleCase(k), v: JSON.stringify(v) });
        } else {
          rows.push({ k: titleCase(k), v: String(v) });
        }
      });
      if (lastRoll.count != null && !rows.length) {
        rows.push({ k: "Count", v: String(lastRoll.count) });
      }
    } else {
      // Show locked values for this stage if already set
      if (stageKey === "lifepath_cultural" && lp.culturalOrigin) {
        rows.push({ k: "Region", v: lp.culturalOrigin });
        if (lp.language) rows.push({ k: "Language", v: lp.language });
      } else if (
        stageKey === "lifepath_personality" && lp.personality
      ) {
        rows.push({ k: "Personality", v: lp.personality });
        if (lp.clothingStyle) {
          rows.push({ k: "Style", v: lp.clothingStyle });
        }
        if (lp.hairstyle) {
          rows.push({ k: "Hair", v: lp.hairstyle });
        }
      } else if (
        stageKey === "lifepath_motivations" && lp.lifeGoal
      ) {
        rows.push({ k: "Goal", v: lp.lifeGoal });
        if (lp.feelingAboutPeople) {
          rows.push({ k: "People", v: lp.feelingAboutPeople });
        }
      } else if (stageKey === "lifepath_family") {
        if (lp.familyBackground) {
          rows.push({ k: "Background", v: lp.familyBackground });
        }
        if (lp.childhoodEnvironment) {
          rows.push({ k: "Childhood", v: lp.childhoodEnvironment });
        }
        if (lp.familyCrisis) {
          rows.push({ k: "Crisis", v: lp.familyCrisis });
        }
      } else if (stageKey === "lifepath_friends") {
        if (lp.friends && lp.friends.length) {
          lp.friends.forEach(function (f, i) {
            rows.push({ k: "Friend " + (i + 1), v: f });
          });
        } else if (lp._friendCount === 0) {
          rows.push({ k: "Friends", v: "None this life" });
        }
      } else if (stageKey === "lifepath_enemies") {
        if (lp.enemies && lp.enemies.length) {
          lp.enemies.forEach(function (e, i) {
            rows.push({
              k: "Enemy " + (i + 1),
              v: e.description || String(e),
            });
          });
        } else if (lp._enemyCount === 0) {
          rows.push({ k: "Enemies", v: "None yet" });
        }
      } else if (
        stageKey === "lifepath_events" &&
        lp.lifeEvents && lp.lifeEvents.length
      ) {
        lp.lifeEvents.forEach(function (e, i) {
          rows.push({ k: "Event " + (i + 1), v: e });
        });
      } else if (
        stageKey === "lifepath_role" &&
        lp.roleEvents && lp.roleEvents.length
      ) {
        lp.roleEvents.forEach(function (e, i) {
          rows.push({ k: "Role " + (i + 1), v: e });
        });
      }
    }

    if (!rows.length) {
      return (
        '<div class="cg-lp-result cg-lp-result--empty ' +
        'cg-lp-result--slim" data-cpr-lp-result>' +
        "<p>Nothing locked yet — roll or pick above.</p>" +
        "</div>"
      );
    }
    // One-line summary when short; multi-row stays compact
    var html =
      '<div class="cg-lp-result cg-lp-result--slim" ' +
      'data-cpr-lp-result>' +
      '<p class="cg-lp-result__title">' + esc(title) + "</p>";
    if (rows.length === 1) {
      html +=
        '<p class="cg-lp-result__one">' +
        '<strong>' + esc(rows[0].k) + "</strong> " +
        esc(rows[0].v) +
        "</p>";
    } else {
      html += '<ul class="cg-lp-result__list">';
      rows.forEach(function (r) {
        html +=
          '<li><span class="cg-lp-result__k">' +
          esc(r.k) +
          '</span><span class="cg-lp-result__v">' +
          esc(r.v) +
          "</span></li>";
      });
      html += "</ul>";
    }
    html += "</div>";
    return html;
  }

  function renderMethod() {
    var cur = String(draft().chargenMethod || "");
    var methods = (meta && meta.methods) || [
      "streetrat", "edgerunner", "complete",
    ];
    var blurb = {
      streetrat: "Book templates — 1d10 STAT row + fixed Role skills.",
      edgerunner: "Fast & dirty — roll STATs; spend 86 on Role skills.",
      complete: "Full point-buy (62 STAT / 86 skill). Maximum control.",
    };
    var html = '<p class="cg-stage__hint">How do you want to build ' +
      "this edgerunner?</p>" +
      '<div class="cg-cards cg-cards--methods">';
    methods.forEach(function (m) {
      var sel = cur === m ? " is-selected" : "";
      html +=
        '<button type="button" class="cg-card' + sel +
        '" data-cpr-set="method" data-cpr-val="' + esc(m) + '">' +
        '<p class="cg-card__name">' + esc(titleCase(m)) + "</p>" +
        '<p class="cg-card__key">' +
        esc(blurb[m] || m) +
        "</p></button>";
    });
    html += "</div>";
    return html;
  }

  function renderRole() {
    var cur = String(draft().role || "");
    var items = (meta && meta.roleItems) ||
      ((meta && meta.roles) || []).map(function (r) {
        return { slug: r, name: titleCase(r) };
      });
    var html = '<p class="cg-stage__hint">Pick your Role. Ability ' +
      "rank starts at 4.</p>" +
      '<div class="cg-cards">';
    items.forEach(function (r) {
      var slug = r.slug || r.name || r;
      var name = r.name || titleCase(slug);
      var ab = r.ability ? titleCase(r.ability) : "";
      var sel = cur === slug ? " is-selected" : "";
      html +=
        '<button type="button" class="cg-card' + sel +
        '" data-cpr-set="role" data-cpr-val="' + esc(slug) + '">' +
        '<p class="cg-card__name">' + esc(name) + "</p>" +
        (ab
          ? '<p class="cg-card__key">' + esc(ab) + "</p>"
          : "") +
        "</button>";
    });
    html += "</div>";
    return html;
  }

  /** True when this lifepath section already has a kept result. */
  function lpStageHasResult(stageKey) {
    var lp = draft().lifepath || {};
    if (stageKey === "lifepath_cultural") return !!lp.culturalOrigin;
    if (stageKey === "lifepath_personality") return !!lp.personality;
    if (stageKey === "lifepath_motivations") return !!lp.lifeGoal;
    if (stageKey === "lifepath_family") {
      return !!(lp.familyBackground && lp.familyCrisis);
    }
    if (stageKey === "lifepath_friends") {
      return (lp.friends && lp.friends.length > 0) ||
        lp._friendCount === 0;
    }
    if (stageKey === "lifepath_enemies") {
      return (lp.enemies && lp.enemies.length > 0) ||
        lp._enemyCount === 0;
    }
    if (stageKey === "lifepath_events") {
      return !!(lp.lifeEvents && lp.lifeEvents.length);
    }
    if (stageKey === "lifepath_role") {
      return !!(lp.roleEvents && lp.roleEvents.length);
    }
    return false;
  }

  function lpFamilyNeedsCrisis() {
    var lp = draft().lifepath || {};
    return !!(lp.familyBackground && !lp.familyCrisis);
  }

  function lpStageSummary(stageKey) {
    var lp = draft().lifepath || {};
    if (stageKey === "lifepath_cultural") {
      if (!lp.culturalOrigin) return "";
      return lp.culturalOrigin +
        (lp.language ? " · " + lp.language : "");
    }
    if (stageKey === "lifepath_personality") {
      if (!lp.personality) return "";
      var bits = [lp.personality];
      if (lp.clothingStyle) bits.push(lp.clothingStyle);
      if (lp.hairstyle) bits.push(lp.hairstyle);
      if (lp.affectation) bits.push(lp.affectation);
      return bits.join(" · ");
    }
    if (stageKey === "lifepath_motivations") {
      if (!lp.lifeGoal) return "";
      var m = [lp.lifeGoal];
      if (lp.mostValuablePerson) m.push(lp.mostValuablePerson);
      if (lp.mostValuableThing) m.push(lp.mostValuableThing);
      if (lp.feelingAboutPeople) m.push(lp.feelingAboutPeople);
      return m.join(" · ");
    }
    if (stageKey === "lifepath_family") {
      if (!lp.familyBackground) return "";
      var f = [lp.familyBackground];
      if (lp.childhoodEnvironment) f.push(lp.childhoodEnvironment);
      if (lp.familyCrisis) f.push(lp.familyCrisis);
      else f.push("crisis still open");
      return f.join(" · ");
    }
    if (stageKey === "lifepath_friends") {
      if (lp._friendCount === 0) return "None this life";
      if (lp.friends && lp.friends.length) {
        return lp.friends.map(function (x) {
          return String(x);
        }).join(" · ");
      }
      return "";
    }
    if (stageKey === "lifepath_enemies") {
      if (lp._enemyCount === 0) return "None yet";
      if (lp.enemies && lp.enemies.length) {
        return lp.enemies.map(function (e) {
          return e && e.description
            ? String(e.description)
            : String(e);
        }).join(" · ");
      }
      return "";
    }
    if (stageKey === "lifepath_events") {
      if (lp.lifeEvents && lp.lifeEvents.length) {
        return lp.lifeEvents.map(function (e) {
          return String(e);
        }).join(" · ");
      }
      return "";
    }
    if (stageKey === "lifepath_role") {
      if (lp.roleEvents && lp.roleEvents.length) {
        return lp.roleEvents.map(function (e) {
          return String(e);
        }).join(" · ");
      }
      return "";
    }
    return "";
  }

  function lpItemsForStage(stageKey) {
    var bag = catalogs.lifepathByStage || {};
    if (stageKey === "lifepath_family" && lpFamilyNeedsCrisis()) {
      var c = bag["lifepath_family_crisis"];
      return (c && c.items) || [];
    }
    var b = bag[stageKey];
    return (b && b.items) || [];
  }

  function lpMaxN(stageKey) {
    return stageKey === "lifepath_role" ? 6 : 10;
  }

  function lpIsBundle(stageKey) {
    return stageKey === "lifepath_friends" ||
      stageKey === "lifepath_enemies";
  }

  function lpAllDone() {
    for (var i = 0; i < PATH_STAGES.length; i++) {
      if (!lpStageHasResult(PATH_STAGES[i].key)) return false;
    }
    return true;
  }

  function lpDoneCount() {
    var n = 0;
    for (var i = 0; i < PATH_STAGES.length; i++) {
      if (lpStageHasResult(PATH_STAGES[i].key)) n++;
    }
    return n;
  }

  /**
   * Single-screen lifepath hub — every beat on one list.
   * Path is one phase: roll/pick here, Next jumps to Stats.
   */
  function renderLifepathHub() {
    var done = lpDoneCount();
    var total = PATH_STAGES.length;
    var all = lpAllDone();
    var open = total - done;

    var html =
      '<div class="cg-lp cg-lp--hub" data-cpr-lp-hub>' +
      '<div class="cg-lp-hub__head">' +
      '<div class="cg-lp-hub__copy">' +
      '<p class="cg-lp-hub__kicker">// PATH</p>' +
      '<p class="cg-lp-hub__lead">' +
      (all
        ? "Path locked — hit Next for STATs, or reroll any beat."
        : "Fill the list once. " +
          "<strong>Roll all open</strong> fills blanks, " +
          "or pick per row. Next leaves Path.") +
      "</p></div>" +
      '<div class="cg-lp-hub__actions">' +
      '<button type="button" class="cg-btn cg-btn--primary ' +
      'cg-lp-hub__roll-all" data-cpr-lp-roll-all' +
      (all ? " disabled" : "") +
      ">" +
      (all
        ? "All set"
        : open === total
        ? "Roll entire path"
        : "Roll " + open + " open") +
      "</button>" +
      '<span class="cg-lp-hub__count" data-cpr-lp-count>' +
      done + " / " + total +
      "</span>" +
      "</div></div>";

    html += '<ul class="cg-lp-hub__list">';
    PATH_STAGES.forEach(function (ps) {
      var key = ps.key;
      var ok = lpStageHasResult(key);
      var midCrisis = key === "lifepath_family" &&
        lpFamilyNeedsCrisis();
      var summary = lpStageSummary(key);
      var items = lpItemsForStage(key);
      var bundle = lpIsBundle(key);
      var cls = "cg-lp-hub__row";
      if (ok) cls += " is-done";
      if (midCrisis) cls += " is-partial";
      if (!ok && !midCrisis) cls += " is-open";

      html +=
        '<li class="' + cls + '" data-cpr-lp-row="' +
        esc(key) + '">' +
        '<div class="cg-lp-hub__status" aria-hidden="true">' +
        (ok ? "✓" : midCrisis ? "!" : "○") +
        "</div>" +
        '<div class="cg-lp-hub__main">' +
        '<p class="cg-lp-hub__name">' + esc(ps.name) +
        (midCrisis
          ? ' <span class="cg-lp-hub__tag">needs crisis</span>'
          : "") +
        "</p>" +
        '<p class="cg-lp-hub__sum' +
        (summary ? "" : " is-empty") + '">' +
        esc(summary || "— roll or pick —") +
        "</p></div>" +
        '<div class="cg-lp-hub__ctrls">';

      // Fixed label length so every row's Roll column matches
      var rollLab = ok ? "Reroll" : "Roll";
      html +=
        '<button type="button" class="cg-btn cg-btn--tiny ' +
        'cg-lp-hub__btn' +
        (ok ? "" : " cg-btn--primary") +
        '" data-cpr-lp-roll="' + esc(key) + '">' +
        rollLab +
        "</button>";

      // Always render select slot (bundle rows get a disabled
      // placeholder) so control columns stay uniform width.
      if (bundle) {
        html +=
          '<select class="cg-lp-hub__select is-bundle" disabled ' +
          'aria-label="' + esc(ps.name) + ' is a roll bundle">' +
          "<option>Bundle roll</option></select>";
      } else {
        html +=
          '<select class="cg-lp-hub__select" ' +
          'data-cpr-lp-pick="' + esc(key) + '" ' +
          'aria-label="Pick ' + esc(ps.name) + '">' +
          '<option value="">Pick…</option>';
        items.forEach(function (it) {
          var lab = it.n + ". " + (it.label || "");
          if (lab.length > 40) lab = lab.slice(0, 37) + "…";
          html +=
            '<option value="' + esc(String(it.n)) + '">' +
            esc(lab) + "</option>";
        });
        html += "</select>";
      }
      html += "</div></li>";
    });
    html += "</ul>" +
      '<p class="cg-lp-hub__foot muted">' +
      "Footer <strong>Next</strong> jumps straight to STATs — " +
      "no eight-step crawl." +
      "</p></div>";
    return html;
  }

  function renderLifepathStage(_stageKey) {
    return renderLifepathHub();
  }

  function renderStats() {
    var s = draft().stats || {};
    var method = draft().chargenMethod || "";
    var pool = draft().chargenStatPool;
    var locked = method === "streetrat";
    var html =
      '<p class="cg-stage__hint">';
    if (locked) {
      html += "Streetrat presets are locked. Review and continue.";
    } else if (method === "complete") {
      html += "Complete Package — spend points (2–8 per STAT). " +
        "Remaining: <strong>" +
        esc(String(pool != null ? pool : "?")) +
        "</strong>.";
    } else {
      html += "Edgerunner STATs were rolled — tweak 2–8 if needed.";
    }
    html += "</p>" +
      '<div class="cg-ability-grid">';
    STAT_KEYS.forEach(function (k) {
      var v = Number(s[k] != null ? s[k] : 5);
      html +=
        '<div class="cg-field">' +
        '<label class="cg-field__label">' +
        esc(k.toUpperCase()) +
        "</label>" +
        '<div class="cg-stepper-num">' +
        '<button type="button" data-cpr-stat="' + esc(k) +
        '" data-cpr-delta="-1"' +
        (locked ? " disabled" : "") +
        ' aria-label="Decrease">−</button>' +
        '<span class="cg-stepper-num__val">' + v + "</span>" +
        '<button type="button" data-cpr-stat="' + esc(k) +
        '" data-cpr-delta="1"' +
        (locked ? " disabled" : "") +
        ' aria-label="Increase">+</button>' +
        "</div></div>";
    });
    html += "</div>";
    return html;
  }

  function renderSkills() {
    var d = draft();
    var sk = d.skills || {};
    var method = String(d.chargenMethod || "");
    var pool = d.chargenSkillPool;
    if (pool == null) pool = method === "streetrat" ? 0 : 86;
    var items = (catalogs.skills && catalogs.skills.items) || [];
    var career = (catalogs.skills && catalogs.skills.career) || [];
    var careerSet = {};
    career.forEach(function (n) {
      careerSet[n] = true;
    });
    var locked = method === "streetrat";

    // Only skills this method can actually set
    var fallback = [
      "athletics", "brawling", "concentration", "conversation",
      "education", "evasion", "first_aid", "human_perception",
      "local_expert", "perception", "persuasion", "stealth",
    ].map(function (n) {
      return { slug: n, name: n, basic: true };
    });
    var catalog = items.length ? items : fallback;

    var show = catalog.map(function (s) {
      var slug = s.slug || s.name || s;
      return Object.assign({}, s, {
        slug: slug,
        career: !!(s.career || careerSet[slug]),
      });
    }).filter(function (s) {
      if (method === "edgerunner") {
        // Role package only (book: 86 pts on that list)
        return !!s.career || !!careerSet[s.slug];
      }
      if (method === "streetrat") {
        // Templates: show ranks you have / basics
        return !!s.basic || !!s.career ||
          Number(sk[s.slug] || 0) > 0;
      }
      // complete — entire catalog is buyable
      return true;
    });

    show.sort(function (a, b) {
      var an = String(a.slug || "");
      var bn = String(b.slug || "");
      // Career ★ first for edgerunner/complete readability
      var ga = a.career ? 0 : a.basic ? 1 : 2;
      var gb = b.career ? 0 : b.basic ? 1 : 2;
      if (ga !== gb) return ga - gb;
      return an.localeCompare(bn);
    });

    var html = '<p class="cg-stage__hint">';
    if (locked) {
      html += "Streetrat skill templates are fixed for your Role.";
    } else if (method === "edgerunner") {
      html += "Your Role skills only — spend <strong>86</strong> pts " +
        "(ranks <strong>2–6</strong>). Out-of-range marked " +
        "<strong>!</strong>. (x2 costs double.)";
    } else {
      html += "All skills — <strong>86</strong> points. " +
        "Basics (B) need ≥2 before Next.";
    }
    html += "</p>";

    if (!locked) {
      var spent = 86 - Number(pool);
      if (spent < 0) spent = 0;
      html +=
        '<p class="cg-skill-pool" data-cpr-skill-pool>' +
        "Skill budget: <strong>" + esc(String(spent)) +
        " / 86</strong> spent · <strong>" +
        esc(String(pool)) +
        "</strong> remaining" +
        ' <span class="muted">(rank × cost; x2 skills cost double)</span>' +
        "</p>";
    }

    var invalidN = 0;
    html +=
      '<div class="cg-skill-grid" data-cpr-skills role="list">';

    show.forEach(function (s) {
      var name = s.slug || s.name || s;
      var v = Number(sk[name] != null ? sk[name] : 0);
      var mult = s.cost === 2 ? 2 : 1;
      var isCareer = !!s.career;
      var isBasic = !!s.basic;
      var editable = !locked;
      var needsBand = method === "edgerunner" ||
        (method === "complete" && isBasic);
      var invalid = needsBand && (v < 2 || v > 6);
      if (invalid) invalidN++;
      var cls = "cg-skill-row";
      if (v > 0) cls += " is-set";
      if (isCareer) cls += " is-career";
      if (invalid) cls += " is-invalid";
      var canDown = editable && v > 0;
      var canUp = editable && v < 6 && pool >= mult;
      html +=
        '<div class="' + cls + '" role="listitem" ' +
        (invalid
          ? 'title="Needs rank 2–6 before leaving Skills"'
          : "") +
        ">" +
        '<div class="cg-skill-row__name">' +
        "<span>" + esc(titleCase(name)) +
        (mult === 2 ? " <span class=\"muted\">(x2)</span>" : "") +
        "</span>" +
        (invalid
          ? '<span class="cg-skill-row__tag cg-skill-row__tag--bad" ' +
            'title="Out of range">!</span>'
          : isCareer
          ? '<span class="cg-skill-row__tag" title="Role skill">' +
            "★</span>"
          : isBasic
          ? '<span class="cg-skill-row__tag cg-skill-row__tag--basic" ' +
            'title="Basic">B</span>'
          : "") +
        "</div>" +
        '<div class="cg-skill-row__ctrl">' +
        '<button type="button" class="cg-skill-row__btn" ' +
        'data-cpr-skill="' + esc(name) + '" data-cpr-delta="-1" ' +
        'aria-label="Decrease ' + esc(titleCase(name)) + '"' +
        (canDown ? "" : " disabled") +
        ">−</button>" +
        '<span class="cg-skill-row__val" aria-live="polite">' +
        v +
        "</span>" +
        '<button type="button" class="cg-skill-row__btn" ' +
        'data-cpr-skill="' + esc(name) + '" data-cpr-delta="1" ' +
        'aria-label="Increase ' + esc(titleCase(name)) + '"' +
        (canUp ? "" : " disabled") +
        ">+</button>" +
        "</div></div>";
    });

    html += "</div>";
    if (invalidN > 0 && !locked) {
      html +=
        '<p class="cg-skill-warn" data-cpr-skill-warn>' +
        esc(String(invalidN)) +
        " skill" + (invalidN === 1 ? "" : "s") +
        " still outside 2–6 — raise or fix them before Next." +
        "</p>";
    }
    return html;
  }

  function renderLifestyle() {
    var cur = "";
    var ls = draft().lifestyle;
    if (ls && typeof ls === "object") cur = String(ls.tier || "");
    else if (typeof ls === "string") cur = ls;
    var items = LIFESTYLES;
    if (meta && meta.lifestyleItems) items = meta.lifestyleItems;
    var html =
      '<p class="cg-stage__hint">Monthly burn tier. Seeds starting ' +
      "eddies (1 month advance).</p>" +
      '<div class="cg-cards">';
    items.forEach(function (L) {
      var slug = L.slug || L.name;
      var name = L.name || titleCase(slug);
      var sel = cur === slug ? " is-selected" : "";
      html +=
        '<button type="button" class="cg-card' + sel +
        '" data-cpr-set="lifestyle" data-cpr-val="' +
        esc(slug) + '">' +
        '<p class="cg-card__name">' + esc(name) + "</p>" +
        (L.costEb != null
          ? '<p class="cg-card__key">' +
            esc(String(L.costEb)) + " eb/mo</p>"
          : '<p class="cg-card__key">' + esc(slug) + "</p>") +
        "</button>";
    });
    html += "</div>";
    return html;
  }

  /** Free option slots on a foundation name (mirrors server). */
  function chromeFreeSlots(installed, items, foundation) {
    var foundations = installed.filter(function (c) {
      return (c.name || c) === foundation;
    });
    if (!foundations.length) return 0;
    var fdef = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].name === foundation) {
        fdef = items[i];
        break;
      }
    }
    var per = (fdef && fdef.optionSlots) || 0;
    if (per <= 0) return 0;
    var free = 0;
    foundations.forEach(function (f) {
      var used = 0;
      installed.forEach(function (p) {
        var pname = p.name || p;
        var def = null;
        for (var j = 0; j < items.length; j++) {
          if (items[j].name === pname) {
            def = items[j];
            break;
          }
        }
        if (!def || def.requiresFoundation !== foundation) {
          return;
        }
        var cost = def.slotCost != null ? Number(def.slotCost) : 1;
        if (cost <= 0) return;
        if (p.installedIn) {
          if (p.installedIn === f.id) used += cost;
        } else {
          used += cost;
        }
      });
      free += Math.max(0, per - used);
    });
    return free;
  }

  function chromeCount(installed, name) {
    var n = 0;
    installed.forEach(function (c) {
      if ((c.name || c) === name) n++;
    });
    return n;
  }


  /** Segment meter for inventory side values (HL / SP / cost). */
  function invMeterHtml(n, max, kind) {
    max = max > 0 ? max : 10;
    var v = Math.max(0, Math.min(max, Number(n) || 0));
    var segs = 10;
    var on = Math.round((v / max) * segs);
    var html =
      '<span class="cpr-inv__meter' +
      (kind ? " cpr-inv__meter--" + kind : "") +
      '" aria-hidden="true">';
    var i;
    for (i = 0; i < segs; i++) {
      html +=
        '<span class="cpr-inv__meter-seg' +
        (i < on ? " is-on" : "") +
        '"></span>';
    }
    return html + "</span>";
  }

  function invStatusCell(label, valueHtml, barPct, barKind) {
    var html =
      '<div class="cpr-inv-status__cell">' +
      '<span class="cpr-inv-status__lbl">' + esc(label) +
      "</span>" +
      '<span class="cpr-inv-status__val">' + valueHtml +
      "</span>";
    if (barPct != null) {
      html +=
        '<div class="cpr-inv-status__bar" role="presentation">' +
        '<div class="cpr-inv-status__fill' +
        (barKind ? " cpr-inv-status__fill--" + barKind : "") +
        '" style="width:' +
        Math.max(0, Math.min(100, Math.round(barPct))) +
        '%"></div></div>';
    }
    return html + "</div>";
  }

  function renderChrome() {
    var d = draft();
    var installed = d.cyberware || [];
    var countBy = {};
    installed.forEach(function (c) {
      var n = c.name || c;
      countBy[n] = (countBy[n] || 0) + 1;
    });
    var names = Object.keys(countBy).sort(function (a, b) {
      return titleCase(a).localeCompare(titleCase(b));
    });
    var items = (catalogs.chrome && catalogs.chrome.items) || [];
    var hl = Number(d.humanityLoss || 0);
    var hlLeft = Math.max(0, 60 - hl);
    var totalPieces = installed.length;

    var order = [
      "fashionware", "neuralware", "chipware", "cyberoptics",
      "cyberaudio", "internal", "external", "cyberlimb",
      "borgware",
    ];
    var groups = {};
    items.forEach(function (c) {
      var cat = c.category || "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(c);
    });
    Object.keys(groups).forEach(function (cat) {
      groups[cat].sort(function (a, b) {
        return String(a.name).localeCompare(String(b.name));
      });
    });
    var cats = order.filter(function (c) {
      return groups[c] && groups[c].length;
    });
    Object.keys(groups).forEach(function (c) {
      if (cats.indexOf(c) < 0) cats.push(c);
    });

    if (!chromeCatTab || cats.indexOf(chromeCatTab) < 0) {
      chromeCatTab = cats[0] || "";
    }
    var activeList = groups[chromeCatTab] || [];

    var sockFree = chromeFreeSlots(
      installed, items, "chipware_socket",
    );
    var sockCount = chromeCount(installed, "chipware_socket");

    var html =
      '<div class="cpr-sheet cg-chrome">' +
      '<p class="cg-stage__hint">Foundations first (Neural Link, ' +
      "Cybereye…). Chipware needs a <strong>Chipware Socket</strong> " +
      "under Neuralware — each socket holds 1 chip.</p>";

    html +=
      '<div class="cpr-inv-status">' +
      invStatusCell(
        "Humanity loss",
        esc(String(hl)) +
          ' <span class="muted">/ 60 · ' +
          esc(String(hlLeft)) + " left</span>",
        (hl / 60) * 100,
        "hl",
      ) +
      invStatusCell(
        "Installed",
        esc(String(totalPieces)) +
          ' <span class="muted">piece' +
          (totalPieces === 1 ? "" : "s") + "</span>",
        null,
        null,
      ) +
      (sockCount
        ? invStatusCell(
          "Chip sockets",
          esc(String(sockFree)) +
            ' <span class="muted">free / ' +
            esc(String(sockCount)) + "</span>",
          sockCount
            ? (sockFree / sockCount) * 100
            : 0,
          null,
        )
        : "") +
      "</div>";

    html +=
      '<section class="cpr-live__block" aria-label="Installed chrome">' +
      '<h3 class="cpr-live__h">Installed' +
      (totalPieces ? " · " + totalPieces : "") +
      "</h3>";
    if (names.length) {
      html += '<ul class="cpr-inv">';
      names.forEach(function (n) {
        var cnt = countBy[n] || 1;
        var piece = installed.filter(function (c) {
          return (c.name || c) === n;
        })[0] || {};
        var pieceHl = piece.hl != null ? Number(piece.hl) : 0;
        html +=
          '<li class="cpr-inv__row is-on">' +
          '<div class="cpr-inv__main">' +
          '<p class="cpr-inv__name">' +
          esc(titleCase(n)) +
          (cnt > 1
            ? ' <span class="muted">×' + cnt + "</span>"
            : "") +
          "</p>" +
          '<p class="cpr-inv__meta">' +
          (piece.category
            ? esc(titleCase(piece.category)) + " · "
            : "") +
          "HL " + esc(String(pieceHl)) +
          (piece.installType
            ? " · " + esc(String(piece.installType))
            : "") +
          "</p></div>" +
          '<div class="cpr-inv__side">' +
          '<div><span class="cpr-inv__val-lbl">HL</span>' +
          '<span class="cpr-inv__val">' +
          esc(String(pieceHl)) +
          "</span></div>" +
          invMeterHtml(pieceHl, 14, "hl") +
          '<div class="cpr-inv__actions">' +
          '<button type="button" class="cpr-inv__btn ' +
          'cpr-inv__btn--off" data-cpr-chrome-rm="' +
          esc(n) +
          '">Remove</button></div></div></li>';
      });
      html += "</ul>";
    } else {
      html +=
        '<p class="cpr-inv__empty">None yet — install from the ' +
        "catalog below, or Next to skip.</p>";
    }
    html += "</section>";

    if (!items.length) {
      html +=
        '<p class="muted">Loading chrome catalog…</p></div>';
      return html;
    }

    if (chromeCatTab === "chipware" && !sockCount) {
      html +=
        '<p class="cpr-inv-tip">No chipware sockets yet. Install ' +
        '<button type="button" class="cg-linkish" ' +
        'data-cpr-chrome-tab="neuralware">Neuralware → ' +
        "Chipware Socket</button> (needs Neural Link) first." +
        "</p>";
    } else if (chromeCatTab === "chipware" && sockFree <= 0) {
      html +=
        '<p class="cpr-inv-tip">All sockets full. Install another ' +
        "Chipware Socket under Neuralware, or remove a chip.</p>";
    }

    html +=
      '<section class="cpr-live__block" aria-label="Chrome catalog">' +
      '<h3 class="cpr-live__h">Catalog</h3>' +
      '<div class="cpr-inv-tabs" role="tablist" ' +
      'aria-label="Chrome category">';
    cats.forEach(function (cat) {
      var n = (groups[cat] || []).length;
      var onN = 0;
      (groups[cat] || []).forEach(function (c) {
        onN += countBy[c.name] || 0;
      });
      var sel = cat === chromeCatTab;
      html +=
        '<button type="button" role="tab" class="cpr-inv-tab' +
        (sel ? " is-active" : "") +
        '" data-cpr-chrome-tab="' + esc(cat) + '" ' +
        'aria-selected="' + (sel ? "true" : "false") + '">' +
        esc(titleCase(cat).replace("Cyber", "")) +
        ' <span class="cpr-inv-tab__n">' + n +
        (onN ? " · " + onN + " on" : "") +
        "</span></button>";
    });
    html += "</div><ul class=\"cpr-inv\">";

    activeList.forEach(function (c) {
      var cnt = countBy[c.name] || 0;
      var multi = !!c.allowMultiple;
      var need = c.requiresFoundation
        ? titleCase(c.requiresFoundation)
        : "";
      var foundN = c.requiresFoundation
        ? chromeCount(installed, c.requiresFoundation)
        : 0;
      var needN = c.paired ? 2 : 1;
      var hasFound = !c.requiresFoundation || foundN >= needN;
      var slotNeed = c.slotCost != null
        ? Number(c.slotCost)
        : (c.requiresFoundation ? 1 : 0);
      var freeOnParent = c.requiresFoundation
        ? chromeFreeSlots(
          installed, items, c.requiresFoundation,
        )
        : 999;
      var hasSlots = slotNeed <= 0 || freeOnParent >= slotNeed;
      var already = cnt > 0 && !multi;
      var pieceHl = Number(c.hl || 0);
      var tooMuch = pieceHl > hlLeft;
      var canAdd = !already && hasFound && hasSlots && !tooMuch;
      var why = "";
      if (!hasFound && need) {
        why = c.paired ? "Needs two " + need : "Needs " + need;
      } else if (!hasSlots && need) {
        why = "No free slots on " + need;
      } else if (already) {
        why = "Already installed";
      } else if (tooMuch) {
        why = "Not enough HL";
      }
      var slotBadge = "";
      if (c.optionSlots) {
        var freeHere = chromeFreeSlots(
          installed, items, c.name,
        );
        if (cnt > 0) {
          slotBadge = freeHere + "/" +
            (Number(c.optionSlots) * cnt) + " free";
        } else {
          slotBadge = c.optionSlots + " slots ea.";
        }
      }
      var cls = "cpr-inv__row";
      if (cnt > 0) cls += " is-on";
      if (!canAdd && cnt === 0) cls += " is-blocked";
      html +=
        '<li class="' + cls + '"' +
        (why ? ' title="' + esc(why) + '"' : "") + ">" +
        '<div class="cpr-inv__main">' +
        '<p class="cpr-inv__name">' +
        esc(titleCase(c.name)) +
        (cnt > 1
          ? ' <span class="muted">×' + cnt + "</span>"
          : "") +
        "</p>" +
        '<p class="cpr-inv__meta">' +
        "<strong>HL " + esc(String(pieceHl)) + "</strong>" +
        (slotNeed
          ? " · " + esc(String(slotNeed)) + " slot" +
            (slotNeed === 1 ? "" : "s")
          : "") +
        (c.installType
          ? " · " + esc(String(c.installType))
          : "") +
        (slotBadge ? " · " + esc(slotBadge) : "") +
        (multi ? " · multi" : "") +
        "</p>";
      if (need || why) {
        html += '<div class="cpr-inv__tags">';
        if (need) {
          html +=
            '<span class="cpr-inv__tag' +
            (hasFound && hasSlots ? " cpr-inv__tag--ok" : "") +
            '">' +
            (hasFound
              ? (hasSlots ? "✓ " : "full · ") + esc(need)
              : "Needs " + esc(need)) +
            (c.paired ? " ×2" : "") +
            "</span>";
        }
        if (why && !canAdd) {
          html +=
            '<span class="cpr-inv__tag cpr-inv__tag--bad">' +
            esc(why) + "</span>";
        }
        html += "</div>";
      }
      html +=
        "</div><div class=\"cpr-inv__side\">" +
        '<div><span class="cpr-inv__val-lbl">HL</span>' +
        '<span class="cpr-inv__val">' +
        esc(String(pieceHl)) +
        "</span></div>" +
        invMeterHtml(pieceHl, 14, "hl") +
        '<div class="cpr-inv__actions">';
      if (canAdd) {
        html +=
          '<button type="button" class="cpr-inv__btn" ' +
          'data-cpr-chrome="' + esc(c.name) +
          '">Install</button>';
      } else if (cnt === 0) {
        html +=
          '<button type="button" class="cpr-inv__btn" ' +
          "disabled>Install</button>";
      }
      if (cnt > 0) {
        html +=
          '<button type="button" class="cpr-inv__btn ' +
          'cpr-inv__btn--off" data-cpr-chrome-rm="' +
          esc(c.name) +
          '">Remove</button>';
      }
      html += "</div></div></li>";
    });
    html += "</ul></section></div>";
    return html;
  }

  function gearFmtEb(n) {
    var s = String(Math.floor(Number(n) || 0));
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function renderGear() {
    var d = draft();
    var g = catalogs.gear || {};
    var loadout = g.loadout ||
      ((d.roleData && d.roleData.startingGear) || []);
    var budget = g.budget != null
      ? Number(g.budget)
      : Number(d.eurodollars || 0);
    var weapons = g.weapons || [];
    var armor = g.armor || [];
    var spent = g.spent;
    if (spent == null) {
      spent = 0;
      loadout.forEach(function (n) {
        var w = weapons.filter(function (x) {
          return x.name === n;
        })[0];
        var a = armor.filter(function (x) {
          return x.name === n;
        })[0];
        spent += Number((w && w.costEb) || (a && a.costEb) || 0);
      });
    }
    var totalPool = budget + spent;
    var pct = totalPool > 0
      ? Math.min(100, Math.round((spent / totalPool) * 100))
      : 0;

    var tabs = [
      { id: "suggested", label: "Suggested" },
      { id: "weapons", label: "Weapons" },
      { id: "armor", label: "Armor" },
    ];
    if (!gearCatTab || !tabs.some(function (t) {
      return t.id === gearCatTab;
    })) {
      gearCatTab = "suggested";
    }

    var suggested = weapons.filter(function (w) {
      return w.suggested;
    }).concat(armor.filter(function (a) {
      return a.suggested;
    }));
    var activeList = gearCatTab === "armor"
      ? armor
      : gearCatTab === "weapons"
      ? weapons
      : suggested;

    function gearLookup(n) {
      var w = weapons.filter(function (x) {
        return x.name === n;
      })[0];
      if (w) return w;
      return armor.filter(function (x) {
        return x.name === n;
      })[0] || null;
    }

    function gearMetaLine(it) {
      if (!it) return "";
      var isArmor = it.kind === "armor" ||
        it.type === "armor" ||
        (it.sp != null && !it.damage);
      if (isArmor) {
        return "SP " +
          esc(String(it.sp != null ? it.sp : "?")) +
          (it.locations && it.locations.length
            ? " · " + esc(it.locations.join("/"))
            : "") +
          (it.penalty
            ? " · pen " + esc(String(it.penalty))
            : "") +
          (it.concealable ? " · conceal" : "");
      }
      return esc(String(it.damage || "?")) +
        (it.rof != null
          ? " · ROF " + esc(String(it.rof))
          : "") +
        (it.hands != null
          ? " · " + esc(String(it.hands)) + "H"
          : "") +
        (it.skill
          ? " · " + esc(titleCase(it.skill))
          : "") +
        (it.weaponType
          ? " · " + esc(titleCase(it.weaponType))
          : "");
    }

    var html =
      '<div class="cpr-sheet cg-gear">' +
      '<p class="cg-stage__hint">Spend leftover eddies on weapons ' +
      "and armor (same as <code>+chargen/gear</code>). " +
      "Role-skill weapons are under Suggested — skip anytime." +
      "</p>";

    html +=
      '<div class="cpr-inv-status">' +
      invStatusCell(
        "Eddies left",
        esc(gearFmtEb(budget)) +
          ' <span class="muted">eb</span>',
        totalPool > 0 ? (budget / totalPool) * 100 : 0,
        "eb",
      ) +
      invStatusCell(
        "Spent",
        esc(gearFmtEb(spent)) +
          (totalPool > 0
            ? ' <span class="muted">/ ' +
              esc(gearFmtEb(totalPool)) + "</span>"
            : ""),
        pct,
        "eb",
      ) +
      invStatusCell(
        "Loadout",
        esc(String(loadout.length)) +
          ' <span class="muted">item' +
          (loadout.length === 1 ? "" : "s") + "</span>",
        null,
        null,
      ) +
      "</div>";

    html +=
      '<section class="cpr-live__block" aria-label="Loadout">' +
      '<h3 class="cpr-live__h">Loadout' +
      (loadout.length ? " · " + loadout.length : "") +
      "</h3>";
    if (loadout.length) {
      html += '<ul class="cpr-inv">';
      loadout.forEach(function (n) {
        var it = gearLookup(n);
        var cost = it ? Number(it.costEb || 0) : 0;
        var isArmor = it && (
          it.kind === "armor" ||
          it.type === "armor" ||
          (it.sp != null && !it.damage)
        );
        html +=
          '<li class="cpr-inv__row is-on">' +
          '<div class="cpr-inv__main">' +
          '<p class="cpr-inv__name">' +
          esc(titleCase(n)) + "</p>" +
          '<p class="cpr-inv__meta">' +
          (gearMetaLine(it) || "—") +
          (cost
            ? " · <strong>" + esc(gearFmtEb(cost)) +
              " eb</strong>"
            : "") +
          "</p></div>" +
          '<div class="cpr-inv__side">' +
          '<div><span class="cpr-inv__val-lbl">' +
          (isArmor ? "SP" : "EB") +
          "</span><span class=\"cpr-inv__val\">" +
          esc(
            isArmor
              ? String(it && it.sp != null ? it.sp : "?")
              : gearFmtEb(cost),
          ) +
          "</span></div>" +
          (isArmor
            ? invMeterHtml(
              it && it.sp != null ? it.sp : 0,
              18,
              "sp",
            )
            : invMeterHtml(
              Math.min(cost, 5000),
              5000,
              "eb",
            )) +
          '<div class="cpr-inv__actions">' +
          '<button type="button" class="cpr-inv__btn ' +
          'cpr-inv__btn--off" data-cpr-gear-rm="' +
          esc(n) +
          '">Remove</button></div></div></li>';
      });
      html += "</ul>";
    } else {
      html +=
        '<p class="cpr-inv__empty">Empty — pick below or Next ' +
        "to skip.</p>";
    }
    html += "</section>";

    if (!weapons.length && !armor.length) {
      html +=
        '<p class="muted">Loading gear catalog…</p></div>';
      return html;
    }

    if (gearCatTab === "suggested" && !suggested.length) {
      html +=
        '<p class="cpr-inv-tip">No role-matched weapons in ' +
        "budget. Browse <button type=\"button\" " +
        'class="cg-linkish" data-cpr-gear-tab="weapons">' +
        "Weapons</button> or " +
        '<button type="button" class="cg-linkish" ' +
        'data-cpr-gear-tab="armor">Armor</button>.</p>';
    }

    html +=
      '<section class="cpr-live__block" aria-label="Gear catalog">' +
      '<h3 class="cpr-live__h">Catalog</h3>' +
      '<div class="cpr-inv-tabs" role="tablist" ' +
      'aria-label="Gear category">';
    tabs.forEach(function (t) {
      var list = t.id === "armor"
        ? armor
        : t.id === "weapons"
        ? weapons
        : suggested;
      var onN = list.filter(function (it) {
        return it.owned || loadout.indexOf(it.name) >= 0;
      }).length;
      var sel = t.id === gearCatTab;
      html +=
        '<button type="button" role="tab" class="cpr-inv-tab' +
        (sel ? " is-active" : "") +
        '" data-cpr-gear-tab="' + esc(t.id) + '" ' +
        'aria-selected="' + (sel ? "true" : "false") + '">' +
        esc(t.label) +
        ' <span class="cpr-inv-tab__n">' + list.length +
        (onN ? " · " + onN + " on" : "") +
        "</span></button>";
    });
    html += '</div><ul class="cpr-inv">';

    if (!activeList.length) {
      html +=
        '<li class="cpr-inv__empty">Nothing in this tab.</li>';
    }

    activeList.forEach(function (it) {
      var on = !!(it.owned || loadout.indexOf(it.name) >= 0);
      var cost = Number(it.costEb || 0);
      var canBuy = !on && cost <= budget;
      var tooRich = !on && cost > budget;
      var isArmor = it.kind === "armor" ||
        it.type === "armor" ||
        (it.sp != null && !it.damage);
      var cls = "cpr-inv__row";
      if (on) cls += " is-on";
      if (tooRich) cls += " is-blocked";
      var why = tooRich
        ? "Need " + gearFmtEb(cost) + " eb"
        : "";
      html +=
        '<li class="' + cls + '"' +
        (why ? ' title="' + esc(why) + '"' : "") +
        (it.description
          ? ' data-tip="' + esc(it.description) + '"'
          : "") +
        ">" +
        '<div class="cpr-inv__main">' +
        '<p class="cpr-inv__name">' +
        esc(titleCase(it.name)) +
        (it.suggested
          ? ' <span class="cpr-inv__tag">role</span>'
          : "") +
        "</p>" +
        '<p class="cpr-inv__meta">' +
        gearMetaLine(it) +
        "</p>";
      if (why) {
        html +=
          '<div class="cpr-inv__tags">' +
          '<span class="cpr-inv__tag cpr-inv__tag--bad">' +
          esc(why) + "</span></div>";
      }
      html +=
        '</div><div class="cpr-inv__side">' +
        '<div><span class="cpr-inv__val-lbl">EB</span>' +
        '<span class="cpr-inv__val">' +
        esc(gearFmtEb(cost)) +
        "</span></div>" +
        (isArmor
          ? invMeterHtml(
            it.sp != null ? it.sp : 0,
            18,
            "sp",
          )
          : invMeterHtml(
            Math.min(cost, 5000),
            5000,
            "eb",
          )) +
        '<div class="cpr-inv__actions">';
      if (canBuy) {
        html +=
          '<button type="button" class="cpr-inv__btn" ' +
          'data-cpr-gear="' + esc(it.name) +
          '">Add</button>';
      } else if (!on) {
        html +=
          '<button type="button" class="cpr-inv__btn" ' +
          "disabled>Add</button>";
      }
      if (on) {
        html +=
          '<button type="button" class="cpr-inv__btn ' +
          'cpr-inv__btn--off" data-cpr-gear-rm="' +
          esc(it.name) +
          '">Remove</button>';
      }
      html += "</div></div></li>";
    });

    html += "</ul></section></div>";
    return html;
  }

  function reviewLifestyleLabel(d) {
    var ls = d.lifestyle;
    var tier = "";
    if (ls && typeof ls === "object") tier = String(ls.tier || "");
    else if (typeof ls === "string") tier = ls;
    if (!tier) return "—";
    for (var i = 0; i < LIFESTYLES.length; i++) {
      if (LIFESTYLES[i].slug === tier) {
        return LIFESTYLES[i].name || titleCase(tier);
      }
    }
    return titleCase(tier);
  }

  function renderPendingGate() {
    var d = draft();
    var notes = String(d.conceptNotes || "").trim();
    return (
      '<header class="cg-header">' +
      '<h2 class="cg-header__title">Awaiting approval</h2>' +
      '<p class="cg-header__sub">Staff is reviewing your ' +
      "edgerunner. Play unlocks when they approve " +
      "(or close the CGEN job).</p></header>" +
      '<div class="cg-review">' +
      '<p class="cg-review__ready" role="status">' +
      "Status: <strong>PENDING</strong> — hang tight.</p>" +
      '<div class="cg-review__hero">' +
      '<div class="cg-review__id">' +
      '<p class="cg-review__role">' +
      esc(titleCase(d.role || "—")) +
      "</p>" +
      '<p class="cg-review__sub">' +
      esc(titleCase(d.chargenMethod || "")) +
      " · rank " + esc(String(d.roleRank || 4)) +
      "</p></div></div>" +
      (notes
        ? '<section class="cg-review__panel">' +
          '<header class="cg-review__panel-h">' +
          "<h4>Your notes</h4></header>" +
          '<p class="cg-review__panel-note">' +
          esc(notes) + "</p></section>"
        : "") +
      '<p class="muted">In-game: staff runs ' +
      "<code>+approve yourname</code> or closes the CGEN " +
      "job. Need edits? Ask them to " +
      "<code>+reject yourname</code>.</p>" +
      '<div class="cg-actions">' +
      '<button type="button" class="cg-btn" data-cpr-refresh>' +
      "Refresh status</button>" +
      "</div></div>"
    );
  }

  function renderReview() {
    var d = draft();
    var s = d.stats || {};
    var sk = d.skills || {};
    var chrome = d.cyberware || [];
    var loadout =
      (d.roleData && d.roleData.startingGear) || [];
    var method = String(d.chargenMethod || "");
    var skN = 0;
    var skBad = 0;
    Object.keys(sk).forEach(function (k) {
      var rv = Number(sk[k]);
      if (rv > 0) skN++;
      if (method === "edgerunner" && rv > 0 &&
        (rv < 2 || rv > 6)) {
        skBad++;
      }
    });
    var skPool = d.chargenSkillPool;
    var skSpent = null;
    if (method !== "streetrat" && skPool != null) {
      skSpent = Math.max(0, 86 - Number(skPool));
    }
    var hpMax = d.hp && d.hp.max != null ? d.hp.max : null;
    var eb = d.eurodollars != null ? d.eurodollars : 0;
    var hl = d.humanityLoss != null ? d.humanityLoss : 0;
    var lsLabel = reviewLifestyleLabel(d);

    var checks = [];
    if (!d.role) checks.push("Pick a Role");
    if (!method) checks.push("Pick a Method");
    if (method === "edgerunner" && skPool != null &&
      Number(skPool) !== 0) {
      checks.push("Spend remaining skill pts (" + skPool + ")");
    }
    if (method === "edgerunner" && skBad > 0) {
      checks.push(skBad + " skill(s) outside 2–6");
    }
    if (method === "complete" && skPool != null &&
      Number(skPool) > 0) {
      checks.push("Skill pts left: " + skPool);
    }
    var notes = String(d.conceptNotes || "").trim();
    var notesLen = notes.length;
    if (notesLen < NOTES_MIN) {
      checks.push(
        "Concept notes — need " + (NOTES_MIN - notesLen) +
          " more characters (min " + NOTES_MIN + ")",
      );
    }
    if (d.chargenRejectReason) {
      checks.push("Staff rejected: " + d.chargenRejectReason);
    }

    var html =
      '<div class="cg-review">' +
      '<p class="cg-stage__hint">Submit for <strong>staff ' +
      "approval</strong>. Play unlocks after review — same as " +
      "<code>+chargen/done</code>. Concept notes are required." +
      "</p>";

    // Hero identity + key metrics
    html +=
      '<div class="cg-review__hero">' +
      '<div class="cg-review__id">' +
      '<p class="cg-review__role">' +
      esc(titleCase(d.role || "—")) +
      "</p>" +
      '<p class="cg-review__sub">' +
      esc(method ? titleCase(method) : "No method") +
      " · rank " + esc(String(d.roleRank || 4)) +
      " · " + esc(lsLabel) +
      "</p></div>" +
      '<dl class="cg-review__metrics">' +
      "<div><dt>HP</dt><dd>" +
      esc(hpMax != null ? String(hpMax) : "—") +
      "</dd></div>" +
      "<div><dt>EB</dt><dd>" +
      esc(gearFmtEb(eb)) +
      "</dd></div>" +
      "<div><dt>HL</dt><dd>" +
      esc(String(hl)) +
      "</dd></div>" +
      "<div><dt>Chrome</dt><dd>" +
      esc(String(chrome.length)) +
      "</dd></div>" +
      "<div><dt>Gear</dt><dd>" +
      esc(String(loadout.length)) +
      "</dd></div>" +
      "</dl></div>";

    if (checks.length) {
      html +=
        '<div class="cg-review__warn" role="status">' +
        "<strong>Before you submit</strong>" +
        "<ul>";
      checks.forEach(function (c) {
        html += "<li>" + esc(c) + "</li>";
      });
      html += "</ul></div>";
    } else {
      html +=
        '<p class="cg-review__ready" role="status">' +
        "Looks solid — hit <strong>Submit for approval</strong>." +
        "</p>";
    }

    // Concept / background notes (required)
    html +=
      '<section class="cg-review__panel">' +
      '<header class="cg-review__panel-h">' +
      "<h4>Concept notes</h4>" +
      '<span class="muted" data-cpr-notes-count>' +
      esc(String(notesLen)) + " / " + NOTES_MIN + " min" +
      "</span></header>" +
      '<p class="cg-review__panel-note muted">' +
      "Who is this edgerunner? Hooks, vibe, ties — staff reads " +
      "this before unlock.</p>" +
      '<textarea class="cg-review__notes" data-cpr-notes ' +
      'rows="6" maxlength="4000" ' +
      'placeholder="Ex-corpo solo hunting the fixers who burned ' +
      "her crew…\">" +
      esc(notes) +
      "</textarea></section>";

    // Stats
    html +=
      '<section class="cg-review__panel">' +
      '<header class="cg-review__panel-h">' +
      "<h4>Stats</h4></header>" +
      '<ul class="cg-review__stats" aria-label="Stats">';
    STAT_KEYS.forEach(function (k) {
      var v = s[k] != null ? s[k] : "—";
      html +=
        "<li><span>" + esc(k.toUpperCase()) +
        "</span><strong>" + esc(String(v)) +
        "</strong></li>";
    });
    html += "</ul></section>";

    // Skills summary
    html +=
      '<section class="cg-review__panel">' +
      '<header class="cg-review__panel-h">' +
      "<h4>Skills</h4>";
    if (method === "streetrat") {
      html +=
        '<span class="muted">' + esc(String(skN)) +
        " package ranks</span>";
    } else if (skSpent != null) {
      html +=
        '<span class="muted">' +
        esc(String(skSpent)) + " / 86 spent · " +
        esc(String(skPool != null ? skPool : "—")) +
        " left</span>";
    }
    html += "</header>";
    if (skBad > 0) {
      html +=
        '<p class="cg-review__panel-note is-bad">' +
        esc(String(skBad)) +
        " rank" + (skBad === 1 ? "" : "s") +
        " outside 2–6 — fix on the Skills stage." +
        "</p>";
    } else if (skN === 0) {
      html +=
        '<p class="cg-review__panel-note muted">' +
        "No skill ranks set.</p>";
    } else {
      html +=
        '<p class="cg-review__panel-note muted">' +
        esc(String(skN)) +
        " skill" + (skN === 1 ? "" : "s") +
        " with ranks — edit on the Skills stage." +
        "</p>";
    }
    html += "</section>";

    // Lifepath
    html +=
      '<section class="cg-review__panel">' +
      '<header class="cg-review__panel-h">' +
      "<h4>Lifepath</h4></header>";
    var trail = lpTrailHtml();
    if (trail) {
      html += trail;
    } else {
      html +=
        '<p class="cg-review__panel-note muted">' +
        "No path entries yet.</p>";
    }
    html += "</section>";

    // Chrome
    html +=
      '<section class="cg-review__panel">' +
      '<header class="cg-review__panel-h">' +
      "<h4>Chrome</h4>" +
      '<span class="muted">' +
      esc(String(chrome.length)) +
      " piece" + (chrome.length === 1 ? "" : "s") +
      (hl ? " · HL " + esc(String(hl)) : "") +
      "</span></header>";
    if (chrome.length) {
      html += '<div class="cg-review__pills">';
      chrome.forEach(function (c) {
        var n = c.name || c;
        html +=
          '<span class="cg-review__pill" title="HL ' +
          esc(String(c.hl != null ? c.hl : "?")) +
          '">' + esc(titleCase(n)) + "</span>";
      });
      html += "</div>";
    } else {
      html +=
        '<p class="cg-review__panel-note muted">' +
        "Meat only — no cyberware.</p>";
    }
    html += "</section>";

    // Gear + lifestyle
    html +=
      '<section class="cg-review__panel">' +
      '<header class="cg-review__panel-h">' +
      "<h4>Loadout</h4>" +
      '<span class="muted">' +
      esc(gearFmtEb(eb)) + " eb · " +
      esc(lsLabel) +
      "</span></header>";
    if (loadout.length) {
      html += '<div class="cg-review__pills">';
      loadout.forEach(function (n) {
        html +=
          '<span class="cg-review__pill">' +
          esc(titleCase(n)) + "</span>";
      });
      html += "</div>";
    } else {
      html +=
        '<p class="cg-review__panel-note muted">' +
        "Empty pockets — add gear or finish as-is.</p>";
    }
    html += "</section>";

    html += "</div>";
    return html;
  }

  function renderStageBody(uiIdx) {
    var key = (UI_STAGES[uiIdx] || UI_STAGES[0]).key;
    if (key === "method") return renderMethod();
    if (key === "role_select") return renderRole();
    if (isLifepath(key)) return renderLifepathStage(key);
    if (key === "stats") return renderStats();
    if (key === "skills") return renderSkills();
    if (key === "lifestyle") return renderLifestyle();
    if (key === "cyberware") return renderChrome();
    if (key === "equipment") return renderGear();
    return renderReview();
  }

  /** Visual bar like in-game +sheet hpBar (filled segments). */
  function renderVitalBar(cur, max, kind, opts) {
    opts = opts || {};
    cur = Number(cur);
    max = Number(max);
    if (!(max > 0) || isNaN(max)) {
      return '<span class="cpr-vbar cpr-vbar--empty">—</span>';
    }
    if (isNaN(cur)) cur = 0;
    cur = Math.max(0, Math.min(max, cur));
    var pct = Math.round((cur / max) * 100);
    var segs = opts.compact
      ? Math.min(12, Math.max(6, max <= 12 ? max : 10))
      : Math.min(20, Math.max(8, max <= 20 ? max : 16));
    var filled = Math.round((cur / max) * segs);
    var tone = "ok";
    if (pct <= 25) tone = "crit";
    else if (pct <= 50) tone = "warn";
    var html =
      '<div class="cpr-vbar cpr-vbar--' + esc(kind || "hp") +
      " is-" + tone +
      (opts.compact ? " cpr-vbar--compact" : "") +
      '" role="img" aria-label="' +
      esc(String(kind || "vital")) + " " + cur + " of " + max +
      '">' +
      '<div class="cpr-vbar__track" aria-hidden="true">';
    var i;
    for (i = 0; i < segs; i++) {
      html +=
        '<span class="cpr-vbar__seg' +
        (i < filled ? " is-on" : "") +
        '"></span>';
    }
    html +=
      "</div>" +
      '<span class="cpr-vbar__num">' +
      esc(String(cur)) + "/" + esc(String(max)) +
      "</span></div>";
    return html;
  }

  function woundClass(ws) {
    ws = String(ws || "healthy").toLowerCase();
    if (ws === "healthy") return "is-ok";
    if (ws === "lightly") return "is-warn";
    if (ws === "seriously" || ws === "mortally") return "is-crit";
    if (ws === "dead") return "is-dead";
    return "";
  }

  /** Shared vitals block — used on the right rail after approve. */
  function renderVitalsPanel(d, opts) {
    opts = opts || {};
    var compact = !!opts.compact;
    var s = d.stats || {};
    var hpCur = d.hp && d.hp.current != null ? Number(d.hp.current) : 0;
    var hpMax = d.hp && d.hp.max != null ? Number(d.hp.max) : 0;
    var stun = d.stun || {};
    var stunCur = stun.current != null ? Number(stun.current) : hpMax;
    var stunMax = stun.max != null ? Number(stun.max) : hpMax;
    var empBase = s.empBase != null
      ? Number(s.empBase)
      : Number(s.emp) || 0;
    var empCur = s.emp != null ? Number(s.emp) : empBase;
    var luckCur = d.luckRemaining != null
      ? Number(d.luckRemaining)
      : (s.luck != null ? Number(s.luck) : 0);
    var luckMax = s.luck != null ? Number(s.luck) : luckCur;
    var hl = d.humanityLoss != null ? Number(d.humanityLoss) : 0;
    var eb = d.eurodollars != null ? d.eurodollars : 0;
    var wound = String(d.woundState || "healthy");
    var bodyArm = d.armorBody;
    var headArm = d.armorHead;
    var sw = d.swThreshold != null
      ? d.swThreshold
      : Math.ceil(hpMax / 2);
    var barOpts = { compact: compact };

    var html =
      '<div class="cpr-live__vitals' +
      (compact ? " cpr-live__vitals--rail" : "") +
      '">' +
      (compact
        ? ""
        : '<h3 class="cpr-live__h">Vitals</h3>') +
      '<div class="cpr-live__vrow">' +
      '<span class="cpr-live__vlbl">HP</span>' +
      renderVitalBar(hpCur, hpMax, "hp", barOpts) +
      "</div>" +
      '<div class="cpr-live__vrow">' +
      '<span class="cpr-live__vlbl">Stun</span>' +
      renderVitalBar(stunCur, stunMax, "stun", barOpts) +
      "</div>" +
      '<div class="cpr-live__vrow">' +
      '<span class="cpr-live__vlbl">EMP</span>' +
      renderVitalBar(empCur, empBase || 1, "emp", barOpts) +
      "</div>" +
      '<div class="cpr-live__vrow">' +
      '<span class="cpr-live__vlbl">Luck</span>' +
      renderVitalBar(luckCur, luckMax || 1, "luck", barOpts) +
      "</div>" +
      '<div class="cpr-live__badges">' +
      '<span class="cpr-badge cpr-badge--wound ' +
      woundClass(wound) + '">' +
      esc(wound.toUpperCase()) +
      "</span>" +
      '<span class="cpr-badge">SW ' + esc(String(sw)) +
      "</span>" +
      '<span class="cpr-badge">HL ' + esc(String(hl)) +
      "</span>" +
      '<span class="cpr-badge">EB ' +
      esc(gearFmtEb(eb)) +
      "</span></div>";

    html += '<div class="cpr-live__armor">';
    if (bodyArm && bodyArm.name) {
      html +=
        '<div class="cpr-live__arm">' +
        '<span class="cpr-live__vlbl">Body</span>' +
        '<span class="cpr-live__arm-name">' +
        esc(titleCase(bodyArm.name)) + "</span>" +
        renderVitalBar(
          bodyArm.currentSp != null
            ? bodyArm.currentSp
            : bodyArm.sp,
          bodyArm.sp,
          "sp",
          barOpts,
        ) +
        "</div>";
    } else {
      html +=
        '<div class="cpr-live__arm cpr-live__arm--empty">' +
        '<span class="cpr-live__vlbl">Body</span>' +
        '<span class="muted">no armor</span></div>';
    }
    if (headArm && headArm.name) {
      html +=
        '<div class="cpr-live__arm">' +
        '<span class="cpr-live__vlbl">Head</span>' +
        '<span class="cpr-live__arm-name">' +
        esc(titleCase(headArm.name)) + "</span>" +
        renderVitalBar(
          headArm.currentSp != null
            ? headArm.currentSp
            : headArm.sp,
          headArm.sp,
          "sp",
          barOpts,
        ) +
        "</div>";
    } else {
      html +=
        '<div class="cpr-live__arm cpr-live__arm--empty">' +
        '<span class="cpr-live__vlbl">Head</span>' +
        '<span class="muted">no armor</span></div>';
    }
    html += "</div></div>";
    return html;
  }

  function liveBlock(title, body, label) {
    return (
      '<section class="cpr-live__block" aria-label="' +
      esc(label || title) + '">' +
      '<h3 class="cpr-live__h">' + esc(title) + "</h3>" +
      body +
      "</section>"
    );
  }

  /** 10-seg rank meter (0–10). */
  function skillMeterHtml(rank) {
    var r = Math.max(0, Math.min(10, Number(rank) || 0));
    var html =
      '<span class="cpr-skill-meter" aria-hidden="true" data-rank="' +
      esc(String(r)) + '">';
    var i;
    for (i = 0; i < 10; i++) {
      html +=
        '<span class="cpr-skill-meter__seg' +
        (i < r ? " is-on" : "") +
        '"></span>';
    }
    return html + "</span>";
  }

  function skillStatFor(name) {
    var items = (catalogs.skills && catalogs.skills.items) || [];
    for (var i = 0; i < items.length; i++) {
      var slug = items[i].slug || items[i].name;
      if (slug === name) {
        return String(items[i].stat || "").toUpperCase();
      }
    }
    return "";
  }

  /** Full catalog from options API (every skill). */
  function allSkillSlugs() {
    var items = (catalogs.skills && catalogs.skills.items) || [];
    var names = items.map(function (s) {
      return s.slug || s.name;
    }).filter(Boolean);
    names.sort(function (a, b) {
      return titleCase(a).localeCompare(titleCase(b));
    });
    return names;
  }

  /** Mini fill under each stat tile (0–10). */
  function statMeterHtml(n, max) {
    max = max > 0 ? max : 10;
    var v = Math.max(0, Math.min(max, Number(n) || 0));
    var on = Math.round((v / max) * 10);
    var html = '<span class="cpr-stat-meter" aria-hidden="true">';
    var i;
    for (i = 0; i < 10; i++) {
      html +=
        '<span class="cpr-stat-meter__seg' +
        (i < on ? " is-on" : "") +
        '"></span>';
    }
    return html + "</span>";
  }

  function statTileHtml(k, s) {
    s = s || {};
    if (k === "emp") {
      var cur = s.emp != null ? Number(s.emp) : 0;
      var base = s.empBase != null ? Number(s.empBase) : cur;
      return (
        '<li class="cpr-stat cpr-stat--emp" data-stat="emp">' +
        '<span class="cpr-stat__lbl">EMP</span>' +
        '<strong class="cpr-stat__val">' +
        esc(String(s.emp != null ? s.emp : "—")) +
        "/" +
        esc(String(s.empBase != null ? s.empBase : "—")) +
        "</strong>" +
        statMeterHtml(cur, Math.max(base || 10, 1)) +
        "</li>"
      );
    }
    var n = s[k] != null ? Number(s[k]) : NaN;
    var display = isFinite(n) ? String(n) : "—";
    var meterN = isFinite(n) ? n : 0;
    var hot = isFinite(n) && n >= 8 ? " is-hot" : "";
    return (
      '<li class="cpr-stat' + hot + '" data-stat="' +
      esc(k) + '">' +
      '<span class="cpr-stat__lbl">' + esc(k.toUpperCase()) +
      "</span>" +
      '<strong class="cpr-stat__val">' + esc(display) +
      "</strong>" +
      statMeterHtml(meterN) +
      "</li>"
    );
  }

  function skillRowHtml(name, rank) {
    var r = Number(rank) || 0;
    var stat = skillStatFor(name);
    var cls = ["cpr-skill"];
    if (r >= 6) cls.push("is-hot");
    if (r <= 0) cls.push("is-empty");

    var badges = stat
      ? '<span class="cpr-skill__stat">' + esc(stat) + "</span>"
      : "";

    return (
      '<li class="' + cls.join(" ") + '" data-skill="' +
      esc(name) + '">' +
      '<div class="cpr-skill__top">' +
      '<span class="cpr-skill__name">' +
      esc(titleCase(name)) + "</span>" +
      '<span class="cpr-skill__badges">' + badges + "</span>" +
      '<strong class="cpr-skill__rank">' + esc(String(r)) +
      "</strong></div>" +
      skillMeterHtml(r) +
      "</li>"
    );
  }

  function fact(label, value, cls) {
    return (
      "<li" + (cls ? ' class="' + cls + '"' : "") + ">" +
      "<span>" + esc(label) + "</span>" +
      "<strong>" + value + "</strong></li>"
    );
  }

  function liveOverviewBody(d) {
    var s = d.stats || {};
    var chrome = d.cyberware || [];
    var loadout =
      (d.roleData && d.roleData.startingGear) || [];
    var notes = String(d.conceptNotes || "").trim();
    var sk = d.skills || {};
    var top = Object.keys(sk)
      .filter(function (k) {
        return Number(sk[k]) > 0;
      })
      .sort(function (a, b) {
        return Number(sk[b]) - Number(sk[a]) ||
          a.localeCompare(b);
      })
      .slice(0, 8);

    var luckCur = d.luckRemaining != null
      ? d.luckRemaining
      : (s.luck != null ? s.luck : "—");
    var luckMax = s.luck != null ? s.luck : "—";

    var facts =
      '<ul class="cpr-facts">' +
      fact(
        "Role",
        esc(titleCase(d.role || "—")) +
          " r" + esc(String(d.roleRank || 4)),
        "is-accent",
      ) +
      fact(
        "Reputation",
        esc(String(d.reputation != null ? d.reputation : 0)),
      ) +
      fact(
        "Eddies",
        esc(gearFmtEb(d.eurodollars != null ? d.eurodollars : 0)),
        "is-money",
      ) +
      fact("Lifestyle", esc(reviewLifestyleLabel(d))) +
      fact(
        "Chrome",
        esc(String(chrome.length)) + " installed",
      ) +
      fact(
        "Luck pool",
        esc(String(luckCur)) + " / " + esc(String(luckMax)),
      ) +
      "</ul>";

    var html = liveBlock("Street", facts);

    // Mini stats strip on overview
    var stats = '<ul class="cpr-live__stats">';
    STAT_KEYS.forEach(function (k) {
      stats += statTileHtml(k, s);
    });
    stats += "</ul>";
    html += liveBlock("Stats", stats);

    if (top.length) {
      var list = '<ul class="cpr-live__skills">';
      top.forEach(function (k) {
        list += skillRowHtml(k, sk[k]);
      });
      list += "</ul>";
      list +=
        '<p class="cpr-live__hint muted">Left menu → Skills ' +
        "for the full list.</p>";
      html += liveBlock("Highlights", list);
    }

    if (loadout.length) {
      var list = '<ul class="cpr-inv">';
      loadout.forEach(function (n) {
        list +=
          '<li class="cpr-inv__row is-on">' +
          '<div class="cpr-inv__main">' +
          '<p class="cpr-inv__name">' +
          esc(titleCase(n)) +
          "</p></div></li>";
      });
      list += "</ul>" +
        '<p class="cpr-live__hint muted">Left menu → Gear for ' +
        "detail.</p>";
      html += liveBlock(
        "Loadout · " + loadout.length,
        list,
      );
    }
    if (chrome.length) {
      var chList = '<ul class="cpr-inv">';
      chrome.slice(0, 6).forEach(function (c) {
        chList +=
          '<li class="cpr-inv__row is-on">' +
          '<div class="cpr-inv__main">' +
          '<p class="cpr-inv__name">' +
          esc(titleCase(c.name || c)) +
          "</p>" +
          '<p class="cpr-inv__meta">HL ' +
          esc(String(c.hl != null ? c.hl : "?")) +
          "</p></div>" +
          '<div class="cpr-inv__side">' +
          invMeterHtml(
            c.hl != null ? c.hl : 0,
            14,
            "hl",
          ) +
          "</div></li>";
      });
      chList += "</ul>";
      if (chrome.length > 6) {
        chList +=
          '<p class="cpr-live__hint muted">+' +
          (chrome.length - 6) +
          " more — Chrome tab.</p>";
      } else {
        chList +=
          '<p class="cpr-live__hint muted">Left menu → Chrome ' +
          "for full list.</p>";
      }
      html += liveBlock(
        "Chrome · " + chrome.length,
        chList,
      );
    }

    if (notes) {
      html += liveBlock(
        "Concept",
        '<p class="cpr-live__notes">' + esc(notes) + "</p>",
      );
    }
    return html;
  }

  function liveStatsBody(d) {
    var s = d.stats || {};
    var list = '<ul class="cpr-live__stats">';
    STAT_KEYS.forEach(function (k) {
      list += statTileHtml(k, s);
    });
    list += "</ul>";
    if (s.luck != null) {
      list +=
        '<ul class="cpr-facts cpr-sheet__list-gap">' +
        fact(
          "Luck pool",
          esc(String(
            d.luckRemaining != null ? d.luckRemaining : s.luck,
          )) +
            " / " + esc(String(s.luck)),
          "is-accent",
        ) +
        fact(
          "Death save",
          esc(String(d.deathSave != null ? d.deathSave : "—")),
        ) +
        "</ul>";
    }
    return liveBlock("Stats", list);
  }

  function liveSkillsBody(d) {
    var sk = d.skills || {};
    var names = allSkillSlugs();
    // Fallback: ranked skills only if catalog not loaded yet
    if (!names.length) {
      names = Object.keys(sk)
        .filter(function (k) {
          return Number(sk[k]) > 0;
        })
        .sort(function (a, b) {
          return titleCase(a).localeCompare(titleCase(b));
        });
    }
    if (!names.length) {
      return liveBlock(
        "Skills",
        '<p class="muted">No skills on sheet yet.</p>',
      );
    }
    var list = '<ul class="cpr-live__skills">';
    names.forEach(function (name) {
      list += skillRowHtml(name, Number(sk[name]) || 0);
    });
    list += "</ul>";
    return liveBlock(
      "Skills · " + names.length,
      list,
      "Skills",
    );
  }

  function liveChromeBody(d) {
    var chrome = d.cyberware || [];
    var s = d.stats || {};
    var hl = d.humanityLoss != null ? Number(d.humanityLoss) : 0;
    var byCat = {};
    chrome.forEach(function (c) {
      var cat = String(c.category || "other");
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push(c);
    });
    var catOrder = [
      "fashionware", "neuralware", "chipware", "cyberoptics",
      "cyberaudio", "internal", "external", "cyberlimb",
      "borgware", "other",
    ];
    var cats = catOrder.filter(function (c) {
      return byCat[c] && byCat[c].length;
    });
    Object.keys(byCat).forEach(function (c) {
      if (cats.indexOf(c) < 0) cats.push(c);
    });

    var body =
      '<div class="cpr-inv-status">' +
      invStatusCell(
        "EMP",
        esc(String(s.emp != null ? s.emp : "—")) +
          ' <span class="muted">/ ' +
          esc(String(s.empBase != null ? s.empBase : "—")) +
          "</span>",
        null,
        null,
      ) +
      invStatusCell(
        "Humanity loss",
        esc(String(hl)) +
          ' <span class="muted">/ 60</span>',
        (hl / 60) * 100,
        "hl",
      ) +
      invStatusCell(
        "Installed",
        esc(String(chrome.length)) +
          ' <span class="muted">piece' +
          (chrome.length === 1 ? "" : "s") + "</span>",
        null,
        null,
      ) +
      "</div>";

    if (!chrome.length) {
      body +=
        '<p class="cpr-inv__empty">Meat only — no cyberware ' +
        "installed.</p>";
    } else {
      cats.forEach(function (cat) {
        body +=
          '<p class="cpr-inv__cat">' +
          esc(titleCase(cat)) +
          " · " + byCat[cat].length +
          "</p><ul class=\"cpr-inv\">";
        byCat[cat].forEach(function (c) {
          var pieceHl = c.hl != null ? Number(c.hl) : 0;
          body +=
            '<li class="cpr-inv__row is-on">' +
            '<div class="cpr-inv__main">' +
            '<p class="cpr-inv__name">' +
            esc(titleCase(c.name || c)) +
            "</p>" +
            '<p class="cpr-inv__meta">' +
            (c.installType
              ? esc(String(c.installType)) + " · "
              : "") +
            "HL " + esc(String(pieceHl)) +
            "</p></div>" +
            '<div class="cpr-inv__side">' +
            '<div><span class="cpr-inv__val-lbl">HL</span>' +
            '<span class="cpr-inv__val">' +
            esc(String(pieceHl)) +
            "</span></div>" +
            invMeterHtml(pieceHl, 14, "hl") +
            "</div></li>";
        });
        body += "</ul>";
      });
    }
    return liveBlock(
      "Chrome" + (chrome.length ? " · " + chrome.length : ""),
      body,
      "Chrome",
    );
  }

  function liveGearBody(d) {
    var loadout = (d.roleData && d.roleData.startingGear) || [];
    var g = catalogs.gear || {};
    var weapons = g.weapons || [];
    var armor = g.armor || [];
    var bodyArm = d.armorBody;
    var headArm = d.armorHead;
    var eb = d.eurodollars != null ? d.eurodollars : 0;

    function lookup(n) {
      var i;
      for (i = 0; i < weapons.length; i++) {
        if (weapons[i].name === n) return weapons[i];
      }
      for (i = 0; i < armor.length; i++) {
        if (armor[i].name === n) return armor[i];
      }
      return null;
    }

    var body =
      '<div class="cpr-inv-status">' +
      invStatusCell(
        "Eddies",
        esc(gearFmtEb(eb)) +
          ' <span class="muted">eb</span>',
        null,
        null,
      ) +
      invStatusCell(
        "Loadout",
        esc(String(loadout.length)) +
          ' <span class="muted">item' +
          (loadout.length === 1 ? "" : "s") + "</span>",
        null,
        null,
      ) +
      "</div>";

    body +=
      '<p class="cpr-inv__cat">Armor</p><ul class="cpr-inv">';
    function armorRow(label, arm) {
      if (arm && arm.name) {
        var sp = arm.currentSp != null ? arm.currentSp : arm.sp;
        var spMax = arm.sp != null ? arm.sp : sp;
        return (
          '<li class="cpr-inv__row is-on">' +
          '<div class="cpr-inv__main">' +
          '<p class="cpr-inv__name">' +
          esc(titleCase(arm.name)) +
          "</p>" +
          '<p class="cpr-inv__meta">' +
          esc(label) +
          (arm.penalty
            ? " · pen " + esc(String(arm.penalty))
            : "") +
          "</p></div>" +
          '<div class="cpr-inv__side">' +
          '<div><span class="cpr-inv__val-lbl">SP</span>' +
          '<span class="cpr-inv__val">' +
          esc(String(sp)) + "/" + esc(String(spMax)) +
          "</span></div>" +
          invMeterHtml(sp, Math.max(spMax || 1, 1), "sp") +
          "</div></li>"
        );
      }
      return (
        '<li class="cpr-inv__row is-blocked">' +
        '<div class="cpr-inv__main">' +
        '<p class="cpr-inv__name">' + esc(label) + "</p>" +
        '<p class="cpr-inv__meta muted">no armor</p>' +
        "</div></li>"
      );
    }
    body += armorRow("Body", bodyArm) + armorRow("Head", headArm);
    body += "</ul>";

    if (loadout.length) {
      body +=
        '<p class="cpr-inv__cat">Loadout · ' +
        loadout.length +
        '</p><ul class="cpr-inv">';
      loadout.forEach(function (n) {
        var it = lookup(n);
        var isArmor = it && (
          it.kind === "armor" ||
          it.type === "armor" ||
          (it.sp != null && !it.damage)
        );
        var meta = "";
        if (it) {
          if (isArmor) {
            meta = "SP " +
              esc(String(it.sp != null ? it.sp : "?")) +
              (it.locations && it.locations.length
                ? " · " + esc(it.locations.join("/"))
                : "");
          } else {
            meta = esc(String(it.damage || "?")) +
              (it.rof != null
                ? " · ROF " + esc(String(it.rof))
                : "") +
              (it.skill
                ? " · " + esc(titleCase(it.skill))
                : "");
          }
          if (it.costEb != null) {
            meta += (meta ? " · " : "") +
              "<strong>" + esc(gearFmtEb(it.costEb)) +
              " eb</strong>";
          }
        }
        body +=
          '<li class="cpr-inv__row is-on">' +
          '<div class="cpr-inv__main">' +
          '<p class="cpr-inv__name">' +
          esc(titleCase(n)) + "</p>" +
          '<p class="cpr-inv__meta">' +
          (meta || "—") +
          "</p></div>" +
          '<div class="cpr-inv__side">' +
          (isArmor
            ? '<div><span class="cpr-inv__val-lbl">SP</span>' +
              '<span class="cpr-inv__val">' +
              esc(String(it.sp != null ? it.sp : "?")) +
              "</span></div>" +
              invMeterHtml(
                it.sp != null ? it.sp : 0,
                18,
                "sp",
              )
            : '<div><span class="cpr-inv__val-lbl">DMG</span>' +
              '<span class="cpr-inv__val" style="font-size:0.8rem">' +
              esc(String((it && it.damage) || "—")) +
              "</span></div>") +
          "</div></li>";
      });
      body += "</ul>";
    } else {
      body +=
        '<p class="cpr-inv__empty">No weapons or kit listed on ' +
        "the sheet.</p>";
    }

    return liveBlock(
      "Gear" + (loadout.length ? " · " + loadout.length : ""),
      body,
      "Gear",
    );
  }

  function liveCombatBody(d) {
    var body =
      '<ul class="cpr-facts">' +
      fact(
        "Wound",
        esc(String(d.woundState || "healthy").toUpperCase()),
        "is-accent",
      ) +
      fact(
        "SW threshold",
        esc(String(d.swThreshold != null ? d.swThreshold : "—")),
      ) +
      fact(
        "Death save",
        esc(String(d.deathSave != null ? d.deathSave : "—")),
      ) +
      fact(
        "HP",
        esc(String(
          d.hp && d.hp.current != null ? d.hp.current : "—",
        )) +
          " / " +
          esc(String(d.hp && d.hp.max != null ? d.hp.max : "—")),
      ) +
      "</ul>" +
      '<p class="cpr-live__hint muted">Live bars + armor SP ' +
      "are on the right rail.</p>";
    var inj = d.criticalInjuries || [];
    if (inj.length) {
      body +=
        '<p class="cpr-live__h cpr-sheet__subh">' +
        "Critical injuries</p><ul class=\"cpr-live__skills\">";
      inj.forEach(function (i) {
        body +=
          "<li><span>" +
          esc(
            "[" +
              String(i.location || "").toUpperCase() +
              "] " +
              (i.name || ""),
          ) +
          "</span><strong>" +
          esc(i.treated ? "treated" : "open") +
          "</strong></li>";
      });
      body += "</ul>";
    }
    return liveBlock("Combat", body);
  }

  function liveEconomyBody(d) {
    var body =
      '<ul class="cpr-facts">' +
      fact(
        "Eddies",
        esc(gearFmtEb(d.eurodollars != null ? d.eurodollars : 0)),
        "is-money",
      ) +
      fact("Lifestyle", esc(reviewLifestyleLabel(d)), "is-accent") +
      fact(
        "Reputation",
        esc(String(d.reputation != null ? d.reputation : 0)),
      ) +
      "</ul>";
    var deeds = d.reputationDeeds || [];
    if (deeds.length) {
      body +=
        '<p class="cpr-live__h cpr-sheet__subh">Known for</p>' +
        '<div class="cpr-sheet__pills">';
      deeds.slice(0, 10).forEach(function (deed) {
        body +=
          '<span class="cpr-sheet__pill cpr-sheet__pill--gear">' +
          esc(String(deed)) +
          "</span>";
      });
      body += "</div>";
    }
    return liveBlock("Economy", body);
  }

  function livePathBody() {
    var trail = lpTrailHtml();
    if (!trail) {
      return liveBlock(
        "Lifepath",
        '<p class="muted">No lifepath recorded.</p>',
      );
    }
    return liveBlock("Lifepath", trail);
  }

  function liveViewBody(d) {
    switch (liveSheetView) {
      case "stats":
        return liveStatsBody(d);
      case "skills":
        return liveSkillsBody(d);
      case "chrome":
        return liveChromeBody(d);
      case "gear":
        return liveGearBody(d);
      case "combat":
        return liveCombatBody(d);
      case "economy":
        return liveEconomyBody(d);
      case "path":
        return livePathBody();
      default:
        return liveOverviewBody(d);
    }
  }

  /**
   * Approved /chargen sheet body.
   * Section nav lives in the site left Character menu.
   */
  function renderLiveSheet() {
    var d = draft();
    var viewLabel = "Overview";
    for (var i = 0; i < LIVE_VIEWS.length; i++) {
      if (LIVE_VIEWS[i].id === liveSheetView) {
        viewLabel = LIVE_VIEWS[i].label;
        break;
      }
    }
    var html =
      '<div class="cpr-sheet cpr-live" data-cpr-live ' +
      'data-cpr-view="' + esc(liveSheetView) + '">' +
      '<header class="cpr-live__id">' +
      '<p class="cpr-live__name">' +
      esc(titleCase(d.role || "Edgerunner")) +
      ' <span class="cpr-live__rank">r' +
      esc(String(d.roleRank || 4)) +
      "</span></p>" +
      '<p class="cpr-live__meta">' +
      esc(titleCase(d.chargenMethod || "")) +
      " · " + esc(reviewLifestyleLabel(d)) +
      ' · <span class="cpr-live__ok">Approved</span></p>' +
      '<p class="cpr-live__hint muted">' +
      esc(viewLabel) +
      " · vitals on the right</p>" +
      "</header>" +
      liveViewBody(d) +
      '<p class="cpr-sheet__foot muted">In chat: ' +
      "<code>+sheet</code> compact · " +
      "<code>+score</code></p></div>";
    return html;
  }

  /**
   * Landing gate — auth or first jack-in.
   * mode: "auth" | "start"
   */
  function renderGate(mode) {
    var auth = mode === "auth";
    var steps = [
      { t: "Method", d: "Streetrat · Edgerunner · Complete" },
      { t: "Role", d: "Ten roles, ability rank 4" },
      { t: "Lifepath", d: "Family, friends, enemies, events" },
      { t: "Build", d: "STATs, skills, chrome, gear" },
      { t: "Street", d: "Submit · staff approve · play" },
    ];
    var html =
      '<div class="cg-gate cg-gate--hero" data-cg-gate="' +
      esc(mode) + '">' +
      '<div class="cg-gate__panel">' +
      '<p class="cg-gate__kicker">' +
      "Night City · Chargen</p>" +
      '<h2 class="cg-gate__title">' +
      (auth ? "Jack in to build" : "Build your edgerunner") +
      "</h2>" +
      '<p class="cg-gate__lead">' +
      (auth
        ? "Sign in to run full Cyberpunk RED creation — " +
          "the same pipeline as in-game <code>+chargen</code>."
        : "Full RED creation on the web: method, role, " +
          "lifepath rolls, STATs, skills, lifestyle, chrome, " +
          "and gear. Matches <code>+chargen</code> stage for " +
          "stage.") +
      "</p>" +
      '<ul class="cg-gate__steps" aria-label="Chargen stages">';
    steps.forEach(function (s, i) {
      html +=
        "<li>" +
        '<span class="cg-gate__step-n">' +
        esc(String(i + 1)) +
        "</span>" +
        '<span class="cg-gate__step-body">' +
        '<strong class="cg-gate__step-t">' +
        esc(s.t) +
        "</strong>" +
        '<span class="cg-gate__step-d">' +
        esc(s.d) +
        "</span></span></li>";
    });
    html +=
      "</ul>" +
      '<div class="cg-gate__cta">';
    if (auth) {
      html +=
        '<a class="cg-btn cg-btn--primary cg-gate__btn" ' +
        'href="/login?next=/chargen">Sign in to continue</a>' +
        '<p class="cg-gate__hint muted">No account? Register ' +
        "from the login screen — first account is staff.</p>";
    } else {
      html +=
        '<button type="button" ' +
        'class="cg-btn cg-btn--primary cg-gate__btn" ' +
        'data-cpr-start>Jack in — begin chargen</button>' +
        '<p class="cg-gate__hint muted">You can also type ' +
        "<code>+chargen</code> in play once you are in-game." +
        "</p>";
    }
    html +=
      "</div>" +
      '<div class="cg-gate__methods" aria-hidden="true">' +
      '<span class="cg-gate__chip">Streetrat</span>' +
      '<span class="cg-gate__chip">Edgerunner</span>' +
      '<span class="cg-gate__chip">Complete</span>' +
      "</div>" +
      "</div></div>";
    return html;
  }

  async function renderMain(st) {
    var main = mainEl || qs(".site-main") || document.body;
    mainEl = main;
    st = st || state;
    // Wait for chargen.css so path/method buttons layout correctly
    // on first paint (no "refresh to get full-width" FOUC).
    try {
      await ensureCss();
    } catch (_) {
      ensureCss();
    }

    if (!st) {
      main.innerHTML =
        '<section class="site-section cg-root">' +
        '<p class="muted">Loading…</p></section>';
      paintRight();
      return;
    }

    if (st.needAuth) {
      main.innerHTML =
        '<section class="site-section cg-root">' +
        renderGate("auth") +
        "</section>";
      paintRight();
      return;
    }

    if (st.complete || draft().chargenComplete) {
      main.innerHTML =
        '<section class="site-section cg-root" data-cg-root>' +
        renderLiveSheet() +
        "</section>";
      paintLeft();
      paintRight();
      return;
    }

    if (st.pending || draft().chargenStatus === "pending") {
      main.innerHTML =
        '<section class="site-section cg-root" data-cg-root>' +
        renderPendingGate() +
        "</section>";
      paintLeft();
      paintRight();
      return;
    }

    if (!st.started) {
      main.innerHTML =
        '<section class="site-section cg-root">' +
        renderGate("start") +
        "</section>";
      paintLeft();
      paintRight();
      wire();
      return;
    }

    var uiIdx = stageIndex(draft().chargenStage);
    var stageMeta = stageMetaAt(uiIdx);
    var phaseIdx = phaseIndexForStage(stageMeta.key);
    var phaseMeta = UI_PHASES[phaseIdx] || UI_PHASES[0];
    var onPath = stageMeta.phase === "path";
    var subLine = "";
    if (onPath) {
      // One phase — no "Cultural Origin (3/8)" crawl label
      subLine = " · " + lpDoneCount() + "/" + PATH_STAGES.length +
        " beats set";
    } else if (stageMeta.name !== phaseMeta.name) {
      subLine = " · " + stageMeta.name;
    }
    var html =
      '<section class="site-section cg-root" data-cg-root>' +
      '<header class="cg-header">' +
      '<h2 class="cg-header__title">Character Generation</h2>' +
      '<p class="cg-header__sub">Phase ' + (phaseIdx + 1) +
      " of " + UI_PHASES.length + " — " +
      esc(phaseMeta.name) + esc(subLine) +
      "</p></header>";

    html += renderStepper(uiIdx);
    html += '<div class="cg-error" data-cpr-error hidden></div>';
    html += '<div class="cg-ok" data-cpr-ok hidden></div>';
    html +=
      '<div class="cg-stage" data-cpr-stage>' +
      '<h3 class="cg-stage__title">' +
      esc(onPath ? "Lifepath" : stageMeta.name) +
      "</h3>" +
      renderStageBody(uiIdx) +
      "</div>";

    var isLast = uiIdx >= UI_STAGES.length - 1;
    var nextLabel = "Next stage";
    if (isLast) nextLabel = "Submit for approval";
    else if (onPath) {
      nextLabel = lpAllDone()
        ? "Continue to Stats →"
        : "Skip to Stats →";
    }
    html +=
      '<div class="cg-actions">' +
      '<button type="button" class="cg-btn" data-cpr-back' +
      (uiIdx <= 0 ? " disabled" : "") +
      ">Back</button>" +
      '<button type="button" class="cg-btn cg-btn--primary" ' +
      'data-cpr-next>' +
      nextLabel +
      "</button>" +
      "</div></section>";

    main.innerHTML = html;
    paintLeft();
    paintRight();
    wire();
  }

  async function ensureStageCatalogs() {
    var d = draft();
    var stage = d.chargenStage || "method";
    var role = d.role || "solo";

    if (isLifepath(stage)) {
      // Prefetch every path table for the hub
      catalogs.lifepathByStage = catalogs.lifepathByStage || {};
      var loads = PATH_STAGES.map(function (ps) {
        return loadOptions("lifepath", {
          stage: ps.key,
          role: role,
        }).then(function (res) {
          catalogs.lifepathByStage[ps.key] = res || { items: [] };
        });
      });
      loads.push(
        loadOptions("lifepath", {
          stage: "lifepath_family",
          role: role,
          crisis: "1",
        }).then(function (res) {
          catalogs.lifepathByStage.lifepath_family_crisis =
            res || { items: [] };
        }),
      );
      await Promise.all(loads);
      catalogs.lifepath =
        catalogs.lifepathByStage[stage] || { items: [] };
    }
    if (stage === "skills") {
      catalogs.skills = await loadOptions("skills", { role: role });
    }
    if (stage === "cyberware") {
      catalogs.chrome = await loadOptions("chrome");
    }
    if (stage === "equipment") {
      try {
        catalogs.gear = await api("GET", "/gear");
      } catch (_) {
        catalogs.gear = null;
      }
    }
    if (stage === "lifestyle" && !(meta && meta.lifestyleItems)) {
      var ls = await loadOptions("lifestyles");
      if (ls && ls.items) meta.lifestyleItems = ls.items;
    }
  }

  async function refresh() {
    try {
      await loadMeta();
      try {
        var ro = await loadOptions("roles");
        if (ro && ro.items && ro.items.length) {
          meta.roleItems = ro.items;
          meta.roles = ro.items.map(function (x) {
            return x.slug;
          });
        }
      } catch (_) { /* ignore */ }

      var data = await api("GET", "");
      var d = data.draft || null;
      if (data.notesMin != null) {
        NOTES_MIN = Number(data.notesMin) || NOTES_MIN;
      }
      var status = data.status ||
        (d && d.chargenStatus) ||
        (data.complete || (d && d.chargenComplete)
          ? "approved"
          : "draft");
      state = {
        started: !!d && !data.complete && status !== "approved",
        complete: !!data.complete ||
          !!(d && d.chargenComplete) ||
          status === "approved",
        pending: status === "pending" || !!data.pending,
        draft: d || {},
        needAuth: false,
      };
      if (state.complete && d) state.started = false;
      if (state.pending) state.started = true;
      if (state.complete && (!d || !d.stats)) {
        try {
          var sh = await fetch(SHEET_API, {
            credentials: "same-origin",
            headers: authHeaders(),
          });
          if (sh.ok) {
            var sj = await sh.json();
            state.draft = sj.sheet || sj || state.draft;
          }
        } catch (_) { /* ignore */ }
      }
      // Role skill package for approved sheet browser
      if (state.complete || state.pending) {
        try {
          var roleSlug =
            (state.draft && state.draft.role) || "solo";
          catalogs.skills = await loadOptions("skills", {
            role: roleSlug,
          });
        } catch (_) { /* ignore */ }
      }
      if (state.started) await ensureStageCatalogs();
    } catch (e) {
      if (e && e.status === 401) {
        state = { needAuth: true };
      } else {
        state = {
          needAuth: false,
          started: false,
          draft: {},
          error: String((e && e.message) || e),
        };
      }
    }
    await renderMain(state);
    if (state && state.error) {
      setMsg(qs("[data-cpr-error]"), state.error, true);
    }
  }

  async function setField(field, value, extra) {
    var body = Object.assign({ field: field, value: value }, extra || {});
    var data = await api("POST", "/set", body);
    if (data.draft) state.draft = data.draft;
    return data;
  }

  function skillCostMult(name) {
    var items = (catalogs.skills && catalogs.skills.items) || [];
    for (var i = 0; i < items.length; i++) {
      if ((items[i].slug || items[i].name) === name) {
        return items[i].cost === 2 ? 2 : 1;
      }
    }
    return 1;
  }

  function scheduleSkillFlush() {
    if (skillFlushTimer) clearTimeout(skillFlushTimer);
    skillFlushTimer = setTimeout(function () {
      skillFlushTimer = null;
      flushSkillPending();
    }, 450);
  }

  async function flushSkillPending() {
    var ranks = skillPending;
    skillPending = {};
    var keys = Object.keys(ranks);
    if (!keys.length) return;
    try {
      await setField("skills", ranks);
      // Soft re-sync once (not per click)
      var data = await api("GET", "");
      if (data.draft && state) {
        state.draft = data.draft;
        paintRight();
        // Re-render skills stage if still there
        if (String(draft().chargenStage) === "skills") {
          renderMain(state);
        }
      }
    } catch (e) {
      setMsg(
        qs("[data-cpr-error]"),
        (e && e.message) || String(e),
        true,
      );
      // Reload authoritative draft
      try {
        await refresh();
      } catch (_) { /* ignore */ }
    }
  }

  /** Recompute remaining pts = 86 − sum(rank × cost) on billable set. */
  function recomputeSkillPoolLocal(d) {
    var method = String(d.chargenMethod || "");
    var sk = d.skills || {};
    var career = (catalogs.skills && catalogs.skills.career) || [];
    var spent = 0;
    var names = Object.keys(sk);
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      if (method === "edgerunner" && career.length &&
        career.indexOf(n) < 0) {
        continue;
      }
      var r = Number(sk[n] || 0);
      if (r <= 0) continue;
      spent += r * skillCostMult(n);
    }
    d.chargenSkillPool = Math.max(0, 86 - spent);
    return d.chargenSkillPool;
  }

  /** Optimistic local skill step — no network until debounce flush. */
  function bumpSkillLocal(name, delta) {
    if (!state || !state.draft) return;
    var d = state.draft;
    if (!d.skills) d.skills = {};
    var cur = Number(d.skills[name] != null ? d.skills[name] : 0);
    var next = Math.max(0, Math.min(6, cur + delta));
    if (next === cur) return;
    // Tentative apply + recompute pool from totals (matches book)
    var prev = d.skills[name];
    d.skills[name] = next;
    var pool = recomputeSkillPoolLocal(d);
    // Reject if over budget (spent would exceed 86)
    var spent = 86 - pool;
    // If we went over, spent calc: pool is max(0,86-spent) so detect over:
    var checkSpent = 0;
    var method = String(d.chargenMethod || "");
    var career = (catalogs.skills && catalogs.skills.career) || [];
    Object.keys(d.skills).forEach(function (n) {
      if (method === "edgerunner" && career.length &&
        career.indexOf(n) < 0) return;
      var r = Number(d.skills[n] || 0);
      if (r > 0) checkSpent += r * skillCostMult(n);
    });
    if (checkSpent > 86) {
      d.skills[name] = prev;
      recomputeSkillPoolLocal(d);
      setMsg(
        qs("[data-cpr-error]"),
        "Not enough skill points (86 total budget).",
        true,
      );
      return;
    }
    skillPending[name] = next;
    setMsg(qs("[data-cpr-error]"), "", false);
    renderMain(state);
    scheduleSkillFlush();
  }

  function scheduleStatFlush() {
    if (statFlushTimer) clearTimeout(statFlushTimer);
    statFlushTimer = setTimeout(function () {
      statFlushTimer = null;
      flushStatPending();
    }, 450);
  }

  async function flushStatPending() {
    var pending = statPending;
    statPending = {};
    var keys = Object.keys(pending);
    if (!keys.length) return;
    try {
      for (var i = 0; i < keys.length; i++) {
        await setField("stat", pending[keys[i]], { stat: keys[i] });
      }
      var data = await api("GET", "");
      if (data.draft && state) {
        state.draft = data.draft;
        paintRight();
        if (String(draft().chargenStage) === "stats") {
          renderMain(state);
        }
      }
    } catch (e) {
      setMsg(
        qs("[data-cpr-error]"),
        (e && e.message) || String(e),
        true,
      );
      try {
        await refresh();
      } catch (_) { /* ignore */ }
    }
  }

  function bumpStatLocal(k, delta) {
    if (!state || !state.draft) return;
    var d = state.draft;
    if (!d.stats) d.stats = {};
    var method = String(d.chargenMethod || "");
    if (method === "streetrat") return;
    var cur = Number(d.stats[k] != null ? d.stats[k] : 5);
    var next = Math.max(2, Math.min(8, cur + delta));
    if (next === cur) return;
    if (method === "complete") {
      var pool = d.chargenStatPool;
      var need = next - cur;
      if (pool != null && need > pool) {
        setMsg(
          qs("[data-cpr-error]"),
          "Not enough STAT points.",
          true,
        );
        return;
      }
      if (pool != null) d.chargenStatPool = pool - need;
    }
    d.stats[k] = next;
    if (k === "emp") d.stats.empBase = next;
    statPending[k] = next;
    setMsg(qs("[data-cpr-error]"), "", false);
    renderMain(state);
    scheduleStatFlush();
  }

  async function flushPendingEdits() {
    if (skillFlushTimer) {
      clearTimeout(skillFlushTimer);
      skillFlushTimer = null;
    }
    if (statFlushTimer) {
      clearTimeout(statFlushTimer);
      statFlushTimer = null;
    }
    await flushSkillPending();
    await flushStatPending();
  }

  async function doRoll(n, reroll, stageKey) {
    var stage = stageKey || draft().chargenStage;
    var body = { stage: stage };
    if (n != null) body.n = n;
    if (reroll) body.reroll = true;
    var data = await api("POST", "/roll", body);
    if (data.draft) state.draft = data.draft;
    lastRoll = {
      stage: stage,
      roll: data.roll != null ? data.roll : "bundle",
      count: data.count,
      summary: data.summary || {},
    };
    if (!Object.keys(lastRoll.summary).length) {
      if (data.friends) lastRoll.summary.friends = data.friends;
      if (data.enemies) lastRoll.summary.enemies = data.enemies;
      if (data.count != null) lastRoll.summary.count = data.count;
    }
    return data;
  }

  /** Roll every unfinished path beat (family may need two passes). */
  async function rollAllUnfinishedPath() {
    var btn = qs("[data-cpr-lp-roll-all]");
    var guard = 0;
    while (!lpAllDone() && guard < 24) {
      guard++;
      var key = null;
      for (var i = 0; i < PATH_STAGES.length; i++) {
        var k = PATH_STAGES[i].key;
        if (!lpStageHasResult(k)) {
          key = k;
          break;
        }
      }
      if (!key) break;
      if (btn) {
        btn.textContent = "Rolling " +
          (PATH_STAGES[pathSubIndex(key)].short || "…") +
          "…";
        btn.disabled = true;
      }
      // Family mid-step: crisis still counts as unfinished
      await doRoll(null, false, key);
    }
    // Park engine stage on last path beat so /next is coherent
    // if something still calls it (UI Next jumps to stats).
    if (lpAllDone()) {
      try {
        await setField("stage", "lifepath_role");
      } catch (_) { /* ignore */ }
    }
  }

  /** Soft band check — matches engine skillsMeetChargenRules. */
  function skillsReadyForNext(d) {
    d = d || draft();
    var method = String(d.chargenMethod || "");
    if (method === "streetrat" || !method) return true;
    var sk = d.skills || {};
    var career = (catalogs.skills && catalogs.skills.career) || [];
    if (method === "edgerunner") {
      if (!career.length) return true;
      for (var i = 0; i < career.length; i++) {
        var r = Number(sk[career[i]] != null ? sk[career[i]] : 0);
        if (r < 2 || r > 6) return false;
      }
      return true;
    }
    // complete — basics ≥ 2
    var basics = [
      "athletics", "brawling", "concentration", "conversation",
      "education", "evasion", "first_aid", "human_perception",
      "local_expert", "perception", "persuasion", "stealth",
    ];
    for (var j = 0; j < basics.length; j++) {
      var br = Number(sk[basics[j]] != null ? sk[basics[j]] : 0);
      if (br < 2) return false;
    }
    return true;
  }

  async function goNext() {
    await flushPendingEdits();
    var d = draft();
    var uiIdx = stageIndex(d.chargenStage);
    var key = (UI_STAGES[uiIdx] || {}).key;

    // Path is one phase — never crawl 8 /next hops
    if (isLifepath(key)) {
      lastRoll = null;
      await goToStage("stats");
      return;
    }

    if (key === "skills" && !skillsReadyForNext(d)) {
      setMsg(
        qs("[data-cpr-error]"),
        "Fix skills marked ! (need ranks 2–6) before continuing.",
        true,
      );
      return;
    }
    if (uiIdx >= UI_STAGES.length - 1) {
      var notesEl = qs("[data-cpr-notes]");
      var notesVal = notesEl
        ? String(notesEl.value || "").trim()
        : String(draft().conceptNotes || "").trim();
      if (notesVal.length < NOTES_MIN) {
        setMsg(
          qs("[data-cpr-error]"),
          "Concept notes required — at least " + NOTES_MIN +
            " characters before submit.",
          true,
        );
        if (notesEl) notesEl.focus();
        return;
      }
      try {
        await setField("notes", notesVal);
      } catch (_) { /* submit will re-validate */ }
      await api("POST", "/submit", { notes: notesVal });
      lastRoll = null;
      await refresh();
      return;
    }
    var data = await api("POST", "/next");
    if (data.draft) state.draft = data.draft;
    lastRoll = null;
    await refresh();
  }

  async function goBack() {
    await flushPendingEdits();
    var d = draft();
    var key = d.chargenStage || "";
    // Path is one phase — Back leaves Path entirely
    if (isLifepath(key)) {
      lastRoll = null;
      await goToStage("role_select");
      return;
    }
    // Stats Back returns to Path hub (not last path sub-stage)
    if (key === "stats") {
      lastRoll = null;
      await goToStage("lifepath_cultural");
      return;
    }
    var data = await api("POST", "/back");
    if (data.draft) state.draft = data.draft;
    lastRoll = null;
    await refresh();
  }

  function withBusy(fn) {
    return async function (ev) {
      if (busy) return;
      busy = true;
      try {
        await fn(ev);
      } catch (e) {
        setMsg(
          qs("[data-cpr-error]"),
          (e && e.message) || String(e),
          true,
        );
      } finally {
        busy = false;
      }
    };
  }

  function wire() {
    var start = qs("[data-cpr-start]");
    if (start) {
      start.onclick = withBusy(async function () {
        await api("POST", "/start", { role: "solo" });
        lastRoll = null;
        await refresh();
      });
    }

    var refreshBtn = qs("[data-cpr-refresh]");
    if (refreshBtn) {
      refreshBtn.onclick = withBusy(async function () {
        await refresh();
      });
    }

    var notesEl = qs("[data-cpr-notes]");
    if (notesEl) {
      var notesTimer = null;
      function bumpNotesCount() {
        var n = String(notesEl.value || "").trim().length;
        var cnt = qs("[data-cpr-notes-count]");
        if (cnt) {
          cnt.textContent = n + " / " + NOTES_MIN + " min";
          cnt.classList.toggle("is-bad", n < NOTES_MIN);
        }
        if (!state.draft) state.draft = {};
        state.draft.conceptNotes = notesEl.value;
      }
      notesEl.oninput = function () {
        bumpNotesCount();
        if (notesTimer) clearTimeout(notesTimer);
        notesTimer = setTimeout(function () {
          notesTimer = null;
          setField("notes", notesEl.value).catch(function () {
            /* ignore while typing */
          });
        }, 600);
      };
      bumpNotesCount();
    }

    document.querySelectorAll("[data-cpr-set]").forEach(function (btn) {
      btn.onclick = withBusy(async function () {
        var field = btn.getAttribute("data-cpr-set");
        var val = btn.getAttribute("data-cpr-val");
        await setField(field, val);
        // Auto-advance method/role like a clean wizard
        if (field === "method" || field === "role" ||
          field === "lifestyle") {
          // role/method already advanced stage server-side
          lastRoll = null;
          await refresh();
          return;
        }
        await refresh();
      });
    });

    document.querySelectorAll("[data-cpr-stat]").forEach(function (btn) {
      btn.onclick = function () {
        if (busy) return;
        var k = btn.getAttribute("data-cpr-stat");
        var delta = Number(btn.getAttribute("data-cpr-delta") || 0);
        bumpStatLocal(k, delta);
      };
    });

    document.querySelectorAll("[data-cpr-skill]").forEach(function (btn) {
      btn.onclick = function () {
        if (busy) return;
        var name = btn.getAttribute("data-cpr-skill");
        var delta = Number(btn.getAttribute("data-cpr-delta") || 1);
        bumpSkillLocal(name, delta);
      };
    });

    var rollBtn = qs("[data-cpr-roll]");
    if (rollBtn) {
      rollBtn.onclick = withBusy(async function () {
        await doRoll();
        await refresh();
      });
    }
    var rerollBtn = qs("[data-cpr-reroll]");
    if (rerollBtn) {
      rerollBtn.onclick = withBusy(async function () {
        await doRoll(null, true);
        await refresh();
      });
    }
    var lpSelect = qs("[data-cpr-lp-select]");
    if (lpSelect) {
      lpSelect.onchange = withBusy(async function () {
        var n = Number(lpSelect.value);
        if (!n || isNaN(n)) return;
        await doRoll(n);
        await refresh();
      });
    }
    var keepBtn = qs("[data-cpr-lp-keep]");
    if (keepBtn) {
      keepBtn.onclick = withBusy(async function () {
        await goNext();
      });
    }
    document.querySelectorAll("[data-cpr-roll-n]").forEach(function (btn) {
      btn.onclick = withBusy(async function () {
        var n = Number(btn.getAttribute("data-cpr-roll-n"));
        await doRoll(n);
        await refresh();
      });
    });

    document.querySelectorAll("[data-cpr-chrome-tab]").forEach(
      function (btn) {
        btn.onclick = function () {
          chromeCatTab = btn.getAttribute("data-cpr-chrome-tab") ||
            "";
          renderMain(state);
        };
      },
    );

    document.querySelectorAll("[data-cpr-chrome]").forEach(function (btn) {
      btn.onclick = withBusy(async function () {
        var name = btn.getAttribute("data-cpr-chrome");
        await setField("chrome", name, { action: "install" });
        await refresh();
      });
    });
    document.querySelectorAll("[data-cpr-chrome-rm]").forEach(
      function (btn) {
        btn.onclick = withBusy(async function () {
          var name = btn.getAttribute("data-cpr-chrome-rm");
          await setField("chrome", name, { action: "remove" });
          await refresh();
        });
      },
    );

    document.querySelectorAll("[data-cpr-gear-tab]").forEach(
      function (btn) {
        btn.onclick = function () {
          gearCatTab = btn.getAttribute("data-cpr-gear-tab") ||
            "";
          renderMain(state);
        };
      },
    );
    document.querySelectorAll("[data-cpr-gear]").forEach(function (btn) {
      btn.onclick = withBusy(async function () {
        var name = btn.getAttribute("data-cpr-gear");
        await setField("gear", name, { action: "add" });
        await refresh();
      });
    });
    document.querySelectorAll("[data-cpr-gear-rm]").forEach(
      function (btn) {
        btn.onclick = withBusy(async function () {
          var name = btn.getAttribute("data-cpr-gear-rm");
          await setField("gear", name, { action: "remove" });
          await refresh();
        });
      },
    );

    var nextBtn = qs("[data-cpr-next]");
    if (nextBtn) {
      nextBtn.onclick = withBusy(async function () {
        await goNext();
      });
    }
    var backBtn = qs("[data-cpr-back]");
    if (backBtn) {
      backBtn.onclick = withBusy(async function () {
        await goBack();
      });
    }

    // Phase pills — jump anywhere in the flow
    document.querySelectorAll("[data-cpr-goto-stage]").forEach(
      function (btn) {
        btn.onclick = withBusy(async function () {
          var key = btn.getAttribute("data-cpr-goto-stage") || "";
          if (!key) return;
          await goToStage(key);
        });
      },
    );

    // Lifepath hub — per-row roll / pick / bulk
    document.querySelectorAll("[data-cpr-lp-roll]").forEach(
      function (btn) {
        btn.onclick = withBusy(async function () {
          var key = btn.getAttribute("data-cpr-lp-roll") || "";
          if (!key) return;
          await doRoll(null, false, key);
          await refresh();
        });
      },
    );
    document.querySelectorAll("[data-cpr-lp-pick]").forEach(
      function (sel) {
        sel.onchange = withBusy(async function () {
          var key = sel.getAttribute("data-cpr-lp-pick") || "";
          var n = Number(sel.value);
          if (!key || !n) return;
          await doRoll(n, false, key);
          await refresh();
        });
      },
    );
    var rollAll = qs("[data-cpr-lp-roll-all]");
    if (rollAll) {
      rollAll.onclick = withBusy(async function () {
        await rollAllUnfinishedPath();
        await refresh();
      });
    }
  }

  async function boot() {
    mainEl = qs(".site-main") || document.body;
    mainEl.innerHTML =
      '<section class="site-section cg-root">' +
      '<p class="muted">Loading…</p></section>';
    paintRight();
    // Kick CSS fetch immediately (shared promise)
    var cssP = ensureCss();
    if (!token()) {
      state = { needAuth: true };
      await cssP;
      await renderMain(state);
      return;
    }
    await cssP;
    await refresh();
  }

  global.SiteCprChargen = {
    boot: boot,
    paintLeft: paintLeft,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
