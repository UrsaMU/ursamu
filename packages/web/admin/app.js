/**
 * UrsaMU staff web console — dashboard, wiki, database.
 * @see packages/web/design.md
 */

const TOKEN_KEY = "ursamu.webAdmin.token";
const TOKEN_KEY_LEGACY = "ursamu.wikiAdmin.token";
/** admin+ hierarchy used by game locks */
const STAFF = new Set(["admin", "wizard", "superuser"]);

/** @type {RegExp} path: lore/factions */
export const PATH_RE = /^[a-z0-9]+(?:[/_-][a-z0-9]+)*$/;

const SEED_BODY = `Write the page here.

## Overview

## Details

## See also

- [[related-page]]
`;

/** @typedef {{ id: string, name: string, flags: string[] }} Me */
/** @typedef {{
 *   path: string,
 *   title: string,
 *   type: string,
 *   draft?: boolean,
 *   author?: string,
 *   date?: string,
 *   readLock?: string,
 *   tags?: string[],
 *   chars?: number,
 * }} WikiStub */
/** @typedef {{
 *   path: string,
 *   title: string,
 *   body: string,
 *   draft: boolean,
 *   readLock: string,
 *   tags: string[],
 * }} PageSnapshot */

// ── DOM ──────────────────────────────────────────────────────────

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

const views = {
  loading: $("view-loading"),
  login: $("view-login"),
  forbidden: $("view-forbidden"),
  app: $("view-app"),
};

const loginForm = /** @type {HTMLFormElement} */ ($("login-form"));
const loginError = $("login-error");
const loginSubmit = /** @type {HTMLButtonElement} */ ($("login-submit"));
const treeList = $("tree-list");
const treeSkel = $("tree-skel");
const treeSearch = /** @type {HTMLInputElement} */ ($("tree-search"));
const pagesSearch = /** @type {HTMLInputElement} */ ($("pages-search"));
const topbarUser = $("topbar-user");
const mainDashboard = $("main-dashboard");
const mainPages = $("main-pages");
const mainEditor = $("main-editor");
const mainCreate = $("main-create");
const mainDb = $("main-db");
const toastHost = $("toast-host");
const dbSearch = /** @type {HTMLInputElement} */ ($("db-search"));
const dbTbody = $("db-tbody");
const dbCount = $("db-count");
const dbError = $("db-error");
const dbLoading = $("db-loading");
const dbDetailEmpty = $("db-detail-empty");
const dbDetailBody = $("db-detail-body");
const dbDetailId = $("db-detail-id");
const dbDetailName = $("db-detail-name");
const dbDetailMeta = $("db-detail-meta");
const dbRaw = $("db-raw");
const dbEditForm = /** @type {HTMLFormElement} */ ($("db-edit-form"));
const dbEditName = /** @type {HTMLInputElement} */ ($("db-edit-name"));
const dbEditMoniker =
  /** @type {HTMLInputElement} */ ($("db-edit-moniker"));
const dbEditFlags =
  /** @type {HTMLInputElement} */ ($("db-edit-flags"));
const dbEditLocation =
  /** @type {HTMLInputElement} */ ($("db-edit-location"));
const dbEditZone =
  /** @type {HTMLInputElement} */ ($("db-edit-zone"));
const dbEditOwner =
  /** @type {HTMLInputElement} */ ($("db-edit-owner"));
const dbEditMoney =
  /** @type {HTMLInputElement} */ ($("db-edit-money"));
const dbEditQuota =
  /** @type {HTMLInputElement} */ ($("db-edit-quota"));
const dbEditDesc =
  /** @type {HTMLTextAreaElement} */ ($("db-edit-desc"));
const dbEditImage =
  /** @type {HTMLInputElement} */ ($("db-edit-image"));
const dbEditError = $("db-edit-error");
const dbEditOk = $("db-edit-ok");
const dbEditSave =
  /** @type {HTMLButtonElement} */ ($("db-edit-save"));
const dbEditReset =
  /** @type {HTMLButtonElement} */ ($("db-edit-reset"));

/** @returns {HTMLElement[]} */
function dbEditFields() {
  return [
    dbEditName,
    dbEditMoniker,
    dbEditFlags,
    dbEditLocation,
    dbEditZone,
    dbEditOwner,
    dbEditMoney,
    dbEditQuota,
    dbEditDesc,
    dbEditImage,
  ].filter(Boolean);
}
const dashUserName = $("dash-user-name");
const dashTbody = $("dash-tbody");
const dashEmptyMsg = $("dash-empty-msg");
const dashFilter = /** @type {HTMLInputElement} */ ($("dash-filter"));
const dashTags = $("dash-tags");
const dashRecent = $("dash-recent");
const dashOnline = $("dash-online");
const dashSections = $("dash-sections");
const dashPageCount = $("dash-page-count");
const dashFilterBanner = $("dash-filter-banner");
const dashFilterBannerText = $("dash-filter-banner-text");
const navDraftsCount = $("nav-drafts-count");
const statPages = $("stat-pages");
const statDrafts = $("stat-drafts");
const statPublished = $("stat-published");
const statSections = $("stat-sections");
const statSectionsMeta = $("stat-sections-meta");
const statOnline = $("stat-online");
const statObjects = $("stat-objects");
const statObjectsMeta = $("stat-objects-meta");
const statDbPlayers = $("stat-db-players");
const statDbRooms = $("stat-db-rooms");

/** @type {{ id?: string, name?: string, moniker?: string|null }[]} */
let onlinePlayers = [];

const createForm = /** @type {HTMLFormElement} */ ($("create-form"));
const createPath = /** @type {HTMLInputElement} */ ($("create-path"));
const createPathFile = $("create-path-file");
const createPathError = $("create-path-error");
const createTitle = /** @type {HTMLInputElement} */ ($("create-title"));
const createTitleError = $("create-title-error");
const createBody = /** @type {HTMLTextAreaElement} */ ($("create-body"));
const createBodyPreview = $("create-body-preview");
const createBodyError = $("create-body-error");
const createTagInput =
  /** @type {HTMLInputElement} */ ($("create-tag-input"));
const createTags = $("create-tags");
const createDraft =
  /** @type {HTMLInputElement} */ ($("create-draft"));
const createLock =
  /** @type {HTMLSelectElement} */ ($("create-lock"));
const createFormError = $("create-form-error");
const createExistsHint = $("create-exists-hint");
const createSubmit =
  /** @type {HTMLButtonElement} */ ($("create-submit"));

// Edit pane
const editForm = /** @type {HTMLFormElement} */ ($("edit-form"));
const editPathDisplay = $("edit-path-display");
const editHeading = $("edit-heading");
const editDirty = $("edit-dirty");
const editStatus = $("edit-status");
const editLoading = $("edit-loading");
const editLoadError = $("edit-load-error");
const editTitle = /** @type {HTMLInputElement} */ ($("edit-title"));
const editTitleError = $("edit-title-error");
const editBody = /** @type {HTMLTextAreaElement} */ ($("edit-body"));
const editBodyPreview = $("edit-body-preview");
const editBodyError = $("edit-body-error");
const editTagInput =
  /** @type {HTMLInputElement} */ ($("edit-tag-input"));
const editTagsEl = $("edit-tags");
const editDraft =
  /** @type {HTMLInputElement} */ ($("edit-draft"));
const editLock =
  /** @type {HTMLSelectElement} */ ($("edit-lock"));
const editFormError = $("edit-form-error");
const editSave = /** @type {HTMLButtonElement} */ ($("edit-save"));
const editDiscard =
  /** @type {HTMLButtonElement} */ ($("edit-discard"));

// ── Validation ───────────────────────────────────────────────────

/** @param {string} raw */
export function normalizePath(raw) {
  return raw
    .trim()
    .replace(/\.md$/i, "")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

/** @param {string} path */
export function isValidPath(path) {
  if (!path || path.includes("..")) return false;
  return PATH_RE.test(path);
}

/**
 * Build a comparable snapshot from form fields.
 * @param {{
 *   path: string,
 *   title: string,
 *   body: string,
 *   draft: boolean,
 *   readLock: string,
 *   tags: string[],
 * }} f
 * @returns {PageSnapshot}
 */
export function snapshotFromFields(f) {
  return {
    path: f.path,
    title: f.title.trim(),
    body: f.body.replace(/\r\n/g, "\n"),
    draft: !!f.draft,
    readLock: f.readLock || "connected",
    tags: [...f.tags].map((t) => t.toLowerCase()).sort(),
  };
}

/** @param {PageSnapshot} a @param {PageSnapshot} b */
export function snapshotsEqual(a, b) {
  if (!a || !b) return false;
  return (
    a.path === b.path &&
    a.title === b.title &&
    a.body === b.body &&
    a.draft === b.draft &&
    a.readLock === b.readLock &&
    a.tags.join("\0") === b.tags.join("\0")
  );
}

// ── Token / API ──────────────────────────────────────────────────

function getToken() {
  try {
    const cur = sessionStorage.getItem(TOKEN_KEY) ?? "";
    if (cur) return cur;
    // Migrate from wiki-admin sessions
    const legacy = sessionStorage.getItem(TOKEN_KEY_LEGACY) ?? "";
    if (legacy) {
      sessionStorage.setItem(TOKEN_KEY, legacy);
      sessionStorage.removeItem(TOKEN_KEY_LEGACY);
      return legacy;
    }
    return "";
  } catch {
    return "";
  }
}

function setToken(token) {
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.removeItem(TOKEN_KEY_LEGACY);
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY_LEGACY);
    }
  } catch {
    /* private mode */
  }
}

