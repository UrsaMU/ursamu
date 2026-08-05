<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "@/api/client";
import JsonFormEditor from "@/components/JsonFormEditor.vue";
import { buildLoginPreviewSrcdoc } from "@/utils/loginSplash";

type PluginFile = {
  plugin: string;
  rel: string;
  path: string;
  source: string;
  bytes: number;
  mtime: number | null;
};

type SettingsPayload = {
  game: {
    name: string;
    description: string;
    version: string;
    playerStart: string;
  };
  /** Web /play pre-auth splash (markdown). */
  loginMarkdown?: string;
  layout: {
    header: string;
    divider: string;
    footer: string;
  };
  site?: {
    available: boolean;
    skins: string[];
    themes?: Array<{
      id: string;
      label: string;
      version?: string;
      source?: string;
      skinCss?: string;
      bannerHref?: string;
      title?: string;
      description?: string;
      active?: boolean;
    }>;
    skin: string;
    skinCss: string;
    title: string;
    bannerImage: string;
    plainBg: boolean;
    telnet: string;
    themeDir?: string;
    previewUrl: string;
    nav?: Array<{
      id?: string;
      label: string;
      href: string;
      order: number;
    }>;
    pluginNav?: Array<{
      id?: string;
      label: string;
      href: string;
      order: number;
    }>;
  };
  server: {
    telnet: number | null;
    wsPort: number | null;
    apiPort: number | null;
    plugins: string[];
  };
  plugins: {
    inline: string[];
    files: PluginFile[];
    roots?: Array<{
      plugin: string;
      root: string;
      hasResources: boolean;
    }>;
    loaded: Array<{
      name: string;
      version: string;
      description: string;
    }>;
    convention: string;
  };
  editable: string[];
  restartKeys: string[];
};

type Tab = "game" | "site" | "restart" | "plugins";

const route = useRoute();
const router = useRouter();

const tab = computed<Tab>(() => {
  const t = String(route.query.tab ?? "game");
  if (t === "restart" || t === "plugins" || t === "site") return t;
  return "game";
});

const loading = ref(true);
const saving = ref(false);
const savingSite = ref(false);
const uploadingTheme = ref(false);
const activatingTheme = ref("");
const themeFile = ref<File | null>(null);
const themeActivateOnUpload = ref(true);
const restarting = ref(false);
const error = ref("");
const ok = ref("");
const needsRestart = ref(false);
const data = ref<SettingsPayload | null>(null);

const form = ref({
  name: "",
  description: "",
  version: "",
  playerStart: "",
  header: "",
  divider: "",
  footer: "",
  loginMarkdown: "",
});

const siteForm = ref({
  skin: "default",
  skinCss: "",
  title: "",
  bannerImage: "",
  plainBg: false,
  telnet: "",
});

type NavDraft = {
  id?: string;
  label: string;
  href: string;
};

const siteNav = ref<NavDraft[]>([]);
const pluginNavHint = ref<NavDraft[]>([]);

/** Last successfully saved site payload (JSON) — skip no-op autosaves. */
const lastSiteSnap = ref("");
/** Last successfully saved game/layout payload. */
const lastGameSnap = ref("");
let siteSaveChain: Promise<void> = Promise.resolve();
let gameSaveChain: Promise<void> = Promise.resolve();

const restartConfirm = ref("");

// Plugin JSON editor
const editing = ref<PluginFile | null>(null);
const editData = ref<unknown>(null);
const editMode = ref<"form" | "json">("form");
const editLoading = ref(false);
const editSaving = ref(false);
const editError = ref("");
const editDirty = ref(false);

function applyForm(s: SettingsPayload): void {
  form.value = {
    name: s.game.name,
    description: s.game.description,
    version: s.game.version,
    playerStart: s.game.playerStart,
    header: s.layout.header,
    divider: s.layout.divider,
    footer: s.layout.footer,
    loginMarkdown: s.loginMarkdown ?? "",
  };
  const site = s.site;
  if (site) {
    siteForm.value = {
      skin: site.skin || "default",
      skinCss: site.skinCss || "",
      title: site.title || "",
      bannerImage: site.bannerImage || "",
      plainBg: site.plainBg === true,
      telnet: site.telnet || "",
    };
    siteNav.value = (site.nav ?? []).map((n) => ({
      id: n.id,
      label: n.label || "",
      href: n.href || "",
    }));
    pluginNavHint.value = (site.pluginNav ?? []).map((n) => ({
      id: n.id,
      label: n.label || "",
      href: n.href || "",
    }));
  }
  lastGameSnap.value = gameSnapshot();
  lastSiteSnap.value = siteSnapshot();
}

function gameSnapshot(): string {
  return JSON.stringify({
    name: form.value.name.trim(),
    description: form.value.description.trim(),
    version: form.value.version.trim(),
    playerStart: form.value.playerStart.trim(),
    header: form.value.header,
    divider: form.value.divider,
    footer: form.value.footer,
    loginMarkdown: form.value.loginMarkdown,
  });
}

/** Live /play-shaped preview (site tokens + active skin). */
const loginPreviewSrcdoc = computed(() =>
  buildLoginPreviewSrcdoc({
    content: form.value.loginMarkdown || "",
    skin: siteForm.value.skin || "default",
    skinCss: siteForm.value.skinCss || "",
    origin: typeof window !== "undefined"
      ? window.location.origin
      : "",
  })
);

