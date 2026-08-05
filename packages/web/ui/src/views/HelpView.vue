<script setup lang="ts">
/**
 * Staff help — same browser chrome as Wiki (dash-header,
 * pages-toolbar, dash-table, editor-header, WikiBodyField).
 */
import { computed, onMounted, ref, watch } from "vue";
import {
  onBeforeRouteLeave,
  useRoute,
  useRouter,
} from "vue-router";
import { api } from "@/api/client";
import type { HelpEntry, HelpIndex } from "@/api/types";
import WikiBodyField from "@/components/WikiBodyField.vue";
import { renderWikiMarkdown } from "@/utils/wikiMarkdown";

const props = defineProps<{ topic?: string }>();
const route = useRoute();
const router = useRouter();

const topics = ref<HelpEntry[]>([]);
const sections = ref<string[]>([]);
const selected = ref<HelpEntry | null>(null);
const q = ref("");
const loadError = ref("");
const saveError = ref("");
const status = ref("");
const busy = ref(false);
const loading = ref(false);
const loadingDetail = ref(false);
const editing = ref(false);
const creating = ref(false);
const newName = ref("");

const formContent = ref("");
const formSection = ref("general");
const formTags = ref("");
const loadedSnap = ref("");

const sourceFilter = computed(() => {
  const s = route.query.source;
  if (s === "file" || s === "command" || s === "database") {
    return s;
  }
  return "all";
});

const sectionFilter = computed(() =>
  typeof route.query.section === "string" ? route.query.section : ""
);

const filterBits = computed(() => {
  const bits: string[] = [];
  if (sourceFilter.value !== "all") {
    bits.push(`${sourceFilter.value} only`);
  }
  if (sectionFilter.value) {
    bits.push(`section “${sectionFilter.value}”`);
  }
  return bits;
});

