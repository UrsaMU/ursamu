/**
 * Theme Studio client — Grapes skin mode + Phase 1 live preview.
 */

const statusEl = document.getElementById("ts-status");
const tokenHost = document.getElementById("token-panels");
const cssExtras = document.getElementById("css-extras");
const liveFrame = document.getElementById("live-frame");
const gjsEl = document.getElementById("gjs");

/** @type {"grapes"|"live"} */
let viewMode = "grapes";
/** @type {string} */
let currentLayout = "home";
/** @type {string[]} */
let assetPaths = [];

const LAYOUT_LIVE = {
  home: "/site/",
  wiki: "/site/wiki/",
  article: "/site/wiki/lore",
  help: "/site/help/",
  login: "/site/login",
};

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

function $(id) {
  return document.getElementById(id);
}

/** @type {Record<string, string>} */
let tokenValues = {};
/** @type {Record<string, string>} */
let tokensLight = {};
/** @type {Record<string, string>} */
let tokensDark = {};
/** @type {"light"|"dark"} */
let colorMode = "light";
/** @type {Array<{name:string,label:string,group:string,kind:string,default:string}>} */
let catalog = [];
/** @type {Array<{id:string,label:string,mode?:string,pair?:string}>} */
let presets = [];

function isColorToken(def) {
  return def.kind === "color";
}

const FONT_TOKEN_NAMES = new Set([
  "--site-font-ui",
  "--site-font-display",
  "--site-font-mono",
]);

function isFontToken(def) {
  return FONT_TOKEN_NAMES.has(def.name);
}

