<script setup lang="ts">
/**
 * Staff channels console — list, edit, who, history.
 */
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "@/api/client";
import type {
  ChannelRow,
  ChanHistoryLine,
} from "@/api/types";
import { useFormSync } from "@/composables/useFormSync";
import { formatMailWhen } from "@/utils/mail";

const props = defineProps<{ id?: string }>();
const route = useRoute();
const router = useRouter();

const rows = ref<ChannelRow[]>([]);
const selected = ref<ChannelRow | null>(null);
const who = ref<{ id: string; name: string }[]>([]);
const history = ref<ChanHistoryLine[]>([]);
const loadError = ref("");
const saveError = ref("");
const saveOk = ref("");
const busy = ref(false);
const loading = ref(false);
const creating = ref(false);
const q = ref("");
const detailTab = ref<"edit" | "who" | "history">("edit");

const {
  form,
  dirty,
  markSaved,
  resetFrom,
  confirmLeave,
} = useFormSync(selected, (c) => ({
  name: c.name || "",
  header: c.header || "",
  alias: c.alias || "",
  lock: c.lock || "",
  owner: c.owner || "",
  hidden: !!c.hidden,
  masking: !!c.masking,
  logHistory: !!c.logHistory,
  announce: !!c.announce,
  autoJoin: !!c.autoJoin,
  historyLimit: c.historyLimit ?? 500,
}));

const newForm = ref({
  name: "",
  alias: "",
  lock: "connected",
  header: "",
  announce: false,
  autoJoin: false,
  logHistory: false,
});

const filtered = computed(() => {
  const n = q.value.trim().toLowerCase();
  let list = [...rows.value];
  if (n) {
    list = list.filter((c) =>
      `${c.name} ${c.alias || ""} ${c.lock || ""} ${c.owner || ""}`
        .toLowerCase()
        .includes(n)
    );
  }
  return list;
});

async function loadList(): Promise<void> {
  loading.value = true;
  loadError.value = "";
  try {
    // Core mush returns a bare array; plugin returns { items }.
    const { res, data } = await api<
      ChannelRow[] | {
        items?: ChannelRow[];
        channels?: ChannelRow[];
        error?: string;
      }
    >("/api/v1/channels");
    if (!res.ok) {
      const err = data && !Array.isArray(data)
        ? data.error
        : undefined;
      loadError.value = err || `Load failed (${res.status})`;
      rows.value = [];
      return;
    }
    if (Array.isArray(data)) {
      rows.value = data;
    } else {
      rows.value = data?.items ?? data?.channels ?? [];
    }
  } finally {
    loading.value = false;
  }
}

async function openChan(idOrName: string): Promise<void> {
  if (dirty.value && !confirmLeave("Discard unsaved changes?")) {
    return;
  }
  creating.value = false;
  loadError.value = "";
  saveOk.value = "";
  const key = encodeURIComponent(idOrName);
  const { res, data } = await api<ChannelRow & { error?: string }>(
    `/api/v1/channels/${key}`,
  );
  if (!res.ok) {
    loadError.value = data?.error || `Open failed (${res.status})`;
    return;
  }
  selected.value = data as ChannelRow;
  detailTab.value = "edit";
  markSaved();
  if (props.id !== data.id && props.id !== data.name) {
    await router.replace({
      name: "channels-detail",
      params: { id: data.id },
    });
  }
  void loadWho();
  void loadHistory();
}

async function loadWho(): Promise<void> {
  if (!selected.value) return;
  const key = encodeURIComponent(selected.value.id);
  const { res, data } = await api<{
    items?: { id: string; name: string }[];
  }>(`/api/v1/channels/${key}/who`);
  who.value = res.ok ? (data?.items ?? []) : [];
}

async function loadHistory(): Promise<void> {
  if (!selected.value) return;
  const key = encodeURIComponent(selected.value.id);
  // Prefer /messages (plugin) — core GET …/history is stricter.
  const { res, data } = await api<
    ChanHistoryLine[] | { items?: ChanHistoryLine[] }
  >(`/api/v1/channels/${key}/messages?limit=100`);
  if (!res.ok) {
    history.value = [];
    return;
  }
  history.value = Array.isArray(data)
    ? data
    : (data?.items ?? []);
}