function siteSnapshot(): string {
  const nav = siteNav.value
    .map((n) => ({
      id: n.id?.trim() || undefined,
      label: n.label.trim(),
      href: n.href.trim(),
    }))
    .filter((n) => n.label || n.href);
  return JSON.stringify({
    skin: siteForm.value.skin.trim() || "default",
    skinCss: siteForm.value.skinCss.trim(),
    title: siteForm.value.title.trim(),
    bannerImage: siteForm.value.bannerImage.trim(),
    plainBg: siteForm.value.plainBg === true,
    telnet: siteForm.value.telnet.trim(),
    nav,
  });
}

/** Autosave site on blur/change when dirty. */
function onSiteFieldBlur(): void {
  void queueSiteSave();
}

/** Autosave game/layout on blur when dirty. */
function onGameFieldBlur(): void {
  void queueGameSave();
}

function queueSiteSave(): Promise<void> {
  siteSaveChain = siteSaveChain
    .then(() => saveSite({ silent: true }))
    .catch(() => { /* errors set on error ref */ });
  return siteSaveChain;
}

function queueGameSave(): Promise<void> {
  gameSaveChain = gameSaveChain
    .then(() => save({ silent: true }))
    .catch(() => { /* errors set on error ref */ });
  return gameSaveChain;
}

function normalizePayload(
  body: SettingsPayload & { error?: string },
): SettingsPayload {
  const plugins = body.plugins ?? {
    inline: [],
    files: [],
    loaded: [],
    convention: "",
  };
  const files = (plugins.files ?? []).map((f) => {
    const row = f as PluginFile & { name?: string };
    return {
      plugin: row.plugin || row.name || "?",
      rel: row.rel || row.name || "",
      path: row.path || "",
      source: row.source || "resources",
      bytes: row.bytes ?? 0,
      mtime: row.mtime ?? null,
    };
  });
  return {
    ...body,
    site: body.site ?? {
      available: false,
      skins: ["default"],
      themes: [],
      skin: "default",
      skinCss: "",
      title: "",
      bannerImage: "",
      plainBg: false,
      telnet: "",
      themeDir: "",
      previewUrl: "/site/",
      nav: [],
      pluginNav: [],
    },
    plugins: {
      inline: plugins.inline ?? [],
      files,
      roots: plugins.roots ?? [],
      loaded: plugins.loaded ?? [],
      convention: plugins.convention ||
        "Package data lives in each plugin's resources/ folder.",
    },
  };
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    const { res, data: body } = await api<
      SettingsPayload & { error?: string }
    >("/api/v1/admin/settings");
    if (!res.ok) {
      error.value = body?.error || `Load failed (${res.status})`;
      data.value = null;
      return;
    }
    const normalized = normalizePayload(body);
    data.value = normalized;
    applyForm(normalized);

    if (!normalized.plugins.files.length) {
      const plug = await api<{
        files?: PluginFile[];
        loaded?: SettingsPayload["plugins"]["loaded"];
        inline?: string[];
        convention?: string;
        error?: string;
      }>("/api/v1/admin/plugins");
      if (plug.res.ok && plug.data && !plug.data.error) {
        data.value = {
          ...normalized,
          plugins: {
            ...normalized.plugins,
            files: (plug.data.files ?? []).map((f) => ({
              plugin: f.plugin || "?",
              rel: f.rel || "",
              path: f.path || "",
              source: f.source || "resources",
              bytes: f.bytes ?? 0,
              mtime: f.mtime ?? null,
            })),
            loaded: plug.data.loaded ?? normalized.plugins.loaded,
            inline: plug.data.inline ?? normalized.plugins.inline,
            convention: plug.data.convention ||
              normalized.plugins.convention,
          },
        };
      }
    }
  } finally {
    loading.value = false;
  }
}

async function save(
  opts: { silent?: boolean } = {},
): Promise<void> {
  const snap = gameSnapshot();
  if (opts.silent && snap === lastGameSnap.value) return;

  saving.value = true;
  if (!opts.silent) {
    error.value = "";
    ok.value = "";
  }
  try {
    const { res, data: body } = await api<{
      ok?: boolean;
      error?: string;
      needsRestart?: boolean;
      settings?: SettingsPayload;
      applied?: string[];
    }>("/api/v1/admin/settings", {
      method: "PATCH",
      body: JSON.stringify({
        game: {
          name: form.value.name.trim(),
          description: form.value.description.trim(),
          version: form.value.version.trim(),
          playerStart: form.value.playerStart.trim(),
        },
        layout: {
          header: form.value.header,
          divider: form.value.divider,
          footer: form.value.footer,
        },
        loginMarkdown: form.value.loginMarkdown,
      }),
    });
    if (!res.ok) {
      error.value = body?.error || `Save failed (${res.status})`;
      return;
    }
    needsRestart.value = body.needsRestart === true;
    ok.value = needsRestart.value
      ? "Saved. Soft-restart recommended for some keys."
      : opts.silent
      ? "Auto-saved."
      : "Saved.";
    lastGameSnap.value = snap;
    // Don't clobber fields the user edited during the request
    if (body.settings && gameSnapshot() === snap) {
      data.value = normalizePayload(
        body.settings as SettingsPayload & { error?: string },
      );
      applyForm(data.value);
    }
  } finally {
    saving.value = false;
  }
}