function fontStack(family) {
  const f = String(family || "").trim().replace(/['"]/g, "");
  if (!f) return "";
  return `"${f}", system-ui, -apple-system, sans-serif`;
}

function familyFromStack(stack) {
  const s = String(stack || "").trim();
  const m = s.match(/^["']([^"']+)["']/);
  if (m) return m[1];
  if (s.startsWith("var(")) return "";
  return "";
}

function uniqueFontFamilies() {
  const out = [];
  const seen = new Set();
  for (const f of fontItems) {
    const name = (f.fontFamily || "").trim();
    if (!name) continue;
    const k = name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(name);
  }
  return out;
}

function buildFontSelect(def) {
  const wrap = document.createElement("div");
  wrap.className = "ts-field ts-field--font";
  const lab = document.createElement("label");
  lab.textContent = def.label;
  lab.htmlFor = "tok-" + def.name;
  wrap.appendChild(lab);

  const sel = document.createElement("select");
  sel.id = "tok-" + def.name;
  sel.setAttribute("data-font-token", def.name);
  sel.setAttribute("aria-label", def.label);

  const custom = document.createElement("input");
  custom.type = "text";
  custom.className = "ts-font-custom";
  custom.id = "tok-" + def.name + "-custom";
  custom.spellcheck = false;
  custom.placeholder = "Custom stack…";
  custom.hidden = true;

  const fill = () => fillFontSelect(sel, def, tokenValues[def.name]);
  fill();

  sel.addEventListener("change", () => {
    const v = sel.value;
    if (v === "__custom__") {
      custom.hidden = false;
      custom.value = tokenValues[def.name] || def.default || "";
      custom.focus();
      return;
    }
    if (!v) return;
    custom.hidden = true;
    tokenValues[def.name] = v;
    const face = sel.selectedOptions?.[0]?.getAttribute("data-family");
    sel.style.fontFamily = face
      ? `"${face}", system-ui, sans-serif`
      : "";
    snapshotActiveToSlot();
    scheduleApply();
    setStatus(
      def.label + " → " + (face || shortFontLabel(v)),
    );
  });

  custom.addEventListener("change", () => {
    tokenValues[def.name] = custom.value.trim();
    snapshotActiveToSlot();
    scheduleApply();
  });

  wrap.appendChild(sel);
  wrap.appendChild(custom);
  return wrap;
}

function shortFontLabel(stack) {
  const fam = familyFromStack(stack);
  if (fam) return fam;
  const s = String(stack || "");
  if (s === "var(--site-font-ui)") return "Same as UI";
  if (s.startsWith("var(")) return s;
  if (s.includes("system-ui") || s.includes("sans-serif")) {
    return "System";
  }
  return s.slice(0, 40) || "—";
}

/**
 * Build <option> list: uploaded faces by real name first,
 * then system/token helpers. Labels are the family name
 * (and rendered in that face when the browser allows).
 */
function fillFontSelect(sel, def, current) {
  if (!sel) return;
  const cur = (current ?? tokenValues[def.name] ?? def.default ?? "")
    .trim();
  sel.innerHTML = "";

  const add = (value, label, face) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    if (face) {
      o.style.fontFamily = `"${face}", system-ui, sans-serif`;
      o.setAttribute("data-family", face);
    }
    sel.appendChild(o);
  };

  const addGroup = (label) => {
    const g = document.createElement("optgroup");
    g.label = label;
    sel.appendChild(g);
    return g;
  };

  const addTo = (parent, value, label, face) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    if (face) {
      o.style.fontFamily = `"${face}", system-ui, sans-serif`;
      o.setAttribute("data-family", face);
    }
    parent.appendChild(o);
  };

  const uploaded = uniqueFontFamilies();
  if (uploaded.length) {
    const g = addGroup("Uploaded fonts");
    for (const fam of uploaded) {
      // Label = real family name (what the user picks)
      addTo(g, fontStack(fam), fam, fam);
    }
  } else {
    add("", "— upload fonts below —");
  }

  const sys = addGroup("System / theme");
  if (def.name === "--site-font-display") {
    addTo(sys, "var(--site-font-ui)", "Same as UI font");
  }
  if (def.name === "--site-font-mono") {
    addTo(
      sys,
      def.default || "ui-monospace, monospace",
      "System mono",
    );
  } else {
    addTo(
      sys,
      def.default ||
        'system-ui, -apple-system, "Segoe UI", sans-serif',
      "System UI",
    );
  }
  addTo(sys, "__custom__", "Custom stack…");

  // Match current value to an option
  let matched = false;
  const tryMatch = (value) => {
    for (const o of sel.querySelectorAll("option")) {
      if (o.value === value) {
        sel.value = value;
        matched = true;
        return true;
      }
    }
    return false;
  };

  if (cur && !tryMatch(cur)) {
    const fam = familyFromStack(cur);
    if (fam) tryMatch(fontStack(fam));
  }
  // Also match bare family name if token was set that way
  if (!matched && cur) {
    const bare = cur.replace(/^["']|["']$/g, "");
    if (uploaded.some((f) => f.toLowerCase() === bare.toLowerCase())) {
      tryMatch(fontStack(bare));
    }
  }

  const custom = $("tok-" + def.name + "-custom");
  if (!matched && cur && cur !== "__custom__") {
    sel.value = "__custom__";
    if (custom) {
      custom.hidden = false;
      custom.value = cur;
    }
  } else if (custom) {
    custom.hidden = sel.value !== "__custom__";
  }

  // Show selected face on the closed <select>
  const picked = sel.selectedOptions && sel.selectedOptions[0];
  const face = picked && picked.getAttribute("data-family");
  sel.style.fontFamily = face
    ? `"${face}", system-ui, sans-serif`
    : "";
}

function refreshFontSelects() {
  for (const name of FONT_TOKEN_NAMES) {
    const sel = $("tok-" + name);
    if (!sel || sel.tagName !== "SELECT") continue;
    const def = catalog.find((d) => d.name === name);
    if (!def) continue;
    fillFontSelect(sel, def, tokenValues[name]);
  }
}

function buildTokenPanels() {
  if (!tokenHost) return;
  tokenHost.innerHTML = "";
  const groups = new Map();
  for (const def of catalog) {
    if (!groups.has(def.group)) groups.set(def.group, []);
    groups.get(def.group).push(def);
    if (tokenValues[def.name] == null) {
      tokenValues[def.name] = def.default;
    }
  }
  for (const [group, defs] of groups) {
    const sec = document.createElement("section");
    sec.className = "ts-group";
    const h = document.createElement("h3");
    h.className = "ts-group__title";
    h.textContent = group;
    sec.appendChild(h);
    for (const def of defs) {
      if (isFontToken(def)) {
        sec.appendChild(buildFontSelect(def));
        continue;
      }

      const row = document.createElement("div");
      row.className = "ts-field" +
        (def.kind === "text" || def.kind === "size"
          ? " ts-field--text"
          : "");
      const lab = document.createElement("label");
      lab.textContent = def.label;
      lab.htmlFor = "tok-" + def.name;
      row.appendChild(lab);

      if (isColorToken(def)) {
        const color = document.createElement("input");
        color.type = "color";
        const text = document.createElement("input");
        text.type = "text";
        text.id = "tok-" + def.name;
        text.spellcheck = false;
        const raw = tokenValues[def.name] || def.default;
        text.value = raw;
        if (/^#[0-9a-fA-F]{6}$/.test(raw.trim())) {
          color.value = raw.trim();
        } else {
          color.value = "#888888";
        }
        color.id = "tok-" + def.name + "-c";
        text.addEventListener("change", () => {
          tokenValues[def.name] = text.value.trim();
          if (/^#[0-9a-fA-F]{6}$/.test(text.value.trim())) {
            color.value = text.value.trim();
          }
          snapshotActiveToSlot();
          scheduleApply();
          refreshContrast();
        });
        color.addEventListener("input", () => {
          text.value = color.value;
          tokenValues[def.name] = color.value;
          snapshotActiveToSlot();
          scheduleApply();
          refreshContrast();
        });
        row.appendChild(text);
        row.appendChild(color);
      } else {
        const text = document.createElement("input");
        text.type = "text";
        text.id = "tok-" + def.name;
        text.spellcheck = false;
        text.value = tokenValues[def.name] || def.default;
        text.addEventListener("change", () => {
          tokenValues[def.name] = text.value.trim();
          snapshotActiveToSlot();
          scheduleApply();
          refreshContrast();
        });
        row.appendChild(text);
      }
      sec.appendChild(row);
    }
    tokenHost.appendChild(sec);
  }
}

function refreshTokenInputs() {
  for (const def of catalog) {
    if (isFontToken(def)) continue;
    const el = $("tok-" + def.name);
    if (el && tokenValues[def.name] != null) {
      el.value = tokenValues[def.name];
    }
    const colorEl = $("tok-" + def.name + "-c");
    if (
      colorEl &&
      tokenValues[def.name] &&
      /^#[0-9a-fA-F]{6}$/.test(tokenValues[def.name].trim())
    ) {
      colorEl.value = tokenValues[def.name].trim();
    }
  }
  refreshFontSelects();
}

function snapshotActiveToSlot() {
  if (colorMode === "dark") {
    tokensDark = { ...tokenValues };
  } else {
    tokensLight = { ...tokenValues };
  }
}

function loadSlotToActive() {
  const src = colorMode === "dark" ? tokensDark : tokensLight;
  if (src && Object.keys(src).length) {
    tokenValues = { ...src };
  }
  refreshTokenInputs();
}

function setColorMode(mode) {
  snapshotActiveToSlot();
  colorMode = mode === "dark" ? "dark" : "light";
  $("btn-mode-light")?.classList.toggle("is-active", colorMode === "light");
  $("btn-mode-dark")?.classList.toggle("is-active", colorMode === "dark");
  loadSlotToActive();
  scheduleApply();
  refreshContrast();
}

function fillPresetSelect() {
  const sel = $("preset-select");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">— custom —</option>';
  for (const p of presets) {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.label + (p.mode ? ` (${p.mode})` : "");
    sel.appendChild(o);
  }
  if (cur) sel.value = cur;
}

async function applyPreset(id) {
  if (!id) return;
  setStatus("Loading preset…");
  const res = await fetch("/api/preset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, target: "both-pair" }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(j.error || "Preset failed");
    return;
  }
  if (j.tokensLight) tokensLight = { ...j.tokensLight };
  if (j.tokensDark) tokensDark = { ...j.tokensDark };
  if (j.preset?.mode === "dark") {
    colorMode = "dark";
    tokenValues = { ...(j.tokensDark || j.tokens || {}) };
  } else {
    colorMode = "light";
    tokenValues = { ...(j.tokensLight || j.tokens || {}) };
  }
  $("btn-mode-light")?.classList.toggle("is-active", colorMode === "light");
  $("btn-mode-dark")?.classList.toggle("is-active", colorMode === "dark");
  refreshTokenInputs();
  await applyDraft(window.__gjs);
  renderContrast(j.contrast || []);
  setStatus("Preset · " + (j.preset?.label || id));
}

function renderContrast(results) {
  const host = $("contrast-panel");
  if (!host) return;
  if (!results || !results.length) {
    host.innerHTML = "";
    return;
  }
  host.innerHTML = results.map((r) => {
    const cls = r.pass === true
      ? "is-pass"
      : r.pass === false
      ? "is-fail"
      : "is-skip";
    const ratio = r.ratio != null ? r.ratio.toFixed(2) + ":1" : "—";
    const mark = r.pass === true ? "AA" : r.pass === false ? "fail" : "n/a";
    return `<div class="ts-contrast__row ${cls}" title="${
      (r.note || r.fgToken + " / " + r.bgToken).replace(/"/g, "")
    }"><span>${r.label}</span><span>${ratio} ${mark}</span></div>`;
  }).join("");
}

async function refreshContrast() {
  try {
    const res = await fetch("/api/contrast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tokens: tokenValues }),
    });
    const j = await res.json();
    renderContrast(j.results || []);
  } catch {
    /* ignore */
  }
}

function buildDraftJson() {
  snapshotActiveToSlot();
  return {
    specVersion: "1.0.0",
    manifest: readManifest(),
    tokens: { ...tokenValues },
    tokensLight: { ...tokensLight },
    tokensDark: { ...tokensDark },
    activeMode: colorMode,
    dual: !!$("export-dual")?.checked,
    cssExtras: (cssExtras && cssExtras.value) || "",
    presetId: $("preset-select")?.value || "",
  };
}

function exportDraftJson() {
  const draft = buildDraftJson();
  const blob = new Blob([JSON.stringify(draft, null, 2) + "\n"], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (draft.manifest.id || "theme") + ".draft.json";
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus("Shared draft JSON downloaded");
}

async function importDraftJson(file) {
  try {
    const text = await file.text();
    const draft = JSON.parse(text);
    if (draft.manifest) writeManifest(draft.manifest);
    if (draft.tokensLight) tokensLight = { ...draft.tokensLight };
    if (draft.tokensDark) tokensDark = { ...draft.tokensDark };
    if (draft.tokens) tokenValues = { ...draft.tokens };
    if (draft.activeMode === "dark" || draft.activeMode === "light") {
      colorMode = draft.activeMode;
    }
    if (typeof draft.cssExtras === "string" && cssExtras) {
      cssExtras.value = draft.cssExtras;
    }
    if ($("export-dual")) {
      $("export-dual").checked = !!draft.dual;
    }
    if (draft.presetId && $("preset-select")) {
      $("preset-select").value = draft.presetId;
    }
    $("btn-mode-light")?.classList.toggle(
      "is-active",
      colorMode === "light",
    );
    $("btn-mode-dark")?.classList.toggle("is-active", colorMode === "dark");
    refreshTokenInputs();
    await applyDraft(window.__gjs);
    await refreshContrast();
    setStatus("Imported draft · " + (draft.manifest?.id || file.name));
  } catch (e) {
    alert("Invalid draft JSON");
    setStatus("Draft import failed");
  }
}

function tokensToRootCss() {
  const lines = [":root {"];
  for (const def of catalog) {
    const v = (tokenValues[def.name] ?? def.default).trim();
    if (v) lines.push(`  ${def.name}: ${v};`);
  }
  lines.push("}");
  return lines.join("\n");
}

/**
 * Font file URL for CSS / FontFace.
 * Keep root-relative `/draft/assets/…` so export can rewrite to
 * `/site/theme/installed/<id>/…`.
 */
function fontAssetUrl(relPath) {
  return "/draft/assets/" + String(relPath || "").replace(/^\/+/, "");
}

function buildFontFaceCss() {
  if (!fontItems.length) return "";
  const blocks = [];
  for (const f of fontItems) {
    const fam = (f.fontFamily || familyFromFilename(f.path))
      .replace(/["']/g, "")
      .trim();
    if (!fam) continue;
    const url = fontAssetUrl(f.path);
    blocks.push([
      "@font-face {",
      `  font-family: "${fam}";`,
      `  src: url("${url}") format("${fontFormatFromPath(f.path)}");`,
      "  font-weight: 100 900;",
      "  font-style: normal;",
      "  font-display: swap;",
      "}",
    ].join("\n"));
  }
  if (!blocks.length) return "";
  return "/* theme fonts */\n" + blocks.join("\n\n");
}

/**
 * Strip junk that used to accumulate in the extras textarea
 * (nested :root dumps, stale @font-face, full draft echoes).
 */
function sanitizeExtras(raw) {
  let s = String(raw || "");
  // Drop full generated headers / nested drafts
  s = s.replace(
    /\/\*\*?[\s\S]*?Generated by @ursamu\/theme-studio[\s\S]*?\*\//gi,
    "",
  );
  s = s.replace(/\/\*\s*theme fonts\s*\*\/[\s\S]*?(?=\/\*|$)/gi, "");
  s = s.replace(/@font-face\s*\{[\s\S]*?\}\s*/gi, "");
  s = s.replace(/:root\s*\{[\s\S]*?\}\s*/gi, "");
  // Grapes global resets break export allowlist — drop them
  s = s.replace(/(^|})\s*\*\s*\{[^}]*\}/g, "$1");
  s = s.replace(/(^|})\s*body\s*\{[^}]*\}/gi, "$1");
  s = s.replace(/\/\*\s*grapes\s*\*\//gi, "");
  s = s.replace(/\/\*\s*extras\s*\*\//gi, "");
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

function composeDraftCss(editor) {
  // Keep extras textarea clean (faces live in buildFontFaceCss)
  if (cssExtras) {
    const clean = sanitizeExtras(cssExtras.value);
    if (clean !== cssExtras.value) cssExtras.value = clean;
  }
  const root = tokensToRootCss();
  const faces = buildFontFaceCss();
  let grapes = editor ? (editor.getCss() || "") : "";
  grapes = sanitizeExtras(grapes);
  const extras = sanitizeExtras((cssExtras && cssExtras.value) || "");
  const parts = [root];
  if (faces) parts.push(faces);
  if (grapes.trim()) {
    parts.push("/* grapes */\n" + grapes.trim());
  }
  if (extras.trim()) {
    parts.push("/* extras */\n" + extras.trim());
  }
  return parts.join("\n\n") + "\n";
}

let applyTimer = 0;
function scheduleApply() {
  clearTimeout(applyTimer);
  applyTimer = setTimeout(() => applyDraft(window.__gjs), 120);
}

async function pushDraftCss(css) {
  await fetch("/api/draft.css", {
    method: "POST",
    headers: { "content-type": "text/css" },
    body: css,
  });
}

/** Grapes canvas is often about:blank — root-relative urls break. */
function absolutizeDraftAssetUrls(css) {
  const origin = location.origin;
  return String(css || "").replace(
    /url\(\s*(['"]?)(\/draft\/assets\/[^'")\s]+)\1\s*\)/g,
    (_m, q, path) => {
      const quote = q || '"';
      return `url(${quote}${origin}${path}${quote})`;
    },
  );
}

/**
 * Load each uploaded face into a document via the FontFace API
 * so the browser actually uses them (not just CSS text).
 */
async function loadFontsIntoDocument(doc) {
  if (!doc || !doc.defaultView || !doc.fonts) return;
  const Win = doc.defaultView;
  if (typeof Win.FontFace !== "function") return;
  for (const f of fontItems) {
    const fam = (f.fontFamily || familyFromFilename(f.path))
      .replace(/["']/g, "")
      .trim();
    if (!fam) continue;
    // Absolute URL required for about:blank / blob canvas docs
    const url = location.origin + fontAssetUrl(f.path);
    const key = fam + "::" + f.path;
    try {
      if (doc.documentElement.dataset.fontKeys?.includes(key)) {
        continue;
      }
      const face = new Win.FontFace(
        fam,
        `url(${JSON.stringify(url)})`,
        { weight: "100 900", style: "normal", display: "swap" },
      );
      const loaded = await face.load();
      doc.fonts.add(loaded);
      const prev = doc.documentElement.dataset.fontKeys || "";
      doc.documentElement.dataset.fontKeys = prev
        ? prev + "|" + key
        : key;
    } catch (err) {
      console.warn("[theme-studio] font load failed", fam, err);
    }
  }
}

function injectCanvasCss(editor, css) {
  if (!editor) return;
  const doc = editor.Canvas.getDocument();
  if (!doc) return;
  let el = doc.getElementById("ursamu-draft-css");
  if (!el) {
    el = doc.createElement("style");
    el.id = "ursamu-draft-css";
    doc.head.appendChild(el);
  }
  // Absolute font urls so about:blank canvas can fetch faces
  el.textContent = absolutizeDraftAssetUrls(css);

  // Bust Grapes' static <link href="/api/draft.css"> so tokens refresh
  const links = doc.querySelectorAll('link[rel="stylesheet"]');
  for (const link of links) {
    const href = link.getAttribute("href") || "";
    if (href.includes("/api/draft.css") || href.includes("draft.css")) {
      link.setAttribute(
        "href",
        "/api/draft.css?t=" + Date.now(),
      );
    }
  }
}

function pushLiveCss(css) {
  const frame = liveFrame;
  if (!frame || !frame.contentWindow) return;
  // Live iframe is same-origin under /site/ — absolute fonts still safest
  frame.contentWindow.postMessage(
    {
      type: "ursamu-theme-draft",
      css: absolutizeDraftAssetUrls(css),
    },
    "*",
  );
  try {
    const doc = frame.contentDocument;
    if (doc) loadFontsIntoDocument(doc);
  } catch {
    /* cross-origin ignore */
  }
}

/**
 * Grapes Style Manager font list.
 * Uploaded faces first, labeled with the real family name.
 */
function grapesFontOptions() {
  const opts = [];
  // Real uploaded names first — this is what multi-font sites need
  for (const fam of uniqueFontFamilies()) {
    opts.push({
      id: fontStack(fam),
      label: fam,
      name: fam,
    });
  }
  // Fallbacks / tokens after
  opts.push(
    {
      id: "var(--site-font-ui)",
      label: "Same as theme UI",
      name: "Same as theme UI",
    },
    {
      id: "var(--site-font-display)",
      label: "Same as theme Display",
      name: "Same as theme Display",
    },
    {
      id: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      label: "System UI",
      name: "System UI",
    },
    {
      id: "Georgia, 'Times New Roman', serif",
      label: "Georgia",
      name: "Georgia",
    },
    {
      id: 'ui-monospace, "SF Mono", Menlo, monospace',
      label: "System Mono",
      name: "System Mono",
    },
  );
  return opts;
}

function syncGrapesFonts(editor) {
  if (!editor || !editor.StyleManager) return;
  const opts = grapesFontOptions();
  try {
    const sm = editor.StyleManager;
    // Sector id may be name-lowercased ("typography")
    let prop = sm.getProperty("typography", "font-family");
    if (!prop) {
      const sectors = sm.getSectors();
      sectors.forEach((sec) => {
        const p = sec.getProperty && sec.getProperty("font-family");
        if (p) prop = p;
      });
    }
    if (prop) {
      if (typeof prop.setOptions === "function") {
        prop.setOptions(opts);
      } else {
        prop.set("options", opts);
      }
      // Re-render style manager so the select updates
      if (typeof sm.render === "function") sm.render();
    }
  } catch (err) {
    console.warn("[theme-studio] Grapes font options", err);
  }
}

async function syncMeta() {
  const meta = readManifest();
  await fetch("/api/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(meta),
  });
}

async function applyDraft(editor) {
  const ed = editor || window.__gjs;
  const css = composeDraftCss(ed);
  injectCanvasCss(ed, css);
  pushLiveCss(css);
  pushLiveMeta();
  syncGrapesFonts(ed);
  try {
    if (ed && ed.Canvas) {
      const doc = ed.Canvas.getDocument();
      if (doc) await loadFontsIntoDocument(doc);
    }
  } catch {
    /* ignore */
  }
  try {
    await pushDraftCss(css);
    await syncMeta();
    setStatus("Draft updated · " + new Date().toLocaleTimeString());
  } catch {
    setStatus("Draft apply failed");
  }
}

function lockStructure(editor) {
  try {
    const all = editor.DomComponents.getWrapper().find("*");
    all.forEach((cmp) => {
      cmp.set({
        draggable: false,
        droppable: false,
        removable: false,
        copyable: false,
        highlightable: true,
        hoverable: true,
        selectable: true,
      });
    });
    editor.DomComponents.getWrapper().set({
      droppable: false,
      removable: false,
      copyable: false,
      draggable: false,
    });
  } catch {
    /* ignore */
  }
}

function wireTabs(editor) {
  const tabs = document.querySelectorAll(".ts-tab");
  const styles = $("styles-container");
  const layers = $("layers-container");
  const cssPanel = $("css-panel");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      const name = tab.getAttribute("data-panel");
      if (styles) styles.hidden = name !== "styles";
      if (layers) layers.hidden = name !== "layers";
      if (cssPanel) cssPanel.hidden = name !== "css";
    });
  });
}

function readManifest() {
  return {
    id: ($("m-id")?.value || "my-theme").trim().toLowerCase(),
    label: ($("m-label")?.value || "My Theme").trim(),
    title: ($("m-title")?.value || "My Game").trim(),
    plainBg: !!$("m-plain")?.checked,
    version: "0.1.0",
    description: "Exported from UrsaMU Theme Studio",
  };
}

function writeManifest(m) {
  if ($("m-id") && m.id != null) $("m-id").value = m.id;
  if ($("m-label") && m.label != null) $("m-label").value = m.label;
  // Allow empty title only if explicitly provided; keep field in sync
  if ($("m-title") && m.title != null && m.title !== "") {
    $("m-title").value = m.title;
  }
  if ($("m-plain") && m.plainBg != null) {
    $("m-plain").checked = !!m.plainBg;
  }
}

function livePathForLayout(layout) {
  return LAYOUT_LIVE[layout] || LAYOUT_LIVE.home;
}

function canvasUrl(layout) {
  const m = readManifest();
  const title = m.title || m.label || "My Game";
  const brand = m.label || m.title || "My Theme";
  const lay = layout || currentLayout || "home";
  return "/api/canvas-html?layout=" + encodeURIComponent(lay) +
    "&title=" + encodeURIComponent(title) +
    "&brand=" + encodeURIComponent(brand);
}

function pushLiveMeta() {
  const frame = liveFrame;
  if (!frame || !frame.contentWindow) return;
  const meta = readManifest();
  frame.contentWindow.postMessage(
    { type: "ursamu-theme-meta", meta },
    "*",
  );
}

/** True while we push field → canvas (skip canvas → field echo). */
let patchingManifest = false;

/**
 * Live-patch Grapes canvas text (no full rebuild) so title/label
 * update as you type.
 */
function patchGrapesManifestLive() {
  const editor = window.__gjs;
  if (!editor || viewMode !== "grapes") return;
  const m = readManifest();
  const title = m.title || m.label || "My Game";
  const label = m.label || m.title || "My Theme";

  const setText = (el, text) => {
    if (!el) return;
    if (el.querySelector && el.querySelector("img")) return;
    if ((el.textContent || "") === text) return;
    el.textContent = text;
  };

  patchingManifest = true;
  try {
    const doc = editor.Canvas.getDocument();
    if (doc) {
      doc.querySelectorAll('[data-bind="title"]').forEach((el) => {
        setText(el, title);
      });
      doc.querySelectorAll('[data-bind="label"]').forEach((el) => {
        setText(el, label);
      });
      doc.querySelectorAll(
        "[data-site-banner-title], .site-banner__title",
      ).forEach((el) => setText(el, title));
      doc.querySelectorAll(
        "[data-site-brand], .site-nav__brand",
      ).forEach((el) => setText(el, label));
    }
  } catch {
    /* ignore */
  } finally {
    // Release after Grapes processes component:update
    setTimeout(() => {
      patchingManifest = false;
    }, 0);
  }
}

/** Debounced server meta sync (not full Grapes rebuild) */
let metaTimer = 0;
function scheduleMetaRefresh(opts) {
  const o = opts || {};
  // Instant visual update in Grapes + live iframe
  if (o.patchLive !== false) {
    patchGrapesManifestLive();
    pushLiveMeta();
  }
  clearTimeout(metaTimer);
  metaTimer = setTimeout(async () => {
    try {
      await syncMeta();
    } catch {
      /* ignore */
    }
    // Full rebuild only when explicitly requested (layout switch, etc.)
    if (o.reloadGrapes && viewMode === "grapes" && window.__gjs) {
      await loadGrapesLayout(window.__gjs, currentLayout);
    }
  }, o.reloadGrapes ? 200 : 150);
}

async function refreshManifestViews(opts) {
  const o = opts || {};
  patchGrapesManifestLive();
  pushLiveMeta();
  try {
    await syncMeta();
  } catch {
    /* ignore */
  }
  if (viewMode === "grapes" && window.__gjs && o.reloadGrapes) {
    await loadGrapesLayout(window.__gjs, currentLayout);
  }
}

async function loadGrapesLayout(editor, layout) {
  if (!editor) return;
  const html = await (await fetch(canvasUrl(layout))).text();
  editor.setComponents(html);
  lockStructure(editor);
  // Banner title + brand are text-editable; rest stays locked
  try {
    editor.getWrapper()
      .find("[data-site-banner-title], .site-banner__title, [data-site-brand], .site-nav__brand")
      .forEach((cmp) => {
        cmp.set({
          editable: true,
          removable: false,
          draggable: false,
          copyable: false,
          droppable: false,
        });
      });
  } catch {
    /* ignore */
  }
  // Select a useful target per layout
  const wrap = editor.getWrapper();
  const pick =
    wrap.find(".site-banner__title")[0] ||
    wrap.find(".site-main")[0] ||
    wrap.find(".site-gate-card")[0] ||
    wrap.find(".site-nav")[0];
  if (pick) editor.select(pick);
  await applyDraft(editor);
  pushLiveMeta();
}

function loadLiveLayout(layout) {
  if (!liveFrame) return;
  const path = livePathForLayout(layout);
  const sep = path.includes("?") ? "&" : "?";
  liveFrame.src = path + sep + "t=" + Date.now();
  liveFrame.dataset.loaded = "1";
  liveFrame.dataset.layout = layout;
  // Meta after load (also re-sent on ursamu-theme-ready)
  setTimeout(() => pushLiveMeta(), 400);
}

async function setLayout(layout, opts) {
  const lay = LAYOUT_LIVE[layout] ? layout : "home";
  currentLayout = lay;
  const sel = $("layout-select");
  if (sel && sel.value !== lay) sel.value = lay;

  if (viewMode === "live") {
    loadLiveLayout(lay);
    setStatus("Live · " + lay);
  } else {
    await loadGrapesLayout(window.__gjs, lay);
    setStatus("Grapes · " + lay + " · structure locked");
  }

  if (!opts || !opts.skipHash) {
    try {
      history.replaceState(null, "", "#" + lay);
    } catch {
      /* ignore */
    }
  }
}

function setViewMode(mode) {
  viewMode = mode;
  const grapesBtn = $("btn-mode-grapes");
  const liveBtn = $("btn-mode-live");
  grapesBtn?.classList.toggle("is-active", mode === "grapes");
  liveBtn?.classList.toggle("is-active", mode === "live");
  gjsEl?.classList.toggle("is-active", mode === "grapes");
  liveFrame?.classList.toggle("is-active", mode === "live");

  if (mode === "live") {
    loadLiveLayout(currentLayout);
    setStatus("Live preview · " + currentLayout);
  } else {
    loadGrapesLayout(window.__gjs, currentLayout).then(() => {
      try {
        window.__gjs?.refresh();
      } catch {
        /* ignore */
      }
    });
    setStatus("Grapes · " + currentLayout);
  }
}

/** @type {{ path: string, fontFamily: string }[]} */
let fontItems = [];
/** Currently highlighted family in Fonts list */
let selectedFontFamily = "";
/** User typed a custom family name for next upload */
let fontFamilyDirty = false;

function isFontFileName(name) {
  return /\.(woff2?|ttf|otf)$/i.test(name || "");
}

function familyFromFilename(name) {
  return String(name || "")
    .replace(/^.*\//, "")
    .replace(/\.(woff2?|ttf|otf)$/i, "")
    .replace(/-?webfont$/i, "")
    .replace(/-?VariableFont.*$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || "CustomFont";
}

function setMediaTab(which) {
  const tabs = document.querySelectorAll(".ts-media-tab");
  const images = $("media-images");
  const fonts = $("media-fonts");
  for (const t of tabs) {
    const on = t.getAttribute("data-media") === which;
    t.classList.toggle("is-active", on);
    t.setAttribute("aria-selected", on ? "true" : "false");
  }
  if (images) {
    images.classList.toggle("is-active", which === "images");
    images.hidden = which !== "images";
  }
  if (fonts) {
    fonts.classList.toggle("is-active", which === "fonts");
    fonts.hidden = which !== "fonts";
  }
}

function fontFormatFromPath(path) {
  const ext = (path.split(".").pop() || "").toLowerCase();
  if (ext === "woff2") return "woff2";
  if (ext === "woff") return "woff";
  if (ext === "ttf") return "truetype";
  if (ext === "otf") return "opentype";
  return ext;
}

/** Keep extras clean; faces are composed from fontItems each apply. */
function rebuildFontFacesInExtras() {
  if (cssExtras) {
    cssExtras.value = sanitizeExtras(cssExtras.value);
  }
}

function selectFontFamily(family) {
  selectedFontFamily = String(family || "").trim();
  const bar = $("font-apply-bar");
  if (bar) bar.hidden = !selectedFontFamily;
  const input = $("font-family");
  if (input && selectedFontFamily) {
    input.value = selectedFontFamily;
    fontFamilyDirty = false;
  }
  const ul = $("font-list");
  if (ul) {
    for (const li of ul.querySelectorAll("li[data-family]")) {
      const on = li.getAttribute("data-family") === selectedFontFamily;
      li.classList.toggle("is-selected", on);
      li.setAttribute("aria-selected", on ? "true" : "false");
    }
  }
}

function renderFontList() {
  const ul = $("font-list");
  if (!ul) return;
  ul.innerHTML = "";
  if (!fontItems.length) {
    selectedFontFamily = "";
    const bar = $("font-apply-bar");
    if (bar) bar.hidden = true;
    const li = document.createElement("li");
    li.className = "ts-media-empty";
    li.textContent = "No fonts yet";
    ul.appendChild(li);
    refreshFontSelects();
    return;
  }

  // One row per family; files that share a name stay grouped
  const families = uniqueFontFamilies();
  if (
    selectedFontFamily &&
    !families.some((f) => f === selectedFontFamily)
  ) {
    selectedFontFamily = "";
  }
  if (!selectedFontFamily && families.length) {
    selectedFontFamily = families[0];
  }

  for (const fam of families) {
    const files = fontItems.filter(
      (x) => (x.fontFamily || "").toLowerCase() === fam.toLowerCase(),
    );
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.setAttribute("data-family", fam);
    li.tabIndex = 0;
    li.title = files.map((x) => x.path.replace(/^fonts\//, "")).join(", ");
    if (fam === selectedFontFamily) {
      li.classList.add("is-selected");
      li.setAttribute("aria-selected", "true");
    } else {
      li.setAttribute("aria-selected", "false");
    }

    const name = document.createElement("span");
    name.className = "ts-font-name";
    name.style.fontFamily = `"${fam}", system-ui, sans-serif`;
    name.textContent = fam;
    const meta = document.createElement("span");
    meta.className = "ts-font-meta";
    meta.textContent = files.length > 1
      ? files.length + " files · click to select"
      : (files[0].path.split(".").pop() || "font").toUpperCase() +
        " · click to select";
    li.appendChild(name);
    li.appendChild(meta);

    const pick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectFontFamily(fam);
      setStatus("Selected “" + fam + "” — use UI / Display / Both");
    };
    li.addEventListener("click", pick);
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") pick(e);
    });
    ul.appendChild(li);
  }

  const bar = $("font-apply-bar");
  if (bar) bar.hidden = !selectedFontFamily;
  if ($("font-family") && selectedFontFamily && !fontFamilyDirty) {
    $("font-family").value = selectedFontFamily;
  }
  refreshFontSelects();
}

function applyFontFamilyToTokens(family, bind) {
  const fam = String(family || selectedFontFamily || "").trim();
  if (!fam) {
    setStatus("Select a font first");
    return;
  }
  const target = bind || "both";
  const stack = fontStack(fam);
  if (target === "both" || target === "--site-font-ui") {
    tokenValues["--site-font-ui"] = stack;
  }
  if (target === "both" || target === "--site-font-display") {
    tokenValues["--site-font-display"] = stack;
  }
  snapshotActiveToSlot();
  refreshTokenInputs();
  syncGrapesFonts(window.__gjs);
  applyDraft(window.__gjs);
  const where = target === "both"
    ? "UI + Display"
    : target === "--site-font-ui"
    ? "UI"
    : "Display";
  setStatus("Applied “" + fam + "” → " + where);
}

function renderAssetList() {
  const ul = $("asset-list");
  if (!ul) return;
  ul.innerHTML = "";
  const images = assetPaths.filter((p) => p.startsWith("imgs/"));
  if (!images.length) {
    const li = document.createElement("li");
    li.className = "ts-media-empty";
    li.textContent = "No images yet";
    ul.appendChild(li);
    return;
  }
  for (const p of images) {
    const li = document.createElement("li");
    li.className = "ts-media-img";
    const file = p.replace(/^imgs\//, "");
    const isSvg = /\.svg$/i.test(file);
    if (isSvg) {
      const ph = document.createElement("span");
      ph.className = "ts-media-thumb ts-media-thumb--ph";
      ph.textContent = "SVG";
      li.appendChild(ph);
    } else {
      const img = document.createElement("img");
      img.className = "ts-media-thumb";
      img.alt = "";
      img.src = "/draft/assets/" + p;
      li.appendChild(img);
    }
    const lab = document.createElement("span");
    lab.className = "ts-media-label";
    lab.textContent = file;
    lab.title = p;
    li.appendChild(lab);
    ul.appendChild(li);
  }
}

function applyAssetsPayload(j) {
  assetPaths = j.assets || [];
  if (Array.isArray(j.fonts)) {
    fontItems = j.fonts.map((f) => ({
      path: f.path,
      fontFamily: f.fontFamily || familyFromFilename(f.path),
    }));
  } else {
    fontItems = assetPaths
      .filter((p) => p.startsWith("fonts/"))
      .map((p) => ({
        path: p,
        fontFamily: familyFromFilename(p),
      }));
  }

  // Repair: if two different base names share one family, rename
  // each from its filename so they stay selectable.
  const byFam = new Map();
  for (const f of fontItems) {
    const k = f.fontFamily.toLowerCase();
    if (!byFam.has(k)) byFam.set(k, []);
    byFam.get(k).push(f);
  }
  for (const group of byFam.values()) {
    if (group.length < 2) continue;
    const stems = new Set(
      group.map((g) =>
        familyFromFilename(g.path).toLowerCase()
      ),
    );
    if (stems.size <= 1) continue; // same face, multi format/weight
    for (const g of group) {
      g.fontFamily = familyFromFilename(g.path);
    }
  }

  rebuildFontFacesInExtras();
  renderFontList();
  renderAssetList();
  refreshFontSelects();
  syncGrapesFonts(window.__gjs);
  // Push faces + load into canvas (skip if editor not ready yet)
  if (window.__gjs) applyDraft(window.__gjs);
}

async function refreshAssets() {
  try {
    const r = await fetch("/api/assets");
    const j = await r.json();
    applyAssetsPayload(j);
  } catch {
    /* ignore */
  }
}

async function exportZip(editor) {
  const manifest = readManifest();
  if (!/^[a-z][a-z0-9_-]{0,39}$/.test(manifest.id)) {
    alert("Theme id must match [a-z][a-z0-9_-]{0,39}");
    return;
  }
  await applyDraft(editor);
  const grapesCss = editor ? (editor.getCss() || "") : "";
  const extras = ((cssExtras && cssExtras.value) || "").trim();
  const mergedExtras = [grapesCss.trim(), extras].filter(Boolean)
    .join("\n\n");

  snapshotActiveToSlot();
  setStatus("Exporting zip…");
  const dual = !!$("export-dual")?.checked;
  const res = await fetch("/api/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      manifest,
      tokens: { ...tokenValues },
      tokensLight: { ...tokensLight },
      tokensDark: { ...tokensDark },
      dual,
      cssExtras: mergedExtras,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.error || "Export failed");
    setStatus("Export failed");
    return;
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = manifest.id + ".zip";
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus("Downloaded " + manifest.id + ".zip");
}

async function importZip(file) {
  setStatus("Importing " + file.name + "…");
  const fd = new FormData();
  fd.append("file", file, file.name);
  const res = await fetch("/api/import", { method: "POST", body: fd });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(j.error || "Import failed");
    setStatus("Import failed");
    return;
  }
  if (j.meta) writeManifest(j.meta);
  if (j.tokens) {
    tokenValues = { ...j.tokens };
    refreshTokenInputs();
  }
  if (typeof j.cssExtras === "string" && cssExtras) {
    cssExtras.value = j.cssExtras;
  }
  if (j.assets || j.fonts || j.items) applyAssetsPayload(j);
  else {
    assetPaths = j.assets || [];
    renderAssetList();
    renderFontList();
  }
  await setLayout(currentLayout);
  setStatus("Imported · " + (j.meta?.id || "theme"));
}

async function resetDraft() {
  if (!confirm("Reset tokens, CSS extras, and assets?")) return;
  const res = await fetch("/api/reset", { method: "POST" });
  const j = await res.json();
  if (j.meta) writeManifest(j.meta);
  if (j.tokens) {
    tokenValues = { ...j.tokens };
    refreshTokenInputs();
  }
  if (cssExtras) cssExtras.value = "";
  assetPaths = [];
  fontItems = [];
  renderAssetList();
  renderFontList();
  if (window.__gjs) {
    try {
      window.__gjs.setStyle("");
    } catch {
      /* ignore */
    }
  }
  await setLayout(currentLayout);
  setStatus("Reset to defaults");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function uploadAsset(file) {
  // Fonts dropped on image upload still register as fonts
  if (isFontFileName(file.name)) {
    await uploadFont(file);
    return;
  }
  const b64 = await fileToBase64(file);
  const asBanner = !!$("asset-as-banner")?.checked;
  const token = $("asset-token")?.value || "";
  const safe = file.name.replace(/[^\w.\-+]+/g, "_");
  setStatus("Uploading " + safe + "…");
  const res = await fetch("/api/assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: safe,
      dataBase64: b64,
      kind: "image",
      asBanner,
      token: token || undefined,
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(j.error || "Upload failed");
    setStatus("Upload failed");
    return;
  }
  if (j.kind === "font") {
    applyFontUploadResult(j, j.fontFamily || safe);
    return;
  }
  if (token && j.path) {
    tokenValues[token] = `url("/draft/assets/${j.path}")`;
    snapshotActiveToSlot();
    refreshTokenInputs();
  }
  if (j.assets || j.fonts) applyAssetsPayload(j);
  else await refreshAssets();
  await applyDraft(window.__gjs);
  setStatus("Image " + j.path);
}

function applyFontUploadResult(j, family) {
  const fam = j.fontFamily || family;
  if (j.assets || j.fonts) applyAssetsPayload(j);
  else {
    if (j.path) {
      fontItems = fontItems.filter((f) => f.path !== j.path);
      fontItems.push({ path: j.path, fontFamily: fam });
      if (!assetPaths.includes(j.path)) assetPaths.push(j.path);
    }
    rebuildFontFacesInExtras();
    renderFontList();
  }

  selectFontFamily(fam);
  // Auto-apply to UI + Display so the canvas shows the face
  applyFontFamilyToTokens(fam, "both");
  setMediaTab("fonts");
  fontFamilyDirty = false;
  if ($("font-family")) $("font-family").value = "";
  setStatus("Font “" + fam + "” selected · applied to UI + Display");
}

async function uploadFont(file) {
  const b64 = await fileToBase64(file);
  const safe = file.name.replace(/[^\w.\-+]+/g, "_");
  if (!isFontFileName(safe)) {
    alert("Font must be .woff2, .woff, .ttf, or .otf");
    setStatus("Font upload failed");
    return;
  }
  // Only use the rename field when the user typed it intentionally.
  // Otherwise derive from the filename so each file stays selectable.
  let family = "";
  if (fontFamilyDirty) {
    family = ($("font-family")?.value || "").trim();
  }
  if (!family) {
    family = familyFromFilename(safe);
  }

  setStatus("Uploading font " + safe + "…");
  const res = await fetch("/api/assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: safe,
      dataBase64: b64,
      kind: "font",
      fontFamily: family,
      bindTokens: false,
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(j.error || "Font upload failed");
    setStatus("Font upload failed");
    return;
  }
  applyFontUploadResult(j, family);
  if (!j.assets && !j.fonts) await refreshAssets();
}

function setWorkspaceUI(ws) {
  const el = $("ts-workspace");
  const saveBtn = $("btn-save");
  if (!el) return;
  if (ws && ws.path) {
    el.hidden = false;
    el.textContent = "📁 " + (ws.name || ws.path);
    el.title = ws.path;
    if (saveBtn) saveBtn.hidden = false;
  } else {
    el.hidden = true;
    if (saveBtn) saveBtn.hidden = true;
  }
}

async function importCssFile(file) {
  setStatus("Importing CSS…");
  const fd = new FormData();
  fd.append("file", file, file.name);
  fd.append(
    "manifest",
    JSON.stringify(readManifest()),
  );
  const res = await fetch("/api/import-css", { method: "POST", body: fd });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(j.error || "CSS import failed");
    setStatus("CSS import failed");
    return;
  }
  if (j.meta) writeManifest(j.meta);
  if (j.tokens) {
    tokenValues = { ...j.tokens };
    refreshTokenInputs();
  }
  if (typeof j.cssExtras === "string" && cssExtras) {
    cssExtras.value = j.cssExtras;
  }
  await applyDraft(window.__gjs);
  setStatus("Imported CSS · " + file.name);
}

async function saveTheme() {
  setStatus("Saving theme…");
  await applyDraft(window.__gjs);
  const grapesCss = window.__gjs ? (window.__gjs.getCss() || "") : "";
  const extras = ((cssExtras && cssExtras.value) || "").trim();
  const mergedExtras = [grapesCss.trim(), extras].filter(Boolean)
    .join("\n\n");
  snapshotActiveToSlot();
  const dual = !!$("export-dual")?.checked;
  const res = await fetch("/api/save-theme", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      manifest: readManifest(),
      tokens: { ...tokenValues },
      tokensLight: { ...tokensLight },
      tokensDark: { ...tokensDark },
      dual,
      cssExtras: mergedExtras,
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(j.error || "Save failed");
    setStatus("Save failed");
    return;
  }
  setStatus("Saved → " + (j.path || "theme folder"));
}

async function boot() {
  setStatus("Loading catalog…");
  const catRes = await fetch("/api/catalog");
  const catJson = await catRes.json();
  catalog = catJson.tokens || [];
  presets = catJson.presets || [];
  fillPresetSelect();
  if (catJson.meta) writeManifest(catJson.meta);
  if (catJson.workspace) setWorkspaceUI(catJson.workspace);
  // Seed token values from loaded draft CSS (workspace)
  try {
    const cssRes = await fetch("/api/draft.css");
    const cssText = await cssRes.text();
    const re = /(--site-[\w-]+)\s*:\s*([^;]+);/g;
    let m;
    while ((m = re.exec(cssText)) !== null) {
      tokenValues[m[1]] = m[2].trim();
    }
    // extras = outside first :root
    if (cssExtras) {
      const extras = cssText.replace(/:root\s*\{[\s\S]*?\}\s*/, "").trim();
      if (extras) cssExtras.value = extras;
    }
  } catch {
    /* ignore */
  }
  buildTokenPanels();
  // Seed light/dark slots from active defaults
  tokensLight = { ...tokenValues };
  tokensDark = { ...tokenValues };
  await refreshAssets();
  await refreshContrast();

  // Initial layout from hash (#wiki, #login, …)
  const hashLay = (location.hash || "").replace(/^#/, "");
  if (LAYOUT_LIVE[hashLay]) currentLayout = hashLay;
  const layoutSel = $("layout-select");
  if (layoutSel) layoutSel.value = currentLayout;

  setStatus("Starting GrapesJS…");

  const editor = grapesjs.init({
    container: "#gjs",
    height: "100%",
    width: "auto",
    fromElement: false,
    storageManager: false,
    noticeOnUnload: false,
    blockManager: false,
    layerManager: { appendTo: "#layers-container" },
    selectorManager: { componentFirst: true },
    styleManager: {
      appendTo: "#styles-container",
      sectors: [
        {
          name: "Dimension",
          open: false,
          buildProps: ["width", "min-height", "padding", "margin"],
        },
        {
          id: "typography",
          name: "Typography",
          open: true,
          buildProps: [
            "font-family",
            "font-size",
            "font-weight",
            "letter-spacing",
            "color",
            "line-height",
            "text-align",
            "text-decoration",
            "text-shadow",
          ],
          properties: [
            {
              id: "font-family",
              name: "Font",
              property: "font-family",
              type: "select",
              default: "var(--site-font-ui)",
              options: grapesFontOptions(),
            },
          ],
        },
        {
          name: "Decorations",
          open: true,
          buildProps: [
            "background-color",
            "border-radius",
            "border",
            "box-shadow",
            "background",
          ],
        },
        {
          name: "Extra",
          open: false,
          buildProps: ["opacity", "transition"],
        },
      ],
    },
    deviceManager: {
      devices: [
        { name: "Desktop", width: "" },
        { name: "Tablet", width: "770px", widthMedia: "992px" },
        { name: "Mobile", width: "390px", widthMedia: "480px" },
      ],
    },
    canvas: {
      styles: [
        "/shell/css/reset.css",
        "/shell/css/tokens.css",
        "/shell/css/layout.css",
        "/shell/css/components.css",
        // Cache-busted draft (tokens + @font-face) — also injected live
        "/api/draft.css?boot=1",
      ],
      scripts: [],
    },
    showOffsets: true,
  });

  window.__gjs = editor;

  try {
    const pn = editor.Panels;
    pn.getPanels().forEach((p) => {
      try {
        pn.removePanel(p.get("id"));
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }

  editor.on("load", async () => {
    await loadGrapesLayout(editor, currentLayout);
    syncGrapesFonts(editor);
    await applyDraft(editor);
    // In-canvas layout links (#home, #wiki, …)
    try {
      const doc = editor.Canvas.getDocument();
      if (doc) {
        doc.addEventListener("click", (ev) => {
          const a = ev.target && ev.target.closest
            ? ev.target.closest("a[href]")
            : null;
          if (!a) return;
          const href = a.getAttribute("href") || "";
          const m = href.match(/^#([a-z]+)$/);
          if (m && LAYOUT_LIVE[m[1]]) {
            ev.preventDefault();
            setLayout(m[1]);
          }
        });
      }
    } catch {
      /* ignore */
    }
    setStatus("Ready · pick a Layout · Grapes or Live");
  });

  // Keep Grapes font list fresh when selection opens Styles
  editor.on("component:selected", () => {
    syncGrapesFonts(editor);
  });

  editor.on("component:add", () => {
    queueMicrotask(() => lockStructure(editor));
  });
  editor.on("update", () => scheduleApply());
  editor.on("style:change", () => scheduleApply());
  editor.on("component:remove:before", (...args) => {
    const opts = args[1] && typeof args[1] === "object" ? args[1] : args[2];
    if (opts && opts.temporary) return;
    if (opts && typeof opts === "object") {
      if (typeof opts.abort === "function") opts.abort();
      else opts.abort = true;
    }
    setStatus("Structure locked — style only");
  });

  // Parent ← live iframe ready
  window.addEventListener("message", (ev) => {
    if (ev.data && ev.data.type === "ursamu-theme-ready") {
      applyDraft(editor);
      pushLiveMeta();
    }
  });

  // Sync canvas text edits → title / label fields
  editor.on("component:update", (comp) => {
    if (patchingManifest) return;
    try {
      const el = comp.getEl && comp.getEl();
      if (!el || !el.getAttribute) return;
      const cls = el.className || "";
      const text = (el.textContent || "").trim();
      if (!text) return;
      if (
        el.getAttribute("data-site-banner-title") != null ||
        (typeof cls === "string" && cls.includes("site-banner__title"))
      ) {
        if ($("m-title") && $("m-title").value !== text) {
          $("m-title").value = text;
          scheduleMetaRefresh({ reloadGrapes: false });
        }
      }
      if (
        el.getAttribute("data-site-brand") != null ||
        (typeof cls === "string" && cls.includes("site-nav__brand"))
      ) {
        // brand may include only text node
        if (!el.querySelector || !el.querySelector("img")) {
          if ($("m-label") && $("m-label").value !== text) {
            $("m-label").value = text;
            scheduleMetaRefresh({ reloadGrapes: false });
          }
        }
      }
    } catch {
      /* ignore */
    }
  });

  $("btn-tokens")?.addEventListener("click", () => applyDraft(editor));
  $("btn-export")?.addEventListener("click", () => exportZip(editor));
  $("btn-save")?.addEventListener("click", () => saveTheme());
  $("btn-reset")?.addEventListener("click", () => resetDraft());
  $("btn-mode-grapes")?.addEventListener(
    "click",
    () => setViewMode("grapes"),
  );
  $("btn-mode-live")?.addEventListener("click", () => setViewMode("live"));

  $("layout-select")?.addEventListener("change", (e) => {
    setLayout(e.target.value);
  });

  $("preset-select")?.addEventListener("change", (e) => {
    const id = e.target.value;
    if (id) applyPreset(id);
  });
  $("btn-mode-light")?.addEventListener("click", () => setColorMode("light"));
  $("btn-mode-dark")?.addEventListener("click", () => setColorMode("dark"));
  $("btn-export-draft")?.addEventListener("click", () => exportDraftJson());
  $("import-draft")?.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importDraftJson(f);
    e.target.value = "";
  });

  window.addEventListener("hashchange", () => {
    const h = (location.hash || "").replace(/^#/, "");
    if (LAYOUT_LIVE[h] && h !== currentLayout) {
      setLayout(h, { skipHash: true });
    }
  });

  $("import-file")?.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importZip(f);
    e.target.value = "";
  });

  $("import-css")?.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importCssFile(f);
    e.target.value = "";
  });

  $("asset-file")?.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) {
      setMediaTab("images");
      uploadAsset(f);
    }
    e.target.value = "";
  });

  $("font-file")?.addEventListener("change", (e) => {
    const input = e.target;
    const files = input.files ? [...input.files] : [];
    setMediaTab("fonts");
    (async () => {
      for (const f of files) await uploadFont(f);
      input.value = "";
    })();
  });

  document.querySelectorAll(".ts-media-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      setMediaTab(btn.getAttribute("data-media") || "images");
    });
  });

  $("font-apply-ui")?.addEventListener("click", (e) => {
    e.preventDefault();
    applyFontFamilyToTokens(selectedFontFamily, "--site-font-ui");
  });
  $("font-apply-display")?.addEventListener("click", (e) => {
    e.preventDefault();
    applyFontFamilyToTokens(selectedFontFamily, "--site-font-display");
  });
  $("font-apply-both")?.addEventListener("click", (e) => {
    e.preventDefault();
    applyFontFamilyToTokens(selectedFontFamily, "both");
  });
  $("font-family")?.addEventListener("input", () => {
    fontFamilyDirty = true;
  });
  $("font-family")?.addEventListener("change", () => {
    const next = ($("font-family")?.value || "").trim();
    if (!next || !selectedFontFamily) return;
    // Rename selected family across files + faces + token stacks
    const prev = selectedFontFamily;
    for (const f of fontItems) {
      if (f.fontFamily === prev) f.fontFamily = next;
    }
    const prevStack = fontStack(prev);
    if (tokenValues["--site-font-ui"] === prevStack) {
      tokenValues["--site-font-ui"] = fontStack(next);
    }
    if (tokenValues["--site-font-display"] === prevStack) {
      tokenValues["--site-font-display"] = fontStack(next);
    }
    selectedFontFamily = next;
    fontFamilyDirty = false;
    rebuildFontFacesInExtras();
    renderFontList();
    snapshotActiveToSlot();
    refreshTokenInputs();
    applyDraft(window.__gjs);
    setStatus("Renamed font → “" + next + "”");
  });

  cssExtras?.addEventListener("change", () => scheduleApply());

  // Manifest fields: live-update Grapes + live iframe as you type
  ["m-id", "m-label", "m-title"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", () => {
      // Immediate canvas/iframe text patch (no full rebuild)
      patchGrapesManifestLive();
      pushLiveMeta();
      scheduleMetaRefresh({ reloadGrapes: false, patchLive: false });
      scheduleApply();
    });
    el.addEventListener("change", () => {
      patchGrapesManifestLive();
      pushLiveMeta();
      scheduleMetaRefresh({ reloadGrapes: false });
      scheduleApply();
    });
  });
  $("m-plain")?.addEventListener("change", () => {
    // plainBg needs shell class rebuild
    scheduleMetaRefresh({ reloadGrapes: true });
    scheduleApply();
  });

  wireTabs(editor);
  gjsEl?.classList.add("is-active");
}

boot().catch((e) => {
  console.error(e);
  setStatus("Boot failed: " + (e && e.message ? e.message : e));
});