function clearSession() {
  setToken("");
}

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function api(path, init = {}) {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || res.statusText };
  }
  return { res, data };
}

/**
 * Normalize /api/v1/me flags (array or space-separated string).
 * @param {unknown} flags
 * @returns {string[]}
 */
export function normalizeFlags(flags) {
  if (!flags) return [];
  if (Array.isArray(flags)) {
    return flags.map((f) => String(f).toLowerCase().trim()).filter(Boolean);
  }
  if (typeof flags === "string") {
    return flags.split(/[\s,|]+/).map((f) => f.toLowerCase().trim())
      .filter(Boolean);
  }
  // unexpected object — try values
  if (typeof flags === "object") {
    try {
      return Object.values(/** @type {object} */ (flags))
        .map((f) => String(f).toLowerCase().trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}

/** @param {unknown} flags */
export function isStaffFlags(flags) {
  const list = normalizeFlags(flags);
  return list.some((f) => STAFF.has(f));
}

// ── Views / toast ────────────────────────────────────────────────

/** @param {keyof typeof views} name */
function showView(name) {
  for (const [k, el] of Object.entries(views)) {
    const on = k === name;
    el.hidden = !on;
    el.setAttribute("aria-hidden", on ? "false" : "true");
    if (on) el.removeAttribute("inert");
    else el.setAttribute("inert", "");
  }
}

/** @param {string} msg @param {"ok"|"error"} [kind] */
function toast(msg, kind = "ok") {
  const el = document.createElement("div");
  el.className = kind === "error" ? "toast toast-error" : "toast";
  el.textContent = msg;
  toastHost.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

/** @param {HTMLElement} el @param {string} msg */
function setFieldError(el, msg) {
  el.hidden = !msg;
  el.textContent = msg || "";
}

// ── Auth ─────────────────────────────────────────────────────────

async function boot() {
  showView("loading");
  if (!getToken()) {
    showView("login");
    return;
  }

  const { res, data } = await api("/api/v1/me");
  if (res.status === 401) {
    clearSession();
    showView("login");
    return;
  }
  if (!res.ok) {
    showView("login");
    showLoginError(data?.error || "Could not load profile.");
    return;
  }

  /** @type {Me} */
  const me = {
    id: String(data.dbId ?? data.id ?? ""),
    name: String(data.name ?? "Unknown"),
    flags: normalizeFlags(data.flags),
  };

  if (!isStaffFlags(me.flags)) {
    console.warn(
      "[wiki-admin] signed in but not staff. flags=",
      me.flags,
      "raw=",
      data.flags,
    );
    showView("forbidden");
    // Show which flags we saw (helps diagnose)
    const detail = $("forbidden-flags");
    if (detail) {
      detail.textContent = me.flags.length
        ? `Flags on account: ${me.flags.join(", ")}`
        : "No flags returned by /api/v1/me.";
      detail.hidden = false;
    }
    return;
  }

  enterApp(me);
}

/** @param {string} msg */
function showLoginError(msg) {
  loginError.hidden = !msg;
  loginError.textContent = msg || "";
}

loginForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  showLoginError("");
  loginSubmit.setAttribute("aria-busy", "true");
  loginSubmit.disabled = true;

  const fd = new FormData(loginForm);
  const username = String(fd.get("username") ?? "").trim();
  const password = String(fd.get("password") ?? "");

  try {
    const { res, data } = await api("/api/v1/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      showLoginError(data?.error || "Login failed.");
      return;
    }
    if (!data?.token) {
      showLoginError("No token returned.");
      return;
    }
    setToken(String(data.token));

    // Fast path: login payload may already include flags (admin+).
    if (data.flags != null && isStaffFlags(data.flags)) {
      enterApp({
        id: String(data.id ?? ""),
        name: String(data.name ?? "Unknown"),
        flags: normalizeFlags(data.flags),
      });
      return;
    }

    await boot();
  } catch {
    showLoginError("Network error. Is the game HTTP port up?");
  } finally {
    loginSubmit.removeAttribute("aria-busy");
    loginSubmit.disabled = false;
  }
});

function signOut() {
  clearSession();
  closeCreate({ force: true, to: "none" });
  clearEditor();
  showView("login");
  loginForm.reset();
  showLoginError("");
}

$("btn-signout").addEventListener("click", signOut);
$("btn-signout-forbidden").addEventListener("click", signOut);

// ── App state ────────────────────────────────────────────────────

/** @type {Me | null} */
let currentUser = null;
/** @type {WikiStub[]} */
let pages = [];
/** @type {string | null} */
let activePath = null;
/** @type {string[]} */
let createTagList = [];
/** @type {string[]} */
let editTagList = [];
/** @type {string | null} */
let conflictPath = null;
/** @type {PageSnapshot | null} */
let loadedSnapshot = null;
/** @type {number} */
let loadGen = 0;
/** @type {"all"|"drafts"|"published"} */
let dashStatusFilter = "all";
/** @type {string} */
let dashTagFilter = "";
/** @type {string} */
let dashSectionFilter = "";
/** @type {"dashboard"|"pages"|"editor"|"create"|"db"} */
let currentScreen = "dashboard";

/** @typedef {{
 *   id?: string,
 *   flags?: string | string[],
 *   location?: string,
 *   description?: string,
 *   data?: Record<string, unknown>,
 * }} DboStub */
/** @type {DboStub[]} */
let dbObjects = [];
/** @type {string | null} */
let dbSelectedId = null;
/** @type {DboStub | null} */
let dbLoaded = null;
/** @type {"all"|"player"|"room"|"exit"|"thing"} */
let dbTypeFilter = "all";
/** @type {boolean} */
let dbLoadedOnce = false;

/** @param {Me} me */
/** Plain staff name for chrome (never moniker / color codes). */
function staffDisplayName(me) {
  const n = stripMushCodes(me?.name || "").trim();
  return n || "Staff";
}

function enterApp(me) {
  currentUser = me;
  const label = staffDisplayName(me);
  topbarUser.textContent = label;
  if (dashUserName) {
    dashUserName.textContent = label ? `, ${label}` : "";
  }
  showView("app");
  currentScreen = "dashboard";
  showMain("dashboard");
  void loadTree();
}

async function loadTree() {
  const { res, data } = await api("/api/v1/wiki");

  if (res.status === 401) {
    clearSession();
    showView("login");
    return;
  }
  if (res.status === 403) {
    showView("forbidden");
    return;
  }
  if (!res.ok) {
    toast(data?.error || "Failed to load pages", "error");
    pages = [];
    renderScreens();
    return;
  }

  pages = Array.isArray(data) ? data : [];
  if (pagesSearch) pagesSearch.disabled = false;
  renderScreens();
  // Prefetch live DB + online for dashboard variety
  void loadOnlinePlayers();
  if (!dbLoadedOnce) void loadDbObjects();
}

/** Refresh list UIs without changing screen */
function renderScreens() {
  renderDashboard();
  renderPagesScreen();
  updateNavMeta();
  updateDashLiveStats();
}

async function loadOnlinePlayers() {
  const { res, data } = await api("/api/v1/players/online");
  if (!res.ok) {
    onlinePlayers = [];
    renderOnline();
    updateDashLiveStats();
    return;
  }
  onlinePlayers = Array.isArray(data)
    ? data
    : (Array.isArray(data?.players) ? data.players : []);
  renderOnline();
  updateDashLiveStats();
}

/**
 * Strip MUSH color codes / ANSI for plain UI text.
 * @param {unknown} s
 */
function stripMushCodes(s) {
  return String(s ?? "")
    .replace(/%c[a-zA-Z]/gi, "")
    .replace(/%[nrtbR]/gi, "")
    .replace(/<#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})>/g, "")
    // deno-lint-ignore no-control-regex
    .replace(/\u001b\[[0-9;]*m/g, "")
    .trim();
}

/** Display name for online list — moniker without codes, else name. */
function onlineDisplayName(p) {
  const mono = stripMushCodes(p.moniker || "");
  if (mono) return mono;
  return String(p.name || `#${p.id}` || "Unknown");
}

function renderOnline() {
  if (!dashOnline) return;
  dashOnline.replaceChildren();
  if (!onlinePlayers.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No one connected right now.";
    dashOnline.appendChild(li);
    return;
  }
  const sorted = [...onlinePlayers].sort((a, b) =>
    onlineDisplayName(a).localeCompare(onlineDisplayName(b))
  );
  for (const p of sorted.slice(0, 12)) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dash-recent-link";
    btn.textContent = onlineDisplayName(p);
    btn.addEventListener("click", () => {
      void (async () => {
        goScreen("db");
        if (!dbLoadedOnce) await loadDbObjects();
        if (p.id) await selectDbObject(String(p.id));
      })();
    });
    const meta = document.createElement("span");
    meta.className = "dash-recent-meta";
    meta.textContent = p.id ? `#${p.id}` : "";
    li.append(btn, meta);
    dashOnline.appendChild(li);
  }
  if (sorted.length > 12) {
    const more = document.createElement("li");
    more.className = "muted";
    more.textContent = `+${sorted.length - 12} more online`;
    dashOnline.appendChild(more);
  }
}

function updateDashLiveStats() {
  if (statOnline) {
    statOnline.textContent = String(onlinePlayers.length);
  }
  if (statObjects) {
    statObjects.textContent = dbLoadedOnce
      ? String(dbObjects.length)
      : "—";
  }
  if (statObjectsMeta) {
    if (!dbLoadedOnce) {
      statObjectsMeta.textContent = "Loading…";
    } else {
      const players = dbObjects.filter((o) => dboType(o) === "player")
        .length;
      const rooms = dbObjects.filter((o) => dboType(o) === "room").length;
      statObjectsMeta.textContent = `${players} players · ${rooms} rooms`;
    }
  }
  if (statDbPlayers) {
    statDbPlayers.textContent = dbLoadedOnce
      ? String(dbObjects.filter((o) => dboType(o) === "player").length)
      : "—";
  }
  if (statDbRooms) {
    statDbRooms.textContent = dbLoadedOnce
      ? String(dbObjects.filter((o) => dboType(o) === "room").length)
      : "—";
  }
}

/** @param {WikiStub} p */
function pageSection(p) {
  const parts = String(p.path).split("/");
  return parts.length > 1 ? parts[0] : "(root)";
}

/** @param {WikiStub[]} list */
function applyDashFilters(list) {
  let out = list;
  if (dashStatusFilter === "drafts") {
    out = out.filter((p) => p.draft === true);
  } else if (dashStatusFilter === "published") {
    out = out.filter((p) => p.draft !== true);
  }
  if (dashTagFilter) {
    const tag = dashTagFilter.toLowerCase();
    out = out.filter((p) =>
      (p.tags || []).some((t) => String(t).toLowerCase() === tag)
    );
  }
  if (dashSectionFilter) {
    out = out.filter((p) => pageSection(p) === dashSectionFilter);
  }
  return out;
}

function searchQuery() {
  const fromPages = (pagesSearch?.value || "").trim().toLowerCase();
  if (fromPages) return fromPages;
  return (dashFilter?.value || treeSearch?.value || "")
    .trim()
    .toLowerCase();
}

function filteredPages() {
  const q = searchQuery();
  const list = applyDashFilters(pages);
  if (!q) return list;
  return list.filter(
    (p) =>
      String(p.path).toLowerCase().includes(q) ||
      String(p.title).toLowerCase().includes(q) ||
      String(p.author || "").toLowerCase().includes(q) ||
      (p.tags || []).some((t) => String(t).toLowerCase().includes(q)),
  );
}

function clearDashFilters() {
  dashStatusFilter = "all";
  dashTagFilter = "";
  dashSectionFilter = "";
  if (dashFilter) dashFilter.value = "";
  if (treeSearch) treeSearch.value = "";
  if (pagesSearch) pagesSearch.value = "";
  updateStatusChips();
  renderScreens();
}

/**
 * @param {"all"|"drafts"|"published"} next
 */
function setStatusFilter(next) {
  dashStatusFilter = next;
  updateStatusChips();
  renderScreens();
}

function updateStatusChips() {
  for (const id of ["chip-all", "chip-drafts", "chip-published"]) {
    const el = $(id);
    if (!el) continue;
    const st = el.getAttribute("data-status") || "all";
    const on = st === dashStatusFilter;
    el.setAttribute("aria-pressed", on ? "true" : "false");
    el.classList.toggle("pages-chip-active", on);
  }
}

function updateNavMeta() {
  const drafts = pages.filter((p) => p.draft === true).length;
  if (navDraftsCount) {
    navDraftsCount.textContent = drafts
      ? `${drafts} draft${drafts === 1 ? "" : "s"}`
      : "None";
  }
  updateNavActive();
}

function updateNavActive() {
  const map = {
    dashboard: "nav-dashboard",
    pages: "nav-pages",
    create: "nav-create",
    editor: "nav-pages",
    db: "nav-db",
  };
  const activeId = map[currentScreen] || "nav-dashboard";
  for (const id of [
    "nav-dashboard",
    "nav-pages",
    "nav-create",
    "nav-db",
  ]) {
    const el = $(id);
    if (!el) continue;
    const on = id === activeId;
    if (on) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  }
}

/**
 * @param {"dashboard"|"pages"|"editor"|"create"|"db"} name
 */
function showMain(name) {
  currentScreen = name;
  if (mainDashboard) mainDashboard.hidden = name !== "dashboard";
  if (mainPages) mainPages.hidden = name !== "pages";
  if (mainEditor) mainEditor.hidden = name !== "editor";
  if (mainCreate) mainCreate.hidden = name !== "create";
  if (mainDb) mainDb.hidden = name !== "db";
  updateNavActive();
}

/**
 * Navigate to a top-level screen (not editor).
 * @param {"dashboard"|"pages"|"create"|"db"} name
 * @param {{ force?: boolean }} [opts]
 */
function goScreen(name, opts = {}) {
  if (!opts.force) {
    if (!confirmLeaveIfDirty()) return false;
    if (!confirmLeaveCreate()) return false;
  }
  if (name === "create") {
    openCreate();
    return true;
  }
  activePath = null;
  loadedSnapshot = null;
  showMain(name);
  if (name === "dashboard") renderDashboard();
  if (name === "pages") renderPagesScreen();
  if (name === "db") {
    renderDbList();
    if (!dbLoadedOnce) void loadDbObjects();
  }
  mainPaneFocus();
  return true;
}

function showDashboard() {
  goScreen("dashboard");
}

function showPages() {
  goScreen("pages");
}

/** Back from editor/create/db detail → previous list */
function goBack() {
  if (currentScreen === "editor") {
    if (!confirmLeaveIfDirty()) return;
    activePath = null;
    loadedSnapshot = null;
    showMain("pages");
    renderPagesScreen();
    mainPaneFocus();
    return;
  }
  if (currentScreen === "create") {
    closeCreate({ force: false, to: "pages" });
    return;
  }
  if (currentScreen === "db") {
    if (dbSelectedId && isDbEditDirty()) {
      if (!globalThis.confirm("Discard object edits?")) return;
    }
    if (dbSelectedId) {
      clearDbSelection();
      return;
    }
    goScreen("dashboard");
    return;
  }
  if (currentScreen === "pages") {
    goScreen("dashboard");
    return;
  }
}

/** True if create form has meaningful user input */
function isCreateDirty() {
  if (currentScreen !== "create" && (mainCreate?.hidden !== false)) {
    return false;
  }
  if (!mainCreate || mainCreate.hidden) return false;
  const path = (createPath?.value || "").trim();
  const title = (createTitle?.value || "").trim();
  const body = (createBody?.value || "").trim();
  const seed = SEED_BODY.trim();
  if (path || title) return true;
  if (createTagList.length) return true;
  if (body && body !== seed) return true;
  return false;
}

/** @returns {boolean} true if OK to leave create view */
function confirmLeaveCreate() {
  if (!isCreateDirty()) return true;
  return globalThis.confirm(
    "Discard the new page draft and leave?",
  );
}

function mainPaneFocus() {
  try {
    $("main-pane")?.focus({ preventScroll: true });
  } catch {
    /* ignore */
  }
}

/** @param {number} n */
function formatChars(n) {
  if (!n || n < 1) return "—";
  if (n < 1000) return `${n} c`;
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

/** @param {string} dateStr */
function formatDate(dateStr) {
  if (!dateStr) return "—";
  // ISO date or datetime
  const d = String(dateStr).slice(0, 10);
  return d || "—";
}

function renderFilterBanner() {
  if (!dashFilterBanner || !dashFilterBannerText) return;
  /** @type {string[]} */
  const bits = [];
  if (dashStatusFilter === "drafts") bits.push("drafts only");
  if (dashStatusFilter === "published") bits.push("published only");
  if (dashTagFilter) bits.push(`tag “${dashTagFilter}”`);
  if (dashSectionFilter) bits.push(`section “${dashSectionFilter}”`);
  if (!bits.length) {
    dashFilterBanner.hidden = true;
    return;
  }
  dashFilterBanner.hidden = false;
  dashFilterBannerText.textContent = `Filtered: ${bits.join(" · ")}`;
}

function sectionCountsMap() {
  /** @type {Map<string, number>} */
  const sectionCounts = new Map();
  for (const p of pages) {
    const s = pageSection(p);
    sectionCounts.set(s, (sectionCounts.get(s) || 0) + 1);
  }
  return sectionCounts;
}

function renderDashboard() {
  const total = pages.length;
  const drafts = pages.filter((p) => p.draft === true).length;
  const published = total - drafts;
  const sectionCounts = sectionCountsMap();

  if (statPages) statPages.textContent = String(total);
  if (statDrafts) statDrafts.textContent = String(drafts);
  if (statPublished) statPublished.textContent = String(published);
  if (statSections) statSections.textContent = String(sectionCounts.size);
  if (statSectionsMeta) {
    const top = [...sectionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([k]) => k)
      .join(", ");
    statSectionsMeta.textContent = top || "Top folders";
  }

  renderRecent();
  updateNavMeta();
}

function renderPagesScreen() {
  const total = pages.length;
  const sectionCounts = sectionCountsMap();

  renderFilterBanner();
  updateStatusChips();
  renderSectionList(sectionCounts);
  renderTagCloud();

  let rows = filteredPages();
  rows = [...rows].sort((a, b) =>
    String(a.path).localeCompare(String(b.path))
  );

  if (dashPageCount) {
    dashPageCount.textContent = total
      ? `(${rows.length}${rows.length !== total ? ` of ${total}` : ""})`
      : "";
  }

  if (!dashTbody) return;
  dashTbody.replaceChildren();

  if (dashEmptyMsg) {
    dashEmptyMsg.hidden = total > 0;
  }

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 9;
    td.className = "muted";
    td.textContent = total === 0
      ? "No pages yet."
      : "No pages match this filter.";
    tr.appendChild(td);
    dashTbody.appendChild(tr);
  } else {
    for (const p of rows) {
      dashTbody.appendChild(buildDashRow(p));
    }
  }
}

function renderTagCloud() {
  /** @type {Map<string, number>} */
  const tagCounts = new Map();
  for (const p of pages) {
    for (const t of p.tags || []) {
      const key = String(t).toLowerCase();
      if (!key) continue;
      tagCounts.set(key, (tagCounts.get(key) || 0) + 1);
    }
  }
  if (!dashTags) return;
  dashTags.replaceChildren();
  if (!tagCounts.size) {
    const s = document.createElement("span");
    s.className = "muted";
    s.textContent = "No tags yet.";
    dashTags.appendChild(s);
    return;
  }
  const sorted = [...tagCounts.entries()].sort((a, b) =>
    b[1] - a[1] || a[0].localeCompare(b[0])
  );
  for (const [tag, count] of sorted) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tag";
    btn.textContent = `${tag} · ${count}`;
    btn.setAttribute(
      "aria-pressed",
      dashTagFilter === tag ? "true" : "false",
    );
    btn.addEventListener("click", () => {
      dashTagFilter = dashTagFilter === tag ? "" : tag;
      renderPagesScreen();
    });
    dashTags.appendChild(btn);
  }
}

function renderRecent() {
  if (!dashRecent) return;
  dashRecent.replaceChildren();
  if (!pages.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No pages yet — create one to get started.";
    dashRecent.appendChild(li);
    return;
  }
  const recent = [...pages].sort((a, b) => {
    const da = String(a.date || "");
    const db = String(b.date || "");
    if (da !== db) return db.localeCompare(da);
    return String(a.path).localeCompare(String(b.path));
  }).slice(0, 8);

  for (const p of recent) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dash-recent-link";
    btn.textContent = p.title || p.path;
    btn.addEventListener("click", () => void selectPage(p.path));

    const path = document.createElement("code");
    path.className = "muted";
    path.textContent = p.path;

    if (p.draft) {
      const badge = document.createElement("span");
      badge.className = "badge badge-draft";
      badge.textContent = "Draft";
      li.append(btn, badge, path);
    } else {
      li.append(btn, path);
    }

    const meta = document.createElement("span");
    meta.className = "dash-recent-meta";
    const bits = [];
    if (p.date) bits.push(formatDate(p.date));
    if (p.author) bits.push(p.author);
    bits.push(formatChars(Number(p.chars) || 0));
    meta.textContent = bits.join(" · ");
    li.appendChild(meta);
    dashRecent.appendChild(li);
  }
}

/** @param {Map<string, number>} sectionCounts */
function renderSectionList(sectionCounts) {
  if (!dashSections) return;
  dashSections.replaceChildren();
  if (!sectionCounts.size) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No sections yet.";
    dashSections.appendChild(li);
    return;
  }
  const sorted = [...sectionCounts.entries()].sort((a, b) =>
    b[1] - a[1] || a[0].localeCompare(b[0])
  );
  for (const [name, count] of sorted) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = name;
    if (dashSectionFilter === name) {
      btn.style.color = "var(--primary)";
      btn.style.fontWeight = "600";
    }
    btn.addEventListener("click", () => {
      dashSectionFilter = dashSectionFilter === name ? "" : name;
      if (currentScreen !== "pages") showMain("pages");
      renderPagesScreen();
    });
    const c = document.createElement("span");
    c.className = "count";
    c.textContent = String(count);
    li.append(btn, c);
    dashSections.appendChild(li);
  }
}

