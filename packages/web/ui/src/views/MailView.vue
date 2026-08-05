<script setup lang="ts">
/**
 * Staff mail console — system browser + personal folders + compose.
 */
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { api } from "@/api/client";
import type { MailMessage, MailStats } from "@/api/types";
import { useLiveStore } from "@/stores/live";
import { useSessionStore } from "@/stores/session";
import PlayerSelect from "@/components/PlayerSelect.vue";
import {
  asDbref,
  bareDbref,
  formatMailWhen,
} from "@/utils/mail";
import { dboName } from "@/utils/text";

const props = defineProps<{ id?: string }>();
const route = useRoute();
const router = useRouter();
const live = useLiveStore();
const session = useSessionStore();
const { objects } = storeToRefs(live);

type Folder =
  | "all"
  | "unread"
  | "trash"
  | "mine"
  | "sent";

const folder = ref<Folder>("all");
const q = ref("");
const rows = ref<MailMessage[]>([]);
const stats = ref<MailStats | null>(null);
const selected = ref<MailMessage | null>(null);
const loadError = ref("");
const busy = ref(false);
const loading = ref(false);
const composing = ref(false);
const composeTo = ref<string[]>([]);
const composeSubject = ref("");
const composeBody = ref("");
const composeError = ref("");
const saveOk = ref("");

const myDbref = computed(() => {
  const id = String(
    session.me?.dbId || session.me?.id || "",
  ).replace(/^#/, "");
  return id ? `#${id}` : "";
});

function nameOf(ref: string): string {
  const id = bareDbref(ref);
  if (!id) return ref || "—";
  const hit = objects.value.find(
    (o) => bareDbref(String(o.id ?? "")) === id,
  );
  if (hit) return dboName(hit);
  return `#${id}`;
}

function refsLabel(refs: string[] | undefined): string {
  if (!refs?.length) return "—";
  return refs.map(nameOf).join(", ");
}

const folderLabel = computed(() => {
  const m: Record<Folder, string> = {
    all: "All mail",
    unread: "Unread",
    trash: "Trash",
    mine: "My inbox",
    sent: "Sent",
  };
  return m[folder.value];
});

async function loadStats(): Promise<void> {
  const { res, data } = await api<MailStats & { error?: string }>(
    "/api/v1/mail/stats",
  );
  if (res.ok && data && !("error" in data && data.error)) {
    stats.value = data as MailStats;
  }
}

async function loadList(): Promise<void> {
  loading.value = true;
  loadError.value = "";
  try {
    const f = folder.value;
    let path = "";
    if (f === "sent") {
      path = "/api/v1/mail/sent";
    } else if (f === "mine") {
      path = "/api/v1/mail?folder=inbox";
    } else if (f === "trash") {
      path = "/api/v1/mail/all?folder=trash&limit=300";
    } else if (f === "unread") {
      path = "/api/v1/mail/all?unread=1&limit=300";
    } else {
      path = "/api/v1/mail/all?folder=any&limit=300";
    }
    const needle = q.value.trim();
    if (needle && path.includes("/all")) {
      path += `&q=${encodeURIComponent(needle)}`;
    }
    const { res, data } = await api<
      MailMessage[] | { error?: string }
    >(path);
    if (!res.ok) {
      loadError.value = (data as { error?: string })?.error ||
        `Load failed (${res.status})`;
      rows.value = [];
      return;
    }
    let list = Array.isArray(data) ? data : [];
    if (needle && (f === "mine" || f === "sent")) {
      const n = needle.toLowerCase();
      list = list.filter((m) =>
        `${m.subject} ${m.message} ${m.from}`.toLowerCase()
          .includes(n)
      );
    }
    rows.value = list;
  } finally {
    loading.value = false;
  }
}

async function openMail(id: string): Promise<void> {
  loadError.value = "";
  saveOk.value = "";
  composing.value = false;
  const { res, data } = await api<MailMessage & { error?: string }>(
    `/api/v1/mail/${encodeURIComponent(id)}`,
  );
  if (!res.ok) {
    loadError.value = data?.error || `Open failed (${res.status})`;
    return;
  }
  selected.value = data as MailMessage;
  if (props.id !== id) {
    await router.replace({ name: "mail-detail", params: { id } });
  }
  void loadList();
  void loadStats();
}

function clearSelection(): void {
  selected.value = null;
  composing.value = false;
  void router.replace({ name: "mail", query: route.query });
}

function startCompose(reply?: MailMessage): void {
  composing.value = true;
  selected.value = null;
  composeError.value = "";
  if (reply) {
    composeTo.value = [bareDbref(reply.from)].filter(Boolean);
    composeSubject.value = reply.subject.startsWith("Re:")
      ? reply.subject
      : `Re: ${reply.subject}`;
    composeBody.value =
      `\n\n--- On ${formatMailWhen(reply.date)}, ` +
      `${nameOf(reply.from)} wrote ---\n${reply.message}`;
  } else {
    composeTo.value = [];
    composeSubject.value = "";
    composeBody.value = "";
  }
  void router.replace({ name: "mail", query: { compose: "1" } });
}

async function sendCompose(): Promise<void> {
  composeError.value = "";
  const to = composeTo.value.map(asDbref).filter(Boolean);
  if (!to.length) {
    composeError.value = "Pick at least one recipient.";
    return;
  }
  if (!composeSubject.value.trim()) {
    composeError.value = "Subject is required.";
    return;
  }
  if (!composeBody.value.trim()) {
    composeError.value = "Message body is required.";
    return;
  }
  busy.value = true;
  try {
    const { res, data } = await api<{ id?: string; error?: string }>(
      "/api/v1/mail",
      {
        method: "POST",
        body: JSON.stringify({
          to,
          subject: composeSubject.value.trim(),
          message: composeBody.value.trim(),
        }),
      },
    );
    if (!res.ok) {
      composeError.value = data?.error || `Send failed (${res.status})`;
      return;
    }
    composing.value = false;
    saveOk.value = "Sent.";
    folder.value = "sent";
    await loadList();
    void loadStats();
    if (data?.id) await openMail(data.id);
  } finally {
    busy.value = false;
  }
}

async function trashSelected(): Promise<void> {
  if (!selected.value) return;
  busy.value = true;
  try {
    const id = selected.value.id;
    const { res, data } = await api<{ error?: string }>(
      `/api/v1/mail/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      loadError.value = data?.error || "Delete failed";
      return;
    }
    selected.value = null;
    saveOk.value = "Moved to trash / purged.";
    await loadList();
    void loadStats();
    void router.replace({ name: "mail" });
  } finally {
    busy.value = false;
  }
}

async function toggleStar(): Promise<void> {
  if (!selected.value) return;
  const next = !selected.value.starred;
  busy.value = true;
  try {
    const { res, data } = await api<{ error?: string }>(
      `/api/v1/mail/${encodeURIComponent(selected.value.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ starred: next }),
      },
    );
    if (!res.ok) {
      loadError.value = data?.error || "Update failed";
      return;
    }
    selected.value = { ...selected.value, starred: next };
    await loadList();
  } finally {
    busy.value = false;
  }
}

