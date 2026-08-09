/**
 * D&D 5e chargen FE — mirrors CoFD chargen.js patterns:
 *  site-section cg-root, stepper, cg-actions, catalog pickers,
 *  draft sheet in [data-site-right-panels].
 *
 * API: /api/v1/dnd/chargen/*
 * Demo: ?demo=1 — local shell (no auth; Playwright / offline).
 */
(function (global) {
  "use strict";

  var API = "/api/v1/dnd/chargen";
  var SHEET_API = "/api/v1/dnd/sheet";
  var state = null;
  var demo = false;
  try {
    demo = new URLSearchParams(location.search).get("demo") ===
      "1";
  } catch (_) {
    demo = false;
  }
  var opts = {
    classes: [],
    species: [],
    backgrounds: [],
    feats: [],
    skills: [],
    spells: [],
  };
  var busy = false;
  var mainEl = null;

  var ABILS = [
    "strength", "dexterity", "constitution",
    "intelligence", "wisdom", "charisma",
  ];

  var SKILL_MAP = {
    athletics: "strength",
    acrobatics: "dexterity",
    sleight_of_hand: "dexterity",
    stealth: "dexterity",
    arcana: "intelligence",
    history: "intelligence",
    investigation: "intelligence",
    nature: "intelligence",
    religion: "intelligence",
    animal_handling: "wisdom",
    insight: "wisdom",
    medicine: "wisdom",
    perception: "wisdom",
    survival: "wisdom",
    deception: "charisma",
    intimidation: "charisma",
    performance: "charisma",
    persuasion: "charisma",
  };
  var ALL_SKILLS = Object.keys(SKILL_MAP);

  /* ── helpers ─────────────────────────────────────────── */

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function token() {
    try {
      return sessionStorage.getItem("ursamu.webAdmin.token") ||
        "";
    } catch (_) {
      return "";
    }
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
      .replace(/[_-]/g, " ")
      .replace(/\b\w/g, function (c) {
        return c.toUpperCase();
      });
  }

  function draft() {
    return (state && state.draft) || {};
  }

  function pointBuyCost(score) {
    var table = {
      8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
    };
    return table[score] != null ? table[score] : 99;
  }

  function pointsSpent(abilities) {
    var n = 0;
    ABILS.forEach(function (a) {
      n += pointBuyCost(Number(abilities[a]) || 8);
    });
    return n;
  }

  function setMsg(el, text, isErr) {
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.className = isErr ? "cg-error" : "cg-ok";
    el.textContent = text;
  }

  /* ── API ─────────────────────────────────────────────── */

  function demoInit() {
    return {
      started: true,
      stage: 1,
      maxStage: 8,
      stages: [
        { stage: 1, name: "Class", short: "Class" },
        { stage: 2, name: "Origin", short: "Origin" },
        { stage: 3, name: "Abilities", short: "Abils" },
        { stage: 4, name: "Skills", short: "Skills" },
        { stage: 5, name: "Feats", short: "Feats" },
        { stage: 6, name: "Spells", short: "Spells" },
        { stage: 7, name: "Gear", short: "Gear" },
        { stage: 8, name: "Review", short: "Review" },
      ],
      draft: {
        class: "fighter",
        species: "human",
        background: "soldier",
        abilities: {
          strength: 15,
          dexterity: 14,
          constitution: 13,
          intelligence: 10,
          wisdom: 12,
          charisma: 8,
        },
        chosenSkills: ["athletics", "intimidation"],
        chosenFeats: [],
        chosenSpells: [],
        startingGear: "equipment",
      },
    };
  }

  async function api(method, path, body) {
    if (demo) {
      if (!state) state = demoInit();
      return state;
    }
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
    if (!res.ok) {
      var err = new Error(data.error || ("HTTP " + res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function loadOptions(topic, extra) {
    var q = "?topic=" + encodeURIComponent(topic);
    if (extra) {
      Object.keys(extra).forEach(function (k) {
        q += "&" + encodeURIComponent(k) + "=" +
          encodeURIComponent(extra[k]);
      });
    }
    var res = await fetch(API + "/options" + q, {
      credentials: "same-origin",
    });
    if (!res.ok) return [];
    var j = await res.json();
    return j.items || [];
  }

  async function ensureCatalog() {
    if (demo && !opts.classes.length) {
      opts.classes = [
        { slug: "fighter", name: "Fighter" },
        { slug: "wizard", name: "Wizard" },
        { slug: "rogue", name: "Rogue" },
        { slug: "cleric", name: "Cleric" },
      ];
      opts.species = [
        { slug: "human", name: "Human" },
        { slug: "elf", name: "Elf" },
        { slug: "dwarf", name: "Dwarf" },
      ];
      opts.backgrounds = [
        { slug: "soldier", name: "Soldier" },
        { slug: "sage", name: "Sage" },
      ];
      opts.feats = [
        { slug: "alert", name: "Alert" },
        { slug: "tough", name: "Tough" },
      ];
      opts.skills = [
        { slug: "athletics", name: "Athletics" },
        { slug: "intimidation", name: "Intimidation" },
        { slug: "perception", name: "Perception" },
      ];
      opts.spells = [];
      return;
    }
    if (!opts.classes.length) {
      opts.classes = await loadOptions("classes");
    }
    if (!opts.species.length) {
      opts.species = await loadOptions("species");
    }
    if (!opts.backgrounds.length) {
      opts.backgrounds = await loadOptions("backgrounds");
    }
    if (!opts.feats.length) {
      opts.feats = await loadOptions("feats");
    }
  }

  async function refreshClassOpts() {
    var cls = String(draft().class || "").toLowerCase();
    if (!cls) {
      opts.skills = [];
      opts.spells = [];
      return;
    }
    opts.skills = await loadOptions("skills", { class: cls });
    opts.spells = await loadOptions("spells", { class: cls });
  }

  /* ── catalog (CoFD fieldCatalog pattern) ─────────────── */

  function catalogPool(field) {
    if (field === "class") return opts.classes || [];
    if (field === "species") return opts.species || [];
    if (field === "background") return opts.backgrounds || [];
    if (field === "feat") return opts.feats || [];
    if (field === "spell") return opts.spells || [];
    if (field === "skill") return opts.skills || [];
    return [];
  }

  function findCatalogItem(field, raw) {
    var q = String(raw || "").trim().toLowerCase();
    if (!q) return null;
    var pool = catalogPool(field);
    var i;
    for (i = 0; i < pool.length; i++) {
      var slug = String(pool[i].slug || "").toLowerCase();
      var name = String(pool[i].name || "").toLowerCase();
      if (slug === q || name === q) return pool[i];
    }
    for (i = 0; i < pool.length; i++) {
      slug = String(pool[i].slug || "").toLowerCase();
      name = String(pool[i].name || "").toLowerCase();
      if (name.indexOf(q) === 0 || slug.indexOf(q) === 0) {
        return pool[i];
      }
    }
    for (i = 0; i < pool.length; i++) {
      name = String(pool[i].name || "").toLowerCase();
      if (name.indexOf(q) !== -1) return pool[i];
    }
    return null;
  }

  function catalogMetaLine(field, item) {
    if (!item) return "";
    if (field === "class") {
      var bits = [];
      if (item.hitDie) bits.push("d" + item.hitDie);
      if (item.skillCount) {
        bits.push(item.skillCount + " skills");
      }
      if (item.spellcasting) bits.push("caster");
      return bits.join(" · ");
    }
    if (field === "background") {
      var parts = [];
      if (item.feat) parts.push("feat " + titleCase(item.feat));
      if (item.skills && item.skills.length) {
        parts.push(item.skills.map(titleCase).join(", "));
      }
      return parts.join(" · ");
    }
    if (field === "spell" && item.level != null) {
      return item.level === 0
        ? "Cantrip"
        : ("L" + item.level +
          (item.school ? " · " + item.school : ""));
    }
    return item.slug || "";
  }

  function catalogDisplayName(item) {
    if (!item) return "";
    return item.name || titleCase(item.slug || "");
  }

  /** CoFD-style searchable catalog picker. */
  function fieldCatalog(field, label, selectedSlug, hint) {
    var item = findCatalogItem(field, selectedSlug);
    var has = !!item;
    var shown = has
      ? catalogDisplayName(item)
      : (selectedSlug ? titleCase(selectedSlug) : "");
    var id = "cat-" + field;
    var html = '<div class="cg-catalog-picker cg-merit-picker" ' +
      'data-cg-catalog="' + esc(field) + '">';
    html += '<div class="cg-field cg-merit-search-wrap">';
    /* Skip visible label when it duplicates the stage title */
    if (label) {
      html += '<label class="cg-field__label" for="' +
        esc(id) + '">' + esc(label) + "</label>";
    } else {
      html += '<label class="site-sr-only" for="' +
        esc(id) + '">' + esc(field) + "</label>";
    }
    if (hint) {
      html += '<p class="cg-catalog-hint muted">' + esc(hint) +
        "</p>";
    }
    html += '<input type="search" class="cg-input" id="' +
      esc(id) + '" data-cg-cat-search="' + esc(field) +
      '" autocomplete="off" placeholder="Search…" value="' +
      esc(shown) + '" />' +
      '<ul class="cg-merit-suggest" data-cg-cat-suggest="' +
      esc(field) + '" hidden></ul></div>';
    html += '<div class="cg-merit-detail" data-cg-cat-detail="' +
      esc(field) + '"' + (has ? "" : " hidden") + ">" +
      '<p class="cg-merit-detail__name" data-cg-cat-name>' +
      esc(shown) + "</p>" +
      '<p class="cg-merit-detail__meta muted" ' +
      'data-cg-cat-meta>' +
      esc(has ? catalogMetaLine(field, item) : "") +
      "</p>" +
      '<button type="button" class="cg-btn cg-btn--tiny" ' +
      'data-cg-cat-clear="' + esc(field) +
      '">Clear</button></div>';
    html += "</div>";
    return html;
  }

  function chips(items, chosen, trait, maxN) {
    var set = {};
    (chosen || []).forEach(function (c) {
      set[String(c).toLowerCase()] = true;
    });
    var html =
      '<p class="cg-stage__hint">Pick ' +
      (maxN != null ? maxN : "any") +
      " · selected " +
      (chosen || []).length +
      "</p>" +
      '<div class="cg-chips">';
    (items || []).forEach(function (it) {
      var slug = it.slug || it;
      var name = it.name || titleCase(slug);
      var on = !!set[String(slug).toLowerCase()];
      html +=
        '<button type="button" class="cg-chip' +
        (on ? " is-on" : "") +
        '" data-cg-toggle="' + esc(trait) +
        '" data-cg-val="' + esc(slug) + '">' +
        esc(name) +
        "</button>";
    });
    html += "</div>";
    return html;
  }

  function renderAbilities() {
    var ab = draft().abilities || {};
    var spent = pointsSpent(ab);
    var html =
      '<p class="cg-stage__hint">Point buy (27 points). ' +
      "Scores 8–15. Spent: <strong>" + spent +
      "</strong> / 27.</p>" +
      '<div class="cg-ability-grid">';
    ABILS.forEach(function (a) {
      var v = Number(ab[a]) || 8;
      html +=
        '<div class="cg-field">' +
        '<label class="cg-field__label">' +
        esc(titleCase(a)) +
        "</label>" +
        '<div class="cg-stepper-num">' +
        '<button type="button" data-cg-abil="' + a +
        '" data-cg-delta="-1" ' +
        (v <= 8 ? "disabled" : "") +
        ">−</button>" +
        '<span class="cg-stepper-num__val">' + v +
        "</span>" +
        '<button type="button" data-cg-abil="' + a +
        '" data-cg-delta="1" ' +
        (v >= 15 ? "disabled" : "") +
        ">+</button>" +
        "</div></div>";
    });
    html += "</div>";
    return html;
  }

  function renderGear() {
    var g = draft().startingGear || "equipment";
    return (
      '<p class="cg-stage__hint">Starting package or gold.</p>' +
      '<div class="cg-cards">' +
      '<button type="button" class="cg-card' +
      (g === "equipment" ? " is-selected" : "") +
      '" data-cg-set="gear" data-cg-val="equipment">' +
      '<p class="cg-card__name">Equipment</p>' +
      '<p class="cg-card__key">Class starting kit</p>' +
      "</button>" +
      '<button type="button" class="cg-card' +
      (g === "gold" ? " is-selected" : "") +
      '" data-cg-set="gear" data-cg-val="gold">' +
      '<p class="cg-card__name">Gold</p>' +
      '<p class="cg-card__key">Buy later in town</p>' +
      "</button></div>"
    );
  }

  function renderSummary() {
    var d = draft();
    var ab = d.abilities || {};
    var lines = [
      "Class: " + (d.class || "—"),
      "Species: " + (d.species || "—"),
      "Background: " + (d.background || "—"),
      "Abilities: " +
        ABILS.map(function (a) {
          return a.slice(0, 3).toUpperCase() + " " +
            (ab[a] || 8);
        }).join("  "),
      "Skills: " +
        ((d.chosenSkills || []).map(titleCase).join(", ") ||
          "—"),
      "Feats: " +
        ((d.chosenFeats || []).map(titleCase).join(", ") ||
          "—"),
      "Spells: " +
        ((d.chosenSpells || []).map(titleCase).join(", ") ||
          "—"),
      "Gear: " + (d.startingGear || "equipment"),
    ];
    return (
      '<pre class="cg-sheet-pre">' +
      esc(lines.join("\n")) +
      "</pre>"
    );
  }

  /* ── right rail — compact draft + quick links ─────────
   * Desktop-only (hidden ≤1024). Keep narrow: no long lists.
   */

  function railBlock(label, valueHtml) {
    return (
      '<div class="cg-sheet__block">' +
      '<p class="cg-sheet__label">' + esc(label) + "</p>" +
      '<p class="cg-sheet__value">' + valueHtml + "</p>" +
      "</div>"
    );
  }

  function renderSheetSummary() {
    var d = draft();
    var ab = d.abilities || {};
    var cls = findCatalogItem("class", d.class);
    var clsName = catalogDisplayName(cls) ||
      titleCase(d.class) || "—";
    var spent = pointsSpent(ab);
    var left = Math.max(0, 27 - spent);
    var nSk = (d.chosenSkills || []).length;
    var nFt = (d.chosenFeats || []).length;
    var nSp = (d.chosenSpells || []).length;
    var html = '<div class="cg-sheet cg-sheet--rail">';

    if (state.stage != null && state.maxStage != null) {
      html += railBlock(
        "Stage",
        esc(String(state.stage)) + " / " +
          esc(String(state.maxStage)) +
          (state.stageName
            ? " · " + esc(state.stageName)
            : ""),
      );
    }

    html += railBlock("Class", esc(clsName));
    html += railBlock(
      "Origin",
      esc(titleCase(d.species || "—")) + "<br>" +
        esc(titleCase(d.background || "—")),
    );

    html += '<div class="cg-sheet__block">' +
      '<p class="cg-sheet__label">Abilities</p>' +
      '<ul class="cg-sheet__abils" aria-label="Ability scores">';
    ABILS.forEach(function (a) {
      html += "<li><span>" +
        esc(a.slice(0, 3).toUpperCase()) +
        "</span><strong>" + (ab[a] || 8) +
        "</strong></li>";
    });
    html += "</ul></div>";

    html += railBlock(
      "Point buy",
      esc(String(spent)) + " / 27 used" +
        (left > 0
          ? ' <span class="cg-sheet__muted">(' +
            left + " left)</span>"
          : left === 0
          ? ' <span class="cg-sheet__ok">ok</span>'
          : ""),
    );

    html += railBlock(
      "Picks",
      "Skills " + nSk +
        " · Feats " + nFt +
        " · Spells " + nSp,
    );
    html += railBlock(
      "Gear",
      esc(titleCase(d.startingGear || "equipment")),
    );

    if (state.validationError && state.canAdvance === false) {
      html += '<p class="cg-sheet__warn">' +
        esc(state.validationError) + "</p>";
    }

    html += "</div>";
    return html;
  }

  function renderQuickLinks() {
    return (
      '<section class="site-menu menu cg-rail-links">' +
      '<h2 class="site-menu__title">Quick links</h2>' +
      '<ul class="site-menu__list">' +
      "<li><a href=\"/help/chargen\">+cg help</a></li>" +
      "<li><a href=\"/wiki/rules/chargen\">Chargen rules</a></li>" +
      "<li><a href=\"/play\">Play Online</a></li>" +
      "<li><a href=\"/help/\">Help index</a></li>" +
      "</ul></section>"
    );
  }

  /* ── Live D&D 5e character sheet (approved) ─────────── */

  function abilMod(score) {
    return Math.floor(((Number(score) || 10) - 10) / 2);
  }

  function fmtMod(n) {
    n = Number(n) || 0;
    return n >= 0 ? "+" + n : String(n);
  }

  function profBonus(level) {
    var lv = Number(level) || 1;
    if (lv <= 4) return 2;
    if (lv <= 8) return 3;
    if (lv <= 12) return 4;
    if (lv <= 16) return 5;
    return 6;
  }

  function liveSheetOf(st) {
    return st.sheet || (st.draft && st.draft.pendingSheet) ||
      null;
  }

  function skillTotal(sh, sk, prof) {
    var ab = SKILL_MAP[sk] || "strength";
    var m = abilMod((sh.abilities || {})[ab]);
    var p = (sh.skillProficiency || {})[sk] || "none";
    var mult = p === "expert" ? 2 : p === "proficient" ? 1 : 0;
    return m + prof * mult;
  }

  function renderLiveSheet(st) {
    var sh = liveSheetOf(st) || {};
    var name = st.name || "Character";
    var ab = sh.abilities || {};
    var prof = profBonus(sh.level);
    var dexM = abilMod(ab.dexterity);
    var wisM = abilMod(ab.wisdom);
    var percP = (sh.skillProficiency || {}).perception || "none";
    var percMult = percP === "expert"
      ? 2
      : percP === "proficient"
      ? 1
      : 0;
    var passive = 10 + wisM + prof * percMult;
    var saves = sh.savingThrowProficiency || [];
    var hp = sh.hp || { current: 0, max: 0, temp: 0 };
    var hd = sh.hitDice || { current: 0, max: 0 };
    var clsLine = titleCase(sh.class || "—");
    if (sh.subclass) clsLine += " (" + titleCase(sh.subclass) + ")";
    clsLine += " · Level " + (sh.level || 1);

    var html = '<div class="dnd-sheet" data-dnd-sheet>';

    /* Identity banner */
    html += '<header class="dnd-sheet__banner">';
    html += '<p class="dnd-sheet__name">' + esc(name) + "</p>";
    html += '<p class="dnd-sheet__class">' + esc(clsLine) +
      "</p>";
    html += '<p class="dnd-sheet__meta">' +
      esc(titleCase(sh.species || "—")) +
      " · " +
      esc(titleCase(sh.background || "—")) +
      " · XP " +
      esc(String(sh.xp != null ? sh.xp : 0)) +
      "</p></header>";

    /* Combat strip */
    html += '<div class="dnd-sheet__combat" aria-label="Combat">';
    [
      ["AC", String(sh.ac != null ? sh.ac : 10)],
      ["Initiative", fmtMod(dexM)],
      ["Speed", (sh.speed != null ? sh.speed : 30) + " ft"],
      ["Proficiency", fmtMod(prof)],
      ["Passive Perc", String(passive)],
    ].forEach(function (pair) {
      html += '<div class="dnd-sheet__stat">' +
        '<span class="dnd-sheet__stat-l">' + pair[0] +
        "</span>" +
        '<span class="dnd-sheet__stat-v">' + esc(pair[1]) +
        "</span></div>";
    });
    html += "</div>";

    /* HP + HD */
    html += '<div class="dnd-sheet__hp-row">';
    html += '<div class="dnd-sheet__hp">' +
      '<span class="dnd-sheet__stat-l">Hit Points</span>' +
      '<span class="dnd-sheet__hp-val">' +
      esc(String(hp.current)) + " / " +
      esc(String(hp.max)) +
      (hp.temp
        ? ' <span class="dnd-sheet__temp">+' +
          esc(String(hp.temp)) + " temp</span>"
        : "") +
      "</span></div>";
    html += '<div class="dnd-sheet__hd">' +
      '<span class="dnd-sheet__stat-l">Hit Dice</span>' +
      '<span class="dnd-sheet__stat-v">' +
      esc(String(hd.current)) + " / " +
      esc(String(hd.max)) +
      "</span></div>";
    html += '<div class="dnd-sheet__gold">' +
      '<span class="dnd-sheet__stat-l">Gold</span>' +
      '<span class="dnd-sheet__stat-v">' +
      esc(String(sh.gold != null ? sh.gold : 0)) +
      " gp</span></div></div>";

    html += '<div class="dnd-sheet__body">';

    /* Ability scores */
    html += '<section class="dnd-sheet__panel">' +
      '<h3 class="dnd-sheet__h">Abilities</h3>' +
      '<ul class="dnd-sheet__abils">';
    ABILS.forEach(function (a) {
      var v = ab[a] != null ? ab[a] : 10;
      var m = abilMod(v);
      html += '<li class="dnd-sheet__abil">' +
        '<span class="dnd-sheet__abil-name">' +
        esc(a.slice(0, 3).toUpperCase()) + "</span>" +
        '<span class="dnd-sheet__abil-mod">' +
        esc(fmtMod(m)) + "</span>" +
        '<span class="dnd-sheet__abil-score">' +
        esc(String(v)) + "</span></li>";
    });
    html += "</ul></section>";

    /* Saves */
    html += '<section class="dnd-sheet__panel">' +
      '<h3 class="dnd-sheet__h">Saving throws</h3>' +
      '<ul class="dnd-sheet__checks dnd-sheet__checks--4">';
    ABILS.forEach(function (a) {
      var isP = saves.indexOf(a) >= 0;
      var m = abilMod(ab[a]) + (isP ? prof : 0);
      html += "<li class=\"" +
        (isP ? "is-prof" : "") + '">' +
        '<span class="dnd-sheet__mark" aria-hidden="true">' +
        (isP ? "●" : "○") + "</span>" +
        "<span>" + esc(titleCase(a)) + "</span>" +
        "<strong>" + esc(fmtMod(m)) +
        "</strong></li>";
    });
    html += "</ul></section>";

    /* Skills */
    html += '<section class="dnd-sheet__panel dnd-sheet__panel--wide">' +
      '<h3 class="dnd-sheet__h">Skills</h3>' +
      '<ul class="dnd-sheet__checks dnd-sheet__checks--4">';
    ALL_SKILLS.forEach(function (sk) {
      var p = (sh.skillProficiency || {})[sk] || "none";
      var isP = p !== "none";
      var total = skillTotal(sh, sk, prof);
      var mark = p === "expert" ? "◆" : isP ? "●" : "○";
      html += "<li class=\"" + (isP ? "is-prof" : "") + '">' +
        '<span class="dnd-sheet__mark" aria-hidden="true">' +
        mark + "</span>" +
        "<span>" + esc(titleCase(sk)) +
        ' <span class="dnd-sheet__ab">' +
        esc((SKILL_MAP[sk] || "").slice(0, 3).toUpperCase()) +
        "</span></span>" +
        "<strong>" + esc(fmtMod(total)) +
        "</strong></li>";
    });
    html += "</ul></section>";

    /* Feats */
    var feats = sh.feats || [];
    html += '<section class="dnd-sheet__panel">' +
      '<h3 class="dnd-sheet__h">Feats &amp; features</h3>';
    if (!feats.length) {
      html += '<p class="dnd-sheet__empty">None yet.</p>';
    } else {
      html += '<ul class="dnd-sheet__list">';
      feats.forEach(function (f) {
        html += "<li>" + esc(titleCase(f)) + "</li>";
      });
      html += "</ul>";
    }
    html += "</section>";

    /* Equipment */
    var gear = sh.equipment || [];
    html += '<section class="dnd-sheet__panel">' +
      '<h3 class="dnd-sheet__h">Equipment</h3>';
    if (!gear.length) {
      html += '<p class="dnd-sheet__empty">See inventory ' +
        "in Play (+inv).</p>";
    } else {
      html += '<ul class="dnd-sheet__list">';
      gear.forEach(function (g) {
        html += "<li>" + esc(titleCase(g)) + "</li>";
      });
      html += "</ul>";
    }
    html += "</section>";

    /* Spells */
    var spells = sh.spells || [];
    var slotsMax = sh.spellSlotsMax || {};
    var slotsCur = sh.spellSlotsCurrent || {};
    var hasSlots = false;
    var si;
    for (si = 1; si <= 9; si++) {
      if ((slotsMax[si] || 0) > 0) hasSlots = true;
    }
    if (spells.length || hasSlots) {
      html += '<section class="dnd-sheet__panel dnd-sheet__panel--wide">' +
        '<h3 class="dnd-sheet__h">Spellcasting</h3>';
      if (hasSlots) {
        html += '<ul class="dnd-sheet__slots">';
        for (si = 1; si <= 9; si++) {
          var mx = slotsMax[si] || 0;
          if (!mx) continue;
          var cur = slotsCur[si] != null ? slotsCur[si] : mx;
          html += "<li><span>Level " + si +
            "</span><strong>" + cur + " / " + mx +
            "</strong></li>";
        }
        html += "</ul>";
      }
      if (spells.length) {
        html += '<ul class="dnd-sheet__list dnd-sheet__list--wrap">';
        spells.forEach(function (sp) {
          html += "<li>" + esc(titleCase(sp)) + "</li>";
        });
        html += "</ul>";
      }
      html += "</section>";
    }

    html += "</div>"; /* body */

    html += '<p class="dnd-sheet__foot muted">' +
      '<a href="/play">Open Play</a> · ' +
      "In-game: <code>+sheet</code></p>";
    html += "</div>";
    return html;
  }

  function paintRight() {
    var right = qs("[data-site-right-panels]");
    if (!right) return;
    if (!state || state.needAuth) {
      right.innerHTML = renderQuickLinks();
      return;
    }
    if (state.approved || state.isApproved || state.closed) {
      var shR = liveSheetOf(state) || {};
      var hpR = shR.hp || {};
      right.innerHTML =
        '<section class="site-menu menu">' +
        '<h2 class="site-menu__title">At a glance</h2>' +
        '<div class="cg-sheet cg-sheet--rail">' +
        railBlock(
          "Class",
          esc(titleCase(shR.class || "—")) +
            " " +
            esc(String(shR.level || 1)),
        ) +
        railBlock(
          "HP",
          esc(String(hpR.current != null ? hpR.current : "—")) +
            " / " +
            esc(String(hpR.max != null ? hpR.max : "—")),
        ) +
        railBlock("AC", esc(String(shR.ac != null ? shR.ac : "—"))) +
        railBlock(
          "Gold",
          esc(String(shR.gold != null ? shR.gold : 0)) + " gp",
        ) +
        "</div></section>" +
        renderQuickLinks();
      return;
    }
    if (!state.started) {
      right.innerHTML =
        '<section class="site-menu menu">' +
        '<h2 class="site-menu__title">Draft</h2>' +
        '<p class="cg-sheet__muted">Begin chargen to track ' +
        "class, scores, and picks here.</p></section>" +
        renderQuickLinks();
      return;
    }
    right.innerHTML =
      '<section class="site-menu menu">' +
      '<h2 class="site-menu__title">Draft</h2>' +
      renderSheetSummary() +
      "</section>" +
      renderQuickLinks();
  }

  /* ── stage body ──────────────────────────────────────── */

  function renderStepper(stages, cur) {
    stages = stages || [];
    cur = cur || 1;
    var html = '<ol class="cg-stepper" aria-label="Progress">';
    stages.forEach(function (s) {
      var cls = "cg-stepper__item";
      if (s.stage < cur) cls += " is-done";
      if (s.stage === cur) cls += " is-current";
      html +=
        '<li class="' + cls + '">' +
        '<span class="cg-stepper__num">' + s.stage +
        "</span>" +
        '<span class="cg-stepper__label">' +
        esc(s.short || s.name) +
        "</span></li>";
    });
    html += "</ol>";
    return html;
  }

  function renderStageBody(st) {
    var stage = st.stage;
    var name = String(st.stageName || "").toLowerCase();
    var d = draft();

    if (stage === 1 || name === "class") {
      /* Stage title is already "Class" — no second label */
      return fieldCatalog(
        "class",
        "",
        d.class,
        "Type to search, or click the field to browse.",
      );
    }
    if (stage === 2 || name === "origin") {
      return (
        fieldCatalog(
          "species",
          "Species",
          d.species,
          "Ancestry / lineage.",
        ) +
        fieldCatalog(
          "background",
          "Background",
          d.background,
          "Grants skills and often an origin feat.",
        )
      );
    }
    if (stage === 3 || name === "abilities") {
      return renderAbilities();
    }
    if (stage === 4 || name === "skills") {
      var cls = findCatalogItem("class", d.class);
      var need = (cls && cls.skillCount) || 2;
      return chips(opts.skills, d.chosenSkills, "skill", need);
    }
    if (stage === 5 || name === "feats") {
      var maxF = String(d.species || "").toLowerCase() ===
        "human"
        ? 2
        : 1;
      return chips(opts.feats, d.chosenFeats, "feat", maxF);
    }
    if (name === "spells") {
      return (
        '<p class="cg-stage__hint">Toggle known spells ' +
        "from your class list.</p>" +
        chips(opts.spells, d.chosenSpells, "spell", null)
      );
    }
    if (name === "gear") {
      return renderGear();
    }
    return (
      '<p class="cg-stage__hint">Review and submit for ' +
      "staff approval.</p>" +
      renderSummary()
    );
  }

  /* ── main render (CoFD renderMain shape) ─────────────── */

  function renderMain(st) {
    var main = mainEl || qs(".site-main") || document.body;
    mainEl = main;
    st = st || state;

    if (!document.getElementById("site-chargen-css")) {
      var link = document.createElement("link");
      link.id = "site-chargen-css";
      link.rel = "stylesheet";
      link.href = "/site/css/chargen.css?v=20260809playmob";
      document.head.appendChild(link);
    }
    if (!document.getElementById("site-dnd-chargen-css")) {
      var link2 = document.createElement("link");
      link2.id = "site-dnd-chargen-css";
      link2.rel = "stylesheet";
      link2.href = "/site/css/dnd-chargen.css?v=20260809playmob";
      document.head.appendChild(link2);
    }

    var shell = qs(".site-shell");
    if (shell) shell.classList.add("is-mode-chargen");

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
        "<p>Please <a href=\"/login?next=/chargen\">log in" +
        "</a>.</p></section>";
      paintRight();
      return;
    }

    if (st.approved || st.isApproved || st.closed) {
      main.innerHTML =
        '<section class="site-section cg-root" data-cg-root>' +
        renderLiveSheet(st) +
        "</section>";
      paintRight();
      return;
    }

    if (st.isSubmitted || draft().isSubmitted) {
      var job = st.submittedJob || draft().submittedJob;
      main.innerHTML =
        '<section class="site-section cg-root" data-cg-root>' +
        '<header class="cg-header">' +
        '<h2 class="cg-header__title">Submitted</h2>' +
        '<p class="cg-header__sub">Awaiting staff' +
        (job ? " · CGEN #" + esc(String(job)) : "") +
        "</p></header>" +
        renderSummary() +
        "</section>";
      paintRight();
      return;
    }

    if (!st.started) {
      main.innerHTML =
        '<section class="site-section cg-root">' +
        '<div class="cg-gate">' +
        '<h2 class="cg-header__title">Character Generation</h2>' +
        "<p>Guided D&amp;D 5e creation matching in-game " +
        "+cg — Class, Origin, Abilities, Skills, Feats, " +
        "Spells, Gear, and Review.</p>" +
        '<button type="button" class="cg-btn cg-btn--primary" ' +
        'data-cg-start>Begin chargen</button>' +
        "</div></section>";
      paintRight();
      wireStage();
      return;
    }

    var stages = st.stages || [];
    var html =
      '<section class="site-section cg-root" data-cg-root>' +
      '<header class="cg-header">' +
      '<h2 class="cg-header__title">Character Generation</h2>' +
      '<p class="cg-header__sub">Stage ' + st.stage +
      " of " + st.maxStage + " — " +
      esc(st.stageName || "") +
      "</p></header>";

    html += renderStepper(stages, st.stage);
    html += '<div class="cg-error" data-cg-error hidden></div>';
    html += '<div class="cg-ok" data-cg-ok hidden></div>';
    html += '<div class="cg-stage" data-cg-stage>' +
      '<h3 class="cg-stage__title">' +
      esc(st.stageName || ("Stage " + st.stage)) +
      "</h3>" +
      renderStageBody(st) +
      "</div>";

    html += '<div class="cg-actions">' +
      '<button type="button" class="cg-btn" data-cg-back' +
      (st.stage <= 1 ? " disabled" : "") +
      ">Back</button>" +
      '<button type="button" class="cg-btn cg-btn--primary" ' +
      'data-cg-next' +
      (st.canAdvance === false ? " disabled" : "") +
      ">" +
      (st.stage >= st.maxStage ? "Finish" : "Next stage") +
      "</button></div></section>";

    main.innerHTML = html;

    if (st.validationError && st.canAdvance === false) {
      setMsg(
        qs("[data-cg-error]"),
        st.validationError,
        true,
      );
    }

    paintRight();
    wireStage();
  }

  /* ── actions ─────────────────────────────────────────── */

  async function applyTrait(trait, value, flags) {
    flags = flags || {};
    if (busy) return;
    busy = true;
    try {
      state = await api("POST", "/set", {
        trait: trait,
        value: String(value),
      });
      if (trait === "class") await refreshClassOpts();
      var heavy = flags.rerender !== false && (
        trait === "class" ||
        trait === "species" ||
        trait === "background" ||
        trait === "gear" ||
        trait === "skill" ||
        trait === "feat" ||
        trait === "spell" ||
        ABILS.indexOf(trait) >= 0 ||
        flags.dots
      );
      if (heavy) {
        renderMain(state);
      } else {
        setMsg(
          qs("[data-cg-error]"),
          state.canAdvance
            ? ""
            : (state.validationError || ""),
          !state.canAdvance,
        );
        paintRight();
      }
    } catch (e) {
      setMsg(
        qs("[data-cg-error]"),
        e.message || "Could not save.",
        true,
      );
      if (e.data && e.data.draft) {
        state = Object.assign(state || {}, e.data);
        paintRight();
      }
    } finally {
      busy = false;
    }
  }

  async function go(dir) {
    if (busy) return;
    busy = true;
    try {
      if (dir === "start") {
        state = await api("POST", "/start", {});
        await ensureCatalog();
      } else if (dir === "back") {
        state = await api("POST", "/back", {});
      } else if (dir === "next") {
        if (state.stage >= state.maxStage) {
          state = await api("POST", "/submit", {});
        } else {
          state = await api("POST", "/next", {});
        }
      }
      if (draft().class) await refreshClassOpts();
      renderMain(state);
    } catch (e) {
      setMsg(
        qs("[data-cg-error]"),
        e.message || "Action failed.",
        true,
      );
      if (e.data && e.data.stage != null) {
        state = Object.assign(state || {}, e.data);
        renderMain(state);
      }
    } finally {
      busy = false;
    }
  }

  /* ── catalog wiring (CoFD wireCatalogPickers) ────────── */

  function fillCatalogDetail(box, field, item) {
    var detail = qs(
      '[data-cg-cat-detail="' + field + '"]',
      box,
    );
    if (!detail) return;
    if (!item) {
      detail.hidden = true;
      return;
    }
    detail.hidden = false;
    var nm = qs("[data-cg-cat-name]", detail);
    var meta = qs("[data-cg-cat-meta]", detail);
    if (nm) nm.textContent = catalogDisplayName(item);
    if (meta) meta.textContent = catalogMetaLine(field, item);
  }

  function wireCatalogPickers(root) {
    var pickers = root.querySelectorAll("[data-cg-catalog]");
    if (!pickers.length) return;

    pickers.forEach(function (box) {
      var field = box.getAttribute("data-cg-catalog");
      if (!field) return;
      var search = qs(
        '[data-cg-cat-search="' + field + '"]',
        box,
      );
      var suggest = qs(
        '[data-cg-cat-suggest="' + field + '"]',
        box,
      );
      if (!search || !suggest) return;

      var curSlug = draft()[field] || "";
      if (field === "class" || field === "species" ||
        field === "background") {
        curSlug = draft()[field] || "";
      }
      if (curSlug) {
        fillCatalogDetail(
          box,
          field,
          findCatalogItem(field, curSlug),
        );
      }

      function hideSuggest() {
        suggest.hidden = true;
        suggest.innerHTML = "";
      }

      function showSuggest(q) {
        q = String(q || "").trim().toLowerCase();
        var items = catalogPool(field);
        if (!q) {
          items = items.slice(0, 14);
        } else {
          var hits = [];
          for (
            var i = 0;
            i < items.length && hits.length < 14;
            i++
          ) {
            var it = items[i];
            var hay = (
              (it.name || "") + " " +
              (it.slug || "") + " " +
              catalogMetaLine(field, it)
            ).toLowerCase();
            if (hay.indexOf(q) !== -1) hits.push(it);
          }
          items = hits;
        }
        if (!items.length) {
          suggest.innerHTML =
            '<li class="cg-merit-suggest__empty">' +
            "No matches</li>";
          suggest.hidden = false;
          return;
        }
        var html = "";
        for (var h = 0; h < items.length; h++) {
          var m = items[h];
          var sub = catalogMetaLine(field, m) || "";
          html += '<li role="option" tabindex="0" ' +
            'data-cg-cat-pick="' +
            esc(m.slug || m.name) + '">' +
            '<span class="cg-merit-suggest__name">' +
            esc(catalogDisplayName(m)) +
            "</span>" +
            (sub
              ? '<span class="cg-merit-suggest__cost">' +
                esc(sub) + "</span>"
              : "") +
            "</li>";
        }
        suggest.innerHTML = html;
        suggest.hidden = false;
      }

      function pick(raw) {
        var item = findCatalogItem(field, raw);
        if (!item) return;
        search.value = catalogDisplayName(item);
        hideSuggest();
        fillCatalogDetail(box, field, item);
        applyTrait(field, item.slug || item.name, {
          rerender: true,
        });
      }

      search.addEventListener("input", function () {
        showSuggest(search.value);
      });
      search.addEventListener("focus", function () {
        showSuggest(search.value);
      });
      search.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
          hideSuggest();
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          var first = qs("[data-cg-cat-pick]", suggest);
          if (first) {
            pick(first.getAttribute("data-cg-cat-pick"));
          } else {
            var hit = findCatalogItem(field, search.value);
            if (hit) pick(hit.slug || hit.name);
          }
        }
      });

      suggest.addEventListener("mousedown", function (e) {
        var li = e.target.closest
          ? e.target.closest("[data-cg-cat-pick]")
          : null;
        if (!li) return;
        e.preventDefault();
        pick(li.getAttribute("data-cg-cat-pick"));
      });

      var clearBtn = qs(
        '[data-cg-cat-clear="' + field + '"]',
        box,
      );
      if (clearBtn) {
        clearBtn.addEventListener("click", function () {
          search.value = "";
          fillCatalogDetail(box, field, null);
          applyTrait(field, "", { rerender: true });
        });
      }
    });

    document.addEventListener("click", function (e) {
      pickers.forEach(function (box) {
        if (!box.contains(e.target)) {
          var sug = qs("[data-cg-cat-suggest]", box);
          if (sug) {
            sug.hidden = true;
            sug.innerHTML = "";
          }
        }
      });
    });
  }

  function wireStage() {
    var root = qs("[data-cg-root]") || mainEl;
    if (!root) return;

    var start = qs("[data-cg-start]", root);
    if (start) {
      start.onclick = function () {
        go("start");
      };
    }
    var back = qs("[data-cg-back]", root);
    if (back) {
      back.onclick = function () {
        go("back");
      };
    }
    var next = qs("[data-cg-next]", root);
    if (next) {
      next.onclick = function () {
        go("next");
      };
    }

    root.querySelectorAll("[data-cg-toggle]").forEach(
      function (btn) {
        btn.onclick = function () {
          applyTrait(
            btn.getAttribute("data-cg-toggle"),
            btn.getAttribute("data-cg-val"),
            { dots: true },
          );
        };
      },
    );

    root.querySelectorAll("[data-cg-set]").forEach(
      function (btn) {
        btn.onclick = function () {
          applyTrait(
            btn.getAttribute("data-cg-set"),
            btn.getAttribute("data-cg-val"),
            { rerender: true },
          );
        };
      },
    );

    root.querySelectorAll("[data-cg-abil]").forEach(
      function (btn) {
        btn.onclick = function () {
          var key = btn.getAttribute("data-cg-abil");
          var delta = parseInt(
            btn.getAttribute("data-cg-delta") || "0",
            10,
          );
          var cur =
            Number((draft().abilities || {})[key]) || 8;
          var n = Math.max(8, Math.min(15, cur + delta));
          if (n !== cur) {
            applyTrait(key, String(n), { dots: true });
          }
        };
      },
    );

    wireCatalogPickers(root);
  }

  /* ── boot ────────────────────────────────────────────── */

  async function boot() {
    mainEl = qs(".site-main") || document.body;
    try {
      state = await api("GET", "");
      await ensureCatalog();
      if (state.started && draft().class) {
        await refreshClassOpts();
      }
      if (
        !demo &&
        (state.closed || state.approved || state.isApproved) &&
        !state.sheet
      ) {
        try {
          var sh = await fetch(SHEET_API, {
            credentials: "same-origin",
            headers: authHeaders(),
          }).then(function (r) {
            return r.ok ? r.json() : null;
          });
          if (sh) {
            state = Object.assign({}, state, sh, {
              approved: true,
              isApproved: true,
            });
          }
        } catch (_) { /* ignore */ }
      }
      renderMain(state);
    } catch (e) {
      // Unauthenticated: leave site.js route guard to redirect.
      // Demo mode keeps the local shell (Figma 2054:137).
      if (e.status === 401 && !demo) {
        try {
          var next = encodeURIComponent(
            location.pathname + location.search,
          );
          location.replace("/login?next=" + next);
        } catch (_) {
          state = { needAuth: true };
          renderMain(state);
        }
        return;
      }
      if (demo) {
        state = demoInit();
        await ensureCatalog();
        renderMain(state);
        return;
      }
      state = { needAuth: true };
      renderMain(state);
    }
  }

  global.SiteDndChargen = {
    isDemo: function () {
      return demo;
    },
    boot: boot,
    getState: function () {
      return state;
    },
  };
  global.SiteChargen = global.SiteDndChargen;
})(typeof window !== "undefined" ? window : globalThis);