/** @param {WikiStub} p */
function buildDashRow(p) {
  const tr = document.createElement("tr");
  tr.tabIndex = 0;
  tr.addEventListener("click", (ev) => {
    if ((/** @type {HTMLElement} */ (ev.target)).closest("button")) return;
    void selectPage(p.path);
  });
  tr.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      void selectPage(p.path);
    }
  });

  const tdTitle = document.createElement("td");
  tdTitle.textContent = p.title || p.path;

  const tdPath = document.createElement("td");
  const code = document.createElement("code");
  code.textContent = p.path;
  tdPath.appendChild(code);

  const tdStatus = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = p.draft ? "badge badge-draft" : "badge badge-live";
  badge.textContent = p.draft ? "Draft" : "Live";
  tdStatus.appendChild(badge);

  const tdLock = document.createElement("td");
  tdLock.className = "muted";
  tdLock.textContent = p.readLock || "connected";

  const tdDate = document.createElement("td");
  tdDate.className = "muted";
  tdDate.textContent = formatDate(p.date || "");

  const tdSize = document.createElement("td");
  tdSize.className = "muted";
  tdSize.textContent = formatChars(Number(p.chars) || 0);

  const tdTags = document.createElement("td");
  tdTags.className = "muted";
  tdTags.textContent = (p.tags || []).join(", ") || "—";

  const tdAuthor = document.createElement("td");
  tdAuthor.className = "muted";
  tdAuthor.textContent = p.author || "—";

  const tdOpen = document.createElement("td");
  tdOpen.className = "row-open";
  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "secondary outline";
  openBtn.textContent = "Open";
  openBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    void selectPage(p.path);
  });
  tdOpen.appendChild(openBtn);

  tr.append(
    tdTitle,
    tdPath,
    tdStatus,
    tdLock,
    tdDate,
    tdSize,
    tdTags,
    tdAuthor,
    tdOpen,
  );
  return tr;
}

