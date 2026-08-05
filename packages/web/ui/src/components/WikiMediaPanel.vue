<script setup lang="ts">
/**
 * On-server images for a wiki page.
 * Upload a file or import a URL → stored under
 * wiki/<path>/_assets/ and inserted as markdown.
 */
import { onMounted, ref, watch } from "vue";
import { api } from "@/api/client";
import { encodeWikiPath } from "@/utils/wiki";

export type WikiMediaItem = {
  name: string;
  path: string;
  url: string;
  size: number;
  type: string;
};

const props = defineProps<{
  pagePath: string;
}>();

const emit = defineEmits<{
  insert: [markdown: string];
}>();

const items = ref<WikiMediaItem[]>([]);
const loading = ref(false);
const busy = ref(false);
const error = ref("");
const urlIn = ref("");
const fileInput = ref<HTMLInputElement | null>(null);

function mediaApiBase(): string {
  const enc = encodeWikiPath(props.pagePath);
  return `/api/v1/wiki/${enc}/media`;
}

async function refresh(): Promise<void> {
  if (!props.pagePath) return;
  loading.value = true;
  error.value = "";
  try {
    const { res, data } = await api<{
      media?: WikiMediaItem[];
      error?: string;
    }>(mediaApiBase());
    if (!res.ok) {
      error.value = data?.error || `List failed (${res.status})`;
      items.value = [];
      return;
    }
    items.value = Array.isArray(data?.media) ? data.media : [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.pagePath,
  () => {
    void refresh();
  },
);

onMounted(() => {
  void refresh();
});

/** Short form — renderer expands to /api/v1/wiki/…/_assets/… */
function mdFor(item: WikiMediaItem): string {
  const alt = item.name.replace(/\.[^.]+$/, "");
  return `![${alt}](${item.name})`;
}

function insert(item: WikiMediaItem): void {
  emit("insert", mdFor(item));
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function onFileChange(ev: Event): Promise<void> {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  busy.value = true;
  error.value = "";
  try {
    const form = new FormData();
    form.append("file", file, file.name);
    const { res, data } = await api<WikiMediaItem & { error?: string }>(
      mediaApiBase(),
      { method: "POST", body: form },
    );
    if (!res.ok) {
      error.value = data?.error || `Upload failed (${res.status})`;
      return;
    }
    await refresh();
    if (data?.url) {
      emit("insert", mdFor(data as WikiMediaItem));
    }
  } finally {
    busy.value = false;
    input.value = "";
  }
}

async function importUrl(): Promise<void> {
  const url = urlIn.value.trim();
  if (!url) {
    error.value = "Paste an image URL first.";
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    const { res, data } = await api<WikiMediaItem & { error?: string }>(
      mediaApiBase(),
      {
        method: "POST",
        body: JSON.stringify({ url }),
      },
    );
    if (!res.ok) {
      error.value = data?.error || `Import failed (${res.status})`;
      return;
    }
    urlIn.value = "";
    await refresh();
    if (data?.url) {
      emit("insert", mdFor(data as WikiMediaItem));
    }
  } finally {
    busy.value = false;
  }
}

async function remove(item: WikiMediaItem): Promise<void> {
  if (
    !globalThis.confirm(
      `Delete ${item.name} from the server? ` +
        "Markdown that still references it will break.",
    )
  ) {
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    const { res, data } = await api<{ error?: string }>(
      `${mediaApiBase()}/${encodeURIComponent(item.name)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      error.value = data?.error || `Delete failed (${res.status})`;
      return;
    }
    await refresh();
  } finally {
    busy.value = false;
  }
}

function pickFile(): void {
  fileInput.value?.click();
}
</script>

<template>
  <section class="wiki-media-panel">
    <header class="wiki-media-panel__head">
      <h2 class="wiki-media-panel__title">
        Images
      </h2>
      <p class="muted wiki-media-panel__hint">
        On-server under
        <code>{{ pagePath }}/_assets/</code>.
        Insert writes short markdown like
        <code>![crest](crest.png)</code>.
      </p>
    </header>

    <div class="wiki-media-panel__actions">
      <input
        ref="fileInput"
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,.png,.jpg,.jpeg,.gif,.webp,.svg"
        class="wiki-media-panel__file"
        :disabled="busy"
        @change="onFileChange"
      >
      <button
        type="button"
        class="secondary outline"
        :disabled="busy"
        @click="pickFile"
      >
        Upload image…
      </button>
      <div class="wiki-media-panel__url-row">
        <input
          v-model="urlIn"
          type="url"
          placeholder="https://… image URL to import"
          :disabled="busy"
          @keydown.enter.prevent="importUrl"
        >
        <button
          type="button"
          class="secondary"
          :disabled="busy || !urlIn.trim()"
          @click="importUrl"
        >
          Import URL
        </button>
      </div>
    </div>

    <p
      v-if="error"
      class="error"
      role="alert"
    >
      {{ error }}
    </p>
    <p
      v-else-if="loading"
      class="muted"
    >
      Loading images…
    </p>
    <p
      v-else-if="!items.length"
      class="muted"
    >
      No images yet. Upload a file or import a URL.
    </p>

    <ul
      v-else
      class="wiki-media-panel__list"
    >
      <li
        v-for="it in items"
        :key="it.path"
        class="wiki-media-panel__item"
      >
        <a
          class="wiki-media-panel__thumb"
          :href="it.url"
          target="_blank"
          rel="noopener"
        >
          <img
            :src="it.url"
            :alt="it.name"
            loading="lazy"
          >
        </a>
        <div class="wiki-media-panel__meta">
          <code>{{ it.name }}</code>
          <small class="muted">{{ fmtSize(it.size) }}</small>
        </div>
        <div class="wiki-media-panel__item-actions">
          <button
            type="button"
            class="secondary outline"
            :disabled="busy"
            @click="insert(it)"
          >
            Insert
          </button>
          <button
            type="button"
            class="secondary outline"
            :disabled="busy"
            title="Remove from server"
            @click="remove(it)"
          >
            Delete
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