async function saveSite(
  opts: { silent?: boolean } = {},
): Promise<void> {
  const snap = siteSnapshot();
  if (opts.silent && snap === lastSiteSnap.value) return;

  savingSite.value = true;
  if (!opts.silent) {
    error.value = "";
    ok.value = "";
  }
  try {
    const parsed = JSON.parse(snap) as {
      skin: string;
      skinCss: string;
      title: string;
      bannerImage: string;
      plainBg: boolean;
      telnet: string;
      nav: Array<{ id?: string; label: string; href: string }>;
    };

    const { res, data: body } = await api<{
      ok?: boolean;
      error?: string;
      siteLive?: boolean;
      settings?: SettingsPayload;
    }>("/api/v1/admin/settings", {
      method: "PATCH",
      body: JSON.stringify({ site: parsed }),
    });
    if (!res.ok) {
      error.value = body?.error || `Save failed (${res.status})`;
      return;
    }
    ok.value = body.siteLive
      ? opts.silent
        ? "Auto-saved — live on /site/."
        : "Site settings saved — live (hard-refresh /site/)."
      : opts.silent
      ? "Auto-saved to config.json."
      : "Site settings saved to config.json.";
    lastSiteSnap.value = snap;
    if (body.settings && siteSnapshot() === snap) {
      data.value = normalizePayload(
        body.settings as SettingsPayload & { error?: string },
      );
      applyForm(data.value);
    }
  } finally {
    savingSite.value = false;
  }
}

function moveNav(i: number, dir: -1 | 1): void {
  const j = i + dir;
  if (j < 0 || j >= siteNav.value.length) return;
  const next = [...siteNav.value];
  const tmp = next[i]!;
  next[i] = next[j]!;
  next[j] = tmp;
  siteNav.value = next;
  void queueSiteSave();
}

function addNav(): void {
  siteNav.value = [
    ...siteNav.value,
    { label: "New link", href: "/site/" },
  ];
  void queueSiteSave();
}

function removeNav(i: number): void {
  siteNav.value = siteNav.value.filter((_, idx) => idx !== i);
  void queueSiteSave();
}

const dragNavFrom = ref<number | null>(null);
const dragNavOver = ref<number | null>(null);

function onNavDragStart(i: number, ev: DragEvent): void {
  dragNavFrom.value = i;
  dragNavOver.value = i;
  if (ev.dataTransfer) {
    ev.dataTransfer.effectAllowed = "move";
    ev.dataTransfer.setData("text/plain", String(i));
  }
}

function onNavDragOver(i: number, ev: DragEvent): void {
  ev.preventDefault();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
  dragNavOver.value = i;
}

function onNavDrop(i: number, ev: DragEvent): void {
  ev.preventDefault();
  const from = dragNavFrom.value;
  dragNavFrom.value = null;
  dragNavOver.value = null;
  if (from == null || from === i) return;
  const next = [...siteNav.value];
  const [row] = next.splice(from, 1);
  if (!row) return;
  next.splice(i, 0, row);
  siteNav.value = next;
  void queueSiteSave();
}

function onNavDragEnd(): void {
  dragNavFrom.value = null;
  dragNavOver.value = null;
}

/** Pull a plugin-only link into the editable config list. */
function adoptPluginNav(n: NavDraft): void {
  const exists = siteNav.value.some(
    (x) =>
      (n.id && x.id === n.id) ||
      (x.href === n.href && x.label === n.label),
  );
  if (exists) return;
  siteNav.value = [
    ...siteNav.value,
    { id: n.id, label: n.label, href: n.href },
  ];
  void queueSiteSave();
}

async function doRestart(): Promise<void> {
  if (restartConfirm.value !== "restart") {
    error.value = 'Type "restart" to confirm.';
    return;
  }
  restarting.value = true;
  error.value = "";
  ok.value = "";
  try {
    const { res, data: body } = await api<{
      ok?: boolean;
      error?: string;
      message?: string;
    }>("/api/v1/admin/restart", {
      method: "POST",
      body: JSON.stringify({
        mode: "soft",
        confirm: "restart",
      }),
    });
    if (!res.ok) {
      error.value = body?.error || `Restart failed (${res.status})`;
      return;
    }
    ok.value = body.message ||
      "Soft-reboot scheduled — reconnect in a few seconds.";
  } finally {
    restarting.value = false;
  }
}

function setTab(t: Tab): void {
  closeEditor();
  void router.replace({
    name: "settings",
    query: t === "game" ? {} : { tab: t },
  });
}

const siteSkins = computed(() => {
  const list = data.value?.site?.skins ?? ["default"];
  const cur = siteForm.value.skin;
  if (cur && !list.includes(cur)) return [...list, cur];
  return list;
});

const siteThemes = computed(() => {
  return data.value?.site?.themes ?? [];
});

function onThemeFileChange(ev: Event): void {
  const input = ev.target as HTMLInputElement;
  const f = input.files?.[0] ?? null;
  themeFile.value = f;
}