/** @param {WikiStub[]} [_list] */
function renderTree(_list) {
  // Page list lives on the Pages screen (table), not the side nav.
}

function highlightTree() {
  // no-op — selection is shown on the Pages table / editor path
}

// ── Dirty / snapshot ─────────────────────────────────────────────

function currentEditSnapshot() {
  if (!activePath) return null;
  if (editTagInput.value.trim()) {
    // don't mutate list while comparing; include pending as soft dirty
  }
  return snapshotFromFields({
    path: activePath,
    title: editTitle.value,
    body: editBody.value,
    draft: editDraft.checked,
    readLock: editLock.value || "connected",
    tags: editTagList,
  });
}

function isDirty() {
  if (!loadedSnapshot || !activePath) return false;
  const cur = currentEditSnapshot();
  if (!cur) return false;
  // Pending tag text counts as dirty
  if (editTagInput.value.trim()) return true;
  return !snapshotsEqual(loadedSnapshot, cur);
}

function updateDirtyUI() {
  const dirty = isDirty();
  editDirty.hidden = !dirty;
  editSave.disabled = !dirty || !activePath;
  editDiscard.disabled = !dirty || !activePath;
  if (dirty) {
    editStatus.textContent = "Unsaved";
  } else if (loadedSnapshot) {
    editStatus.textContent = loadedSnapshot.draft
      ? "Draft · saved"
      : "Published · saved";
  } else {
    editStatus.textContent = "";
  }
}

function clearEditor() {
  activePath = null;
  loadedSnapshot = null;
  editTagList = [];
  editForm.hidden = true;
  editLoading.hidden = true;
  editLoadError.hidden = true;
  editFormError.hidden = true;
  updateDirtyUI();
}