function clearSelection(): void {
  if (dirty.value && !confirmLeave("Discard unsaved changes?")) {
    return;
  }
  selected.value = null;
  creating.value = false;
  void router.replace({ name: "channels" });
}

function startCreate(): void {
  if (dirty.value && !confirmLeave("Discard unsaved changes?")) {
    return;
  }
  selected.value = null;
  creating.value = true;
  newForm.value = {
    name: "",
    alias: "",
    lock: "connected",
    header: "",
    announce: false,
    autoJoin: false,
    logHistory: false,
  };
}

async function createChan(): Promise<void> {
  saveError.value = "";
  const name = newForm.value.name.trim();
  if (!name) {
    saveError.value = "Name is required.";
    return;
  }
  busy.value = true;
  try {
    const body = {
      name,
      alias: newForm.value.alias.trim() || undefined,
      lock: newForm.value.lock.trim() || undefined,
      header: newForm.value.header.trim() || undefined,
      announce: newForm.value.announce,
      autoJoin: newForm.value.autoJoin,
      logHistory: newForm.value.logHistory,
    };
    const { res, data } = await api<ChannelRow & { error?: string }>(
      "/api/v1/channels",
      { method: "POST", body: JSON.stringify(body) },
    );
    if (!res.ok) {
      saveError.value = data?.error ||
        `Create failed (${res.status})`;
      return;
    }
    creating.value = false;
    await loadList();
    await openChan(data.id);
    saveOk.value = "Channel created.";
  } finally {
    busy.value = false;
  }
}

async function save(): Promise<void> {
  if (!selected.value || !form.value) return;
  saveError.value = "";
  busy.value = true;
  try {
    const key = encodeURIComponent(selected.value.id);
    const { res, data } = await api<ChannelRow & { error?: string }>(
      `/api/v1/channels/${key}`,
      {
        method: "PATCH",
        body: JSON.stringify({ ...form.value }),
      },
    );
    if (!res.ok) {
      saveError.value = data?.error ||
        `Save failed (${res.status})`;
      return;
    }
    selected.value = data as ChannelRow;
    markSaved();
    saveOk.value = "Saved.";
    await loadList();
  } finally {
    busy.value = false;
  }
}