async function uploadThemeZip(): Promise<void> {
  if (!themeFile.value) {
    error.value = "Choose a .zip theme package first.";
    return;
  }
  uploadingTheme.value = true;
  error.value = "";
  ok.value = "";
  try {
    const fd = new FormData();
    fd.append("file", themeFile.value, themeFile.value.name);
    fd.append(
      "activate",
      themeActivateOnUpload.value ? "true" : "false",
    );
    const { res, data: body } = await api<{
      ok?: boolean;
      error?: string;
      installed?: boolean;
      activated?: boolean;
      siteLive?: boolean;
      theme?: {
        id: string;
        label: string;
        skinCss?: string;
        bannerHref?: string;
        title?: string;
      };
      themes?: SettingsPayload["site"] extends
        | { themes?: infer T }
        | undefined ? T
        : never;
    }>("/api/v1/admin/site/theme", {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      error.value = body?.error || `Upload failed (${res.status})`;
      return;
    }
    const name = body.theme?.label || body.theme?.id || "theme";
    ok.value = body.activated
      ? `Installed and activated “${name}”` +
        (body.siteLive ? " — live on /site/." : ".")
      : `Installed “${name}”. Activate it below or Save.`;
    themeFile.value = null;
    // Refresh settings so themes list + form update
    await load();
    if (body.theme && body.activated) {
      siteForm.value.skin = body.theme.id;
      if (body.theme.skinCss) {
        siteForm.value.skinCss = body.theme.skinCss;
      }
      if (body.theme.bannerHref) {
        siteForm.value.bannerImage = body.theme.bannerHref;
      }
      if (body.theme.title) {
        siteForm.value.title = body.theme.title;
      }
    }
  } finally {
    uploadingTheme.value = false;
  }
}

async function activateTheme(id: string): Promise<void> {
  if (!id) return;
  activatingTheme.value = id;
  error.value = "";
  ok.value = "";
  try {
    const { res, data: body } = await api<{
      ok?: boolean;
      error?: string;
      siteLive?: boolean;
      theme?: {
        id: string;
        label: string;
        skinCss?: string;
        bannerHref?: string;
        title?: string;
        plainBg?: boolean;
      };
    }>("/api/v1/admin/site/theme", {
      method: "POST",
      body: JSON.stringify({ activate: id }),
    });
    if (!res.ok) {
      error.value = body?.error || `Activate failed (${res.status})`;
      return;
    }
    const name = body.theme?.label || id;
    ok.value = body.siteLive
      ? `Theme “${name}” live on /site/ (hard-refresh).`
      : `Theme “${name}” written to config.`;
    await load();
    if (body.theme) {
      siteForm.value.skin = body.theme.id;
      siteForm.value.skinCss = body.theme.skinCss || "";
      siteForm.value.bannerImage = body.theme.bannerHref ||
        siteForm.value.bannerImage;
      if (body.theme.title) {
        siteForm.value.title = body.theme.title;
      }
      if (typeof body.theme.plainBg === "boolean") {
        siteForm.value.plainBg = body.theme.plainBg;
      }
    }
  } finally {
    activatingTheme.value = "";
  }
}

async function openFile(f: PluginFile): Promise<void> {
  editError.value = "";
  ok.value = "";
  editLoading.value = true;
  editing.value = f;
  editData.value = null;
  editMode.value = "form";
  editDirty.value = false;
  try {
    const q = encodeURIComponent(f.path);
    const { res, data: body } = await api<{
      text?: string;
      data?: unknown;
      error?: string;
      path?: string;
      plugin?: string;
      rel?: string;
    }>(`/api/v1/admin/plugins/file?path=${q}`);
    if (!res.ok) {
      editError.value = body?.error ||
        `Load failed (${res.status})`;
      return;
    }
    if (body.data !== undefined) {
      editData.value = body.data;
    } else if (body.text) {
      try {
        editData.value = JSON.parse(body.text);
      } catch {
        editData.value = body.text;
        editMode.value = "json";
      }
    } else {
      editData.value = {};
    }
    editDirty.value = false;
  } finally {
    editLoading.value = false;
  }
}

function onEditDirty(): void {
  editDirty.value = true;
}

function closeEditor(): void {
  if (
    editDirty.value &&
    !confirm("Discard unsaved changes to this file?")
  ) {
    return;
  }
  editing.value = null;
  editData.value = null;
  editError.value = "";
  editDirty.value = false;
  editMode.value = "form";
}

async function saveFile(): Promise<void> {
  if (!editing.value) return;
  editError.value = "";
  ok.value = "";

  // Ensure we have a serializable value
  let payload: unknown;
  try {
    payload = JSON.parse(JSON.stringify(editData.value));
  } catch (e: unknown) {
    editError.value = `Cannot save: ${
      e instanceof Error ? e.message : String(e)
    }`;
    return;
  }

  editSaving.value = true;
  try {
    const q = encodeURIComponent(editing.value.path);
    const { res, data: body } = await api<{
      ok?: boolean;
      error?: string;
      needsRestart?: boolean;
      bytes?: number;
    }>(`/api/v1/admin/plugins/file?path=${q}`, {
      method: "PUT",
      body: JSON.stringify({ data: payload }),
    });
    if (!res.ok) {
      editError.value = body?.error ||
        `Save failed (${res.status})`;
      return;
    }
    editDirty.value = false;
    needsRestart.value = body.needsRestart !== false;
    ok.value = needsRestart.value
      ? `Saved ${editing.value.rel}. Soft-restart to apply.`
      : `Saved ${editing.value.rel}.`;
    void load();
  } finally {
    editSaving.value = false;
  }
}

onMounted(() => {
  void load();
});

watch(
  () => route.query.tab,
  () => {
    ok.value = "";
    error.value = "";
    closeEditor();
  },
);
</script>

<template>
  <article id="main-settings">
    <header class="dash-header">
      <div>
        <p class="muted dash-kicker">
          Operations
        </p>
        <h1 class="page-title">
          Settings
        </h1>
        <p class="muted">
          Game config, soft-restart, and plugin data.
        </p>
      </div>
      <div class="dash-header-actions">
        <button
          type="button"
          class="secondary outline"
          :disabled="loading"
          @click="load"
        >
          Reload
        </button>
      </div>
    </header>

    <p
      v-if="error"
      class="error"
      role="alert"
    >
      {{ error }}
    </p>
    <p
      v-if="ok"
      class="ok-msg"
      role="status"
    >
      {{ ok }}
    </p>
    <p
      v-if="needsRestart"
      class="warn-banner"
    >
      Some changes need a soft-restart to fully apply.
      <button
        type="button"
        class="secondary outline"
        @click="setTab('restart')"
      >
        Restart…
      </button>
    </p>

    <p
      v-if="loading"
      class="muted"
    >
      Loading settings…
    </p>

    <template v-else-if="data">
      <!-- ── Game ─────────────────────────────────────────── -->
      <section
        v-if="tab === 'game'"
        class="settings-panel"
      >
        <h2 class="dash-h2">
          Game
        </h2>
        <p class="muted settings-help">
          Auto-saves when you leave a field.
        </p>
        <div class="settings-grid">
          <label>
            Name
            <input
              v-model="form.name"
              type="text"
              maxlength="200"
              autocomplete="off"
              @blur="onGameFieldBlur"
            >
          </label>
          <label>
            Version
            <input
              v-model="form.version"
              type="text"
              maxlength="40"
              autocomplete="off"
              @blur="onGameFieldBlur"
            >
          </label>
          <label class="settings-span-2">
            Description
            <textarea
              v-model="form.description"
              rows="3"
              @blur="onGameFieldBlur"
            />
          </label>
          <label>
            Player start (#dbref)
            <input
              v-model="form.playerStart"
              type="text"
              maxlength="32"
              autocomplete="off"
              @blur="onGameFieldBlur"
            >
          </label>
        </div>

        <h2 class="dash-h2">
          Web login splash
        </h2>
        <p class="muted settings-help">
          Markdown or HTML shown on <code>/play</code> before
          sign-in. Preview uses the live site skin and play
          styles. Telnet still uses
          <code>text/default_connect.txt</code>.
          HTML is sanitized. Center with
          <code>&lt;center&gt;</code> if you want — nothing is
          forced centered.
        </p>
        <div class="settings-login-grid">
          <label class="settings-login-edit">
            Markdown or HTML
            <textarea
              v-model="form.loginMarkdown"
              rows="12"
              class="mono"
              spellcheck="false"
              @blur="onGameFieldBlur"
            />
          </label>
          <div class="settings-login-preview">
            <p class="muted dash-kicker">
              Preview
              <span class="settings-login-preview__hint">
                — as on <code>/play</code> with current site skin
              </span>
            </p>
            <iframe
              class="settings-login-preview__frame"
              title="Web login splash preview"
              sandbox="allow-same-origin"
              :srcdoc="loginPreviewSrcdoc"
            />
          </div>
        </div>

        <h2 class="dash-h2">
          Layout softcode
        </h2>
        <p class="muted settings-help">
          TinyMUX-style header / divider / footer templates
          (same as <code>game.layout</code> in config.json).
        </p>
        <div class="settings-grid">
          <label class="settings-span-2">
            Header
            <textarea
              v-model="form.header"
              rows="2"
              class="mono"
              @blur="onGameFieldBlur"
            />
          </label>
          <label class="settings-span-2">
            Divider
            <textarea
              v-model="form.divider"
              rows="2"
              class="mono"
              @blur="onGameFieldBlur"
            />
          </label>
          <label class="settings-span-2">
            Footer
            <textarea
              v-model="form.footer"
              rows="2"
              class="mono"
              @blur="onGameFieldBlur"
            />
          </label>
        </div>

        <h2 class="dash-h2">
          Ports
          <span class="muted">(read-only)</span>
        </h2>
        <p class="muted settings-help">
          Telnet {{ data.server.telnet ?? "—" }}
          · WS {{ data.server.wsPort ?? "—" }}
          · HTTP {{ data.server.apiPort ?? "—" }}
        </p>

        <div class="settings-actions">
          <button
            type="button"
            :disabled="saving"
            @click="save"
          >
            {{ saving ? "Saving…" : "Save changes" }}
          </button>
        </div>
      </section>

      <!-- ── Public site FE ───────────────────────────────── -->
      <section
        v-else-if="tab === 'site'"
        class="settings-panel"
      >
        <h2 class="dash-h2">
          Public site
        </h2>
        <p
          v-if="data.site && !data.site.available"
          class="warn-banner"
        >
          <code>@ursamu/site</code> does not appear loaded.
          Values still write to
          <code>plugins.site</code> in config.json.
        </p>
        <p class="muted settings-help">
          Player-facing front-end at
          <a
            :href="data.site?.previewUrl || '/site/'"
            target="_blank"
            rel="noopener"
          >/site/</a>.
          Upload a Court-style theme
          <code>.zip</code>
          (theme.json + site.css + assets), or pick a
          built-in / installed skin below.
        </p>

        <h2 class="dash-h2">
          Install theme zip
        </h2>
        <p class="muted settings-help">
          Package layout:
          <code>theme.json</code>,
          <code>site.css</code>, optional
          <code>imgs/</code> and
          <code>fonts/</code>.
          Pack with
          <code>deno task pack-theme</code>
          in
          <code>@ursamu/site</code>.
        </p>
        <div class="theme-upload-row">
          <label class="theme-file-label">
            Theme package
            <input
              type="file"
              accept=".zip,application/zip"
              :disabled="uploadingTheme"
              @change="onThemeFileChange"
            >
          </label>
          <label class="chk-row">
            <input
              v-model="themeActivateOnUpload"
              type="checkbox"
              class="chk"
              :disabled="uploadingTheme"
            >
            <span>Activate after install</span>
          </label>
          <button
            type="button"
            :disabled="uploadingTheme || !themeFile"
            @click="uploadThemeZip"
          >
            {{
              uploadingTheme
                ? "Installing…"
                : "Upload & install"
            }}
          </button>
        </div>
        <p
          v-if="themeFile"
          class="muted settings-help"
        >
          Selected:
          <code>{{ themeFile.name }}</code>
          ({{ Math.round(themeFile.size / 1024) }} KB)
        </p>

        <template v-if="siteThemes.length">
          <h2 class="dash-h2">
            Available themes
          </h2>
          <ul
            class="theme-list"
            aria-label="Installed and built-in themes"
          >
            <li
              v-for="t in siteThemes"
              :key="t.id"
              class="theme-list-row"
              :class="{
                'is-active':
                  t.active || t.id === siteForm.skin,
              }"
            >
              <div class="theme-list-meta">
                <strong>{{ t.label || t.id }}</strong>
                <span class="muted">
                  <code>{{ t.id }}</code>
                  · {{ t.source || "theme" }}
                  <template v-if="t.version">
                    · v{{ t.version }}
                  </template>
                </span>
                <span
                  v-if="t.description"
                  class="muted theme-desc"
                >{{ t.description }}</span>
              </div>
              <button
                type="button"
                class="secondary outline"
                :disabled="
                  activatingTheme === t.id ||
                    t.id === siteForm.skin
                "
                @click="activateTheme(t.id)"
              >
                {{
                  t.id === siteForm.skin
                    ? "Active"
                    : activatingTheme === t.id
                    ? "…"
                    : "Activate"
                }}
              </button>
            </li>
          </ul>
        </template>

        <p class="muted settings-help">
          Changes auto-save when you leave a field
          (or change skin / plain background). No reboot
          needed for public site settings.
        </p>
        <h2 class="dash-h2">
          Skin & branding
        </h2>
        <div class="settings-grid">
          <label>
            Skin
            <select
              v-model="siteForm.skin"
              @change="onSiteFieldBlur"
            >
              <option
                v-for="s in siteSkins"
                :key="s"
                :value="s"
              >
                {{ s }}
              </option>
            </select>
          </label>
          <label>
            Site title
            <input
              v-model="siteForm.title"
              type="text"
              maxlength="200"
              autocomplete="off"
              placeholder="Leave blank to hide hero title"
              @blur="onSiteFieldBlur"
            >
            <span class="field-hint muted">
              Clear this field to hide the large hero
              heading on /site/ (auto-saves on blur).
            </span>
          </label>
          <label class="settings-span-2">
            Custom skin CSS URL
            <input
              v-model="siteForm.skinCss"
              type="text"
              maxlength="500"
              class="mono"
              autocomplete="off"
              placeholder="/site/theme/my.css (optional)"
              @blur="onSiteFieldBlur"
            >
          </label>
          <label class="settings-span-2">
            Banner image URL
            <input
              v-model="siteForm.bannerImage"
              type="text"
              maxlength="500"
              class="mono"
              autocomplete="off"
              placeholder="/site/theme/installed/court/imgs/header.png"
              @blur="onSiteFieldBlur"
            >
          </label>
          <label>
            Connect / telnet line
            <input
              v-model="siteForm.telnet"
              type="text"
              maxlength="120"
              autocomplete="off"
              placeholder="host:4201"
              @blur="onSiteFieldBlur"
            >
          </label>
          <label class="chk-row settings-span-2">
            <input
              v-model="siteForm.plainBg"
              type="checkbox"
              class="chk"
              @change="onSiteFieldBlur"
            >
            <span>
              Hide top background art
              <span class="muted">
                (off = show theme background)
              </span>
            </span>
          </label>
        </div>

        <h2 class="dash-h2">
          Top nav links
        </h2>
        <p class="muted settings-help">
          Order is top-to-bottom on the public site.
          Drag rows or use ↑ ↓. Auto-saves to
          <code>plugins.site.nav</code>.
        </p>
        <ul
          class="site-nav-editor"
          aria-label="Public site nav links"
        >
          <li
            v-for="(row, i) in siteNav"
            :key="'nav-' + i"
            class="site-nav-row"
            :class="{
              'is-dragging': dragNavFrom === i,
              'is-drag-over': dragNavOver === i && dragNavFrom !== i,
            }"
            draggable="true"
            @dragstart="onNavDragStart(i, $event)"
            @dragover="onNavDragOver(i, $event)"
            @drop="onNavDrop(i, $event)"
            @dragend="onNavDragEnd"
          >
            <span
              class="site-nav-grip"
              title="Drag to reorder"
              aria-hidden="true"
            >⋮⋮</span>
            <span class="site-nav-ord muted">{{ i + 1 }}</span>
            <input
              v-model="row.label"
              type="text"
              maxlength="80"
              placeholder="Label"
              aria-label="Link label"
              draggable="false"
              @mousedown.stop
              @blur="onSiteFieldBlur"
            >
            <input
              v-model="row.href"
              type="text"
              maxlength="500"
              class="mono"
              placeholder="/site/…"
              aria-label="Link href"
              draggable="false"
              @mousedown.stop
              @blur="onSiteFieldBlur"
            >
            <div class="site-nav-actions">
              <button
                type="button"
                class="secondary outline"
                :disabled="i === 0"
                title="Move up"
                @click="moveNav(i, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                class="secondary outline"
                :disabled="i >= siteNav.length - 1"
                title="Move down"
                @click="moveNav(i, 1)"
              >
                ↓
              </button>
              <button
                type="button"
                class="secondary outline"
                title="Remove"
                @click="removeNav(i)"
              >
                ×
              </button>
            </div>
          </li>
        </ul>
        <p
          v-if="!siteNav.length"
          class="muted settings-help"
        >
          No config nav links yet. Add one, or adopt a plugin
          link below.
        </p>
        <div class="settings-actions">
          <button
            type="button"
            class="secondary outline"
            @click="addNav"
          >
            Add link
          </button>
        </div>

        <template v-if="pluginNavHint.length">
          <h3 class="settings-subh">
            From plugins
          </h3>
          <p class="muted settings-help">
            Registered at runtime via
            <code>registerSiteNav</code>. Adopt into config
            to pin order and label.
          </p>
          <ul class="settings-pill-list">
            <li
              v-for="(p, i) in pluginNavHint"
              :key="'pn-' + i"
            >
              <code>{{ p.label }}</code>
              <span class="muted">{{ p.href }}</span>
              <button
                type="button"
                class="secondary outline"
                @click="adoptPluginNav(p)"
              >
                Add to list
              </button>
            </li>
          </ul>
        </template>

        <div class="settings-actions">
          <button
            type="button"
            :disabled="savingSite"
            @click="saveSite"
          >
            {{
              savingSite ? "Saving…" : "Save now"
            }}
          </button>
          <a
            class="secondary outline"
            :href="data.site?.previewUrl || '/site/'"
            target="_blank"
            rel="noopener"
          >
            Open /site/
          </a>
        </div>
      </section>

      <!-- ── Restart ──────────────────────────────────────── -->
      <section
        v-else-if="tab === 'restart'"
        class="settings-panel"
      >
        <h2 class="dash-h2">
          Soft-restart
        </h2>
        <p class="muted settings-help">
          Schedules exit code <strong>75</strong> so the daemon
          loop restarts main while keeping telnet/WS sessions
          where possible (same as in-game <code>@reboot</code>
          without codebase update).
        </p>
        <label>
          Type <code>restart</code> to confirm
          <input
            v-model="restartConfirm"
            type="text"
            autocomplete="off"
            placeholder="restart"
          >
        </label>
        <div class="settings-actions">
          <button
            type="button"
            class="contrast"
            :disabled="restarting || restartConfirm !== 'restart'"
            @click="doRestart"
          >
            {{ restarting ? "Restarting…" : "Soft-restart now" }}
          </button>
        </div>
      </section>

      <!-- ── Plugins ──────────────────────────────────────── -->
      <section
        v-else-if="tab === 'plugins'"
        class="settings-panel"
      >
        <!-- Editor mode -->
        <template v-if="editing">
          <div class="json-edit-head">
            <button
              type="button"
              class="secondary outline"
              @click="closeEditor"
            >
              ← Back to list
            </button>
            <div class="json-edit-meta">
              <h2 class="dash-h2 json-edit-title">
                {{ editing.plugin }}
                /
                {{ editing.rel }}
              </h2>
              <p class="muted settings-help">
                <code>{{ editing.path }}</code>
                ·
                {{ editing.source === "config-plugins"
                  ? "override"
                  : "resources" }}
                <span v-if="editDirty"> · unsaved</span>
              </p>
            </div>
          </div>

          <p
            v-if="editError"
            class="error"
            role="alert"
          >
            {{ editError }}
          </p>

          <p
            v-if="editLoading"
            class="muted"
          >
            Loading file…
          </p>
          <template v-else>
            <p class="muted settings-help">
              <strong>Form</strong> mode uses labeled fields for
              staff.
              Switch to <strong>JSON</strong> for raw editing.
            </p>
            <JsonFormEditor
              v-model="editData"
              v-model:mode="editMode"
              @dirty="onEditDirty"
            />
            <div class="settings-actions">
              <button
                type="button"
                :disabled="editSaving || !editDirty"
                @click="saveFile"
              >
                {{ editSaving ? "Saving…" : "Save file" }}
              </button>
              <button
                type="button"
                class="secondary outline"
                :disabled="editSaving"
                @click="closeEditor"
              >
                Cancel
              </button>
            </div>
          </template>
        </template>

        <!-- List mode -->
        <template v-else>
          <h2 class="dash-h2">
            Plugins
          </h2>
          <p
            v-if="data.plugins.convention"
            class="muted settings-help"
          >
            {{ data.plugins.convention }}
            Click a JSON file to edit it.
          </p>

          <h3 class="settings-subh">
            Loaded
          </h3>
          <div class="table-wrap">
            <table class="dash-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Version</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="p in data.plugins.loaded"
                  :key="p.name"
                >
                  <td><code>{{ p.name }}</code></td>
                  <td class="muted">
                    {{ p.version }}
                  </td>
                  <td class="muted">
                    {{ p.description || "—" }}
                  </td>
                </tr>
                <tr v-if="!data.plugins.loaded.length">
                  <td
                    colspan="3"
                    class="muted"
                  >
                    No plugins registered.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 class="settings-subh">
            Enabled in config
          </h3>
          <ul class="settings-pill-list">
            <li
              v-for="name in data.server.plugins"
              :key="name"
            >
              <code>{{ name }}</code>
            </li>
            <li
              v-if="!data.server.plugins.length"
              class="muted"
            >
              (none listed)
            </li>
          </ul>

          <h3 class="settings-subh">
            JSON files
            <span
              v-if="data.plugins.files.length"
              class="muted"
            >
              ({{ data.plugins.files.length }})
            </span>
          </h3>
          <div class="table-wrap">
            <table class="dash-table">
              <thead>
                <tr>
                  <th>Plugin</th>
                  <th>File</th>
                  <th>Source</th>
                  <th>Path</th>
                  <th>Size</th>
                  <th>
                    <span class="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="f in data.plugins.files"
                  :key="f.path + f.rel"
                  class="file-row"
                  tabindex="0"
                  @click="openFile(f)"
                  @keydown.enter.prevent="openFile(f)"
                >
                  <td><code>{{ f.plugin }}</code></td>
                  <td><code>{{ f.rel }}</code></td>
                  <td class="muted">
                    {{ f.source === "config-plugins"
                      ? "override"
                      : "resources" }}
                  </td>
                  <td class="muted">
                    <code>{{ f.path }}</code>
                  </td>
                  <td class="muted">
                    {{ f.bytes }} B
                  </td>
                  <td class="row-open">
                    <button
                      type="button"
                      class="secondary outline"
                      @click.stop="openFile(f)"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
                <tr v-if="!data.plugins.files.length">
                  <td
                    colspan="6"
                    class="muted"
                  >
                    No JSON files found under plugin
                    <code>resources/</code> or
                    <code>config/plugins/</code>.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 class="settings-subh">
            Inline config keys
          </h3>
          <ul class="settings-pill-list">
            <li
              v-for="k in data.plugins.inline"
              :key="k"
            >
              <code>plugins.{{ k }}</code>
            </li>
            <li
              v-if="!data.plugins.inline.length"
              class="muted"
            >
              (none)
            </li>
          </ul>
        </template>
      </section>
    </template>
  </article>