/** @returns {boolean} true if OK to leave */
function confirmLeaveIfDirty() {
  if (!isDirty()) return true;
  return globalThis.confirm(
    "You have unsaved changes. Discard them and continue?",
  );
}

// ── Tags (edit) ──────────────────────────────────────────────────

function renderEditTags() {
  editTagsEl.replaceChildren();
  for (const tag of editTagList) {
    const chip = document.createElement("span");
    chip.className = "tag";
    chip.textContent = tag + " ";
    const rm = document.createElement("button");
    rm.type = "button";
    rm.setAttribute("aria-label", `Remove ${tag}`);
    rm.textContent = "×";
    rm.addEventListener("click", () => {
      editTagList = editTagList.filter((t) => t !== tag);
      renderEditTags();
      updateDirtyUI();
    });
    chip.appendChild(rm);
    editTagsEl.appendChild(chip);
  }
}

/** @param {string} raw */
function addEditTag(raw) {
  const t = raw.trim().toLowerCase().replace(/[^\w-]+/g, "");
  if (!t || editTagList.includes(t) || editTagList.length >= 24) return;
  editTagList.push(t);
  renderEditTags();
  updateDirtyUI();
}

editTagInput.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" || ev.key === ",") {
    ev.preventDefault();
    addEditTag(editTagInput.value);
    editTagInput.value = "";
    updateDirtyUI();
  } else if (
    ev.key === "Backspace" &&
    !editTagInput.value &&
    editTagList.length
  ) {
    editTagList.pop();
    renderEditTags();
    updateDirtyUI();
  }
});

editTagInput.addEventListener("input", updateDirtyUI);

// ── Load / select page ───────────────────────────────────────────

/**
 * @param {string} path
 * @param {{ force?: boolean }} [opts]
 */
async function selectPage(path, opts = {}) {
  if (path === activePath && loadedSnapshot && !opts.force) {
    highlightTree();
    return;
  }
  if (!opts.force && !confirmLeaveIfDirty()) return;

  if (!opts.force && !confirmLeaveCreate()) return;

  activePath = path;
  highlightTree();
  showMain("editor");
  editForm.hidden = true;
  editLoadError.hidden = true;
  editFormError.hidden = true;
  editLoading.hidden = false;
  editPathDisplay.textContent = path;
  editHeading.textContent = "Loading…";
  loadedSnapshot = null;
  updateDirtyUI();

  const gen = ++loadGen;
  const enc = encodeURIComponent(path).replace(/%2F/gi, "/");
  const { res, data } = await api(`/api/v1/wiki/${enc}`);

  if (gen !== loadGen) return; // stale

  editLoading.hidden = true;

  if (res.status === 401) {
    clearSession();
    showView("login");
    return;
  }
  if (res.status === 403) {
    showView("forbidden");
    return;
  }
  if (!res.ok) {
    editLoadError.hidden = false;
    editLoadError.textContent =
      data?.error || `Could not load page (${res.status}).`;
    editHeading.textContent = "Error";
    return;
  }

  // Directory listing — not editable as a page
  if (data?.type === "directory") {
    editLoadError.hidden = false;
    editLoadError.textContent =
      "That path is a directory. Pick a page file.";
    editHeading.textContent = path;
    return;
  }

  const title = String(data.title ?? path);
  const body = String(data.body ?? "");
  const draft = data.draft === true;
  const readLock = String(data.readLock ?? "connected");
  const tags = Array.isArray(data.tags)
    ? data.tags.map((t) => String(t).toLowerCase())
    : [];

  editTitle.value = title;
  editBody.value = body;
  editDraft.checked = draft;
  if ([...editLock.options].some((o) => o.value === readLock)) {
    editLock.value = readLock;
  } else {
    // custom lock (e.g. faction:) — add temporary option
    const opt = document.createElement("option");
    opt.value = readLock;
    opt.textContent = readLock;
    editLock.appendChild(opt);
    editLock.value = readLock;
  }
  editTagList = [...tags];
  renderEditTags();
  editTagInput.value = "";
  setEditBodyMode("edit");
  setFieldError(editTitleError, "");
  setFieldError(editBodyError, "");

  loadedSnapshot = snapshotFromFields({
    path,
    title,
    body,
    draft,
    readLock,
    tags: editTagList,
  });

  editHeading.textContent = title || path;
  editForm.hidden = false;
  updateDirtyUI();
}

function applyEditFormListeners() {
  for (const el of [editTitle, editBody, editDraft, editLock]) {
    el.addEventListener("input", updateDirtyUI);
    el.addEventListener("change", updateDirtyUI);
  }
}
applyEditFormListeners();

/** Minimal FE-parity markdown for admin body preview. */
function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderWikiPreview(md) {
  const lines = String(md || "").split(/\r?\n/);
  let html = "";
  let inPara = false;
  const closePara = () => {
    if (inPara) {
      html += "</p>\n";
      inPara = false;
    }
  };
  const inline = (t) => {
    let s = escHtml(t);
    s = s.replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_m, target, label) => {
        const lbl = (label || target).trim();
        return `<a href="/site/wiki/${target.trim()}">${lbl}</a>`;
      },
    );
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    return s;
  };
  for (const line of lines) {
    if (!line.trim()) {
      closePara();
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)/);
    if (h) {
      closePara();
      const n = h[1].length;
      html += `<h${n}>${inline(h[2])}</h${n}>\n`;
      continue;
    }
    if (/^[-*_]{3,}\s*$/.test(line)) {
      closePara();
      html += "<hr>\n";
      continue;
    }
    const ul = line.match(/^[-*+]\s+(.*)/);
    if (ul) {
      closePara();
      html += `<ul><li>${inline(ul[1])}</li></ul>\n`;
      continue;
    }
    if (!inPara) {
      html += "<p>";
      inPara = true;
    } else html += " ";
    html += inline(line);
  }
  closePara();
  return html || "<p><em>Nothing to preview yet.</em></p>";
}

/** @param {"edit"|"preview"} mode */
function setEditBodyMode(mode) {
  const edit = mode === "edit";
  editBody.hidden = !edit;
  editBodyPreview.hidden = edit;
  editForm.querySelectorAll('input[name="edit-body-mode"]').forEach(
    (r) => {
      /** @type {HTMLInputElement} */ (r).checked =
        /** @type {HTMLInputElement} */ (r).value === mode;
    },
  );
  if (!edit) {
    editBodyPreview.innerHTML = renderWikiPreview(editBody.value);
  }
}

editForm.querySelectorAll('input[name="edit-body-mode"]').forEach(
  (r) => {
    r.addEventListener("change", () => {
      const v = /** @type {HTMLInputElement} */ (
        editForm.querySelector(
          'input[name="edit-body-mode"]:checked',
        )
      )?.value;
      setEditBodyMode(v === "preview" ? "preview" : "edit");
    });
  },
);

// ── Save / discard ───────────────────────────────────────────────

