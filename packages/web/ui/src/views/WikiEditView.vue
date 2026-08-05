<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRouter } from "vue-router";
import { api } from "@/api/client";
import { useLiveStore } from "@/stores/live";
import { useSessionStore } from "@/stores/session";
import TagInput from "@/components/TagInput.vue";
import ReadLockSelect from "@/components/ReadLockSelect.vue";
import WikiBodyField from "@/components/WikiBodyField.vue";
import WikiMediaPanel from "@/components/WikiMediaPanel.vue";
import {
  encodeWikiPath,
  pageSnapshot,
  type WikiPagePayload,
} from "@/utils/wiki";

const props = defineProps<{ path: string }>();
const router = useRouter();
const live = useLiveStore();
const session = useSessionStore();

const title = ref("");
const body = ref("");
const draft = ref(false);
const featured = ref(false);
const bgImage = ref(false);
const readLock = ref("connected");
const tags = ref<string[]>([]);
const loading = ref(true);
const error = ref("");
const saveError = ref("");
const status = ref("");
const busy = ref(false);
const loadedSnap = ref("");

const currentPayload = computed<WikiPagePayload>(() => ({
  title: title.value,
  body: body.value,
  draft: draft.value,
  featured: featured.value,
  bgImage: bgImage.value,
  readLock: readLock.value,
  tags: tags.value,
}));

const dirty = computed(
  () =>
    !!loadedSnap.value &&
    pageSnapshot(currentPayload.value) !== loadedSnap.value,
);

async function load(): Promise<void> {
  loading.value = true;
  error.value = "";
  saveError.value = "";
  status.value = "Loading…";
  const enc = encodeWikiPath(props.path);
  const { res, data } = await api<{
    title?: string;
    body?: string;
    draft?: boolean;
    featured?: boolean;
    bgImage?: boolean;
    readLock?: string;
    tags?: string[];
    error?: string;
    type?: string;
  }>(`/api/v1/wiki/${enc}`);
  loading.value = false;

  if (res.status === 401) {
    session.signOut();
    await router.replace({ name: "login" });
    return;
  }
  if (!res.ok) {
    error.value = data?.error || `Load failed (${res.status}).`;
    status.value = "Error";
    return;
  }
  if (data?.type === "directory") {
    error.value = "That path is a directory.";
    status.value = "";
    return;
  }

  title.value = String(data.title ?? props.path);
  body.value = String(data.body ?? "");
  draft.value = data.draft === true;
  featured.value = data.featured === true;
  bgImage.value = data.bgImage === true;
  readLock.value = String(data.readLock ?? "connected");
  tags.value = Array.isArray(data.tags)
    ? data.tags.map((t) => String(t).toLowerCase())
    : [];
  loadedSnap.value = pageSnapshot(currentPayload.value);
  status.value = draft.value ? "Draft · saved" : "Published · saved";
}

watch(
  () => props.path,
  () => {
    void load();
  },
);

watch(dirty, (d) => {
  if (!loadedSnap.value) return;
  if (d) status.value = "Unsaved";
  else {
    status.value = draft.value
      ? "Draft · saved"
      : "Published · saved";
  }
});

function onKey(ev: KeyboardEvent): void {
  if ((ev.metaKey || ev.ctrlKey) && (ev.key === "s" || ev.key === "S")) {
    if (dirty.value) {
      ev.preventDefault();
      void save();
    }
  }
}

onMounted(() => {
  void load();
  document.addEventListener("keydown", onKey);
});

onUnmounted(() => {
  document.removeEventListener("keydown", onKey);
});

