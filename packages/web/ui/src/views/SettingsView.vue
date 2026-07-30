<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "@/api/client";
import JsonFormEditor from "@/components/JsonFormEditor.vue";

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
  layout: {
    header: string;
    divider: string;
    footer: string;
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

type Tab = "game" | "restart" | "plugins";

const route = useRoute();
const router = useRouter();

const tab = computed<Tab>(() => {
  const t = String(route.query.tab ?? "game");
  if (t === "restart" || t === "plugins") return t;
  return "game";
});

const loading = ref(true);
const saving = ref(false);
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
});

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
  };
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

async function save(): Promise<void> {
  saving.value = true;
  error.value = "";
  ok.value = "";
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
      }),
    });
    if (!res.ok) {
      error.value = body?.error || `Save failed (${res.status})`;
      return;
    }
    needsRestart.value = body.needsRestart === true;
    ok.value = needsRestart.value
      ? "Saved. Soft-restart recommended for some keys."
      : "Saved.";
    if (body.settings) {
      data.value = normalizePayload(
        body.settings as SettingsPayload & { error?: string },
      );
      applyForm(data.value);
    }
  } finally {
    saving.value = false;
  }
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
        <div class="settings-grid">
          <label>
            Name
            <input
              v-model="form.name"
              type="text"
              maxlength="200"
              autocomplete="off"
            >
          </label>
          <label>
            Version
            <input
              v-model="form.version"
              type="text"
              maxlength="40"
              autocomplete="off"
            >
          </label>
          <label class="settings-span-2">
            Description
            <textarea
              v-model="form.description"
              rows="3"
            />
          </label>
          <label>
            Player start (#dbref)
            <input
              v-model="form.playerStart"
              type="text"
              maxlength="32"
              autocomplete="off"
            >
          </label>
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
            />
          </label>
          <label class="settings-span-2">
            Divider
            <textarea
              v-model="form.divider"
              rows="2"
              class="mono"
            />
          </label>
          <label class="settings-span-2">
            Footer
            <textarea
              v-model="form.footer"
              rows="2"
              class="mono"
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
        v-else
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