async function saveEdit() {
  if (!activePath || !loadedSnapshot) return;

  if (editTagInput.value.trim()) {
    addEditTag(editTagInput.value);
    editTagInput.value = "";
  }

  const title = editTitle.value.trim();
  const bodyForSave = editBody.value.replace(/\r\n/g, "\n");

  let ok = true;
  if (!title) {
    setFieldError(editTitleError, "Title is required.");
    ok = false;
  } else setFieldError(editTitleError, "");

  if (!bodyForSave.trim()) {
    setFieldError(editBodyError, "Body is required.");
    ok = false;
  } else setFieldError(editBodyError, "");

  if (!ok) return;

  const payload = {
    title,
    body: bodyForSave,
    draft: editDraft.checked,
    readLock: editLock.value || "connected",
    tags: [...editTagList],
  };

  editSave.disabled = true;
  editSave.setAttribute("aria-busy", "true");
  editFormError.hidden = true;

  const enc = encodeURIComponent(activePath).replace(/%2F/gi, "/");

  try {
    const { res, data } = await api(`/api/v1/wiki/${enc}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });

    if (res.status === 401) {
      clearSession();
      showView("login");
      return;
    }
    if (res.status === 403) {
      showView("forbidden");
      return;
    }
    if (!res.ok) {
      editFormError.hidden = false;
      editFormError.textContent =
        data?.error || `Save failed (${res.status}).`;
      return;
    }

    loadedSnapshot = snapshotFromFields({
      path: activePath,
      title: String(data.title ?? title),
      body: String(data.body ?? bodyForSave),
      draft: data.draft === true,
      readLock: String(data.readLock ?? payload.readLock),
      tags: Array.isArray(data.tags)
        ? data.tags.map((t) => String(t).toLowerCase())
        : [...editTagList],
    });

    // Sync form to server response
    editTitle.value = loadedSnapshot.title;
    editBody.value = loadedSnapshot.body;
    editDraft.checked = loadedSnapshot.draft;
    editLock.value = loadedSnapshot.readLock;
    editTagList = [...loadedSnapshot.tags];
    renderEditTags();
    editHeading.textContent = loadedSnapshot.title || activePath;

    toast(`Saved ${activePath}`);
    updateDirtyUI();
    // Refresh tree titles
    await loadTree();
    highlightTree();
  } catch {
    editFormError.hidden = false;
    editFormError.textContent = "Network error.";
  } finally {
    editSave.removeAttribute("aria-busy");
    updateDirtyUI();
  }
}

function discardEdit() {
  if (!loadedSnapshot || !activePath) return;
  if (!isDirty()) return;
  if (!globalThis.confirm("Discard unsaved changes?")) return;

  editTitle.value = loadedSnapshot.title;
  editBody.value = loadedSnapshot.body;
  editDraft.checked = loadedSnapshot.draft;
  editLock.value = loadedSnapshot.readLock;
  editTagList = [...loadedSnapshot.tags];
  renderEditTags();
  editTagInput.value = "";
  setEditBodyMode("edit");
  setFieldError(editTitleError, "");
  setFieldError(editBodyError, "");
  editFormError.hidden = true;
  editHeading.textContent = loadedSnapshot.title || activePath;
  updateDirtyUI();
}

editSave.addEventListener("click", () => {
  void saveEdit();
});
editDiscard.addEventListener("click", discardEdit);

editForm.addEventListener("submit", (ev) => {
  ev.preventDefault();
  void saveEdit();
});

// ── Create view (inline main pane) ───────────────────────────────

function resetCreateForm() {
  conflictPath = null;
  createTagList = [];
  createForm.reset();
  createDraft.checked = true;
  createLock.value = "connected";
  createBody.value = SEED_BODY;
  if (createPathFile) createPathFile.textContent = "….md";
  setFieldError(createPathError, "");
  setFieldError(createTitleError, "");
  setFieldError(createBodyError, "");
  createFormError.hidden = true;
  createExistsHint.hidden = true;
  renderCreateTags();
  setCreateBodyMode("edit");
}

function openCreate() {
  if (!confirmLeaveIfDirty()) return;
  // Re-open create: only confirm if already on create with dirty form
  if (mainCreate && !mainCreate.hidden && isCreateDirty()) {
    if (!globalThis.confirm("Start over? Current draft will be cleared.")) {
      return;
    }
  }
  resetCreateForm();
  activePath = null;
  loadedSnapshot = null;
  showMain("create");
  mainPaneFocus();
  createPath.focus();
}

/**
 * Leave create view.
 * @param {{ force?: boolean, to?: "dashboard"|"pages"|"none" }} [opts]
 */
function closeCreate(opts = {}) {
  const to = opts.to ?? "pages";
  if (!opts.force && !confirmLeaveCreate()) return;
  resetCreateForm();
  if (to === "none") {
    if (mainCreate) mainCreate.hidden = true;
    return;
  }
  activePath = null;
  loadedSnapshot = null;
  showMain(to);
  if (to === "dashboard") renderDashboard();
  if (to === "pages") renderPagesScreen();
  mainPaneFocus();
}

function isCreateOpen() {
  return !!(mainCreate && !mainCreate.hidden);
}

function renderCreateTags() {
  createTags.replaceChildren();
  for (const tag of createTagList) {
    const chip = document.createElement("span");
    chip.className = "tag";
    chip.textContent = tag + " ";
    const rm = document.createElement("button");
    rm.type = "button";
    rm.setAttribute("aria-label", `Remove ${tag}`);
    rm.textContent = "×";
    rm.addEventListener("click", () => {
      createTagList = createTagList.filter((t) => t !== tag);
      renderCreateTags();
    });
    chip.appendChild(rm);
    createTags.appendChild(chip);
  }
}

/** @param {string} raw */
function addCreateTag(raw) {
  const t = raw.trim().toLowerCase().replace(/[^\w-]+/g, "");
  if (!t || createTagList.includes(t) || createTagList.length >= 24) {
    return;
  }
  createTagList.push(t);
  renderCreateTags();
}

createTagInput.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" || ev.key === ",") {
    ev.preventDefault();
    addCreateTag(createTagInput.value);
    createTagInput.value = "";
  } else if (
    ev.key === "Backspace" &&
    !createTagInput.value &&
    createTagList.length
  ) {
    createTagList.pop();
    renderCreateTags();
  }
});

createPath.addEventListener("input", () => {
  const p = normalizePath(createPath.value);
  createPathFile.textContent = p ? `${p}.md` : "….md";
  if (!createPath.value.trim()) {
    setFieldError(createPathError, "");
    return;
  }
  if (!isValidPath(p)) {
    setFieldError(
      createPathError,
      "Use lowercase letters, numbers, /, _, - (e.g. lore/factions).",
    );
  } else {
    setFieldError(createPathError, "");
  }
});

/** @param {"edit"|"preview"} mode */
function setCreateBodyMode(mode) {
  const edit = mode === "edit";
  createBody.hidden = !edit;
  createBodyPreview.hidden = edit;
  createForm.querySelectorAll('input[name="body-mode"]').forEach(
    (r) => {
      /** @type {HTMLInputElement} */ (r).checked =
        /** @type {HTMLInputElement} */ (r).value === mode;
    },
  );
  if (!edit) {
    createBodyPreview.innerHTML = renderWikiPreview(
      createBody.value,
    );
  }
}

createForm.querySelectorAll('input[name="body-mode"]').forEach((r) => {
  r.addEventListener("change", () => {
    const v = /** @type {HTMLInputElement} */ (
      createForm.querySelector('input[name="body-mode"]:checked')
    )?.value;
    setCreateBodyMode(v === "preview" ? "preview" : "edit");
  });
});

// ── Database browser ─────────────────────────────────────────────

/** @param {DboStub} o */
function dboName(o) {
  const d = o.data || {};
  return String(d.name || d.moniker || o.id || "—");
}

/** @param {unknown} flags */
function flagsToString(flags) {
  if (flags instanceof Set) return [...flags].join(" ");
  if (Array.isArray(flags)) return flags.join(" ");
  return String(flags || "");
}

/** @param {DboStub} o */
function dboType(o) {
  const f = flagsToString(o.flags).toLowerCase();
  if (/\bplayer\b/.test(f)) return "player";
  if (/\broom\b/.test(f)) return "room";
  if (/\bexit\b/.test(f)) return "exit";
  return "thing";
}

function filteredDbObjects() {
  const q = (dbSearch?.value || "").trim().toLowerCase();
  let list = dbObjects;
  if (dbTypeFilter !== "all") {
    list = list.filter((o) => dboType(o) === dbTypeFilter);
  }
  if (!q) return list;
  return list.filter((o) => {
    const id = String(o.id || "").toLowerCase();
    const name = dboName(o).toLowerCase();
    const fl = flagsToString(o.flags).toLowerCase();
    const loc = String(o.location || "").toLowerCase();
    return (
      id.includes(q) ||
      name.includes(q) ||
      fl.includes(q) ||
      loc.includes(q)
    );
  });
}

function updateDbTypeChips() {
  for (const id of [
    "db-chip-all",
    "db-chip-player",
    "db-chip-room",
    "db-chip-exit",
    "db-chip-thing",
  ]) {
    const el = $(id);
    if (!el) continue;
    const t = el.getAttribute("data-db-type") || "all";
    const on = t === dbTypeFilter;
    el.setAttribute("aria-pressed", on ? "true" : "false");
    el.classList.toggle("pages-chip-active", on);
  }
}

function renderDbList() {
  updateDbTypeChips();
  const rows = filteredDbObjects().sort((a, b) => {
    const na = Number(a.id);
    const nb = Number(b.id);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a.id).localeCompare(String(b.id));
  });

  if (dbCount) {
    const total = dbObjects.length;
    dbCount.textContent = total
      ? `(${rows.length}${rows.length !== total ? ` of ${total}` : ""})`
      : "";
  }

  if (!dbTbody) return;
  dbTbody.replaceChildren();

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "muted";
    td.textContent = dbLoadedOnce
      ? "No objects match this filter."
      : "Loading…";
    tr.appendChild(td);
    dbTbody.appendChild(tr);
    return;
  }

  for (const o of rows) {
    const tr = document.createElement("tr");
    tr.tabIndex = 0;
    const id = String(o.id || "");
    if (id === dbSelectedId) {
      tr.classList.add("db-row-active");
    }
    tr.addEventListener("click", () => void selectDbObject(id));
    tr.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        void selectDbObject(id);
      }
    });

    const tdId = document.createElement("td");
    const code = document.createElement("code");
    code.textContent = `#${id}`;
    tdId.appendChild(code);

    const tdName = document.createElement("td");
    tdName.textContent = dboName(o);

    const tdType = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = dboType(o);
    tdType.appendChild(badge);

    const tdLoc = document.createElement("td");
    tdLoc.className = "muted";
    tdLoc.textContent = o.location ? `#${o.location}` : "—";

    const tdFlags = document.createElement("td");
    tdFlags.className = "muted";
    const fl = flagsToString(o.flags);
    tdFlags.textContent = fl.length > 48 ? fl.slice(0, 45) + "…" : fl || "—";
    tdFlags.title = fl;

    tr.append(tdId, tdName, tdType, tdLoc, tdFlags);
    dbTbody.appendChild(tr);
  }
}

/**
 * Normalize list payload from /api/v1/dbos or /api/v1/objects.
 * @param {unknown} data
 * @returns {DboStub[]}
 */
function normalizeObjectList(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const o = /** @type {Record<string, unknown>} */ (data);
    if (Array.isArray(o.objects)) return /** @type {DboStub[]} */ (o.objects);
    if (Array.isArray(o.items)) return /** @type {DboStub[]} */ (o.items);
    if (Array.isArray(o.results)) return /** @type {DboStub[]} */ (o.results);
  }
  return [];
}