async function save(): Promise<void> {
  if (!dirty.value || busy.value) return;
  saveError.value = "";
  const t = title.value.trim();
  if (!t) {
    saveError.value = "Title is required.";
    return;
  }
  if (!body.value.trim()) {
    saveError.value = "Body is required.";
    return;
  }

  busy.value = true;
  status.value = "Saving…";
  try {
    const enc = encodeWikiPath(props.path);
    const payload: Record<string, unknown> = {
      title: t,
      body: body.value,
      draft: draft.value,
      featured: featured.value,
      bgImage: bgImage.value,
      readLock: readLock.value || "connected",
      tags: [...tags.value],
    };
    const { res, data } = await api<{ error?: string }>(
      `/api/v1/wiki/${enc}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    );
    if (res.status === 401) {
      session.signOut();
      await router.replace({ name: "login" });
      return;
    }
    if (!res.ok) {
      saveError.value = data?.error ||
        `Save failed (${res.status}).`;
      status.value = "Error";
      return;
    }
    title.value = t;
    loadedSnap.value = pageSnapshot(currentPayload.value);
    status.value = draft.value
      ? "Draft · saved"
      : "Published · saved";
    live.upsertPage({
      path: props.path,
      title: t,
      draft: draft.value,
      featured: featured.value,
      bgImage: bgImage.value,
      readLock: readLock.value,
      tags: [...tags.value],
      chars: body.value.length,
      date: new Date().toISOString().slice(0, 10),
      author: session.displayName,
    });

  } finally {
    busy.value = false;
  }
}

function discard(): void {
  if (!dirty.value) return;
  if (!globalThis.confirm("Discard unsaved changes?")) return;
  void load();
}

async function deletePage(): Promise<void> {
  if (busy.value || loading.value) return;
  const path = props.path;
  const label = title.value.trim() || path;
  if (
    !globalThis.confirm(
      `Delete wiki page “${label}” (${path})?\n\n` +
        "This removes the page file. History snapshots " +
        "may remain on disk. This cannot be undone from " +
        "the web UI.",
    )
  ) {
    return;
  }
  busy.value = true;
  saveError.value = "";
  status.value = "Deleting…";
  try {
    const enc = encodeWikiPath(path);
    const { res, data } = await api<{
      error?: string;
      deleted?: boolean;
    }>(`/api/v1/wiki/${enc}`, { method: "DELETE" });
    if (res.status === 401) {
      session.signOut();
      await router.replace({ name: "login" });
      return;
    }
    if (!res.ok) {
      saveError.value = data?.error ||
        `Delete failed (${res.status}).`;
      status.value = "Error";
      return;
    }
    live.removePage(path);
    loadedSnap.value = "";
    await router.replace({ name: "wiki" });
  } finally {
    busy.value = false;
  }
}

/** Insert markdown at end of body (from Images panel). */
function insertMediaMarkdown(md: string): void {
  const cur = body.value;
  const sep = !cur
    ? ""
    : cur.endsWith("\n\n")
    ? ""
    : cur.endsWith("\n")
    ? "\n"
    : "\n\n";
  body.value = `${cur}${sep}${md}\n`;
}

function confirmLeave(): boolean {
  if (!dirty.value) return true;
  return globalThis.confirm(
    "You have unsaved changes. Discard them and continue?",
  );
}

function back(): void {
  if (!confirmLeave()) return;
  void router.push({ name: "wiki" });
}

onBeforeRouteLeave(() => confirmLeave());
</script>

<template>
  <article id="main-editor">
    <header class="editor-header">
      <div>
        <p class="editor-path-line">
          <button
            type="button"
            class="back-link"
            @click="back"
          >
            ← Wiki
          </button>
          <code>{{ path }}</code>
          <span
            v-if="dirty"
            class="dirty-dot"
            title="Unsaved changes"
            aria-label="Unsaved changes"
          >●</span>
          <small class="muted">{{ status }}</small>
        </p>
        <h1 class="page-title page-title-tight">
          {{ title || "Edit page" }}
        </h1>
      </div>
      <div class="editor-actions">
        <button
          type="button"
          class="secondary outline"
          :disabled="busy || loading || !!error"
          title="Delete this page"
          @click="deletePage"
        >
          Delete
        </button>
        <button
          type="button"
          class="secondary outline"
          :disabled="!dirty || busy || loading"
          @click="discard"
        >
          Discard
        </button>
        <button
          type="button"
          :disabled="!dirty || busy || loading"
          :aria-busy="busy"
          @click="save"
        >
          Save
        </button>
      </div>
    </header>

    <p
      v-if="loading"
      class="muted"
      aria-busy="true"
    >
      Loading page…
    </p>
    <p
      v-else-if="error"
      class="error"
      role="alert"
    >
      {{ error }}
    </p>

    <form
      v-else
      @submit.prevent="save"
    >
      <label for="edit-title">
        Title
        <input
          id="edit-title"
          v-model="title"
          required
          maxlength="200"
        >
      </label>

      <WikiBodyField
        v-model="body"
        :rows="18"
        :page-path="path"
      />

      <WikiMediaPanel
        :page-path="path"
        @insert="insertMediaMarkdown"
      />

      <label for="edit-tags">
        Tags
        <TagInput
          id="edit-tags"
          v-model="tags"
        />
      </label>

      <div class="db-edit-grid">
        <label class="chk-row">
          <input
            v-model="draft"
            type="checkbox"
            class="chk"
          >
          <span>Draft (staff-only read)</span>
        </label>
        <label class="chk-row">
          <input
            v-model="featured"
            type="checkbox"
            class="chk"
          >
          <span>Featured (left menu on public site)</span>
        </label>
        <label class="chk-row">
          <input
            v-model="bgImage"
            type="checkbox"
            class="chk"
          >
          <span>
            Background image (home-height layout on public site)
          </span>
        </label>
        <label for="edit-lock">
          Who can read
          <ReadLockSelect
            id="edit-lock"
            v-model="readLock"
          />
        </label>
      </div>

      <p
        v-if="saveError"
        class="error"
        role="alert"
      >
        {{ saveError }}
      </p>
      <p>
        <small class="muted">
          Path is fixed after create. Save with the button or Ctrl/⌘+S.
        </small>
      </p>
    </form>
  </article>
</template>