function setFolder(f: Folder): void {
  folder.value = f;
  composing.value = false;
  selected.value = null;
  void router.replace({ name: "mail", query: { folder: f } });
  void loadList();
}

watch(
  () => route.query.folder,
  (f) => {
    const ok = ["all", "unread", "trash", "mine", "sent"] as const;
    if (typeof f === "string" && (ok as readonly string[]).includes(f)) {
      folder.value = f as Folder;
    }
  },
  { immediate: true },
);

watch(
  () => props.id,
  (id) => {
    if (id) void openMail(id);
    else if (!route.query.compose) selected.value = null;
  },
  { immediate: true },
);

watch(
  () => route.query.compose,
  (c) => {
    if (c === "1" && !composing.value) startCompose();
  },
  { immediate: true },
);

onMounted(() => {
  void loadList();
  void loadStats();
});

const showList = computed(
  () => !selected.value && !composing.value,
);
</script>

<template>
  <article
    v-if="showList"
    id="main-mail"
    class="dash-browser"
  >
    <header class="dash-header">
      <div>
        <h1 class="page-title">
          Mail
        </h1>
        <p class="muted lede">
          <template v-if="stats">
            {{ stats.unread }} unread ·
            {{ stats.inbox }} inbox ·
            {{ stats.trash }} trash ·
            {{ stats.total }} total
          </template>
          <template v-else>
            Staff mail browser and personal folders.
          </template>
        </p>
      </div>
      <div class="dash-header-actions">
        <button
          type="button"
          @click="startCompose()"
        >
          Compose
        </button>
      </div>
    </header>

    <p
      class="filter-chips"
      role="toolbar"
      aria-label="Mail folders"
    >
      <button
        v-for="f in (
          ['all', 'unread', 'trash', 'mine', 'sent'] as Folder[]
        )"
        :key="f"
        type="button"
        class="chip"
        :class="{ active: folder === f }"
        @click="setFolder(f)"
      >
        {{ f }}
      </button>
    </p>

    <section
      class="pages-toolbar"
      aria-label="Search mail"
    >
      <label class="pages-search-label">
        <span class="sr-only">Search mail</span>
        <input
          v-model="q"
          type="search"
          placeholder="Search subject, body, dbref…"
          autocomplete="off"
          @change="loadList"
          @keydown.enter.prevent="loadList"
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
    <p
      v-if="saveOk"
      class="muted"
    >
      {{ saveOk }}
    </p>

    <div class="table-wrap">
      <table class="dash-table">
        <thead>
          <tr>
            <th scope="col">
              When
            </th>
            <th scope="col">
              From
            </th>
            <th scope="col">
              To
            </th>
            <th scope="col">
              Subject
            </th>
            <th scope="col">
              <span class="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td
              colspan="5"
              class="muted"
            >
              Loading {{ folderLabel }}…
            </td>
          </tr>
          <tr v-else-if="!rows.length">
            <td
              colspan="5"
              class="muted"
            >
              No messages in {{ folderLabel }}.
            </td>
          </tr>
          <tr
            v-for="m in rows"
            :key="m.id"
            tabindex="0"
            :class="{ 'row-unread': !m.read }"
            @click="openMail(m.id)"
            @keydown.enter.prevent="openMail(m.id)"
          >
            <td class="muted">
              {{ formatMailWhen(m.date) }}
            </td>
            <td>{{ nameOf(m.from) }}</td>
            <td class="muted">
              {{ refsLabel(m.to) }}
            </td>
            <td>
              <span v-if="m.starred">★ </span>
              <strong v-if="!m.read">{{ m.subject }}</strong>
              <template v-else>
                {{ m.subject }}
              </template>
            </td>
            <td class="row-open">
              <button
                type="button"
                class="secondary outline"
                @click.stop="openMail(m.id)"
              >
                Open
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </article>

  <!-- Compose -->
  <article
    v-else-if="composing"
    id="main-mail-compose"
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
            ← Mail
          </button>
        </p>
        <h1 class="page-title page-title-tight">
          Compose
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
          :aria-busy="busy"
          @click="sendCompose"
        >
          Send
        </button>
      </div>
    </header>
    <p
      v-if="composeError"
      class="error"
      role="alert"
    >
      {{ composeError }}
    </p>
    <form @submit.prevent="sendCompose">
      <label>
        To
        <PlayerSelect
          v-model="composeTo"
          multiple
          :allow-empty="false"
        />
      </label>
      <label>
        Subject
        <input v-model="composeSubject">
      </label>
      <label>
        Message
        <textarea
          v-model="composeBody"
          rows="14"
        />
      </label>
    </form>
  </article>

  <!-- Detail -->
  <article
    v-else-if="selected"
    id="main-mail-detail"
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
            ← Mail
          </button>
          <span
            v-if="selected.starred"
            title="Starred"
          >★</span>
          <span
            v-if="!selected.read"
            class="badge"
          >unread</span>
          <span class="muted">{{
            selected.folder || "inbox"
          }}</span>
        </p>
        <h1 class="page-title page-title-tight">
          {{ selected.subject }}
        </h1>
        <p class="muted jobs-detail-meta">
          From {{ nameOf(selected.from) }}
          · To {{ refsLabel(selected.to) }}
          <template v-if="selected.cc?.length">
            · Cc {{ refsLabel(selected.cc) }}
          </template>
          · {{ formatMailWhen(selected.date) }}
        </p>
      </div>
      <div class="editor-actions">
        <button
          type="button"
          class="secondary outline"
          :disabled="busy"
          @click="toggleStar"
        >
          {{ selected.starred ? "Unstar" : "Star" }}
        </button>
        <button
          type="button"
          class="secondary"
          :disabled="busy"
          @click="startCompose(selected)"
        >
          Reply
        </button>
        <button
          type="button"
          class="secondary outline"
          :disabled="busy"
          @click="trashSelected"
        >
          {{
            selected.folder === "trash"
              ? "Purge"
              : "Trash"
          }}
        </button>
      </div>
    </header>
    <p
      v-if="loadError"
      class="error"
      role="alert"
    >
      {{ loadError }}
    </p>
    <pre class="mail-body">{{ selected.message }}</pre>
  </article>
</template>

<style scoped>
.row-unread td {
  font-weight: 500;
}
.mail-body {
  white-space: pre-wrap;
  word-break: break-word;
  margin: 1rem 0 0;
  padding: 1rem 1.15rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font: inherit;
  line-height: 1.5;
  max-width: 48rem;
}
.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0 0 0.75rem;
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
  text-transform: capitalize;
}
.chip.active {
  background: var(--bg-surface-2);
  color: var(--text);
  border-color: var(--border-strong, var(--border));
}
</style>