async function loadDbObjects() {
  if (dbLoading) dbLoading.hidden = false;
  if (dbError) dbError.hidden = true;

  // Prefer /api/v1/dbos (staff list); fall back to /api/v1/objects.
  let { res, data } = await api("/api/v1/dbos?limit=1000");
  if (res.status === 404) {
    ({ res, data } = await api("/api/v1/objects?limit=500"));
  }

  if (dbLoading) dbLoading.hidden = true;
  dbLoadedOnce = true;

  if (res.status === 401) {
    clearSession();
    showView("login");
    return;
  }
  if (res.status === 403) {
    if (dbError) {
      dbError.hidden = false;
      dbError.textContent = "Forbidden — cannot list objects.";
    }
    dbObjects = [];
    renderDbList();
    updateDashLiveStats();
    return;
  }
  if (!res.ok) {
    if (dbError) {
      dbError.hidden = false;
      dbError.textContent = data?.error ||
        `Failed to load objects (${res.status}).`;
    }
    dbObjects = [];
    renderDbList();
    updateDashLiveStats();
    return;
  }

  dbObjects = normalizeObjectList(data);
  renderDbList();
  updateDashLiveStats();
}

function clearDbSelection() {
  dbSelectedId = null;
  dbLoaded = null;
  if (dbDetailEmpty) dbDetailEmpty.hidden = false;
  if (dbDetailBody) dbDetailBody.hidden = true;
  if (dbEditError) dbEditError.hidden = true;
  if (dbEditOk) dbEditOk.hidden = true;
  updateDbEditDirty();
  renderDbList();
}

/** @param {DboStub} o */
function dbDescOf(o) {
  const d = o.data || {};
  if (typeof o.description === "string" && o.description) {
    return o.description;
  }
  return String(d.description ?? "");
}