const filtered = computed(() => {
  let list = [...topics.value];
  if (sourceFilter.value !== "all") {
    list = list.filter((t) => t.source === sourceFilter.value);
  }
  if (sectionFilter.value) {
    list = list.filter((t) => t.section === sectionFilter.value);
  }
  const n = q.value.trim().toLowerCase();
  if (n) {
    list = list.filter((t) =>
      `${t.name} ${t.section} ${(t.tags || []).join(" ")} ${
        (t.content || "").slice(0, 200)
      }`.toLowerCase().includes(n)
    );
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
});

const stats = computed(() => {
  const all = topics.value;
  return {
    total: all.length,
    file: all.filter((t) => t.source === "file").length,
    command: all.filter((t) => t.source === "command").length,
    database: all.filter((t) => t.source === "database").length,
  };
});

const previewHtml = computed(() =>
  renderWikiMarkdown(selected.value?.content || "", {
    wikiIndex: {},
    pagePath: "",
  })
);

function topicPath(name: string): string {
  return name.split("/").map(encodeURIComponent).join("/");
}

function formSnapshot(): string {
  return JSON.stringify({
    c: formContent.value,
    s: formSection.value,
    t: formTags.value,
    n: newName.value,
  });
}

const dirty = computed(() =>
  !!loadedSnap.value && formSnapshot() !== loadedSnap.value
);

function clearFilters(): void {
  q.value = "";
  void router.replace({ name: "help", query: {} });
}

async function loadIndex(): Promise<void> {
  loading.value = true;
  loadError.value = "";
  try {
    const { res, data } = await api<HelpIndex & { error?: string }>(
      "/api/v1/help",
    );
    if (!res.ok) {
      loadError.value = data?.error ||
        `Load failed (${res.status})`;
      topics.value = [];
      sections.value = [];
      return;
    }
    topics.value = (data?.topics ?? []).filter((t) =>
      Boolean(t.name?.trim())
    );
    sections.value = data?.sections ?? [];
  } finally {
    loading.value = false;
  }
}

function fillForm(e: HelpEntry): void {
  formContent.value = e.content || "";
  formSection.value = e.section || "general";
  formTags.value = (e.tags || []).join(", ");
  newName.value = e.name || "";
  loadedSnap.value = formSnapshot();
  status.value = e.source === "database"
    ? "Database override · saved"
    : `${e.source} · read-only until override`;
}

async function openTopic(name: string): Promise<void> {
  const clean = String(name ?? "").trim();
  if (!clean) {
    loadError.value = "Invalid topic name.";
    return;
  }
  // Already on this topic (route watch re-entry)
  if (
    selected.value?.name === clean && !creating.value &&
    !dirty.value
  ) {
    return;
  }
  if (dirty.value && !confirmLeave()) return;

  loadError.value = "";
  saveError.value = "";
  creating.value = false;
  editing.value = false;
  loadingDetail.value = true;
  try {
    const path = `/api/v1/help/${topicPath(clean)}`;
    const { res, data } = await api<
      { entry?: HelpEntry; error?: string }
    >(path);
    if (!res.ok || !data?.entry) {
      loadError.value = data?.error ||
        `Open failed (${res.status})`;
      return;
    }
    selected.value = data.entry;
    fillForm(data.entry);
    const enc = topicPath(data.entry.name || clean);
    if (
      route.name !== "help-detail" ||
      String(route.params.topic ?? "") !== enc
    ) {
      await router.push({
        name: "help-detail",
        params: { topic: enc },
      });
    }
  } finally {
    loadingDetail.value = false;
  }
}

function confirmLeave(): boolean {
  if (!dirty.value) return true;
  return globalThis.confirm(
    "You have unsaved changes. Discard them and continue?",
  );
}

function back(): void {
  if (!confirmLeave()) return;
  selected.value = null;
  creating.value = false;
  editing.value = false;
  loadedSnap.value = "";
  const qy = { ...route.query } as Record<string, string>;
  delete qy.new;
  void router.push({ name: "help", query: qy });
}

function startCreate(): void {
  if (dirty.value && !confirmLeave()) return;
  selected.value = {
    name: "",
    section: "general",
    content: "",
    source: "database",
    tags: [],
  };
  creating.value = true;
  editing.value = true;
  formContent.value = "";
  formSection.value = "general";
  formTags.value = "";
  newName.value = "";
  loadedSnap.value = formSnapshot();
  status.value = "New override · unsaved";
  void router.replace({ name: "help", query: { new: "1" } });
}

function startEdit(): void {
  if (!selected.value) return;
  editing.value = true;
  fillForm(selected.value);
  status.value = "Editing override";
}

function discard(): void {
  if (!dirty.value && !creating.value) return;
  if (dirty.value && !globalThis.confirm("Discard unsaved changes?")) {
    return;
  }
  if (creating.value) {
    back();
    return;
  }
  if (selected.value) {
    fillForm(selected.value);
    editing.value = false;
  }
}

async function save(): Promise<void> {
  if (busy.value) return;
  saveError.value = "";
  const name = creating.value
    ? newName.value.trim().toLowerCase().replace(/\s+/g, "-")
    : selected.value?.name;
  if (!name) {
    saveError.value = "Topic name is required.";
    return;
  }
  if (!formContent.value.trim()) {
    saveError.value = "Body is required.";
    return;
  }
  busy.value = true;
  status.value = "Saving…";
  try {
    const tags = formTags.value
      .split(/[,;\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const path = `/api/v1/help/${topicPath(name)}`;
    const { res, data } = await api<
      { entry?: HelpEntry; error?: string }
    >(path, {
      method: "POST",
      body: JSON.stringify({
        content: formContent.value,
        section: formSection.value.trim() || "general",
        tags,
      }),
    });
    if (!res.ok) {
      saveError.value = data?.error ||
        `Save failed (${res.status})`;
      status.value = "Error";
      return;
    }
    creating.value = false;
    editing.value = false;
    await loadIndex();
    if (data?.entry) {
      selected.value = data.entry;
      fillForm(data.entry);
      status.value = "Database override · saved";
      await router.replace({
        name: "help-detail",
        params: { topic: topicPath(data.entry.name) },
      });
    }
  } finally {
    busy.value = false;
  }
}

async function removeOverride(): Promise<void> {
  if (!selected.value || selected.value.source !== "database") {
    return;
  }
  if (
    !globalThis.confirm(
      `Delete database override for “${selected.value.name}”? ` +
        `File/command help (if any) will show again.`,
    )
  ) {
    return;
  }
  busy.value = true;
  saveError.value = "";
  try {
    const path = `/api/v1/help/${
      topicPath(selected.value.name)
    }`;
    const { res, data } = await api<{ error?: string }>(path, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 204) {
      saveError.value = data?.error ||
        `Delete failed (${res.status})`;
      return;
    }
    selected.value = null;
    editing.value = false;
    loadedSnap.value = "";
    await loadIndex();
    void router.push({ name: "help" });
  } finally {
    busy.value = false;
  }
}

function sourceBadgeClass(src: string): string {
  if (src === "database") return "badge-draft";
  if (src === "file") return "badge-live";
  return "badge";
}

function sourceLabel(src: string): string {
  if (src === "database") return "Override";
  if (src === "file") return "File";
  if (src === "command") return "Command";
  return src;
}

function formatChars(content?: string): string {
  const n = (content || "").length;
  if (n < 1) return "—";
  if (n < 1000) return `${n} c`;
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

watch(
  () => props.topic,
  (t) => {
    if (t) {
      void openTopic(decodeURIComponent(String(t)));
    } else if (route.query.new !== "1") {
      selected.value = null;
      creating.value = false;
      editing.value = false;
    }
  },
  { immediate: true },
);

watch(
  () => route.query.new,
  (n) => {
    if (n === "1" && !creating.value) startCreate();
  },
);

watch(dirty, (d) => {
  if (!loadedSnap.value || !selected.value) return;
  if (d) status.value = "Unsaved";
  else if (selected.value.source === "database") {
    status.value = "Database override · saved";
  }
});

onMounted(() => {
  void loadIndex();
});

onBeforeRouteLeave(() => confirmLeave());

const showList = computed(
  () => !selected.value && !creating.value && !loadingDetail.value,
);
</script>

<template>
  <!-- List — wiki browser chrome -->
  <article
    v-if="showList"
    id="main-help"
    class="dash-browser"
  >
    <header class="dash-header">
      <div>
        <p class="muted dash-kicker">
          Library
        </p>
        <h1 class="page-title">
          Help
          <span class="muted">
            ({{ filtered.length }}{{
              filtered.length !== stats.total
                ? ` of ${stats.total}`
                : ""
            }})
          </span>
        </h1>
        <p class="muted">
          Browse topics — filters live in the side nav.
          {{ stats.file }} file ·
          {{ stats.command }} command ·
          {{ stats.database }} DB
        </p>
      </div>
      <div class="dash-header-actions">
        <button
          type="button"
          @click="startCreate"
        >
          New override
        </button>
        <button
          type="button"
          class="secondary outline"
          :disabled="loading"
          @click="loadIndex"
        >
          Refresh
        </button>
      </div>
    </header>

    <p
      v-if="filterBits.length"
      class="dash-filter-banner"
    >
      <span>Filtered: {{ filterBits.join(" · ") }}</span>
      <button
        type="button"
        class="secondary outline"
        @click="clearFilters"
      >
        Clear
      </button>
    </p>

    <section
      class="pages-toolbar"
      aria-label="Search help"
    >
      <label class="pages-search-label">
        <span class="sr-only">Search topics</span>
        <input
          v-model="q"
          type="search"
          placeholder="Search topic, section, tags…"
          autocomplete="off"
        >
      </label>
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
              Topic
            </th>
            <th scope="col">
              Path
            </th>
            <th scope="col">
              Source
            </th>
            <th scope="col">
              Section
            </th>
            <th scope="col">
              Size
            </th>
            <th scope="col">
              Tags
            </th>
            <th scope="col">
              <span class="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td
              colspan="7"
              class="muted"
            >
              Loading…
            </td>
          </tr>
          <tr v-else-if="!filtered.length && !stats.total">
            <td
              colspan="7"
              class="muted"
            >
              No help topics loaded.
            </td>
          </tr>
          <tr v-else-if="!filtered.length">
            <td
              colspan="7"
              class="muted"
            >
              No topics match this filter.
            </td>
          </tr>
          <tr
            v-for="t in filtered"
            :key="t.name"
            tabindex="0"
            @click="openTopic(t.name)"
            @keydown.enter.prevent="openTopic(t.name)"
          >
            <td>
              {{ t.name.split("/").pop() || t.name }}
              <span
                v-if="t.hidden"
                class="badge"
              >hidden</span>
            </td>
            <td><code>{{ t.name }}</code></td>
            <td>
              <span
                class="badge"
                :class="sourceBadgeClass(t.source)"
              >{{ sourceLabel(t.source) }}</span>
            </td>
            <td class="muted">
              {{ t.section || "—" }}
            </td>
            <td class="muted">
              {{ formatChars(t.content) }}
            </td>
            <td class="muted">
              {{ (t.tags || []).join(", ") || "—" }}
            </td>
            <td class="row-open">
              <button
                type="button"
                class="secondary outline"
                @click.stop="openTopic(t.name)"
              >
                Open
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </article>

  <!-- Detail / edit — wiki editor chrome -->
  <article
    v-else
    id="main-editor"
  >
    <header class="editor-header">
      <div>
        <p class="editor-path-line">
          <button
            type="button"
            class="back-link"
            @click="back"
          >
            ← Help
          </button>
          <code v-if="!creating">{{
            selected?.name || "…"
          }}</code>
          <code v-else>new override</code>
          <span
            v-if="dirty"
            class="dirty-dot"
            title="Unsaved changes"
            aria-label="Unsaved changes"
          >●</span>
          <small class="muted">{{ status }}</small>
        </p>
        <h1 class="page-title page-title-tight">
          <template v-if="creating">
            New override
          </template>
          <template v-else>
            {{ selected?.name || "Topic" }}
          </template>
        </h1>
      </div>
      <div class="editor-actions">
        <template v-if="editing || creating">
          <button
            type="button"
            class="secondary outline"
            :disabled="(!dirty && !creating) || busy"
            @click="discard"
          >
            Discard
          </button>
          <button
            type="button"
            :disabled="busy || (!dirty && !creating)"
            :aria-busy="busy"
            @click="save"
          >
            Save
          </button>
        </template>
        <template v-else-if="selected">
          <button
            type="button"
            class="secondary"
            :disabled="busy"
            @click="startEdit"
          >
            {{
              selected.source === "database"
                ? "Edit"
                : "Override"
            }}
          </button>
          <button
            v-if="selected.source === 'database'"
            type="button"
            class="secondary outline"
            :disabled="busy"
            @click="removeOverride"
          >
            Delete override
          </button>
        </template>
      </div>
    </header>

    <p
      v-if="loadingDetail"
      class="muted"
      aria-busy="true"
    >
      Loading topic…
    </p>
    <p
      v-else-if="loadError"
      class="error"
      role="alert"
    >
      {{ loadError }}
    </p>

    <template v-else-if="selected">
      <p
        v-if="!editing && !creating &&
          selected.source !== 'database'"
        class="muted dash-hint"
      >
        From <strong>{{ selected.source }}</strong>.
        Override stores a database copy that wins over
        file/command help.
      </p>

      <form
        v-if="editing || creating"
        @submit.prevent="save"
      >
        <label
          v-if="creating"
          for="help-topic-name"
        >
          Topic path
          <input
            id="help-topic-name"
            v-model="newName"
            required
            maxlength="120"
            placeholder="mail/send or my-topic"
            pattern="[a-z0-9][a-z0-9\-/]*"
          >
        </label>

        <div class="db-edit-grid">
          <label for="help-section">
            Section
            <input
              id="help-section"
              v-model="formSection"
              list="help-section-list"
              maxlength="64"
            >
            <datalist id="help-section-list">
              <option
                v-for="s in sections"
                :key="s"
                :value="s"
              />
            </datalist>
          </label>
          <label for="help-tags">
            Tags
            <input
              id="help-tags"
              v-model="formTags"
              placeholder="comma-separated"
            >
          </label>
        </div>

        <WikiBodyField
          v-model="formContent"
          :rows="18"
        />

        <p
          v-if="saveError"
          class="error"
          role="alert"
        >
          {{ saveError }}
        </p>
        <p>
          <small class="muted">
            Save writes a database override (highest priority).
          </small>
        </p>
      </form>

      <template v-else>
        <p class="muted jobs-detail-meta">
          <span
            class="badge"
            :class="sourceBadgeClass(selected.source)"
          >{{ sourceLabel(selected.source) }}</span>
          · section {{ selected.section || "—" }}
          <template v-if="selected.tags?.length">
            · {{ selected.tags.join(", ") }}
          </template>
        </p>
        <fieldset class="wiki-body-field">
          <legend>Body</legend>
          <div
            class="wiki-md-preview"
            v-html="previewHtml"
          />
        </fieldset>
      </template>
    </template>
  </article>
</template>