async function destroyChan(): Promise<void> {
  if (!selected.value) return;
  if (
    !confirm(
      `Destroy channel “${selected.value.name}”? This cannot be undone.`,
    )
  ) {
    return;
  }
  busy.value = true;
  try {
    const key = encodeURIComponent(selected.value.id);
    const { res, data } = await api<{ error?: string }>(
      `/api/v1/channels/${key}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      saveError.value = data?.error || "Delete failed";
      return;
    }
    selected.value = null;
    await loadList();
    void router.replace({ name: "channels" });
  } finally {
    busy.value = false;
  }
}

function flagsOf(c: ChannelRow): string {
  return [
    c.hidden ? "H" : "-",
    c.masking ? "M" : "-",
    c.logHistory ? "L" : "-",
    c.announce ? "A" : "-",
    c.autoJoin ? "J" : "-",
  ].join("");
}

watch(
  () => props.id,
  (id) => {
    if (id) void openChan(id);
    else if (!creating.value) selected.value = null;
  },
  { immediate: true },
);

onMounted(() => {
  void loadList();
});

const showList = computed(
  () => !selected.value && !creating.value,
);
</script>

<template>
  <article
    v-if="showList"
    id="main-channels"
    class="dash-browser"
  >
    <header class="dash-header">
      <div>
        <h1 class="page-title">
          Channels
        </h1>
        <p class="muted lede">
          {{ rows.length }} channel{{
            rows.length === 1 ? "" : "s"
          }}
          · locks, who, history, create
        </p>
      </div>
      <div class="dash-header-actions">
        <button
          type="button"
          @click="startCreate"
        >
          New channel
        </button>
      </div>
    </header>

    <section
      class="pages-toolbar"
      aria-label="Search channels"
    >
      <label class="pages-search-label">
        <span class="sr-only">Search</span>
        <input
          v-model="q"
          type="search"
          placeholder="Search name, alias, lock…"
          autocomplete="off"
        >
      </label>
      <button
        type="button"
        class="secondary outline"
        :disabled="loading"
        @click="loadList"
      >
        Refresh
      </button>
    </section>

    <p
      v-if="loadError"
      class="error"
      role="alert"
    >
      {{ loadError }}
    </p>

    <div class="table-wrap">
      <table class="dash-table">
        <thead>
          <tr>
            <th scope="col">
              Name
            </th>
            <th scope="col">
              Alias
            </th>
            <th scope="col">
              Flags
            </th>
            <th scope="col">
              Lock
            </th>
            <th scope="col">
              Users
            </th>
            <th scope="col">
              <span class="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td
              colspan="6"
              class="muted"
            >
              Loading…
            </td>
          </tr>
          <tr v-else-if="!filtered.length">
            <td
              colspan="6"
              class="muted"
            >
              No channels match.
            </td>
          </tr>
          <tr
            v-for="c in filtered"
            :key="c.id"
            tabindex="0"
            @click="openChan(c.id)"
            @keydown.enter.prevent="openChan(c.id)"
          >
            <td>{{ c.name }}</td>
            <td class="muted">
              {{ c.alias || "—" }}
            </td>
            <td><code>{{ flagsOf(c) }}</code></td>
            <td class="muted mono-sm">
              {{ c.lock || "—" }}
            </td>
            <td>{{ c.users ?? 0 }}</td>
            <td class="row-open">
              <button
                type="button"
                class="secondary outline"
                @click.stop="openChan(c.id)"
              >
                Open
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="muted flags-legend">
      Flags: H hidden · M masking · L log · A announce · J auto-join
    </p>
  </article>

  <!-- Create -->
  <article
    v-else-if="creating"
    id="main-channels-new"
    class="dash-browser"
  >
    <header class="editor-header">
      <div>
        <p class="editor-path-line">
          <button
            type="button"
            class="back-link"
            @click="clearSelection"
          >
            ← Channels
          </button>
        </p>
        <h1 class="page-title page-title-tight">
          New channel
        </h1>
      </div>
      <div class="editor-actions">
        <button
          type="button"
          class="secondary outline"
          :disabled="busy"
          @click="clearSelection"
        >
          Cancel
        </button>
        <button
          type="button"
          :disabled="busy"
          @click="createChan"
        >
          Create
        </button>
      </div>
    </header>
    <p
      v-if="saveError"
      class="error"
      role="alert"
    >
      {{ saveError }}
    </p>
    <form @submit.prevent="createChan">
      <label>
        Name
        <input
          v-model="newForm.name"
          required
          maxlength="32"
        >
      </label>
      <div class="db-edit-grid">
        <label>
          Alias
          <input v-model="newForm.alias">
        </label>
        <label>
          Lock
          <input v-model="newForm.lock">
        </label>
      </div>
      <label>
        Header
        <input
          v-model="newForm.header"
          placeholder="[NAME]"
        >
      </label>
      <label class="check-row">
        <input
          v-model="newForm.announce"
          type="checkbox"
        >
        Announce join/leave
      </label>
      <label class="check-row">
        <input
          v-model="newForm.autoJoin"
          type="checkbox"
        >
        Auto-join on login
      </label>
      <label class="check-row">
        <input
          v-model="newForm.logHistory"
          type="checkbox"
        >
        Log history
      </label>
    </form>
  </article>

  <!-- Detail -->
  <article
    v-else-if="selected && form"
    id="main-channels-detail"
    class="dash-browser"
  >
    <header class="editor-header">
      <div>
        <p class="editor-path-line">
          <button
            type="button"
            class="back-link"
            @click="clearSelection"
          >
            ← Channels
          </button>
          <code>{{ selected.id }}</code>
          <span
            v-if="dirty"
            class="dirty-dot"
            title="Unsaved"
          >●</span>
          <small
            v-if="saveOk"
            class="muted"
          >{{ saveOk }}</small>
        </p>
        <h1 class="page-title page-title-tight">
          {{ form.name || selected.name }}
        </h1>
        <p class="muted jobs-detail-meta">
          {{ selected.users ?? 0 }} online ·
          flags <code>{{ flagsOf(selected) }}</code>
        </p>
      </div>
      <div class="editor-actions">
        <button
          type="button"
          class="secondary outline"
          :disabled="!dirty || busy"
          @click="selected && resetFrom(selected)"
        >
          Discard
        </button>
        <button
          type="button"
          :disabled="!dirty || busy"
          @click="save"
        >
          Save
        </button>
        <button
          type="button"
          class="secondary outline"
          :disabled="busy"
          @click="destroyChan"
        >
          Destroy
        </button>
      </div>
    </header>

    <p
      class="filter-chips"
      role="tablist"
    >
      <button
        type="button"
        class="chip"
        :class="{ active: detailTab === 'edit' }"
        @click="detailTab = 'edit'"
      >
        Settings
      </button>
      <button
        type="button"
        class="chip"
        :class="{ active: detailTab === 'who' }"
        @click="detailTab = 'who'; loadWho()"
      >
        Who ({{ who.length }})
      </button>
      <button
        type="button"
        class="chip"
        :class="{ active: detailTab === 'history' }"
        @click="detailTab = 'history'; loadHistory()"
      >
        History
      </button>
    </p>

    <p
      v-if="loadError || saveError"
      class="error"
      role="alert"
    >
      {{ loadError || saveError }}
    </p>

    <form
      v-if="detailTab === 'edit'"
      @submit.prevent="save"
    >
      <label>
        Name
        <input v-model="form.name">
      </label>
      <div class="db-edit-grid">
        <label>
          Alias
          <input v-model="form.alias">
        </label>
        <label>
          Owner
          <input v-model="form.owner">
        </label>
      </div>
      <label>
        Header
        <input v-model="form.header">
      </label>
      <label>
        Lock
        <input
          v-model="form.lock"
          placeholder="connected admin+"
        >
      </label>
      <label>
        History limit
        <input
          v-model.number="form.historyLimit"
          type="number"
          min="1"
          max="5000"
        >
      </label>
      <label class="check-row">
        <input
          v-model="form.hidden"
          type="checkbox"
        >
        Hidden
      </label>
      <label class="check-row">
        <input
          v-model="form.masking"
          type="checkbox"
        >
        Masking
      </label>
      <label class="check-row">
        <input
          v-model="form.logHistory"
          type="checkbox"
        >
        Log history
      </label>
      <label class="check-row">
        <input
          v-model="form.announce"
          type="checkbox"
        >
        Announce join/leave
      </label>
      <label class="check-row">
        <input
          v-model="form.autoJoin"
          type="checkbox"
        >
        Auto-join on login
      </label>
    </form>

    <div
      v-else-if="detailTab === 'who'"
      class="table-wrap"
    >
      <table class="dash-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Id</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!who.length">
            <td
              colspan="2"
              class="muted"
            >
              Nobody on this channel right now.
            </td>
          </tr>
          <tr
            v-for="p in who"
            :key="p.id"
          >
            <td>{{ p.name }}</td>
            <td class="muted">
              #{{ p.id }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-else
      class="table-wrap"
    >
      <table class="dash-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!history.length">
            <td
              colspan="3"
              class="muted"
            >
              No history (enable Log history to capture).
            </td>
          </tr>
          <tr
            v-for="h in history"
            :key="h.id"
          >
            <td class="muted">
              {{ formatMailWhen(h.timestamp) }}
            </td>
            <td>{{ h.playerName }}</td>
            <td>{{ h.message }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </article>
</template>

<style scoped>
.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0 0 0.85rem;
}
.chip {
  margin: 0;
  padding: 0.35rem 0.75rem;
  min-height: 2rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.chip.active {
  background: var(--bg-surface-2);
  color: var(--text);
}
.check-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.5rem 0;
}
.flags-legend {
  margin-top: 0.75rem;
  font-size: 0.8125rem;
}
.mono-sm {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.8125rem;
}
</style>