</template>

<style scoped>
#main-settings {
  width: 100%;
  max-width: none;
}

.settings-panel {
  width: 100%;
  max-width: none;
}

.settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem 1.25rem;
  margin-bottom: 1.75rem;
  width: 100%;
}

.settings-span-2 {
  grid-column: 1 / -1;
}

.settings-login-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem 1.25rem;
  margin-bottom: 1.75rem;
  width: 100%;
}

.settings-login-edit,
.settings-login-preview {
  min-width: 0;
}

.settings-login-edit textarea {
  width: 100%;
  min-height: 14rem;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  box-sizing: border-box;
}

.settings-login-preview {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-code);
  padding: 0.5rem 0.65rem 0.65rem;
  display: flex;
  flex-direction: column;
  min-height: 14rem;
  max-height: 28rem;
  overflow: hidden;
}

.settings-login-preview__hint {
  font-weight: 400;
  opacity: 0.85;
}

.settings-login-preview__frame {
  flex: 1 1 auto;
  width: 100%;
  min-height: 12rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: #020201;
}

@media (max-width: 900px) {
  .settings-login-grid {
    grid-template-columns: 1fr;
  }
}

.settings-grid label,
.settings-panel > label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: 100%;
  max-width: none;
  font-size: 0.8125rem;
  font-weight: 550;
  color: var(--text-secondary);
  margin: 0;
}

