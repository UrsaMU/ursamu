/**
 * Public chargen FE — stepper matching in-game +cg stages.
 * Loaded by site.js when MODE === "chargen".
 *
 * API: /api/v1/cofd/chargen/*
 * Demo: ?demo=1 uses local state (Playwright / offline).
 */
(function (global) {
  "use strict";

  var API = "/api/v1/cofd/chargen";
  var state = null;
  var opts = {};
  var busy = false;
  var demo = false;

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function token() {
    try {
      return sessionStorage.getItem("ursamu.webAdmin.token") || "";
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

  /**
   * Normalize API payloads. Older servers omitted `started` on
   * /set /next /back, which made the UI jump back to "Begin".
   */
  function normalizeState(raw) {
    if (!raw || typeof raw !== "object") return raw;
    var st = Object.assign({}, raw);
    // Live approved sheet payload
    if (st.approved || st.isApproved || st.sheetText) {
      st.approved = true;
      st.isApproved = true;
      st.started = true;
      return st;
    }
    if (st.closed || st.needAuth) return st;
    if (st.sheet || st.stage != null) {
      st.started = true;
    }
    return st;
  }

  // ── Demo store (Playwright / offline) ──────────────────────────

  function demoInit() {
    return {
      ok: true,
      started: true,
      stage: 1,
      maxStage: 7,
      stageName: "Concept & Anchors",
      stages: [
        { stage: 1, name: "Concept & Anchors", short: "Concept" },
        { stage: 2, name: "Template", short: "Template" },
        { stage: 3, name: "Template Details", short: "Detail" },
        { stage: 4, name: "Attributes", short: "Attrs" },
        { stage: 5, name: "Skills", short: "Skills" },
        { stage: 6, name: "Merits", short: "Merits" },
        { stage: 7, name: "Powers", short: "Powers" },
      ],
      sheet: {
        template: "mortal",
        concept: "",
        virtue: "",
        vice: "",
        attributes: {
          intelligence: 1, wits: 1, resolve: 1,
          strength: 1, dexterity: 1, stamina: 1,
          presence: 1, manipulation: 1, composure: 1,
        },
        skills: {},
        specialties: {},
        merits: {},
        customFields: {},
        powers: {},
        contracts: [],
        moralityValue: 7,
        powerStatValue: 1,
        energyCurrent: 0,
        advantages: {
          willpowerMax: 2,
          willpowerCurrent: 2,
          size: 5,
        },
      },
      isSubmitted: false,
      isApproved: false,
      canAdvance: false,
      validationError: "Concept cannot be empty or 'Unknown'.",
      templateMeta: {
        key: "mortal",
        name: "Mortal",
        customFields: [],
      },
    };
  }

  function demoValidate(st) {
    var sh = st.sheet;
    var stage = st.stage;
    if (stage === 1) {
      if (!sh.concept || !sh.virtue || !sh.vice) {
        return "Fill concept, virtue, and vice.";
      }
    }
    if (stage === 2 && !sh.template) {
      return "Choose a template.";
    }
    if (stage === 3 && sh.template === "changeling") {
      var need = ["seeming", "kith", "court", "favored", "needle", "thread"];
      for (var i = 0; i < need.length; i++) {
        if (!(sh.customFields || {})[need[i]]) {
          return "Set " + need[i] + ".";
        }
      }
    }
    if (stage === 3 && sh.template === "vampire") {
      var vneed = [
        "clan", "covenant",
        "touchstonemask", "touchstonedirge",
      ];
      for (var vi = 0; vi < vneed.length; vi++) {
        if (!(sh.customFields || {})[vneed[vi]]) {
          return "Set clan, covenant, and both Touchstones.";
        }
      }
    }
    if (stage === 7 && sh.template === "vampire") {
      var psum = 0;
      var pw = sh.powers || {};
      Object.keys(pw).forEach(function (k) {
        psum += Number(pw[k]) || 0;
      });
      if (psum !== 3) {
        return "Allocate exactly 3 Discipline dots.";
      }
    }
    if (stage === 4) {
      var a = sh.attributes || {};
      var m = (a.intelligence || 1) - 1 + (a.wits || 1) - 1 +
        (a.resolve || 1) - 1;
      var p = (a.strength || 1) - 1 + (a.dexterity || 1) - 1 +
        (a.stamina || 1) - 1;
      var s = (a.presence || 1) - 1 + (a.manipulation || 1) - 1 +
        (a.composure || 1) - 1;
      var xs = [m, p, s].slice().sort(function (x, y) {
        return x - y;
      });
      if (xs[0] !== 3 || xs[1] !== 4 || xs[2] !== 5) {
        return "Attribute extras must be 5/4/3. " +
          "M+" + m + " P+" + p + " S+" + s;
      }
    }
    if (stage === 6) {
      var tBudget = String(sh.template || "").toLowerCase();
      var budget = (tBudget === "werewolf" ||
        tBudget === "vampire")
        ? 10
        : 7;
      var spent = 0;
      var mer = sh.merits || {};
      Object.keys(mer).forEach(function (k) {
        spent += Number(mer[k]) || 0;
      });
      if (spent !== budget) {
        return "Merits: spend exactly " + budget +
          " dots (have " + spent + ").";
      }
    }
    return null;
  }

  function demoRefresh() {
    var err = demoValidate(state);
    state.canAdvance = !err;
    state.validationError = err;
    var mb = meritBudgetInfo(state);
    state.meritBudget = mb.budget;
    state.meritSpent = mb.spent;
    state.meritRemaining = mb.remaining;
    state.stageName = (state.stages.find(function (s) {
      return s.stage === state.stage;
    }) || {}).name || "Stage";
    if (state.sheet.template === "changeling") {
      state.maxStage = 7;
      state.templateMeta = {
        key: "changeling",
        name: "Changeling: The Lost",
        customFields: [
          "seeming", "kith", "court", "favored",
          "needle", "thread", "mask", "mien",
        ],
      };
    } else if (state.sheet.template === "vampire") {
      state.maxStage = 7;
      state.templateMeta = {
        key: "vampire",
        name: "Vampire: The Requiem",
        customFields: [
          "clan", "covenant",
          "touchstonemask", "touchstonedirge",
          "bloodline",
        ],
      };
    } else if (state.sheet.template === "werewolf") {
      state.maxStage = 8;
      state.templateMeta = {
        key: "werewolf",
        name: "Werewolf: The Forsaken",
        customFields: ["auspice", "tribe"],
      };
    } else {
      state.maxStage = 6;
      state.templateMeta = {
        key: "mortal",
        name: "Mortal",
        customFields: [],
      };
    }
    state.stages = state.stages.filter(function (s) {
      return s.stage <= state.maxStage;
    });
    while (state.stages.length < state.maxStage) {
      var n = state.stages.length + 1;
      state.stages.push({
        stage: n,
        name: "Stage " + n,
        short: "S" + n,
      });
    }
  }

  // ── API ────────────────────────────────────────────────────────

  async function api(method, path, body) {
    if (demo) return demoApi(method, path, body);
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
    data = normalizeState(data);
    if (!res.ok) {
      var err = new Error(data.error || ("HTTP " + res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function demoApi(method, path, body) {
    if (!state) state = demoInit();
    if (path === "" && method === "GET") {
      demoRefresh();
      return Promise.resolve(state);
    }
    if (path === "/start") {
      state = demoInit();
      if (body && body.reset) { /* fresh */ }
      demoRefresh();
      return Promise.resolve(state);
    }
    if (path === "/set") {
      var trait = String((body && body.trait) || "").toLowerCase();
      var value = String((body && body.value) || "");
      var sh = state.sheet;
      if (trait === "concept") sh.concept = value;
      else if (trait === "virtue") sh.virtue = value;
      else if (trait === "vice") sh.vice = value;
      else if (
        trait === "mask" &&
        sh.template === "vampire"
      ) {
        sh.virtue = value;
      } else if (
        trait === "dirge" &&
        sh.template === "vampire"
      ) {
        sh.vice = value;
      } else if (trait === "template") {
        sh.template = value.toLowerCase();
      } else if (
        [
          "seeming", "kith", "court", "favored",
          "needle", "thread", "mask", "mien",
          "auspice", "tribe",
          "clan", "covenant",
          "touchstonemask", "touchstonedirge",
          "bloodline", "touchstone",
        ].indexOf(trait) >= 0
      ) {
        sh.customFields = sh.customFields || {};
        var cfKey = trait === "touchstone"
          ? "touchstonemask"
          : trait;
        sh.customFields[cfKey] = value;
        if (cfKey === "touchstonemask" ||
          cfKey === "touchstonedirge") {
          sh.touchstones = sh.touchstones || {};
          if (cfKey === "touchstonemask") {
            sh.touchstones.mask = value;
          } else {
            sh.touchstones.dirge = value;
          }
        }
      } else if (sh.attributes && trait in sh.attributes) {
        sh.attributes[trait] = Math.max(
          1,
          Math.min(5, parseInt(value, 10) || 1),
        );
      } else if (
        state.stage === 7 &&
        sh.template === "vampire"
      ) {
        sh.powers = sh.powers || {};
        var pkey = trait.toLowerCase();
        var pn = parseInt(value, 10);
        if (!value || value === "0" || isNaN(pn) || pn < 1) {
          delete sh.powers[pkey];
        } else {
          sh.powers[pkey] = Math.min(5, pn);
        }
      } else if (state.stage === 6 || findMeritDef(trait)) {
        sh.merits = sh.merits || {};
        // Normalize language(spanish) → language:spanish storage
        var mref = trait;
        var pm = trait.match(/^([^(]+)\(([^)]+)\)$/);
        if (pm) {
          mref = pm[1].trim() + ":" +
            pm[2].trim().toLowerCase().replace(/\s+/g, "-");
        }
        var def = findMeritDef(mref.split(":")[0]);
        if (!value || value === "0") {
          delete sh.merits[mref];
        } else {
          var dv = parseInt(value, 10) || 0;
          if (def && def.allowedDots.indexOf(dv) < 0) {
            return Promise.reject(Object.assign(
              new Error(
                "Merit only allows: " +
                  def.allowedDots.join(", "),
              ),
              { status: 400, data: state },
            ));
          }
          if (def && def.instanced && mref.indexOf(":") < 0) {
            return Promise.reject(Object.assign(
              new Error("Merit requires a qualifier."),
              { status: 400, data: state },
            ));
          }
          sh.merits[mref] = dv;
        }
      } else {
        sh.skills = sh.skills || {};
        sh.skills[trait] = Math.max(
          0,
          Math.min(5, parseInt(value, 10) || 0),
        );
      }
      demoRefresh();
      return Promise.resolve(state);
    }
    if (path === "/next") {
      demoRefresh();
      if (!state.canAdvance) {
        return Promise.reject(
          Object.assign(new Error(state.validationError), {
            status: 400,
            data: state,
          }),
        );
      }
      if (state.stage < state.maxStage) {
        state.stage += 1;
        demoRefresh();
        return Promise.resolve(state);
      }
      // Final stage Finish → same as /submit
      return demoApi("POST", "/submit", body);
    }
    if (path === "/submit") {
      demoRefresh();
      if (state.stage < state.maxStage) {
        return Promise.reject(
          Object.assign(
            new Error(
              "Finish the last stage first (on stage " +
                state.stage + " of " + state.maxStage + ").",
            ),
            { status: 400, data: state },
          ),
        );
      }
      if (!state.canAdvance) {
        return Promise.reject(
          Object.assign(new Error(state.validationError), {
            status: 400,
            data: state,
          }),
        );
      }
      if (state.isSubmitted) {
        return Promise.reject(
          Object.assign(
            new Error(
              "Already pending staff review" +
                (state.submittedJob
                  ? " (CGEN #" + state.submittedJob + ")"
                  : "") + ".",
            ),
            { status: 409, data: state },
          ),
        );
      }
      state.isSubmitted = true;
      state.submittedJob = state.submittedJob || 9001;
      state.submitted = true;
      state.jobNumber = state.submittedJob;
      demoRefresh();
      return Promise.resolve(state);
    }
    if (path === "/back") {
      if (state.stage > 1) state.stage -= 1;
      demoRefresh();
      return Promise.resolve(state);
    }
    return Promise.resolve(state);
  }

  async function loadOptions() {
    var topics = [
      "virtues", "vices", "templates", "seemings", "kiths",
      "courts", "regalia", "attributes", "skills", "merits",
      "clans", "covenants", "disciplines", "masks",
    ];
    if (demo) {
      opts = {
        virtues: {
          items: [
            { name: "Just" }, { name: "Loyal" },
            { name: "Courageous" }, { name: "Honest" },
          ],
        },
        vices: {
          items: [
            { name: "Greedy" }, { name: "Ambitious" },
            { name: "Wrathful" }, { name: "Prideful" },
          ],
        },
        templates: {
          items: [
            { key: "mortal", name: "Mortal" },
            { key: "changeling", name: "Changeling: The Lost" },
            { key: "vampire", name: "Vampire: The Requiem" },
          ],
        },
        clans: {
          items: [
            {
              name: "Daeva",
              disciplines: ["Celerity", "Majesty", "Vigor"],
              description: "Serpents.",
            },
            {
              name: "Ventrue",
              disciplines: ["Animalism", "Dominate", "Resilience"],
              description: "Lords.",
            },
            {
              name: "Mekhet",
              disciplines: ["Auspex", "Celerity", "Obfuscate"],
              description: "Shadows.",
            },
          ],
        },
        covenants: {
          items: [
            {
              name: "Invictus", mechanic: "Oaths",
              description: "First Estate.",
            },
            {
              name: "Unaligned", mechanic: "None",
              description: "No covenant.",
            },
          ],
        },
        disciplines: {
          items: [
            {
              name: "Majesty", key: "majesty",
              summary: "Awe and presence.",
              inClanFor: ["Daeva"],
            },
            {
              name: "Celerity", key: "celerity",
              summary: "Supernatural speed.",
              inClanFor: ["Daeva", "Mekhet"],
            },
            {
              name: "Vigor", key: "vigor",
              summary: "Supernatural strength.",
              inClanFor: ["Daeva", "Nosferatu"],
            },
            {
              name: "Dominate", key: "dominate",
              summary: "Mental commands.",
              inClanFor: ["Ventrue"],
            },
          ],
        },
        masks: {
          items: [
            {
              name: "Authoritarian",
              description: "Must be on top.",
            },
            {
              name: "Courtesan",
              description: "Exists for others' pleasure.",
            },
            {
              name: "Survivor",
              description: "Own existence above all.",
            },
            {
              name: "Scholar",
              description: "Knowledge is power.",
            },
          ],
        },
        seemings: {
          items: [
            {
              name: "Beast", favoredRegalia: "Steed",
              blessing: "Animal ken", curse: "Bestial",
              description: "Half-beast Lost of the Hedge.",
            },
            {
              name: "Fairest", favoredRegalia: "Crown",
              blessing: "Social grace", curse: "Fragile ego",
              description: "Beautiful and terrible.",
            },
            {
              name: "Wizened", favoredRegalia: "Jewels",
              blessing: "Craft", curse: "Brittleness",
              description: "Artisans of Arcadia.",
            },
          ],
        },
        courts: {
          items: [
            {
              name: "Spring", emotion: "Desire",
              description: "Court of desire and renewal.",
            },
            {
              name: "Summer", emotion: "Wrath",
              description: "Court of wrath and war.",
            },
            {
              name: "Autumn", emotion: "Fear",
              description: "Court of fear and magic.",
            },
            {
              name: "Winter", emotion: "Sorrow",
              description: "Court of sorrow and secrets.",
            },
          ],
        },
        regalia: {
          items: [
            {
              name: "Crown", favoredBy: "Fairest",
              description: "Authority and rule.",
            },
            {
              name: "Jewel", favoredBy: "Wizened",
              description: "Treasure and craft.",
            },
            {
              name: "Mirror", favoredBy: "Darkling",
              description: "Reflection and lies.",
            },
            {
              name: "Shield", favoredBy: "Ogre",
              description: "Protection and endurance.",
            },
            {
              name: "Steed", favoredBy: "Beast",
              description: "Motion and chase.",
            },
            {
              name: "Sword", favoredBy: "Elemental",
              description: "Conflict and force.",
            },
          ],
        },
        attributes: {
          mental: ["intelligence", "wits", "resolve"],
          physical: ["strength", "dexterity", "stamina"],
          social: ["presence", "manipulation", "composure"],
        },
        skills: {
          mental: [
            "academics", "computer", "crafts", "investigation",
            "medicine", "occult", "politics", "science",
          ],
          physical: [
            "athletics", "brawl", "drive", "firearms",
            "larceny", "stealth", "survival", "weaponry",
          ],
          social: [
            "animal ken", "empathy", "expression", "intimidation",
            "persuasion", "socialize", "streetwise", "subterfuge",
          ],
        },
        kiths: {
          items: [
            {
              name: "Dancer", seeming: "Fairest",
              blessing: "Grace", description: "Movement as art.",
            },
            {
              name: "Playmate", seeming: "Fairest",
              blessing: "Charm", description: "Beloved companion.",
            },
            {
              name: "Hunterheart", seeming: "Beast",
              blessing: "Hunt", description: "Predator's edge.",
            },
            {
              name: "Smith", seeming: "Wizened",
              blessing: "Forge", description: "Makes wonders.",
            },
          ],
        },
        merits: {
          budget: 7,
          items: [
            {
              key: "allies", name: "Allies", category: "Social",
              allowedDots: [1, 2, 3, 4, 5], minCost: 1,
              instanced: true, prereqs: [],
            },
            {
              key: "contacts", name: "Contacts", category: "Social",
              allowedDots: [1, 2, 3, 4, 5], minCost: 1,
              instanced: true, prereqs: [],
            },
            {
              key: "resources", name: "Resources",
              category: "Social",
              allowedDots: [1, 2, 3, 4, 5], minCost: 1,
              instanced: false, prereqs: [],
            },
            {
              key: "language", name: "Language",
              category: "Mental",
              allowedDots: [1], minCost: 1,
              instanced: true, prereqs: [],
            },
            {
              key: "striking looks", name: "Striking Looks",
              category: "Social",
              allowedDots: [1, 2], minCost: 1,
              instanced: false, prereqs: [],
            },
            {
              key: "giant", name: "Giant", category: "Physical",
              allowedDots: [3], minCost: 3,
              instanced: false, prereqs: [],
            },
            {
              key: "fame", name: "Fame", category: "Social",
              allowedDots: [1, 2, 3], minCost: 1,
              instanced: false, prereqs: [],
            },
            {
              key: "a shot rings out",
              name: "A Shot Rings Out",
              category: "Fighting Style",
              allowedDots: [3], minCost: 3,
              instanced: false, prereqs: [],
            },
          ],
        },
      };
      return;
    }
    await Promise.all(topics.map(async function (t) {
      try {
        var r = await fetch(
          API + "/options?topic=" + encodeURIComponent(t),
          {
            credentials: "same-origin",
            headers: authHeaders(),
          },
        );
        if (r.ok) opts[t] = await r.json();
      } catch (_) { /* ignore */ }
    }));
  }

  function meritCatalog() {
    return (opts.merits && opts.merits.items) || [];
  }

  function findMeritDef(q) {
    q = String(q || "").trim().toLowerCase();
    if (!q) return null;
    var items = meritCatalog();
    for (var i = 0; i < items.length; i++) {
      if (items[i].key === q ||
        String(items[i].name).toLowerCase() === q) {
        return items[i];
      }
    }
    // storage key merit:qualifier
    var base = q.split(":")[0].split("(")[0].trim();
    for (var j = 0; j < items.length; j++) {
      if (items[j].key === base) return items[j];
    }
    return null;
  }

  function formatMeritStorageKey(key) {
    // "contacts:police" → "Contacts (Police)"
    var parts = String(key || "").split(":");
    var def = findMeritDef(parts[0]);
    var name = def ? def.name : titleCase(parts[0]);
    if (parts[1]) {
      return name + " (" + titleCase(parts[1].replace(/-/g, " ")) +
        ")";
    }
    return name;
  }

  function meritBudgetInfo(st) {
    var budget = st.meritBudget;
    if (budget == null) {
      var tmpl = (st.sheet && st.sheet.template) || "mortal";
      budget = String(tmpl).toLowerCase() === "werewolf" ? 10 : 7;
    }
    var spent = st.meritSpent;
    if (spent == null) {
      spent = 0;
      var m = (st.sheet && st.sheet.merits) || {};
      Object.keys(m).forEach(function (k) {
        spent += Number(m[k]) || 0;
      });
    }
    return {
      budget: budget,
      spent: spent,
      remaining: Math.max(0, budget - spent),
    };
  }

  async function loadKiths(seeming) {
    if (demo) {
      opts.kiths = {
        items: (opts.kiths && opts.kiths.items || []).filter(
          function (k) {
            return !seeming ||
              String(k.seeming).toLowerCase() ===
                seeming.toLowerCase();
          },
        ),
      };
      return;
    }
    try {
      var q = "/options?topic=kiths";
      if (seeming) {
        q += "&seeming=" + encodeURIComponent(seeming);
      }
      var r = await fetch(API + q, { credentials: "same-origin" });
      if (r.ok) opts.kiths = await r.json();
    } catch (_) { /* ignore */ }
  }

  // ── Render ─────────────────────────────────────────────────────

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

  function renderStepper(stages, current) {
    var html = '<ol class="cg-stepper" data-cg-stepper ' +
      'aria-label="Chargen progress">';
    for (var i = 0; i < stages.length; i++) {
      var s = stages[i];
      var cls = "cg-stepper__item";
      if (s.stage === current) cls += " is-current";
      else if (s.stage < current) cls += " is-done";
      html += '<li class="' + cls + '" data-stage="' + s.stage + '">' +
        '<span class="cg-stepper__num">' + s.stage + "</span>" +
        "<span>" + esc(s.short || s.name) + "</span></li>";
    }
    html += "</ol>";
    return html;
  }

  function selectOptions(items, selected, valueKey, labelKey) {
    valueKey = valueKey || "name";
    labelKey = labelKey || valueKey;
    var html = '<option value="">— choose —</option>';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var v = typeof it === "string" ? it : it[valueKey];
      var lbl = typeof it === "string" ? it : (it[labelKey] || v);
      var sel = String(selected || "").toLowerCase() ===
        String(v).toLowerCase()
        ? " selected"
        : "";
      html += '<option value="' + esc(v) + '"' + sel + ">" +
        esc(lbl) + "</option>";
    }
    return html;
  }

  function fieldSelect(id, label, items, selected, valueKey) {
    return '<div class="cg-field">' +
      '<label class="cg-field__label" for="' + id + '">' +
      esc(label) + "</label>" +
      '<select class="cg-select" id="' + id +
      '" data-cg-field="' + id + '">' +
      selectOptions(items, selected, valueKey) +
      "</select></div>";
  }

  /**
   * Merit-style searchable catalog for a single-choice field
   * (seeming, kith, court, favored regalia).
   */
  function fieldCatalog(field, label, selected, hint) {
    var has = !!(selected && String(selected).trim());
    var html = '<div class="cg-catalog-picker cg-merit-picker" ' +
      'data-cg-catalog="' + esc(field) + '">';
    html += '<div class="cg-field cg-merit-search-wrap">' +
      '<label class="cg-field__label" for="cat-' + esc(field) +
      '">' + esc(label) + "</label>";
    if (hint) {
      html += '<p class="cg-catalog-hint muted">' + esc(hint) +
        "</p>";
    }
    html += '<input type="search" class="cg-input" id="cat-' +
      esc(field) + '" data-cg-cat-search="' + esc(field) +
      '" autocomplete="off" placeholder="Search…" value="' +
      esc(has ? selected : "") + '" />' +
      '<ul class="cg-merit-suggest" data-cg-cat-suggest="' +
      esc(field) + '" hidden></ul></div>';
    html += '<div class="cg-merit-detail" data-cg-cat-detail="' +
      esc(field) + '"' + (has ? "" : " hidden") + ">" +
      '<p class="cg-merit-detail__name" data-cg-cat-name>' +
      esc(has ? selected : "") + "</p>" +
      '<p class="cg-merit-detail__meta muted" ' +
      'data-cg-cat-meta></p>' +
      '<p class="cg-catalog-blurb" data-cg-cat-blurb></p>' +
      '<button type="button" class="cg-btn cg-btn--tiny" ' +
      'data-cg-cat-clear="' + esc(field) +
      '">Clear</button></div>';
    html += "</div>";
    return html;
  }

  function catalogItems(field, sheet) {
    sheet = sheet || (state && state.sheet) || {};
    var cf = sheet.customFields || {};
    if (field === "seeming") {
      return (opts.seemings && opts.seemings.items) || [];
    }
    if (field === "kith") {
      var all = (opts.kiths && opts.kiths.items) || [];
      var seem = String(cf.seeming || "").trim().toLowerCase();
      if (!seem) return all;
      return all.filter(function (k) {
        return String(k.seeming || "").toLowerCase() === seem;
      });
    }
    if (field === "court") {
      return (opts.courts && opts.courts.items) || [];
    }
    if (field === "favored") {
      var regs = (opts.regalia && opts.regalia.items) || [];
      var seemName = String(cf.seeming || "").trim().toLowerCase();
      var blocked = "";
      if (seemName) {
        var slist = (opts.seemings && opts.seemings.items) || [];
        for (var si = 0; si < slist.length; si++) {
          if (
            String(slist[si].name).toLowerCase() === seemName
          ) {
            if (slist[si].favoredRegalia) {
              blocked = String(slist[si].favoredRegalia)
                .toLowerCase();
            }
            break;
          }
        }
      }
      if (!blocked) return regs;
      return regs.filter(function (r) {
        return String(r.name).toLowerCase() !== blocked;
      });
    }
    if (field === "clan") {
      return (opts.clans && opts.clans.items) || [];
    }
    if (field === "covenant") {
      return (opts.covenants && opts.covenants.items) || [];
    }
    if (
      field === "mask" ||
      field === "dirge" ||
      field === "virtue" ||
      field === "vice"
    ) {
      // Vampire Mask/Dirge share one archetype list.
      if (
        String(sheet.template || "").toLowerCase() === "vampire"
      ) {
        return (opts.masks && opts.masks.items) || [];
      }
      if (field === "virtue") {
        return (opts.virtues && opts.virtues.items) || [];
      }
      if (field === "vice") {
        return (opts.vices && opts.vices.items) || [];
      }
    }
    if (field === "discipline" || field === "powers") {
      return (opts.disciplines && opts.disciplines.items) || [];
    }
    return [];
  }

  function findCatalogItem(field, name, sheet) {
    var q = String(name || "").trim().toLowerCase();
    if (!q) return null;
    var pool;
    if (field === "seeming") {
      pool = (opts.seemings && opts.seemings.items) || [];
    } else if (field === "kith") {
      pool = (opts.kiths && opts.kiths.items) || [];
    } else if (field === "court") {
      pool = (opts.courts && opts.courts.items) || [];
    } else if (field === "favored") {
      pool = (opts.regalia && opts.regalia.items) || [];
    } else if (field === "clan") {
      pool = (opts.clans && opts.clans.items) || [];
    } else if (field === "covenant") {
      pool = (opts.covenants && opts.covenants.items) || [];
    } else if (
      field === "mask" || field === "dirge" ||
      field === "virtue" || field === "vice"
    ) {
      pool = catalogItems(field, sheet);
    } else if (field === "discipline" || field === "powers") {
      pool = (opts.disciplines && opts.disciplines.items) || [];
    } else {
      pool = catalogItems(field, sheet);
    }
    for (var i = 0; i < pool.length; i++) {
      var nm = String(pool[i].name || "").toLowerCase();
      var ky = String(pool[i].key || "").toLowerCase();
      if (nm === q || ky === q) return pool[i];
      // Prefix match for autocomplete (dae → Daeva)
      if (nm.indexOf(q) === 0 || ky.indexOf(q) === 0) {
        return pool[i];
      }
    }
    // Substring fallback
    for (var j = 0; j < pool.length; j++) {
      var nm2 = String(pool[j].name || "").toLowerCase();
      if (nm2.indexOf(q) !== -1) return pool[j];
    }
    return null;
  }

  function catalogMetaLine(field, item) {
    if (!item) return "";
    if (field === "seeming") {
      return "Favored Regalia: " + (item.favoredRegalia || "—");
    }
    if (field === "kith") {
      return "Seeming: " + (item.seeming || "—");
    }
    if (field === "court") {
      return item.emotion
        ? "Emotion: " + item.emotion
        : "";
    }
    if (field === "favored") {
      return item.favoredBy
        ? "Seeming affinity: " + item.favoredBy
        : "Second favored Regalia";
    }
    if (field === "clan" && item.disciplines) {
      return "In-clan: " +
        (item.disciplines.join
          ? item.disciplines.join(", ")
          : item.disciplines);
    }
    if (field === "covenant" && item.mechanic) {
      return "Mechanic: " + item.mechanic;
    }
    if (
      (field === "discipline" || field === "powers") &&
      item.inClanFor
    ) {
      return "In-clan for: " +
        (item.inClanFor.join
          ? item.inClanFor.join(", ")
          : item.inClanFor);
    }
    return "";
  }

  function catalogBlurb(item) {
    if (!item) return "";
    var parts = [];
    if (item.blessing) parts.push("Blessing: " + item.blessing);
    if (item.curse) parts.push("Curse: " + item.curse);
    if (item.bane) parts.push("Bane: " + item.bane);
    if (item.summary) parts.push(item.summary);
    if (item.description) parts.push(item.description);
    if (item.mantleNotes) parts.push(item.mantleNotes);
    return parts.join(" · ");
  }

  function fieldLabel(fname) {
    if (fname === "touchstonemask") return "Mask Touchstone";
    if (fname === "touchstonedirge") return "Dirge Touchstone";
    if (fname === "favored") return "Second favored Regalia";
    return titleCase(fname);
  }

  function fieldText(id, label, value, multiline) {
    var tag = multiline ? "textarea" : "input";
    var extra = multiline
      ? ""
      : ' type="text"';
    return '<div class="cg-field">' +
      '<label class="cg-field__label" for="' + id + '">' +
      esc(label) + "</label>" +
      "<" + tag + ' class="cg-' +
      (multiline ? "textarea" : "input") +
      '" id="' + id + '" data-cg-field="' + id + '"' +
      extra + (multiline ? ">" + esc(value || "") + "</textarea>"
        : ' value="' + esc(value || "") + '">') +
      "</div>";
  }

  function attrExtras(attrs) {
    attrs = attrs || {};
    function sum(keys) {
      var t = 0;
      for (var i = 0; i < keys.length; i++) {
        t += Math.max(0, (attrs[keys[i]] || 1) - 1);
      }
      return t;
    }
    return {
      mental: sum(["intelligence", "wits", "resolve"]),
      physical: sum(["strength", "dexterity", "stamina"]),
      social: sum(["presence", "manipulation", "composure"]),
    };
  }

  function skillSum(skills, keys) {
    skills = skills || {};
    var t = 0;
    for (var i = 0; i < keys.length; i++) {
      t += skills[keys[i]] || 0;
    }
    return t;
  }

  function renderDots(name, value, min, max) {
    min = min == null ? 0 : min;
    max = max == null ? 5 : max;
    var html = '<div class="cg-dots" data-cg-dots="' +
      esc(name) + '">';
    for (var i = 1; i <= max; i++) {
      var on = i <= value ? " is-on" : "";
      var v = i < min ? min : i;
      // clicking filled last dot toggles toward min
      html += '<button type="button" class="cg-dot' + on +
        '" data-cg-dot="' + esc(name) + '" data-val="' + i +
        '" aria-label="' + esc(name) + " " + i +
        '"></button>';
    }
    html += "</div>";
    return html;
  }

  function renderDotGroup(title, names, values, min) {
    values = values || {};
    min = min == null ? 0 : min;
    var html = '<div class="cg-group"><h3 class="cg-group__title">' +
      esc(title) + "</h3>";
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      var v = values[n] != null ? values[n] : min;
      html += '<div class="cg-dots-row">' +
        '<span class="cg-dots-row__label">' +
        esc(titleCase(n)) + "</span>" +
        renderDots(n, v, min, 5) +
        '<span class="cg-dots-row__val">' + v + "</span></div>";
    }
    html += "</div>";
    return html;
  }

  function renderStageBody(st) {
    var sh = st.sheet || {};
    var stage = st.stage;
    var html = "";

    if (stage === 1) {
      var isVamp1 =
        String(sh.template || "").toLowerCase() === "vampire";
      html += '<p class="cg-stage__hint">Define your core identity — ' +
        (isVamp1
          ? "concept, Mask (public face), and Dirge (true self)."
          : "concept, virtue (strength), and vice (flaw).") +
        " Same as <code>+cg</code> Stage 1.</p>";
      html += fieldText("concept", "Concept", sh.concept, true);
      if (isVamp1) {
        html += fieldCatalog(
          "mask",
          "Mask",
          sh.virtue,
          "Public face archetype — search list.",
        );
        html += fieldCatalog(
          "dirge",
          "Dirge",
          sh.vice,
          "True self archetype — same list as Mask.",
        );
      } else {
        html += fieldSelect(
          "virtue",
          "Virtue",
          (opts.virtues && opts.virtues.items) || [],
          sh.virtue,
        );
        html += fieldSelect(
          "vice",
          "Vice",
          (opts.vices && opts.vices.items) || [],
          sh.vice,
        );
      }
    } else if (stage === 2) {
      html += '<p class="cg-stage__hint">Choose your supernatural ' +
        "template (or Mortal).</p>";
      var items = (opts.templates && opts.templates.items) || [];
      html += '<div class="cg-cards" data-cg-templates>';
      for (var i = 0; i < items.length; i++) {
        var t = items[i];
        var key = t.key || t.name;
        var sel = String(sh.template || "").toLowerCase() ===
          String(key).toLowerCase()
          ? " is-selected"
          : "";
        html += '<button type="button" class="cg-card' + sel +
          '" data-cg-template="' + esc(key) + '">' +
          '<p class="cg-card__name">' + esc(t.name || key) +
          "</p>" +
          '<p class="cg-card__key">' + esc(key) + "</p></button>";
      }
      html += "</div>";
    } else if (stage === 3) {
      var tmplKey = String(sh.template || "").toLowerCase();
      if (tmplKey === "vampire") {
        html += '<p class="cg-stage__hint">Kindred details — ' +
          "search catalogs for clan and covenant. Set both " +
          "Touchstones (Mask anchor and Dirge anchor). " +
          "Bloodline is optional.</p>";
      } else {
        html += '<p class="cg-stage__hint">Template-specific details. ' +
          "Search catalogs like merits — seeming and kith work " +
          "together (pick either first). Court and second favored " +
          "Regalia are independent.</p>";
      }
      var fields = (st.templateMeta && st.templateMeta.customFields) ||
        [];
      var optional = { mask: 1, mien: 1, animals: 1, bloodline: 1 };
      var cf = sh.customFields || {};
      for (var f = 0; f < fields.length; f++) {
        var fname = fields[f];
        if (optional[fname]) continue;
        if (fname === "seeming") {
          html += fieldCatalog(
            "seeming",
            "Seeming",
            cf.seeming,
            "Sets favored Regalia; filters kiths.",
          );
        } else if (fname === "kith") {
          html += fieldCatalog(
            "kith",
            "Kith",
            cf.kith,
            cf.seeming
              ? "Kiths of " + cf.seeming +
                " (or pick any — sets seeming)."
              : "Pick a kith to set seeming, or choose seeming first.",
          );
        } else if (fname === "court") {
          html += fieldCatalog(
            "court",
            "Court",
            cf.court,
            "Seasonal court — free choice.",
          );
        } else if (fname === "favored") {
          html += fieldCatalog(
            "favored",
            "Second favored Regalia",
            cf.favored,
            "Must differ from your seeming's favored Regalia.",
          );
        } else if (fname === "clan") {
          html += fieldCatalog(
            "clan",
            "Clan",
            cf.clan,
            "Sets in-clan Disciplines.",
          );
        } else if (fname === "covenant") {
          html += fieldCatalog(
            "covenant",
            "Covenant",
            cf.covenant,
            "Includes Unaligned.",
          );
        } else if (
          fname === "touchstonemask" ||
          fname === "touchstonedirge"
        ) {
          html += fieldText(
            fname,
            fieldLabel(fname),
            cf[fname],
          );
        } else if (fname === "auspice" || fname === "tribe") {
          html += fieldText(fname, titleCase(fname), cf[fname]);
        } else {
          html += fieldText(
            fname,
            fieldLabel(fname),
            cf[fname],
          );
        }
      }
      if (tmplKey === "vampire") {
        html += fieldText(
          "bloodline",
          "Bloodline (optional)",
          cf.bloodline,
        );
        // Allow Mask/Dirge fix without leaving stage 3
        html += fieldCatalog(
          "mask",
          "Mask",
          sh.virtue,
          "Public face — can set here after picking vampire.",
        );
        html += fieldCatalog(
          "dirge",
          "Dirge",
          sh.vice,
          "True self archetype.",
        );
      }
      if (!fields.length) {
        html += '<p class="cg-stage__hint">No extra details for ' +
          "this template — continue.</p>";
      }
    } else if (stage === 4) {
      var ax = attrExtras(sh.attributes);
      var bad = ![3, 4, 5].every(function (n) {
        return [ax.mental, ax.physical, ax.social].indexOf(n) >= 0;
      });
      html += '<p class="cg-stage__hint">Assign free 1 in each, then ' +
        "extras as <strong>5 / 4 / 3</strong> across Mental, " +
        "Physical, and Social.</p>";
      html += '<p class="cg-pool' + (bad ? " is-bad" : "") +
        '">Extras — Mental <strong>+' + ax.mental +
        "</strong> · Physical <strong>+" + ax.physical +
        "</strong> · Social <strong>+" + ax.social +
        "</strong> (need 5/4/3)</p>";
      var A = opts.attributes || {};
      // In-game +cg: Mental | Physical | Social side-by-side
      html += '<div class="cg-stat-cols" data-cg-stat-cols>';
      html += renderDotGroup(
        "Mental",
        A.mental || ["intelligence", "wits", "resolve"],
        sh.attributes,
        1,
      );
      html += renderDotGroup(
        "Physical",
        A.physical || ["strength", "dexterity", "stamina"],
        sh.attributes,
        1,
      );
      html += renderDotGroup(
        "Social",
        A.social || ["presence", "manipulation", "composure"],
        sh.attributes,
        1,
      );
      html += "</div>";
    } else if (stage === 5) {
      var S = opts.skills || {};
      var mKeys = S.mental || [];
      var pKeys = S.physical || [];
      var sKeys = S.social || [];
      var ms = skillSum(sh.skills, mKeys);
      var ps = skillSum(sh.skills, pKeys);
      var ss = skillSum(sh.skills, sKeys);
      html += '<p class="cg-stage__hint">Skill priorities ' +
        "<strong>11 / 9 / 7</strong> across the three categories." +
        "</p>";
      html += '<p class="cg-pool">Totals — Mental <strong>' + ms +
        "</strong> · Physical <strong>" + ps +
        "</strong> · Social <strong>" + ss +
        "</strong> (need 11/9/7)</p>";
      html += '<div class="cg-stat-cols" data-cg-stat-cols>';
      html += renderDotGroup("Mental", mKeys, sh.skills, 0);
      html += renderDotGroup("Physical", pKeys, sh.skills, 0);
      html += renderDotGroup("Social", sKeys, sh.skills, 0);
      html += "</div>";
    } else if (stage === 6) {
      var mb = meritBudgetInfo(st);
      html += '<p class="cg-stage__hint">Pick merits from the ' +
        "catalog. <strong>Cost = dots</strong> at the rating " +
        "you choose (only legal ratings for that merit).</p>";
      html += '<p class="cg-pool' +
        (mb.remaining === 0 ? "" : "") +
        (mb.spent > mb.budget ? " is-bad" : "") +
        '">Merit dots — spent <strong>' + mb.spent +
        "</strong> / <strong>" + mb.budget +
        "</strong> · remaining <strong>" + mb.remaining +
        "</strong></p>";

      html += '<div class="cg-merit-picker" data-cg-merit-picker>';
      html += '<div class="cg-field cg-merit-search-wrap">' +
        '<label class="cg-field__label" for="merit-search">' +
        "Search merits</label>" +
        '<input type="search" class="cg-input" id="merit-search" ' +
        'data-cg-merit-search autocomplete="off" ' +
        'placeholder="Type a name…" />' +
        '<ul class="cg-merit-suggest" data-cg-merit-suggest ' +
        'hidden role="listbox"></ul></div>';

      html += '<div class="cg-merit-detail" data-cg-merit-detail ' +
        'hidden>' +
        '<p class="cg-merit-detail__name" data-cg-merit-sel-name>' +
        "</p>" +
        '<p class="cg-merit-detail__meta muted" ' +
        'data-cg-merit-sel-meta></p>' +
        '<div class="cg-field" data-cg-merit-qual-wrap hidden>' +
        '<label class="cg-field__label" for="merit-qual">' +
        "Qualifier (required)</label>" +
        '<input type="text" class="cg-input" id="merit-qual" ' +
        'data-cg-merit-qual placeholder="e.g. Spanish, Police" />' +
        "</div>" +
        '<div class="cg-field">' +
        '<span class="cg-field__label">Rating / cost</span>' +
        '<div class="cg-merit-dots" data-cg-merit-dots></div>' +
        '<p class="cg-merit-cost muted" data-cg-merit-cost></p>' +
        "</div>" +
        '<button type="button" class="cg-btn cg-btn--primary" ' +
        'data-cg-add-merit disabled>Add merit</button>' +
        "</div></div>";

      var merits = sh.merits || {};
      var mKeys2 = Object.keys(merits);
      if (mKeys2.length) {
        html += '<div class="cg-group cg-group--spaced">' +
          '<h3 class="cg-group__title">Selected</h3>' +
          '<ul class="cg-merit-list">';
        for (var mi = 0; mi < mKeys2.length; mi++) {
          var mk = mKeys2[mi];
          var md = merits[mk];
          html += '<li class="cg-merit-list__item">' +
            '<span>' + esc(formatMeritStorageKey(mk)) +
            ' <strong class="cg-merit-list__cost">' + md +
            " dot" + (md === 1 ? "" : "s") + "</strong></span>" +
            '<button type="button" class="cg-btn cg-btn--tiny" ' +
            'data-cg-remove-merit="' + esc(mk) +
            '">Remove</button></li>';
        }
        html += "</ul></div>";
      }
    } else if (stage >= 7) {
      var t7 = String(sh.template || "").toLowerCase();
      if (t7 === "vampire") {
        var discItems =
          (opts.disciplines && opts.disciplines.items) || [];
        var clanName = String(
          (sh.customFields && sh.customFields.clan) || "",
        );
        var pwr = sh.powers || {};
        var spentD = 0;
        Object.keys(pwr).forEach(function (k) {
          spentD += Number(pwr[k]) || 0;
        });
        html += '<p class="cg-stage__hint">Allocate ' +
          "<strong>3 Discipline dots</strong> (≥2 in-clan for " +
          esc(clanName || "your clan") +
          "). Search to add; use dots to set rating.</p>";
        html += '<p class="cg-pool' +
          (spentD === 3 ? "" : " is-bad") +
          '">Disciplines <strong>' + spentD +
          "</strong> / 3</p>";
        html += fieldCatalog(
          "discipline",
          "Add Discipline",
          "",
          "Type to search — pick, then set dots below.",
        );
        // Active disciplines as dot rows
        var dNames = discItems.map(function (d) {
          return d.key || String(d.name).toLowerCase();
        });
        // Show in-clan first
        var ordered = discItems.slice().sort(function (a, b) {
          var ai = (a.inClanFor || []).some(function (c) {
            return String(c).toLowerCase() ===
              clanName.toLowerCase();
          }) ? 0 : 1;
          var bi = (b.inClanFor || []).some(function (c) {
            return String(c).toLowerCase() ===
              clanName.toLowerCase();
          }) ? 0 : 1;
          return ai - bi ||
            String(a.name).localeCompare(String(b.name));
        });
        html += '<div class="cg-group"><h3 class="cg-group__title">' +
          "Disciplines</h3>";
        for (var di = 0; di < ordered.length; di++) {
          var d = ordered[di];
          var dkey = d.key || String(d.name).toLowerCase();
          var dv = Number(pwr[dkey]) || 0;
          var inC = (d.inClanFor || []).some(function (c) {
            return String(c).toLowerCase() ===
              clanName.toLowerCase();
          });
          var label = d.name + (inC ? " ★" : "");
          html += '<div class="cg-dots-row">' +
            '<span class="cg-dots-row__label">' +
            esc(label) + "</span>" +
            renderDots(dkey, dv, 0, 5) +
            '<span class="cg-dots-row__val">' + dv +
            "</span></div>";
        }
        html += "</div>";
      } else {
        html += '<p class="cg-stage__hint">Powers stage — for ' +
          "Changeling, choose Contracts with " +
          "<code>+cg/contract</code> (or finish here when " +
          "your package is complete).</p>";
        var contracts = sh.contracts || [];
        if (contracts.length) {
          html += "<ul>";
          for (var c = 0; c < contracts.length; c++) {
            html += "<li>" + esc(contracts[c]) + "</li>";
          }
          html += "</ul>";
        }
      }
    }

    return html;
  }

  function renderSheetSummary(st) {
    if (!st || !st.sheet) {
      return '<p class="cg-sheet__muted">No draft yet.</p>';
    }
    var sh = st.sheet;
    var cf = sh.customFields || {};
    var html = '<div class="cg-sheet">';
    html += '<div class="cg-sheet__block">' +
      '<p class="cg-sheet__label">Concept</p>' +
      '<p class="cg-sheet__value">' +
      esc(sh.concept || "—") + "</p></div>";
    html += '<div class="cg-sheet__block">' +
      '<p class="cg-sheet__label">Template</p>' +
      '<p class="cg-sheet__value">' +
      esc(titleCase(sh.template || "mortal")) + "</p></div>";
    html += '<div class="cg-sheet__block">' +
      '<p class="cg-sheet__label">Anchors</p>' +
      '<p class="cg-sheet__value">' +
      esc(sh.virtue || "—") + " / " +
      esc(sh.vice || "—") + "</p></div>";
    if (cf.seeming || cf.court) {
      html += '<div class="cg-sheet__block">' +
        '<p class="cg-sheet__label">Seeming / Court</p>' +
        '<p class="cg-sheet__value">' +
        esc(cf.seeming || "—") + " · " +
        esc(cf.kith || "—") + "<br>" +
        esc(cf.court || "—") + "</p></div>";
    }
    if (st.stage != null && st.maxStage != null && !st.approved) {
      html += '<div class="cg-sheet__block">' +
        '<p class="cg-sheet__label">Stage</p>' +
        '<p class="cg-sheet__value">' +
        st.stage + " / " + st.maxStage + " — " +
        esc(st.stageName || "") + "</p></div>";
    }
    html += "</div>";
    return html;
  }

  /** Canonical attr/skill columns (same as +cg / options API). */
  var LIVE_ATTRS = {
    mental: ["intelligence", "wits", "resolve"],
    physical: ["strength", "dexterity", "stamina"],
    social: ["presence", "manipulation", "composure"],
  };
  var LIVE_SKILLS = {
    mental: [
      "academics", "computer", "crafts", "investigation",
      "medicine", "occult", "politics", "science",
    ],
    physical: [
      "athletics", "brawl", "drive", "firearms",
      "larceny", "stealth", "survival", "weaponry",
    ],
    social: [
      "animal ken", "empathy", "expression", "intimidation",
      "persuasion", "socialize", "streetwise", "subterfuge",
    ],
  };

  /** Read-only dots row (chargen look, not clickable). */
  function renderReadonlyDots(name, value, maxDots) {
    maxDots = maxDots || 5;
    var n = Math.max(0, Math.min(maxDots, Number(value) || 0));
    var html = '<div class="cg-dots-row cg-dots-row--ro">' +
      '<span class="cg-dots-row__label">' +
      esc(titleCase(name)) + "</span>" +
      '<span class="cg-dots" aria-label="' +
      esc(titleCase(name)) + " " + n + '">';
    for (var i = 1; i <= maxDots; i++) {
      html += '<span class="cg-dot' +
        (i <= n ? " is-on" : "") +
        '" aria-hidden="true"></span>';
    }
    html += '</span><span class="cg-dots-row__num">' +
      n + "</span></div>";
    return html;
  }

  function renderReadonlyDotGroup(title, names, values) {
    values = values || {};
    var html = '<div class="cg-group">' +
      '<h3 class="cg-group__title">' + esc(title) + "</h3>";
    for (var i = 0; i < names.length; i++) {
      var key = names[i];
      var v = values[key];
      if (v == null) v = values[key.toLowerCase()];
      html += renderReadonlyDots(key, v != null ? v : 0, 5);
    }
    html += "</div>";
    return html;
  }

  /**
   * One category column: Attributes then Skills (CoFD sheet order).
   * Mobile stacks columns Mental → Physical → Social.
   */
  function renderCategoryCol(label, attrKeys, skillKeys, attrs, skills) {
    var html = '<div class="cg-live__col" data-cg-cat="' +
      esc(label.toLowerCase()) + '">';
    html += '<h3 class="cg-live__col-title">' + esc(label) + "</h3>";
    html += '<p class="cg-live__col-sub">Attributes</p>';
    for (var i = 0; i < attrKeys.length; i++) {
      var ak = attrKeys[i];
      var av = attrs[ak];
      if (av == null) av = attrs[ak.toLowerCase()];
      html += renderReadonlyDots(ak, av != null ? av : 1, 5);
    }
    html += '<p class="cg-live__col-sub">Skills</p>';
    for (var j = 0; j < skillKeys.length; j++) {
      var sk = skillKeys[j];
      var sv = skills[sk];
      if (sv == null) sv = skills[sk.toLowerCase()];
      html += renderReadonlyDots(sk, sv != null ? sv : 0, 5);
    }
    html += "</div>";
    return html;
  }

  /**
   * CoFD health boxes (same order as +sheet / +health):
   * aggravated [*], lethal [X], bashing [/], empty [ ].
   * Heaviest damage is leftmost.
   */
  function renderHealthBoxes(track, max) {
    max = Math.max(0, Math.min(20, Number(max) || 0));
    if (!max) {
      return '<span class="cg-track cg-track--empty">—</span>';
    }
    var agg = Math.max(0, Number(track && track.aggravated) || 0);
    var leth = Math.max(0, Number(track && track.lethal) || 0);
    var bash = Math.max(0, Number(track && track.bashing) || 0);
    var html = '<span class="cg-track cg-track--health" ' +
      'role="img" aria-label="Health track, ' + max +
      ' boxes">';
    for (var i = 0; i < max; i++) {
      var kind = "empty";
      var mark = "";
      var title = "Empty";
      if (agg > 0) {
        kind = "agg";
        mark = "★";
        title = "Aggravated";
        agg -= 1;
      } else if (leth > 0) {
        kind = "leth";
        mark = "✕";
        title = "Lethal";
        leth -= 1;
      } else if (bash > 0) {
        kind = "bash";
        mark = "/";
        title = "Bashing";
        bash -= 1;
      }
      html += '<span class="cg-hbox cg-hbox--' + kind +
        '" title="' + title + '" aria-hidden="true">' +
        mark + "</span>";
    }
    html += "</span>";
    return html;
  }

  /** Willpower boxes: filled = current, open = spent. */
  function renderWillpowerBoxes(cur, max) {
    max = Math.max(0, Math.min(20, Number(max) || 0));
    cur = Math.max(0, Math.min(max, Number(cur) || 0));
    if (!max) {
      return '<span class="cg-track cg-track--empty">—</span>';
    }
    var html = '<span class="cg-track cg-track--wp" ' +
      'role="img" aria-label="Willpower ' + cur + " of " +
      max + '">';
    for (var i = 0; i < max; i++) {
      var on = i < cur;
      html += '<span class="cg-wbox' +
        (on ? " is-on" : "") +
        '" title="' + (on ? "Available" : "Spent") +
        '" aria-hidden="true"></span>';
    }
    html += "</span>";
    return html;
  }

  /** stamina + size, or advantages.healthMax when set. */
  function liveHealthMax(sh, adv) {
    if (adv.healthMax != null && adv.healthMax !== "") {
      return Number(adv.healthMax) || 0;
    }
    var attrs = sh.attributes || {};
    var stam = Number(attrs.stamina != null
      ? attrs.stamina
      : attrs.Stamina) || 1;
    var size = adv.size != null ? Number(adv.size) : 5;
    if (!size) size = 5;
    return stam + size;
  }

  function renderAdvantagesBlock(st) {
    var sh = st.sheet || {};
    var adv = sh.advantages || {};
    var attrs = sh.attributes || {};
    var skills = sh.skills || {};
    var meta = st.templateMeta || {};
    var size = adv.size != null ? Number(adv.size) : 5;
    if (!size) size = 5;
    var wpMax = adv.willpowerMax != null
      ? Number(adv.willpowerMax)
      : 0;
    var wpCur = adv.willpowerCurrent != null
      ? Number(adv.willpowerCurrent)
      : wpMax;
    var hMax = liveHealthMax(sh, adv);
    var track = sh.health || {
      bashing: 0, lethal: 0, aggravated: 0,
    };
    // Prefer stored advantages; else derive CoFD defaults
    var dex = Number(attrs.dexterity) || 1;
    var wit = Number(attrs.wits) || 1;
    var com = Number(attrs.composure) || 1;
    var str = Number(attrs.strength) || 1;
    var ath = Number(
      skills.athletics != null
        ? skills.athletics
        : skills["Athletics"],
    ) || 0;
    var speed = adv.speed != null
      ? adv.speed
      : (str + dex + 5);
    var defense = adv.defense != null
      ? adv.defense
      : (Math.min(dex, wit) + ath);
    var init = adv.initiativeMod != null
      ? adv.initiativeMod
      : (adv.initiative != null ? adv.initiative : (dex + com));
    var morName = meta.moralityName || "Integrity";
    var powName = meta.powerStatName || "Power";

    var html = '<section class="cg-live__block cg-live__adv" ' +
      'data-cg-sec="advantages" aria-label="Advantages">';
    html += '<h3 class="cg-live__section">Advantages</h3>';

    // Health track (boxes like +sheet)
    html += '<div class="cg-live__track-row">' +
      '<span class="cg-live__track-label">Health</span>' +
      renderHealthBoxes(track, hMax) +
      '<span class="cg-live__track-meta">(' + hMax +
      ")</span></div>";

    // Willpower track
    html += '<div class="cg-live__track-row">' +
      '<span class="cg-live__track-label">Willpower</span>' +
      renderWillpowerBoxes(wpCur, wpMax) +
      '<span class="cg-live__track-meta">' +
      wpCur + "/" + wpMax + "</span></div>";

    // Legend
    html += '<p class="cg-live__track-legend" aria-hidden="true">' +
      '<span class="cg-hbox cg-hbox--empty"></span> empty · ' +
      '<span class="cg-hbox cg-hbox--bash">/</span> bashing · ' +
      '<span class="cg-hbox cg-hbox--leth">✕</span> lethal · ' +
      '<span class="cg-hbox cg-hbox--agg">★</span> aggravated' +
      "</p>";

    // Numeric advantages grid
    html += '<div class="cg-live__adv-grid">';
    html +=
      "<span>Size <strong>" + esc(size) + "</strong></span>" +
      "<span>Speed <strong>" + esc(speed) + "</strong></span>" +
      "<span>Defense <strong>" + esc(defense) +
      "</strong></span>" +
      "<span>Initiative <strong>" + esc(init) +
      "</strong></span>";
    if (sh.moralityValue != null) {
      html += "<span>" + esc(morName) + " <strong>" +
        esc(sh.moralityValue) + "</strong></span>";
    }
    if (sh.powerStatValue != null &&
      Number(sh.powerStatValue) > 0 &&
      String(powName).toLowerCase() !== "none") {
      html += "<span>" + esc(powName) + " <strong>" +
        esc(sh.powerStatValue) + "</strong></span>";
    }
    html += "</div></section>";
    return html;
  }

  /**
   * Full live sheet — identity, traits, specialties / merits /
   * powers, then advantages (health boxes) at the bottom.
   */
  function renderLiveSheet(st) {
    var sh = st.sheet || {};
    var cf = sh.customFields || {};
    var attrs = sh.attributes || {};
    var skills = sh.skills || {};
    var merits = sh.merits || {};
    var A = (opts.attributes) || LIVE_ATTRS;
    var S = (opts.skills) || LIVE_SKILLS;
    var mKeys = A.mental || LIVE_ATTRS.mental;
    var pKeys = A.physical || LIVE_ATTRS.physical;
    var sKeys = A.social || LIVE_ATTRS.social;
    var sm = S.mental || LIVE_SKILLS.mental;
    var sp = S.physical || LIVE_SKILLS.physical;
    var ss = S.social || LIVE_SKILLS.social;

    var html = '<div class="cg-live">';

    // 1. Identity
    html += '<section class="cg-live__block cg-live__id" ' +
      'data-cg-sec="identity">';
    html += '<p class="cg-live__concept">' +
      esc(sh.concept || "Character") + "</p>";
    html += '<p class="cg-live__meta">' +
      esc(titleCase(sh.template || "mortal"));
    if (cf.seeming || cf.kith || cf.court) {
      html += " · " +
        esc([cf.seeming, cf.kith, cf.court]
          .filter(Boolean).join(" / "));
    }
    if (cf.auspice || cf.tribe) {
      html += " · " +
        esc([cf.auspice, cf.tribe].filter(Boolean).join(" / "));
    }
    html += "</p>";
    html += '<p class="cg-live__anchors">' +
      "<span>Virtue <strong>" + esc(sh.virtue || "—") +
      "</strong></span>" +
      "<span>Vice <strong>" + esc(sh.vice || "—") +
      "</strong></span>";
    if (cf.needle || cf.thread) {
      html += "<span>Needle <strong>" +
        esc(cf.needle || "—") + "</strong></span>" +
        "<span>Thread <strong>" +
        esc(cf.thread || "—") + "</strong></span>";
    }
    html += "</p></section>";

    // 2. Stats — one column per category (stacks cleanly on phone)
    html += '<section class="cg-live__block" data-cg-sec="stats">';
    html += '<h3 class="cg-live__section">Traits</h3>';
    html += '<div class="cg-live__cols">';
    html += renderCategoryCol(
      "Mental", mKeys, sm, attrs, skills,
    );
    html += renderCategoryCol(
      "Physical", pKeys, sp, attrs, skills,
    );
    html += renderCategoryCol(
      "Social", sKeys, ss, attrs, skills,
    );
    html += "</div></section>";

    // 3. Specialties
    var specs = sh.specialties || {};
    var specKeys = Object.keys(specs).filter(function (k) {
      return specs[k];
    }).sort();
    if (specKeys.length) {
      html += '<section class="cg-live__block" ' +
        'data-cg-sec="specialties">' +
        '<h3 class="cg-live__section">Specialties</h3>' +
        '<ul class="cg-merit-list">';
      for (var si = 0; si < specKeys.length; si++) {
        var skn = specKeys[si];
        html += '<li class="cg-merit-list__item"><span>' +
          esc(titleCase(skn)) + " — " +
          esc(String(specs[skn])) +
          "</span></li>";
      }
      html += "</ul></section>";
    }

    // 4. Merits (stable alpha order)
    var mKeys2 = Object.keys(merits).filter(function (k) {
      return (Number(merits[k]) || 0) > 0;
    }).sort(function (a, b) {
      return formatMeritStorageKey(a).localeCompare(
        formatMeritStorageKey(b),
      );
    });
    html += '<section class="cg-live__block" data-cg-sec="merits">' +
      '<h3 class="cg-live__section">Merits</h3>';
    if (!mKeys2.length) {
      html += '<p class="cg-sheet__muted">None.</p>';
    } else {
      html += '<ul class="cg-merit-list">';
      for (var mi = 0; mi < mKeys2.length; mi++) {
        var mk = mKeys2[mi];
        var md = Number(merits[mk]) || 0;
        html += '<li class="cg-merit-list__item">' +
          "<span>" + esc(formatMeritStorageKey(mk)) +
          ' <strong class="cg-merit-list__cost">' + md +
          " dot" + (md === 1 ? "" : "s") +
          "</strong></span></li>";
      }
      html += "</ul>";
    }
    html += "</section>";

    // 5. Contracts
    var contracts = sh.contracts || [];
    if (contracts.length) {
      html += '<section class="cg-live__block" ' +
        'data-cg-sec="contracts">' +
        '<h3 class="cg-live__section">Contracts</h3>' +
        '<ul class="cg-merit-list">';
      for (var ci = 0; ci < contracts.length; ci++) {
        html += '<li class="cg-merit-list__item"><span>' +
          esc(String(contracts[ci])) + "</span></li>";
      }
      html += "</ul></section>";
    }

    // 6. Powers / Renown
    var powers = sh.powers || {};
    var pKeys2 = Object.keys(powers).filter(function (k) {
      return (Number(powers[k]) || 0) > 0;
    }).sort();
    if (pKeys2.length) {
      html += '<section class="cg-live__block" ' +
        'data-cg-sec="powers">' +
        '<h3 class="cg-live__section">Powers</h3>' +
        '<div class="cg-live__power-dots">';
      for (var pi = 0; pi < pKeys2.length; pi++) {
        html += renderReadonlyDots(
          pKeys2[pi],
          powers[pKeys2[pi]],
          5,
        );
      }
      html += "</div></section>";
    }

    // 7. Advantages last (health / willpower boxes + derived)
    html += renderAdvantagesBlock(st);

    html += "</div>";
    return html;
  }

  function renderMain(st) {
    var main = qs("[data-site-main]");
    if (!main) return;

    if (!st) {
      main.innerHTML =
        '<section class="site-section cg-root">' +
        '<div class="cg-gate">' +
        '<h2 class="cg-header__title">Character Generation</h2>' +
        "<p>Loading…</p></div></section>";
      return;
    }

    // Approved / live sheet — Character tab (structured UI)
    var showLive = !!(st.approved || st.isApproved ||
      (st.closed && st.sheet && !st.stage) ||
      (st.sheet && st.sheetText && !st.stage));
    if (showLive && st.sheet) {
      // Staff only — never show wipe to players.
      var wipeLive = !!(st.isStaff && st.canWipe !== false);
      main.innerHTML =
        '<section class="site-section cg-root" data-cg-root>' +
        '<header class="cg-header">' +
        '<h2 class="cg-header__title">Character</h2>' +
        '<p class="cg-header__sub">Live sheet' +
        (st.name ? " — " + esc(st.name) : "") +
        "</p></header>" +
        renderLiveSheet(st) +
        (wipeLive
          ? '<div class="cg-actions cg-actions--wipe">' +
            '<button type="button" class="cg-btn cg-btn--danger" ' +
            'data-cg-wipe>Wipe character</button>' +
            '<p class="cg-wipe-hint muted">Staff only. ' +
            "Clears live sheet, approval, and draft " +
            "(<code>+cg/wipe</code>).</p></div>"
          : "") +
        '<div class="cg-error" data-cg-error hidden></div>' +
        "</section>";
      var rightLive = qs("[data-site-right-panels]");
      if (rightLive) {
        rightLive.innerHTML =
          '<section class="site-menu menu">' +
          '<h2 class="site-menu__title">Sheet</h2>' +
          renderSheetSummary(st) + "</section>";
      }
      wireWipe();
      return;
    }

    if (st.closed && !st.sheet && !st.sheetText) {
      main.innerHTML =
        '<section class="site-section cg-root">' +
        '<div class="cg-gate">' +
        '<h2 class="cg-header__title">Character</h2>' +
        "<p>" + esc(st.reason || "No live sheet yet.") +
        "</p>" +
        '<p class="muted">If you were just approved, refresh. ' +
        "Otherwise finish chargen and wait for staff.</p>" +
        '<button type="button" class="cg-btn cg-btn--primary" ' +
        'data-cg-reload-sheet>Refresh sheet</button> ' +
        '<a class="cg-btn" href="/">Home</a>' +
        "</div></section>";
      var reload = qs("[data-cg-reload-sheet]");
      if (reload) {
        reload.addEventListener("click", function () {
          boot();
        });
      }
      return;
    }

    if (st.isSubmitted && !st.needAuth) {
      var jobN = st.jobNumber || st.submittedJob;
      var canW = !!(st.isStaff && st.canWipe !== false);
      main.innerHTML =
        '<section class="site-section cg-root" data-cg-root>' +
        '<div class="cg-gate cg-gate--ok">' +
        '<h2 class="cg-header__title">Submitted for review</h2>' +
        "<p>Your character <strong>" +
        esc((st.sheet && st.sheet.concept) || "draft") +
        "</strong> is with staff" +
        (jobN ? " as CGEN job <strong>#" + esc(jobN) +
          "</strong>" : "") +
        ".</p>" +
        "<p class=\"muted\">They will review the sheet, then " +
        "approve or return it with notes. You can still check " +
        "status in-game with <code>+cg</code>.</p>" +
        '<div class="cg-actions">' +
        '<a class="cg-btn cg-btn--primary" href="/">Home</a>' +
        (canW
          ? ' <button type="button" class="cg-btn cg-btn--danger" ' +
            'data-cg-wipe>Wipe &amp; restart</button>'
          : "") +
        "</div>" +
        '<div class="cg-error" data-cg-error hidden></div>' +
        "</div></section>";
      var rightSub = qs("[data-site-right-panels]");
      if (rightSub) {
        rightSub.innerHTML =
          '<section class="site-menu menu">' +
          '<h2 class="site-menu__title">Draft sheet</h2>' +
          renderSheetSummary(st) + "</section>";
      }
      wireWipe();
      return;
    }

    if (st.needAuth) {
      main.innerHTML =
        '<section class="site-section cg-root">' +
        '<div class="cg-gate">' +
        '<h2 class="cg-header__title">Character Generation</h2>' +
        "<p>Sign in to build your character with the same " +
        "stepper as in-game <code>+cg</code>.</p>" +
        '<a class="cg-btn cg-btn--primary" href="/login">' +
        "Sign in</a> " +
        '<button type="button" class="cg-btn" data-cg-demo>' +
        "Try demo</button>" +
        "</div></section>";
      return;
    }

    // Active session if started flag OR sheet/stage present
    var active = st.started === true ||
      !!(st.sheet && st.stage != null);
    if (!active) {
      main.innerHTML =
        '<section class="site-section cg-root">' +
        '<div class="cg-gate">' +
        '<h2 class="cg-header__title">Character Generation</h2>' +
        "<p>Guided creation matching in-game stages — " +
        "Concept, Template, Details, Attributes, Skills, " +
        "Merits, and Powers.</p>" +
        '<button type="button" class="cg-btn cg-btn--primary" ' +
        'data-cg-start>Begin chargen</button>' +
        "</div></section>";
      return;
    }
    st.started = true;

    var stages = st.stages || [];
    var html = '<section class="site-section cg-root" data-cg-root>' +
      '<header class="cg-header">' +
      '<h2 class="cg-header__title">Character Generation</h2>' +
      '<p class="cg-header__sub">Stage ' + st.stage + " of " +
      st.maxStage + " — " + esc(st.stageName || "") +
      (demo ? " · demo" : "") + "</p></header>";

    html += renderStepper(stages, st.stage);
    html += '<div class="cg-error" data-cg-error hidden></div>';
    html += '<div class="cg-ok" data-cg-ok hidden></div>';
    html += '<div class="cg-stage" data-cg-stage>' +
      '<h3 class="cg-stage__title">' +
      esc(st.stageName || ("Stage " + st.stage)) + "</h3>" +
      renderStageBody(st) + "</div>";

    html += '<div class="cg-actions">' +
      '<button type="button" class="cg-btn" data-cg-back' +
      (st.stage <= 1 ? " disabled" : "") + ">Back</button>" +
      '<button type="button" class="cg-btn cg-btn--primary" ' +
      'data-cg-next>' +
      (st.stage >= st.maxStage ? "Finish" : "Next stage") +
      "</button>" +
      (st.isStaff
        ? ' <button type="button" class="cg-btn cg-btn--danger" ' +
          'data-cg-wipe>Wipe</button>'
        : "") +
      "</div></section>";

    main.innerHTML = html;

    if (st.validationError && !st.canAdvance) {
      setMsg(qs("[data-cg-error]"), st.validationError, true);
    }

    var right = qs("[data-site-right-panels]");
    if (right) {
      right.innerHTML =
        '<section class="site-menu menu">' +
        '<h2 class="site-menu__title">Draft sheet</h2>' +
        renderSheetSummary(st) + "</section>";
    }

    wireStage();
    wireWipe();
  }

  /**
   * Full character wipe via POST /chargen/wipe (same as +cg/wipe).
   */
  function wireWipe() {
    var btn = qs("[data-cg-wipe]");
    if (!btn || btn._cgWipeBound) return;
    // Never bind wipe for non-staff (defense in depth).
    if (!state || !state.isStaff) {
      btn.remove();
      return;
    }
    btn._cgWipeBound = true;
    btn.addEventListener("click", function () {
      if (busy) return;
      if (!state || !state.isStaff) return;
      var approved = !!(state.approved || state.isApproved);
      var msg = approved
        ? "Wipe this character completely?\n\n" +
          "Removes the live sheet, approval, sight flags, " +
          "and chargen draft, then starts a fresh draft.\n" +
          "This cannot be undone."
        : "Staff wipe of this chargen draft?\n\n" +
          "Clears the draft (and any live sheet) " +
          "and starts over at Stage 1.";
      if (!window.confirm(msg)) return;
      var reason = window.prompt(
        "Optional note for the wipe (logged / mailed):",
        "",
      ) || "";
      busy = true;
      (async function () {
        try {
          state = await api("POST", "/wipe", {
            reason: reason,
          });
          if (state && state.wiped) {
            state.approved = false;
            state.isApproved = false;
            state.closed = false;
            state.sheetText = "";
          }
          renderMain(state);
          setMsg(
            qs("[data-cg-ok]"),
            "Character wiped. Fresh chargen draft ready.",
            false,
          );
          var okEl = qs("[data-cg-ok]");
          if (okEl) okEl.hidden = false;
        } catch (err) {
          setMsg(
            qs("[data-cg-error]"),
            (err && err.message) || "Wipe failed.",
            true,
          );
        } finally {
          busy = false;
        }
      })();
    });
  }

  // ── Events ─────────────────────────────────────────────────────

  async function applyTrait(trait, value, opts) {
    opts = opts || {};
    if (busy) return;
    busy = true;
    try {
      state = await api("POST", "/set", {
        trait: trait,
        value: String(value),
      });
      if (trait === "seeming" || trait === "kith") {
        await loadKiths(
          (state.sheet && state.sheet.customFields &&
            state.sheet.customFields.seeming) || value,
        );
      }
      // Full re-render only when layout must change (template /
      // dots / seeming↔kith / favored). Text fields keep focus.
      var heavy = opts.rerender ||
        trait === "template" ||
        trait === "seeming" ||
        trait === "kith" ||
        trait === "court" ||
        trait === "favored" ||
        opts.dots;
      if (heavy) {
        renderMain(state);
      } else {
        setMsg(
          qs("[data-cg-error]"),
          state.canAdvance ? "" : (state.validationError || ""),
          !state.canAdvance,
        );
        setMsg(qs("[data-cg-ok]"), "", false);
        var right = qs("[data-site-right-panels]");
        if (right) {
          right.innerHTML =
            '<section class="site-menu menu">' +
            '<h2 class="site-menu__title">Draft sheet</h2>' +
            renderSheetSummary(state) + "</section>";
        }
      }
    } catch (e) {
      setMsg(
        qs("[data-cg-error]"),
        e.message || "Could not save.",
        true,
      );
      if (e.data && e.data.sheet) {
        state = Object.assign(state || {}, e.data);
      }
    } finally {
      busy = false;
    }
  }

  /** Selected merit def + chosen rating for stage 6. */
  var meritPick = { def: null, dots: 0 };

  function fillCatalogDetail(root, field, item) {
    var detail = qs(
      '[data-cg-cat-detail="' + field + '"]',
      root,
    );
    if (!detail) return;
    if (!item) {
      detail.hidden = true;
      return;
    }
    detail.hidden = false;
    var nm = qs("[data-cg-cat-name]", detail);
    var meta = qs("[data-cg-cat-meta]", detail);
    var blurb = qs("[data-cg-cat-blurb]", detail);
    if (nm) nm.textContent = item.name || "";
    if (meta) meta.textContent = catalogMetaLine(field, item);
    if (blurb) {
      var t = catalogBlurb(item);
      blurb.textContent = t;
      blurb.hidden = !t;
    }
  }

  function wireCatalogPickers(root) {
    var pickers = root.querySelectorAll("[data-cg-catalog]");
    if (!pickers.length) return;
    var sheet = (state && state.sheet) || {};

    pickers.forEach(function (box) {
      var field = box.getAttribute("data-cg-catalog");
      if (!field) return;
      var search = qs('[data-cg-cat-search="' + field + '"]', box);
      var suggest = qs(
        '[data-cg-cat-suggest="' + field + '"]',
        box,
      );
      if (!search || !suggest) return;

      // Hydrate detail from current sheet value.
      var cur = "";
      if (field === "mask" || field === "virtue") {
        cur = sheet.virtue || "";
      } else if (field === "dirge" || field === "vice") {
        cur = sheet.vice || "";
      } else if (field === "discipline" || field === "powers") {
        cur = "";
      } else {
        cur = (sheet.customFields &&
          sheet.customFields[field]) || "";
      }
      if (cur) {
        fillCatalogDetail(
          box,
          field,
          findCatalogItem(field, cur, sheet),
        );
      }

      function hideSuggest() {
        suggest.hidden = true;
        suggest.innerHTML = "";
      }

      function showSuggest(q) {
        q = String(q || "").trim().toLowerCase();
        var items = catalogItems(field, state && state.sheet);
        if (!q || q.length < 1) {
          // Empty query: show first N so lists feel browsable.
          items = items.slice(0, 12);
        } else {
          var hits = [];
          for (
            var i = 0;
            i < items.length && hits.length < 12;
            i++
          ) {
            var it = items[i];
            var hay = (
              it.name + " " +
              (it.key || "") + " " +
              (it.seeming || "") + " " +
              (it.emotion || "") + " " +
              (it.favoredRegalia || "") + " " +
              (it.favoredBy || "") + " " +
              (it.mechanic || "") + " " +
              ((it.inClanFor && it.inClanFor.join)
                ? it.inClanFor.join(" ")
                : "") + " " +
              (it.summary || "") + " " +
              (it.description || "") + " " +
              (it.bane || "")
            ).toLowerCase();
            if (hay.indexOf(q) !== -1) hits.push(it);
          }
          items = hits;
        }
        if (!items.length) {
          suggest.innerHTML =
            '<li class="cg-merit-suggest__empty">No matches' +
            (field === "kith" &&
              !(state && state.sheet &&
                state.sheet.customFields &&
                state.sheet.customFields.seeming)
              ? " — try a seeming first, or type a kith name"
              : "") +
            "</li>";
          suggest.hidden = false;
          return;
        }
        var html = "";
        for (var h = 0; h < items.length; h++) {
          var m = items[h];
          var sub = catalogMetaLine(field, m) || "";
          html += '<li role="option" tabindex="0" ' +
            'data-cg-cat-pick="' + esc(m.name) + '">' +
            '<span class="cg-merit-suggest__name">' +
            esc(m.name) + "</span>" +
            (sub
              ? '<span class="cg-merit-suggest__cost">' +
                esc(sub) + "</span>"
              : "") +
            "</li>";
        }
        suggest.innerHTML = html;
        suggest.hidden = false;
      }

      function pick(name) {
        var item = findCatalogItem(
          field,
          name,
          state && state.sheet,
        );
        if (!item) return;
        search.value = item.name;
        hideSuggest();
        fillCatalogDetail(box, field, item);
        if (field === "discipline" || field === "powers") {
          // Add 1 dot (or keep existing) under power key.
          var pkey = (item.key || item.name).toLowerCase();
          var curP = (state.sheet.powers &&
            state.sheet.powers[pkey]) || 0;
          var next = curP > 0 ? curP : 1;
          applyTrait(pkey, String(next), { rerender: true });
          return;
        }
        if (field === "mask") {
          applyTrait("mask", item.name, { rerender: true });
          return;
        }
        if (field === "dirge") {
          applyTrait("dirge", item.name, { rerender: true });
          return;
        }
        applyTrait(field, item.name, { rerender: true });
      }

      search.addEventListener("input", function () {
        showSuggest(search.value);
      });
      search.addEventListener("focus", function () {
        showSuggest(search.value);
      });
      search.addEventListener("keydown", function (e) {
        if (e.key === "Escape") hideSuggest();
        if (e.key === "Enter") {
          e.preventDefault();
          var first = qs("[data-cg-cat-pick]", suggest);
          if (first && !suggest.hidden) {
            pick(first.getAttribute("data-cg-cat-pick"));
          }
        }
      });

      suggest.addEventListener("click", function (e) {
        var li = e.target && e.target.closest
          ? e.target.closest("[data-cg-cat-pick]")
          : null;
        if (!li) return;
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
      if (!root.contains(e.target)) return;
      root.querySelectorAll("[data-cg-cat-suggest]").forEach(
        function (sug) {
          var wrap = sug.closest("[data-cg-catalog]");
          if (!wrap) return;
          var inp = qs("[data-cg-cat-search]", wrap);
          if (
            inp &&
            (inp.contains(e.target) || sug.contains(e.target))
          ) {
            return;
          }
          sug.hidden = true;
          sug.innerHTML = "";
        },
      );
    });
  }

  function wireMeritPicker(root) {
    var search = qs("[data-cg-merit-search]", root);
    var suggest = qs("[data-cg-merit-suggest]", root);
    var detail = qs("[data-cg-merit-detail]", root);
    var addBtn = qs("[data-cg-add-merit]", root);
    if (!search || !suggest) return;

    function hideSuggest() {
      suggest.hidden = true;
      suggest.innerHTML = "";
    }

    function showSuggest(q) {
      q = String(q || "").trim().toLowerCase();
      var items = meritCatalog();
      if (!q || q.length < 1) {
        hideSuggest();
        return;
      }
      var hits = [];
      for (var i = 0; i < items.length && hits.length < 12; i++) {
        var it = items[i];
        var hay = (it.name + " " + it.key + " " + it.category)
          .toLowerCase();
        if (hay.indexOf(q) !== -1) hits.push(it);
      }
      if (!hits.length) {
        suggest.innerHTML =
          '<li class="cg-merit-suggest__empty">No matches</li>';
        suggest.hidden = false;
        return;
      }
      var html = "";
      for (var h = 0; h < hits.length; h++) {
        var m = hits[h];
        var costHint = m.allowedDots.length === 1
          ? m.allowedDots[0] + " dots"
          : m.allowedDots.join("/") + " dots";
        html += '<li role="option" tabindex="0" ' +
          'data-cg-merit-pick="' + esc(m.key) + '">' +
          '<span class="cg-merit-suggest__name">' +
          esc(m.name) + "</span>" +
          '<span class="cg-merit-suggest__cost">' +
          esc(costHint) +
          (m.instanced ? " · needs qualifier" : "") +
          "</span></li>";
      }
      suggest.innerHTML = html;
      suggest.hidden = false;
    }

    function selectMerit(key) {
      var def = findMeritDef(key);
      if (!def) return;
      meritPick.def = def;
      meritPick.dots = def.allowedDots[0] || 1;
      search.value = def.name;
      hideSuggest();
      if (!detail) return;
      detail.hidden = false;
      var nm = qs("[data-cg-merit-sel-name]", root);
      var meta = qs("[data-cg-merit-sel-meta]", root);
      if (nm) nm.textContent = def.name;
      if (meta) {
        meta.textContent = def.category +
          " · allowed " + def.allowedDots.join(", ") +
          " · min cost " + def.minCost;
      }
      var qw = qs("[data-cg-merit-qual-wrap]", root);
      if (qw) qw.hidden = !def.instanced;
      var qin = qs("[data-cg-merit-qual]", root);
      if (qin) qin.value = "";
      renderMeritDotChoices(root, def);
      updateMeritCostLabel(root);
      if (addBtn) addBtn.disabled = false;
    }

    function renderMeritDotChoices(rootEl, def) {
      var box = qs("[data-cg-merit-dots]", rootEl);
      if (!box) return;
      var html = "";
      for (var i = 0; i < def.allowedDots.length; i++) {
        var d = def.allowedDots[i];
        var on = d === meritPick.dots ? " is-selected" : "";
        html += '<button type="button" class="cg-merit-dot-btn' +
          on + '" data-cg-merit-dot="' + d + '">' +
          d + "</button>";
      }
      box.innerHTML = html;
      box.querySelectorAll("[data-cg-merit-dot]").forEach(
        function (btn) {
          btn.addEventListener("click", function () {
            meritPick.dots = parseInt(
              btn.getAttribute("data-cg-merit-dot"),
              10,
            );
            renderMeritDotChoices(rootEl, def);
            updateMeritCostLabel(rootEl);
          });
        },
      );
    }

    function updateMeritCostLabel(rootEl) {
      var el = qs("[data-cg-merit-cost]", rootEl);
      if (!el || !meritPick.def) return;
      var rem = meritBudgetInfo(state || {}).remaining;
      var cost = meritPick.dots;
      el.textContent = "Cost: " + cost + " merit dot" +
        (cost === 1 ? "" : "s") +
        " (you have " + rem + " remaining)";
      el.classList.toggle("is-bad", cost > rem);
    }

    search.addEventListener("input", function () {
      showSuggest(search.value);
    });
    search.addEventListener("focus", function () {
      if (search.value) showSuggest(search.value);
    });
    search.addEventListener("keydown", function (e) {
      if (e.key === "Escape") hideSuggest();
    });

    suggest.addEventListener("click", function (e) {
      var li = e.target && e.target.closest
        ? e.target.closest("[data-cg-merit-pick]")
        : null;
      if (!li) return;
      selectMerit(li.getAttribute("data-cg-merit-pick"));
    });

    document.addEventListener("click", function (e) {
      if (!root.contains(e.target)) return;
      if (search.contains(e.target) || suggest.contains(e.target)) {
        return;
      }
      hideSuggest();
    });

    if (addBtn) {
      addBtn.addEventListener("click", function () {
        if (!meritPick.def) return;
        var def = meritPick.def;
        var dots = meritPick.dots;
        if (def.allowedDots.indexOf(dots) < 0) {
          setMsg(
            qs("[data-cg-error]"),
            "Invalid rating for " + def.name +
              ". Allowed: " + def.allowedDots.join(", "),
            true,
          );
          return;
        }
        var trait = def.key;
        if (def.instanced) {
          var qel = qs("[data-cg-merit-qual]", root);
          var qv = qel ? qel.value.trim() : "";
          if (!qv) {
            setMsg(
              qs("[data-cg-error]"),
              def.name + " needs a qualifier " +
                "(e.g. Language → Spanish).",
              true,
            );
            return;
          }
          trait = def.key + "(" + qv + ")";
        }
        var rem = meritBudgetInfo(state || {}).remaining;
        if (dots > rem) {
          setMsg(
            qs("[data-cg-error]"),
            "Not enough merit dots (need " + dots +
              ", have " + rem + ").",
            true,
          );
          return;
        }
        applyTrait(trait, String(dots), { rerender: true });
      });
    }

    root.querySelectorAll("[data-cg-remove-merit]").forEach(
      function (btn) {
        btn.addEventListener("click", function () {
          var key = btn.getAttribute("data-cg-remove-merit");
          if (!key) return;
          // Empty value resets merit (validateTraitValue → 0)
          applyTrait(key, "", { rerender: true });
        });
      },
    );
  }

  function wireStage() {
    var root = qs("[data-cg-root]") || document;

    root.querySelectorAll("[data-cg-field]").forEach(function (el) {
      var id = el.getAttribute("data-cg-field");
      var ev = el.tagName === "SELECT" ? "change" : "change";
      el.addEventListener(ev, function () {
        if (id === "merit_name" || id === "merit_dots") return;
        applyTrait(id, el.value);
      });
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        el.addEventListener("blur", function () {
          if (id === "merit_name" || id === "merit_dots") return;
          applyTrait(id, el.value);
        });
      }
    });

    root.querySelectorAll("[data-cg-template]").forEach(
      function (btn) {
        btn.addEventListener("click", function () {
          applyTrait(
            "template",
            btn.getAttribute("data-cg-template"),
            { rerender: true },
          );
        });
      },
    );

    root.querySelectorAll("[data-cg-dot]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var name = btn.getAttribute("data-cg-dot");
        var val = btn.getAttribute("data-val");
        // toggle off if clicking current value on attrs min 1
        var cur = 0;
        if (state && state.sheet) {
          cur = (state.sheet.attributes &&
            state.sheet.attributes[name]) ||
            (state.sheet.skills && state.sheet.skills[name]) ||
            (state.sheet.powers && state.sheet.powers[name]) ||
            0;
        }
        var next = parseInt(val, 10);
        if (cur === next && next > 0) {
          // attrs floor 1, skills/powers floor 0
          var isAttr = state.sheet.attributes &&
            name in state.sheet.attributes;
          next = isAttr ? Math.max(1, next - 1) : next - 1;
          if (next < 0) next = 0;
        }
        applyTrait(name, String(next), { dots: true });
      });
    });

    wireMeritPicker(root);
    wireCatalogPickers(root);

    var back = qs("[data-cg-back]", root);
    if (back) {
      back.addEventListener("click", async function () {
        if (busy) return;
        busy = true;
        try {
          state = await api("POST", "/back", {});
          renderMain(state);
        } catch (e) {
          setMsg(qs("[data-cg-error]"), e.message, true);
        } finally {
          busy = false;
        }
      });
    }

    var next = qs("[data-cg-next]", root);
    if (next) {
      next.addEventListener("click", async function () {
        if (busy) return;
        busy = true;
        try {
          var atEnd = state &&
            state.stage >= state.maxStage;
          // Finish → /submit; earlier stages → /next
          // (server /next also submits on final stage).
          state = await api(
            "POST",
            atEnd ? "/submit" : "/next",
            {},
          );
          renderMain(state);
        } catch (e) {
          if (e.data) {
            state = Object.assign(state || {}, e.data);
            renderMain(state);
          }
          setMsg(
            qs("[data-cg-error]"),
            e.message || "Cannot advance.",
            true,
          );
        } finally {
          busy = false;
        }
      });
    }
  }

  function wireGlobal() {
    document.addEventListener("click", function (e) {
      var t = e.target && e.target.closest
        ? e.target.closest("[data-cg-start], [data-cg-demo]")
        : null;
      if (!t) return;
      if (t.hasAttribute("data-cg-demo")) {
        demo = true;
        boot();
        return;
      }
      if (t.hasAttribute("data-cg-start")) {
        (async function () {
          try {
            state = await api("POST", "/start", {});
            renderMain(state);
          } catch (err) {
            if (err.status === 401) {
              renderMain({ needAuth: true });
            } else {
              renderMain({
                needAuth: false,
                started: false,
              });
              setTimeout(function () {
                setMsg(
                  qs("[data-cg-error]"),
                  err.message,
                  true,
                );
              }, 0);
            }
          }
        })();
      }
    });
  }

  async function boot() {
    var params = new URLSearchParams(location.search);
    if (params.get("demo") === "1") demo = true;

    var shell = qs("[data-site-shell]");
    if (shell) {
      shell.classList.add(
        "is-compact",
        "is-mode-no-hero",
        "is-plain",
        "is-mode-chargen",
      );
    }
    var banner = qs(".site-banner");
    if (banner) banner.hidden = true;

    // Load catalog CSS if not present
    if (!qs('link[data-cg-css]')) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/site/css/chargen.css?v=20260806wipe";
      link.setAttribute("data-cg-css", "1");
      document.head.appendChild(link);
    }

    // Keep in-progress draft if boot re-runs (SPA re-entry)
    // Never keep stale draft over an approved live sheet.
    var hadProgress = !!(state && state.started && state.sheet &&
      state.stage > 1 && !state.approved && !state.isApproved);

    if (!hadProgress) renderMain(null);
    await loadOptions();

    if (demo) {
      // Do not wipe demo progress on accidental re-boot
      if (!state || !state.started) {
        state = demoInit();
      }
      demoRefresh();
      renderMain(state);
      return;
    }

    try {
      state = await api("GET", "");
      // Fallback: dedicated sheet endpoint if chargen closed empty
      if (
        state &&
        (state.closed || state.approved) &&
        !state.sheet &&
        !state.sheetText
      ) {
        try {
          var sh = await fetch("/api/v1/cofd/sheet", {
            credentials: "same-origin",
            headers: authHeaders(),
          }).then(function (r) {
            return r.ok ? r.json() : null;
          });
          if (sh && sh.sheet) {
            state = normalizeState(Object.assign({}, state, sh, {
              approved: true,
              isApproved: true,
            }));
          }
        } catch (_) { /* ignore */ }
      }
      renderMain(state);
    } catch (e) {
      // Unauthenticated: leave site.js route guard to redirect.
      // Demo mode keeps the local gate UI.
      if (e.status === 401 && !demo) {
        try {
          var next = encodeURIComponent(
            location.pathname + location.search,
          );
          location.replace("/login?next=" + next);
        } catch (_) {
          renderMain({ needAuth: true });
        }
        return;
      }
      renderMain({ needAuth: true });
    }
  }

  wireGlobal();

  global.SiteChargen = {
    boot: boot,
    isDemo: function () {
      return demo;
    },
    getState: function () {
      return state;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