/** Snapshot of form fields for dirty compare */
function dbFormSnapshotFromObj(o) {
  const d = o.data || {};
  return {
    name: String(d.name ?? ""),
    moniker: String(d.moniker ?? ""),
    flags: flagsToString(o.flags),
    location: String(o.location ?? "").replace(/^#/, ""),
    zone: String(d.zone ?? "").replace(/^#/, ""),
    owner: String(d.owner ?? "").replace(/^#/, ""),
    money: d.money === undefined || d.money === null
      ? ""
      : String(d.money),
    quota: d.quota === undefined || d.quota === null
      ? ""
      : String(d.quota),
    description: dbDescOf(o),
    image: String(d.image ?? ""),
  };
}

function dbFormSnapshotFromInputs() {
  return {
    name: dbEditName?.value ?? "",
    moniker: dbEditMoniker?.value ?? "",
    flags: dbEditFlags?.value ?? "",
    location: (dbEditLocation?.value ?? "").replace(/^#/, "").trim(),
    zone: (dbEditZone?.value ?? "").replace(/^#/, "").trim(),
    owner: (dbEditOwner?.value ?? "").replace(/^#/, "").trim(),
    money: dbEditMoney?.value ?? "",
    quota: dbEditQuota?.value ?? "",
    description: dbEditDesc?.value ?? "",
    image: dbEditImage?.value ?? "",
  };
}

function isDbEditDirty() {
  if (!dbLoaded) return false;
  const a = dbFormSnapshotFromObj(dbLoaded);
  const b = dbFormSnapshotFromInputs();
  return JSON.stringify(a) !== JSON.stringify(b);
}

function updateDbEditDirty() {
  const dirty = isDbEditDirty();
  if (dbEditSave) dbEditSave.disabled = !dirty || !dbSelectedId;
  if (dbEditReset) dbEditReset.disabled = !dirty || !dbSelectedId;
}

/**
 * @param {string} id
 */
async function selectDbObject(id) {
  if (dbSelectedId === id && dbLoaded) {
    renderDbList();
    return;
  }
  if (isDbEditDirty()) {
    if (!globalThis.confirm("Discard object edits?")) return;
  }

  dbSelectedId = id;
  renderDbList();
  if (dbDetailEmpty) dbDetailEmpty.hidden = true;
  if (dbDetailBody) dbDetailBody.hidden = false;
  if (dbDetailId) dbDetailId.textContent = id;
  if (dbDetailName) dbDetailName.textContent = "Loading…";
  if (dbEditError) dbEditError.hidden = true;
  if (dbEditOk) dbEditOk.hidden = true;

  const enc = encodeURIComponent(id);
  const { res, data } = await api(`/api/v1/dbobj/${enc}`);

  if (dbSelectedId !== id) return; // stale

  if (res.status === 401) {
    clearSession();
    showView("login");
    return;
  }
  if (!res.ok) {
    if (dbDetailName) dbDetailName.textContent = "Error";
    if (dbEditError) {
      dbEditError.hidden = false;
      dbEditError.textContent = data?.error ||
        `Could not load #${id} (${res.status}).`;
    }
    return;
  }

  dbLoaded = data;
  fillDbDetail(data);
}

/** @param {DboStub} o */
function fillDbDetail(o) {
  const d = o.data || {};
  const snap = dbFormSnapshotFromObj(o);
  if (dbDetailId) dbDetailId.textContent = String(o.id || "");
  if (dbDetailName) dbDetailName.textContent = dboName(o);
  if (dbDetailMeta) {
    const bits = [
      dboType(o),
      o.location ? `loc #${o.location}` : null,
      d.zone ? `zone #${d.zone}` : null,
      d.owner ? `owner #${d.owner}` : null,
      flagsToString(o.flags) || null,
    ].filter(Boolean);
    dbDetailMeta.textContent = bits.join(" · ");
  }
  if (dbEditName) dbEditName.value = snap.name;
  if (dbEditMoniker) dbEditMoniker.value = snap.moniker;
  if (dbEditFlags) dbEditFlags.value = snap.flags;
  if (dbEditLocation) dbEditLocation.value = snap.location;
  if (dbEditZone) dbEditZone.value = snap.zone;
  if (dbEditOwner) dbEditOwner.value = snap.owner;
  if (dbEditMoney) dbEditMoney.value = snap.money;
  if (dbEditQuota) dbEditQuota.value = snap.quota;
  if (dbEditDesc) dbEditDesc.value = snap.description;
  if (dbEditImage) dbEditImage.value = snap.image;
  if (dbRaw) {
    try {
      dbRaw.textContent = JSON.stringify(o, null, 2);
    } catch {
      dbRaw.textContent = String(o);
    }
  }
  updateDbEditDirty();
}

function resetDbEdit() {
  if (!dbLoaded) return;
  fillDbDetail(dbLoaded);
  if (dbEditOk) dbEditOk.hidden = true;
  if (dbEditError) dbEditError.hidden = true;
}

function buildDbPatchPayload() {
  const snap = dbFormSnapshotFromInputs();
  /** @type {Record<string, unknown>} */
  const data = {
    name: snap.name.trim(),
    moniker: snap.moniker.trim(),
    description: snap.description,
    image: snap.image.trim(),
    owner: snap.owner,
    zone: snap.zone,
  };
  if (snap.money !== "") {
    data.money = Number(snap.money);
  }
  if (snap.quota !== "") {
    data.quota = Number(snap.quota);
  }
  return {
    flags: snap.flags.trim(),
    location: snap.location,
    description: snap.description,
    data,
  };
}

async function saveDbEdit() {
  if (!dbSelectedId || !dbLoaded) return;
  if (dbEditError) dbEditError.hidden = true;
  if (dbEditOk) dbEditOk.hidden = true;

  const payload = buildDbPatchPayload();

  dbEditSave.disabled = true;
  dbEditSave.setAttribute("aria-busy", "true");

  try {
    const enc = encodeURIComponent(dbSelectedId);
    const { res, data } = await api(`/api/v1/dbobj/${enc}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });

    if (res.status === 401) {
      clearSession();
      showView("login");
      return;
    }
    if (!res.ok) {
      if (dbEditError) {
        dbEditError.hidden = false;
        dbEditError.textContent = data?.error ||
          `Save failed (${res.status}).`;
      }
      return;
    }

    dbLoaded = data;
    const idx = dbObjects.findIndex(
      (o) => String(o.id) === String(dbSelectedId),
    );
    if (idx >= 0) dbObjects[idx] = data;
    fillDbDetail(data);
    renderDbList();
    toast(`Saved #${dbSelectedId}`);
    if (dbEditOk) {
      dbEditOk.hidden = false;
      dbEditOk.textContent = "Saved.";
    }
  } catch {
    if (dbEditError) {
      dbEditError.hidden = false;
      dbEditError.textContent = "Network error.";
    }
  } finally {
    dbEditSave.removeAttribute("aria-busy");
    updateDbEditDirty();
  }
}

// Side nav
$("nav-dashboard")?.addEventListener("click", () => goScreen("dashboard"));
$("nav-pages")?.addEventListener("click", () => goScreen("pages"));
$("nav-db")?.addEventListener("click", () => goScreen("db"));
$("nav-create")?.addEventListener("click", () => goScreen("create"));
$("nav-drafts")?.addEventListener("click", () => {
  setStatusFilter("drafts");
  goScreen("pages");
});

// DB events
$("btn-db-refresh")?.addEventListener("click", () => {
  void loadDbObjects().then(() => toast("Refreshed"));
});
dbSearch?.addEventListener("input", () => renderDbList());
for (const id of [
  "db-chip-all",
  "db-chip-player",
  "db-chip-room",
  "db-chip-exit",
  "db-chip-thing",
]) {
  $(id)?.addEventListener("click", () => {
    const t = $(id)?.getAttribute("data-db-type") || "all";
    if (
      t === "all" || t === "player" || t === "room" ||
      t === "exit" || t === "thing"
    ) {
      dbTypeFilter = t;
      renderDbList();
    }
  });
}
for (const el of dbEditFields()) {
  el.addEventListener("input", updateDbEditDirty);
  el.addEventListener("change", updateDbEditDirty);
}
dbEditReset?.addEventListener("click", resetDbEdit);
dbEditForm?.addEventListener("submit", (ev) => {
  ev.preventDefault();
  void saveDbEdit();
});

// Dashboard actions
$("btn-dash-new")?.addEventListener("click", openCreate);
$("btn-dash-new-2")?.addEventListener("click", openCreate);
$("btn-dash-empty-new")?.addEventListener("click", openCreate);
$("btn-pages-new")?.addEventListener("click", openCreate);
$("btn-go-pages")?.addEventListener("click", () => goScreen("pages"));
$("btn-go-pages-2")?.addEventListener("click", () => goScreen("pages"));
$("btn-go-db")?.addEventListener("click", () => goScreen("db"));
$("btn-go-db-2")?.addEventListener("click", () => goScreen("db"));
$("mod-wiki")?.addEventListener("click", () => goScreen("pages"));
$("mod-db")?.addEventListener("click", () => goScreen("db"));
$("mod-create")?.addEventListener("click", () => openCreate());
$("btn-recent-all")?.addEventListener("click", () => goScreen("pages"));
$("btn-online-refresh")?.addEventListener("click", () => {
  void loadOnlinePlayers().then(() => toast("Online list refreshed"));
});
$("btn-dash-refresh")?.addEventListener("click", () => {
  void loadTree();
  void loadOnlinePlayers();
  void loadDbObjects();
  toast("Refreshed");
});
$("stat-card-online")?.addEventListener("click", () => goScreen("db"));
$("stat-card-objects")?.addEventListener("click", () => goScreen("db"));
$("btn-pages-refresh")?.addEventListener("click", () => {
  void loadTree();
  toast("Refreshed");
});
$("btn-show-drafts")?.addEventListener("click", () => {
  setStatusFilter("drafts");
  goScreen("pages");
});
$("btn-clear-filter")?.addEventListener("click", clearDashFilters);
$("btn-clear-filter-banner")?.addEventListener("click", clearDashFilters);
$("btn-edit-back")?.addEventListener("click", () => goBack());
$("btn-create-back")?.addEventListener("click", () => goBack());

pagesSearch?.addEventListener("input", () => {
  if (dashFilter) dashFilter.value = pagesSearch.value;
  renderPagesScreen();
});

for (const id of ["chip-all", "chip-drafts", "chip-published"]) {
  $(id)?.addEventListener("click", () => {
    const st = $(id)?.getAttribute("data-status") || "all";
    if (st === "all" || st === "drafts" || st === "published") {
      setStatusFilter(/** @type {"all"|"drafts"|"published"} */ (st));
    }
  });
}

for (const id of ["stat-card-pages", "stat-card-drafts", "stat-card-published"]) {
  $(id)?.addEventListener("click", () => {
    const f = $(id)?.getAttribute("data-filter") || "all";
    if (f === "all" || f === "drafts" || f === "published") {
      setStatusFilter(/** @type {"all"|"drafts"|"published"} */ (f));
    }
    goScreen("pages");
  });
}

$("create-cancel")?.addEventListener("click", () => closeCreate());
$("create-cancel-2")?.addEventListener("click", () => closeCreate());

$("create-open-existing").addEventListener("click", (ev) => {
  ev.preventDefault();
  if (!conflictPath) return;
  const path = conflictPath;
  closeCreate({ force: true, to: "none" });
  void selectPage(path, { force: true });
});

createForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  createFormError.hidden = true;
  createExistsHint.hidden = true;
  conflictPath = null;

  const path = normalizePath(createPath.value);
  const title = createTitle.value.trim();
  const body = createBody.value.trim();

  let ok = true;
  if (!isValidPath(path)) {
    setFieldError(
      createPathError,
      "Use lowercase letters, numbers, /, _, -.",
    );
    ok = false;
  } else setFieldError(createPathError, "");

  if (!title) {
    setFieldError(createTitleError, "Title is required.");
    ok = false;
  } else setFieldError(createTitleError, "");

  if (!body) {
    setFieldError(createBodyError, "Body is required.");
    ok = false;
  } else setFieldError(createBodyError, "");

  if (!ok) return;

  if (createTagInput.value.trim()) {
    addCreateTag(createTagInput.value);
    createTagInput.value = "";
  }

  const payload = {
    path,
    title,
    body,
    draft: createDraft.checked,
    readLock: createLock.value || "connected",
    author: currentUser?.name || "Staff",
    date: new Date().toISOString().slice(0, 10),
  };
  if (createTagList.length) payload.tags = [...createTagList];

  const createSubmit2 = /** @type {HTMLButtonElement | null} */ (
    $("create-submit-2")
  );
  createSubmit.disabled = true;
  createSubmit.setAttribute("aria-busy", "true");
  if (createSubmit2) {
    createSubmit2.disabled = true;
    createSubmit2.setAttribute("aria-busy", "true");
  }

  try {
    const { res, data } = await api("/api/v1/wiki", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (res.status === 401) {
      clearSession();
      closeCreate({ force: true, to: "none" });
      showView("login");
      return;
    }
    if (res.status === 403) {
      closeCreate({ force: true, to: "none" });
      showView("forbidden");
      return;
    }
    if (res.status === 409) {
      conflictPath = path;
      createExistsHint.hidden = false;
      createFormError.hidden = false;
      createFormError.textContent =
        data?.error || "Page already exists.";
      return;
    }
    if (!res.ok) {
      createFormError.hidden = false;
      createFormError.textContent =
        data?.error || `Create failed (${res.status}).`;
      return;
    }

    toast(`Created ${path}`);
    // Clear create without dashboard hop; open the new page.
    closeCreate({ force: true, to: "none" });
    loadedSnapshot = null;
    activePath = null;
    await loadTree();
    await selectPage(path, { force: true });
  } catch {
    createFormError.hidden = false;
    createFormError.textContent = "Network error.";
  } finally {
    createSubmit.disabled = false;
    createSubmit.removeAttribute("aria-busy");
    if (createSubmit2) {
      createSubmit2.disabled = false;
      createSubmit2.removeAttribute("aria-busy");
    }
  }
});

// Keyboard
document.addEventListener("keydown", (ev) => {
  if (views.app.hidden) return;
  const tag = document.activeElement?.tagName;
  const typing =
    tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

  if (
    (ev.key === "s" || ev.key === "S") &&
    (ev.metaKey || ev.ctrlKey) &&
    !isCreateOpen()
  ) {
    if (activePath && isDirty()) {
      ev.preventDefault();
      void saveEdit();
    }
    return;
  }

  if (ev.key === "/" && !typing && !isCreateOpen()) {
    ev.preventDefault();
    goScreen("pages");
    pagesSearch?.focus();
    pagesSearch?.select?.();
  }
  if (
    (ev.key === "n" || ev.key === "N") &&
    !typing &&
    !isCreateOpen() &&
    !ev.metaKey &&
    !ev.ctrlKey
  ) {
    ev.preventDefault();
    openCreate();
  }
  if (ev.key === "Escape" && !typing) {
    goBack();
  }
});

// Boot
boot().catch(() => {
  showView("login");
  showLoginError("Failed to start admin shell.");
});