.settings-grid input,
.settings-grid textarea,
.settings-panel > label input,
.settings-panel > label textarea {
  width: 100% !important;
  max-width: none !important;
  font-weight: 400;
  box-sizing: border-box;
}

.settings-help {
  margin: 0 0 1rem;
  font-size: 0.8125rem;
  line-height: 1.5;
  max-width: none;
}

.settings-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.25rem;
}

.settings-subh {
  margin: 1.75rem 0 0.65rem;
  font-size: 0.875rem;
  font-weight: 600;
}

.settings-pill-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  list-style: none;
  margin: 0 0 1rem;
  padding: 0;
  width: 100%;
}

.settings-pill-list li code {
  display: inline-block;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-surface);
  font-size: 0.75rem;
}

#main-settings .table-wrap {
  width: 100%;
  max-width: none;
}

#main-settings .dash-table {
  width: 100%;
}

.file-row {
  cursor: pointer;
}

.file-row:hover {
  background: var(--bg-surface-2);
}

.file-row:focus,
.file-row:focus-visible,
.file-row:active {
  outline: none !important;
  box-shadow: none !important;
  background: var(--bg-surface-2);
}

.mono {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 0.8125rem;
}

.json-edit-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 1rem 1.25rem;
  margin-bottom: 1rem;
}

.json-edit-meta {
  flex: 1 1 auto;
  min-width: 0;
}

.json-edit-title {
  margin: 0 0 0.25rem;
}

.ok-msg {
  color: var(--success);
  font-size: 0.875rem;
}

.warn-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  box-sizing: border-box;
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--warning);
  border-radius: var(--radius-md);
  background: rgba(230, 184, 77, 0.08);
  color: var(--text);
  font-size: 0.8125rem;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

@media (max-width: 700px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
}
</style>
