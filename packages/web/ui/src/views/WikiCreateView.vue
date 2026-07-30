<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { api } from "@/api/client";
import { useSessionStore } from "@/stores/session";
import { useLiveStore } from "@/stores/live";
import TagInput from "@/components/TagInput.vue";
import ReadLockSelect from "@/components/ReadLockSelect.vue";
import WikiBodyField from "@/components/WikiBodyField.vue";
import {
  isValidPath,
  normalizePath,
  SEED_BODY,
} from "@/utils/wiki";

const router = useRouter();
const session = useSessionStore();
const live = useLiveStore();

const path = ref("");
const title = ref("");
const body = ref(SEED_BODY);
const draft = ref(true);
const readLock = ref("connected");
const tags = ref<string[]>([]);
const error = ref("");
const pathError = ref("");
const existsHint = ref(false);
const conflictPath = ref("");
const busy = ref(false);

const pathFile = computed(() => {
  const p = normalizePath(path.value);
  return p ? `${p}.md` : "….md";
});

watch(path, (v) => {
  const p = normalizePath(v);
  if (!p) {
    pathError.value = "";
    return;
  }
  pathError.value = isValidPath(p)
    ? ""
    : "Use lowercase letters, numbers, /, _, -.";
});

function leave(): void {
  void router.push({ name: "wiki" });
}

async function submit(): Promise<void> {
  error.value = "";
  existsHint.value = false;
  conflictPath.value = "";
  const p = normalizePath(path.value);
  const t = title.value.trim();
  const b = body.value.trim();
  if (!isValidPath(p)) {
    pathError.value =
      "Use lowercase letters, numbers, /, _, -.";
    error.value = "Fix the path before creating.";
    return;
  }
  if (!t) {
    error.value = "Title is required.";
    return;
  }
  if (!b) {
    error.value = "Body is required.";
    return;
  }

  busy.value = true;
  try {
    const payload: Record<string, unknown> = {
      path: p,
      title: t,
      body: b,
      draft: draft.value,
      readLock: readLock.value || "connected",
      author: session.displayName,
      date: new Date().toISOString().slice(0, 10),
    };
    if (tags.value.length) payload.tags = [...tags.value];

    const { res, data } = await api<{ error?: string }>(
      "/api/v1/wiki",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    if (res.status === 401) {
      session.signOut();
      await router.replace({ name: "login" });
      return;
    }
    if (res.status === 409) {
      conflictPath.value = p;
      existsHint.value = true;
      error.value = data?.error || "Page already exists.";
      return;
    }
    if (!res.ok) {
      error.value = data?.error ||
        `Create failed (${res.status}).`;
      return;
    }

    live.upsertPage({
      path: p,
      title: t,
      draft: draft.value,
      readLock: readLock.value,
      tags: [...tags.value],
      chars: b.length,
      date: new Date().toISOString().slice(0, 10),
      author: session.displayName,
    });

    await router.push({
      name: "wiki-edit",
      params: { path: p },
    });
  } finally {
    busy.value = false;
  }
}

function openExisting(): void {
  if (!conflictPath.value) return;
  void router.push({
    name: "wiki-edit",
    params: { path: conflictPath.value },
  });
}
</script>

<template>
  <article id="main-create">
    <header class="editor-header">
      <div>
        <p class="editor-path-line">
          <button
            type="button"
            class="back-link"
            @click="leave"
          >
            ← Wiki
          </button>
        </p>
        <p class="muted dash-kicker">
          New entry
        </p>
        <h1 class="page-title page-title-tight">
          Create wiki page
        </h1>
        <p class="muted">
          Path becomes the URL and file under wiki/.
        </p>
      </div>
      <div class="editor-actions">
        <button
          type="button"
          class="secondary outline"
          :disabled="busy"
          @click="leave"
        >
          Cancel
        </button>
        <button
          type="button"
          :disabled="busy"
          :aria-busy="busy"
          @click="submit"
        >
          Create page
        </button>
      </div>
    </header>

    <form
      class="create-layout"
      @submit.prevent="submit"
    >
      <div class="create-main">
        <label for="create-path">
          Path
          <input
            id="create-path"
            v-model="path"
            class="mono"
            placeholder="lore/factions"
            required
            maxlength="200"
            autocapitalize="none"
            spellcheck="false"
            autocomplete="off"
          >
          <small class="muted">Writes to wiki/{{ pathFile }}</small>
          <small
            v-if="pathError"
            class="error"
          >{{ pathError }}</small>
        </label>

        <label for="create-title">
          Title
          <input
            id="create-title"
            v-model="title"
            placeholder="The Iron Pact"
            required
            maxlength="200"
          >
        </label>

        <WikiBodyField
          v-model="body"
          :rows="16"
        />
      </div>

      <aside
        class="create-meta"
        aria-label="Page options"
      >
        <label for="create-tags">
          Tags
          <TagInput
            id="create-tags"
            v-model="tags"
          />
        </label>

        <label class="chk-row">
          <input
            v-model="draft"
            type="checkbox"
            class="chk"
          >
          <span>Save as draft</span>
        </label>

        <label for="create-lock">
          Who can read
          <ReadLockSelect
            id="create-lock"
            v-model="readLock"
          />
        </label>

        <p
          v-if="error"
          class="error"
          role="alert"
        >
          {{ error }}
        </p>
        <p v-if="existsHint">
          <small>
            Page already exists.
            <a
              href="#"
              @click.prevent="openExisting"
            >Open it</a>
          </small>
        </p>
      </aside>
    </form>

    <div class="create-footer">
      <button
        type="button"
        class="secondary outline"
        :disabled="busy"
        @click="leave"
      >
        Cancel
      </button>
      <button
        type="button"
        :disabled="busy"
        :aria-busy="busy"
        @click="submit"
      >
        Create page
      </button>
    </div>
  </article>
</template>
