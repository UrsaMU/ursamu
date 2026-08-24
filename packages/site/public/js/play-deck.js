/**
 * Browser port of src/play-deck.ts. Keep in sync.
 * Loaded before play.js; exposes globalThis.PlayDeck.
 */
(function (root) {
  "use strict";

  var dockChips = [
    { id: "plan", label: "PLAN", cmd: "+week" },
    { id: "job", label: "JOB", cmd: "+act take-job" },
    { id: "info", label: "INFO", cmd: "+act gather-information" },
    { id: "hack", label: "HACK", cmd: "+act hack" },
    { id: "low", label: "LOW", cmd: "+act lay-low" },
    { id: "more", label: "+", cmd: "+act" },
  ];

  var FACES = {
    holds: "HOLDS",
    hitch: "HITCH",
    fails: "FAILS",
    revised: "REVISED",
  };

  function emptyDeck() {
    return { feed: null, week: null };
  }

  function layoutType(ui) {
    if (!ui || typeof ui !== "object") return "";
    var meta = ui.meta;
    if (!meta || typeof meta.type !== "string") return "";
    return meta.type;
  }

  function pinSlot(type) {
    if (type === "utopia-feed") return "feed";
    if (type === "utopia-week") return "week";
    return null;
  }

  function rememberPin(state, ui) {
    var slot = pinSlot(layoutType(ui));
    if (!slot) return state;
    var next = { feed: state.feed, week: state.week };
    next[slot] = ui;
    return next;
  }

  function pinsVisible(state) {
    return !!(state && (state.feed || state.week));
  }

  function mastheadFromFeed(ui) {
    var empty = { city: "", week: "", stories: [] };
    if (layoutType(ui) !== "utopia-feed") return empty;
    var meta = ui.meta || {};
    var raw = Array.isArray(meta.stories) ? meta.stories : [];
    var stories = [];
    for (var i = 0; i < raw.length; i++) {
      var row = raw[i] || {};
      var sev = Number(row.severity);
      stories.push({
        title: String(row.title || ""),
        severity: isFinite(sev) ? sev : 0,
      });
    }
    return {
      city: String(meta.city || ""),
      week: meta.week == null ? "" : String(meta.week),
      stories: stories,
    };
  }

  function crewFromWeek(ui) {
    if (layoutType(ui) !== "utopia-week") return [];
    var comps = Array.isArray(ui.components) ? ui.components : [];
    var out = [];
    for (var i = 0; i < comps.length; i++) {
      var row = comps[i] || {};
      if (row.type !== "entity-list") continue;
      var items = Array.isArray(row.items) ? row.items : [];
      for (var j = 0; j < items.length; j++) {
        var ent = items[j] || {};
        var action = ent.action || {};
        var meta = String(ent.meta || "").toLowerCase();
        out.push({
          name: String(ent.label || ent.name || ""),
          ready: meta === "ready",
          cmd: String(action.cmd || ""),
        });
      }
    }
    return out;
  }

  function rulingFace(ui) {
    if (layoutType(ui) !== "utopia-ruling") return "";
    var meta = ui.meta || {};
    var key = String(meta.result || "").toLowerCase();
    return FACES[key] || "";
  }

  root.PlayDeck = {
    dockChips: dockChips,
    emptyDeck: emptyDeck,
    layoutType: layoutType,
    pinSlot: pinSlot,
    rememberPin: rememberPin,
    pinsVisible: pinsVisible,
    mastheadFromFeed: mastheadFromFeed,
    crewFromWeek: crewFromWeek,
    rulingFace: rulingFace,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
