<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, type Board, type Post } from "../api";
import { signOut } from "../session";

const props = defineProps<{
  boardId?: string;
  postNum?: string;
}>();

const route = useRoute();
const router = useRouter();

const boards = ref<Board[]>([]);
const loadError = ref("");
const q = ref("");
const selectedId = ref("");
const posts = ref<Post[]>([]);
const postsTotal = ref(0);
const postsLoading = ref(false);
const postDetail = ref<Post | null>(null);
const postLoading = ref(false);
const busy = ref(false);
const paneTab = ref<"posts" | "settings">("posts");
const msg = ref("");
const err = ref("");

const composing = ref(false);
const newSubject = ref("");
const newBody = ref("");
const newSticky = ref(false);

const creating = ref(false);
const createTitle = ref("");
const createCat = ref("General");

type Form = {
  title: string;
  category: string;
  type: string;
  readLock: string;
  writeLock: string;
  timeout: string;
  anonymous: boolean;
  moderators: string;
  webhookUrl: string;
};
const form = ref<Form | null>(null);
const dirty = ref(false);
const snap = ref("");

const selected = computed(() =>
  boards.value.find((b) => b.id === selectedId.value) ?? null
);

const rows = computed(() => {
  const needle = q.value.trim().toLowerCase();
  let list = [...boards.value];
  if (needle) {
    list = list.filter((b) =>
      `${b.title} ${b.category} ${b.num} ${b.id}`
        .toLowerCase()
        .includes(needle)
    );
  }
  return list.sort((a, b) => a.num - b.num);
});

function formFrom(b: Board): Form {
  return {
    title: b.title ?? "",
    category: b.category || "General",
    type: b.type || "normal",
    readLock: b.readLock || "all()",
    writeLock: b.writeLock || "all()",
    timeout: String(b.timeout ?? 0),
    anonymous: Boolean(b.anonymous),
    moderators: (b.moderators ?? []).join(" "),
    webhookUrl: b.webhookUrl ?? "",
  };
}

function touchForm(): void {
  if (!form.value) return;
  dirty.value = JSON.stringify(form.value) !== snap.value;
}

function formatWhen(ts?: number): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

async function loadBoards(): Promise<void> {
  loadError.value = "";
  const { res, data } = await api<Board[] | { error?: string }>(
    "/api/v1/boards",
  );
  if (res.status === 401) {
    signOut();
    await router.replace({ name: "login" });
    return;
  }
  if (!res.ok) {
    loadError.value =
      (data as { error?: string })?.error ||
      `Boards failed (${res.status})`;
    return;
  }
  boards.value = Array.isArray(data) ? data : [];
}

async function loadPosts(b: Board): Promise<void> {
  postsLoading.value = true;
  try {
    const enc = encodeURIComponent(b.id);
    const { res, data } = await api<{
      total?: number;
      posts?: Post[];
      error?: string;
    }>(`/api/v1/boards/${enc}/posts?limit=200&offset=0`);
    if (!res.ok) {
      err.value = data?.error || `Posts failed (${res.status})`;
      posts.value = [];
      return;
    }
    posts.value = data?.posts ?? [];
    postsTotal.value = data?.total ?? posts.value.length;
  } finally {
    postsLoading.value = false;
  }
}

async function openBoard(id: string): Promise<void> {
  if (dirty.value && !confirm("Discard board edits?")) return;
  err.value = "";
  msg.value = "";
  composing.value = false;
  postDetail.value = null;
  paneTab.value = "posts";

  let b = boards.value.find((x) => x.id === id);
  if (!b) {
    const enc = encodeURIComponent(id);
    const { res, data } = await api<Board & { error?: string }>(
      `/api/v1/boards/${enc}`,
    );
    if (!res.ok || !data?.id) {
      err.value = data?.error || "Board not found";
      return;
    }
    b = data;
    const i = boards.value.findIndex((x) => x.id === b!.id);
    if (i >= 0) boards.value[i] = b;
    else boards.value.push(b);
  }
  selectedId.value = b.id;
  form.value = formFrom(b);
  snap.value = JSON.stringify(form.value);
  dirty.value = false;
  await loadPosts(b);
  if (String(route.params.boardId) !== b.id) {
    void router.replace({
      name: "board",
      params: { boardId: b.id },
    });
  }
}

async function openPost(num: number): Promise<void> {
  const b = selected.value;
  if (!b) return;
  postLoading.value = true;
  composing.value = false;
  try {
    const enc = encodeURIComponent(b.id);
    const { res, data } = await api<Post & { error?: string }>(
      `/api/v1/boards/${enc}/posts/${num}`,
    );
    if (!res.ok) {
      err.value = data?.error || `Post failed (${res.status})`;
      return;
    }
    postDetail.value = data;
    void router.replace({
      name: "post",
      params: { boardId: b.id, postNum: String(num) },
    });
  } finally {
    postLoading.value = false;
  }
}

function clearBoard(): void {
  if (dirty.value && !confirm("Discard board edits?")) return;
  selectedId.value = "";
  form.value = null;
  postDetail.value = null;
  posts.value = [];
  dirty.value = false;
  void router.replace({ name: "home" });
}

async function saveBoard(): Promise<void> {
  const b = selected.value;
  const f = form.value;
  if (!b || !f || !dirty.value) return;
  busy.value = true;
  err.value = "";
  try {
    const enc = encodeURIComponent(b.id);
    const { res, data } = await api<Board & { error?: string }>(
      `/api/v1/boards/${enc}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          title: f.title.trim(),
          category: f.category.trim() || "General",
          type: f.type === "archive" ? "archive" : "normal",
          readLock: f.readLock.trim() || "all()",
          writeLock: f.writeLock.trim() || "all()",
          timeout: Number(f.timeout) || 0,
          anonymous: f.anonymous,
          moderators: f.moderators,
          webhookUrl: f.webhookUrl.trim() || undefined,
        }),
      },
    );
    if (!res.ok) {
      err.value = data?.error || `Save failed (${res.status})`;
      return;
    }
    const next = { ...b, ...data };
    const i = boards.value.findIndex((x) => x.id === b.id);
    if (i >= 0) boards.value[i] = next;
    form.value = formFrom(next);
    snap.value = JSON.stringify(form.value);
    dirty.value = false;
    msg.value = "Board saved.";
  } finally {
    busy.value = false;
  }
}

async function createBoard(): Promise<void> {
  const title = createTitle.value.trim();
  if (!title) return;
  busy.value = true;
  err.value = "";
  try {
    const { res, data } = await api<Board & { error?: string }>(
      "/api/v1/boards",
      {
        method: "POST",
        body: JSON.stringify({
          name: title,
          category: createCat.value.trim() || "General",
        }),
      },
    );
    if (!res.ok) {
      err.value = data?.error || `Create failed (${res.status})`;
      return;
    }
    createTitle.value = "";
    creating.value = false;
    await loadBoards();
    if (data?.id) await openBoard(data.id);
  } finally {
    busy.value = false;
  }
}

async function deleteBoard(): Promise<void> {
  const b = selected.value;
  if (!b) return;
  if (!confirm(`Delete board "${b.title}" and all posts?`)) {
    return;
  }
  busy.value = true;
  try {
    const enc = encodeURIComponent(b.id);
    const { res, data } = await api<{ error?: string }>(
      `/api/v1/boards/${enc}`,
      { method: "DELETE" },
    );
    if (!res.ok && res.status !== 204) {
      err.value = data?.error || `Delete failed (${res.status})`;
      return;
    }
    dirty.value = false;
    boards.value = boards.value.filter((x) => x.id !== b.id);
    clearBoard();
  } finally {
    busy.value = false;
  }
}

async function createPost(): Promise<void> {
  const b = selected.value;
  if (!b || b.type === "archive") return;
  const subject = newSubject.value.trim();
  const body = newBody.value.trim();
  if (!subject || !body) {
    err.value = "Subject and body required.";
    return;
  }
  busy.value = true;
  err.value = "";
  try {
    const enc = encodeURIComponent(b.id);
    const { res, data } = await api<Post & { error?: string }>(
      `/api/v1/boards/${enc}/posts`,
      {
        method: "POST",
        body: JSON.stringify({ subject, body }),
      },
    );
    if (!res.ok || !data?.num) {
      err.value = data?.error || `Post failed (${res.status})`;
      return;
    }
    if (newSticky.value) {
      await api(`/api/v1/boards/${enc}/posts/${data.num}`, {
        method: "PATCH",
        body: JSON.stringify({ sticky: true }),
      });
    }
    composing.value = false;
    newSubject.value = "";
    newBody.value = "";
    newSticky.value = false;
    await loadPosts(b);
    await openPost(data.num);
  } finally {
    busy.value = false;
  }
}

async function toggleSticky(p: Post): Promise<void> {
  const b = selected.value;
  if (!b) return;
  busy.value = true;
  try {
    const enc = encodeURIComponent(b.id);
    const { res, data } = await api<Post & { error?: string }>(
      `/api/v1/boards/${enc}/posts/${p.num}`,
      {
        method: "PATCH",
        body: JSON.stringify({ sticky: !p.sticky }),
      },
    );
    if (!res.ok) {
      err.value = data?.error || `Sticky failed (${res.status})`;
      return;
    }
    await loadPosts(b);
    if (postDetail.value?.num === p.num) {
      postDetail.value = { ...postDetail.value, ...data };
    }
  } finally {
    busy.value = false;
  }
}

async function deletePost(p: Post): Promise<void> {
  const b = selected.value;
  if (!b) return;
  if (!confirm(`Delete post #${p.num}?`)) return;
  busy.value = true;
  try {
    const enc = encodeURIComponent(b.id);
    const { res, data } = await api<{ error?: string }>(
      `/api/v1/boards/${enc}/posts/${p.num}`,
      { method: "DELETE" },
    );
    if (!res.ok && res.status !== 204) {
      err.value = data?.error || `Delete failed (${res.status})`;
      return;
    }
    postDetail.value = null;
    await loadPosts(b);
  } finally {
    busy.value = false;
  }
}

watch(
  () => [props.boardId, props.postNum] as const,
  async ([id, pn]) => {
    if (id) {
      await openBoard(String(id));
      if (pn) await openPost(Number(pn));
    }
  },
);

onMounted(async () => {
  await loadBoards();
  if (props.boardId) {
    await openBoard(String(props.boardId));
    if (props.postNum) await openPost(Number(props.postNum));
  }
});
</script>

<template>
  <article id="main-bbs">
    <header class="page-head">
      <div>
        <p class="dash-kicker">
          Bulletin boards
        </p>
        <h1 class="page-title">
          BBS
          <span class="muted">({{ boards.length }})</span>
        </h1>
        <p class="lede muted">
          Moderate boards and posts — shared session with
          the staff console.
        </p>
      </div>
      <div class="page-actions">
        <button
          type="button"
          class="outline"
          @click="creating = !creating"
        >
          {{ creating ? "Cancel" : "New board" }}
        </button>
        <button
          type="button"
          class="outline"
          @click="loadBoards"
        >
          Refresh
        </button>
      </div>
    </header>

    <p class="summary muted">
      <strong>{{ boards.length }}</strong> boards
      ·
      <strong>{{
        boards.reduce((n, b) => n + (b.postCount ?? 0), 0)
      }}</strong> posts
      ·
      <strong>{{
        boards.reduce((n, b) => n + (b.flaggedCount ?? 0), 0)
      }}</strong> flagged
    </p>

    <div class="toolbar">
      <input
        v-model="q"
        type="search"
        placeholder="Search boards…"
        aria-label="Search boards"
      >
    </div>

    <div
      v-if="creating"
      class="create-row"
    >
      <input
        v-model="createTitle"
        placeholder="Board title"
        @keydown.enter.prevent="createBoard"
      >
      <input
        v-model="createCat"
        placeholder="Category"
      >
      <button
        type="button"
        class="primary"
        :disabled="busy || !createTitle.trim()"
        @click="createBoard"
      >
        Create
      </button>
    </div>

    <p
      v-if="loadError || err"
      class="error"
      role="alert"
    >
      {{ loadError || err }}
    </p>
    <p
      v-if="msg"
      class="muted"
    >
      {{ msg }}
    </p>

    <section class="list">
      <p
        v-if="!rows.length"
        class="empty muted"
      >
        No boards.
      </p>
      <button
        v-for="b in rows"
        :key="b.id"
        type="button"
        class="row"
        :class="{ active: selectedId === b.id }"
        @click="openBoard(b.id)"
      >
        <code class="num">#{{ b.num }}</code>
        <span class="main">
          <span class="title">{{ b.title }}</span>
          <span class="meta muted">
            {{ b.category || "General" }}
            · {{ b.postCount ?? 0 }} posts
          </span>
        </span>
        <span
          v-if="b.type === 'archive'"
          class="badge"
        >archive</span>
      </button>
    </section>

    <aside
      v-if="selected && form"
      class="pane"
    >
      <header class="pane-head">
        <button
          type="button"
          class="ghost linkish"
          @click="clearBoard"
        >
          ← Close
        </button>
        <h2>
          #{{ selected.num }} · {{ form.title }}
          <span
            v-if="dirty"
            class="dot"
          >●</span>
        </h2>
        <div class="tabs">
          <button
            type="button"
            :class="{ active: paneTab === 'posts' }"
            @click="paneTab = 'posts'"
          >
            Posts ({{ postsTotal }})
          </button>
          <button
            type="button"
            :class="{ active: paneTab === 'settings' }"
            @click="paneTab = 'settings'"
          >
            Settings
          </button>
        </div>
      </header>

      <form
        v-if="paneTab === 'settings'"
        @submit.prevent="saveBoard"
      >
        <div class="grid2">
          <label>
            Title
            <input
              v-model="form.title"
              @input="touchForm"
            >
          </label>
          <label>
            Category
            <input
              v-model="form.category"
              @input="touchForm"
            >
          </label>
        </div>
        <div class="grid2">
          <label>
            Type
            <select
              v-model="form.type"
              @change="touchForm"
            >
              <option value="normal">
                normal
              </option>
              <option value="archive">
                archive
              </option>
            </select>
          </label>
          <label>
            Timeout (days)
            <input
              v-model="form.timeout"
              type="number"
              min="0"
              @input="touchForm"
            >
          </label>
        </div>
        <div class="grid2">
          <label>
            Read lock
            <input
              v-model="form.readLock"
              @input="touchForm"
            >
          </label>
          <label>
            Write lock
            <input
              v-model="form.writeLock"
              @input="touchForm"
            >
          </label>
        </div>
        <label class="check">
          <input
            v-model="form.anonymous"
            type="checkbox"
            @change="touchForm"
          >
          Anonymous
        </label>
        <label>
          Moderators (ids)
          <input
            v-model="form.moderators"
            placeholder="12 45"
            @input="touchForm"
          >
        </label>
        <label>
          Webhook URL
          <input
            v-model="form.webhookUrl"
            @input="touchForm"
          >
        </label>
        <div class="actions">
          <button
            type="submit"
            class="primary"
            :disabled="!dirty || busy"
          >
            Save board
          </button>
          <button
            type="button"
            class="ghost"
            :disabled="busy"
            @click="deleteBoard"
          >
            Delete
          </button>
        </div>
      </form>

      <div v-else>
        <div class="actions">
          <button
            v-if="selected.type !== 'archive' && !composing"
            type="button"
            class="primary"
            @click="composing = true; postDetail = null"
          >
            New post
          </button>
          <span
            v-else-if="selected.type === 'archive'"
            class="muted"
          >Archive — read only</span>
        </div>

        <form
          v-if="composing"
          class="compose"
          @submit.prevent="createPost"
        >
          <label>
            Subject
            <input
              v-model="newSubject"
              required
            >
          </label>
          <label>
            Body
            <textarea
              v-model="newBody"
              required
              rows="8"
            />
          </label>
          <label class="check">
            <input
              v-model="newSticky"
              type="checkbox"
            >
            Sticky
          </label>
          <div class="actions">
            <button
              type="button"
              class="ghost"
              @click="composing = false"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="primary"
              :disabled="busy"
            >
              Post
            </button>
          </div>
        </form>

        <p
          v-if="postsLoading"
          class="muted"
        >
          Loading…
        </p>
        <p
          v-else-if="!posts.length && !composing"
          class="muted"
        >
          No posts.
        </p>
        <button
          v-for="p in posts"
          :key="p.id"
          type="button"
          class="row"
          :class="{ active: postDetail?.num === p.num }"
          @click="openPost(p.num)"
        >
          <code class="num">#{{ p.num }}</code>
          <span class="main">
            <span class="title">
              <span v-if="p.sticky">📌 </span>{{ p.subject }}
            </span>
            <span class="meta muted">
              {{ p.authorName }} · {{ formatWhen(p.createdAt) }}
            </span>
          </span>
        </button>

        <section
          v-if="postDetail"
          class="detail"
        >
          <h3>
            <span v-if="postDetail.sticky">📌 </span>
            #{{ postDetail.num }} — {{ postDetail.subject }}
          </h3>
          <p class="muted meta">
            {{ postDetail.authorName }}
            · {{ formatWhen(postDetail.createdAt) }}
          </p>
          <div class="actions">
            <button
              type="button"
              class="ghost"
              :disabled="busy"
              @click="toggleSticky(postDetail)"
            >
              {{ postDetail.sticky ? "Unsticky" : "Sticky" }}
            </button>
            <button
              type="button"
              class="ghost"
              :disabled="busy"
              @click="deletePost(postDetail)"
            >
              Delete
            </button>
          </div>
          <pre class="body">{{ postDetail.body }}</pre>
          <div
            v-if="postDetail.replies?.length"
            class="replies"
          >
            <h4>Replies ({{ postDetail.replies.length }})</h4>
            <article
              v-for="r in postDetail.replies"
              :key="r.num"
              class="reply"
            >
              <p class="muted meta">
                #{{ r.num }} · {{ r.authorName }}
                · {{ formatWhen(r.createdAt) }}
              </p>
              <pre class="body">{{ r.body }}</pre>
            </article>
          </div>
        </section>
      </div>
    </aside>
  </article>
</template>

<style scoped>
.page-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.85rem 1.25rem;
  margin-bottom: 0.75rem;
}
.lede {
  margin: 0.35rem 0 0;
  font-size: 0.875rem;
  max-width: 36rem;
}
.page-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  align-items: flex-start;
}
.summary {
  margin: 0 0 0.85rem;
  font-size: 0.8125rem;
}
.summary strong {
  color: var(--text);
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.85rem;
}
.toolbar input[type="search"] {
  flex: 1 1 12rem;
  min-width: 0;
}
.create-row {
  display: grid;
  grid-template-columns: 1fr 8rem auto;
  gap: 0.5rem;
  margin-bottom: 0.85rem;
}
@media (max-width: 600px) {
  .create-row {
    grid-template-columns: 1fr;
  }
}
.list,
.pane {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-surface);
  margin-bottom: 0.85rem;
}
.list {
  max-height: min(40vh, 22rem);
  overflow: auto;
}
.empty {
  padding: 1.25rem;
  text-align: center;
}
.row {
  display: grid;
  grid-template-columns: 2.75rem minmax(0, 1fr) auto;
  gap: 0.5rem 0.75rem;
  align-items: center;
  width: 100%;
  text-align: left;
  border: none;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  background: transparent;
  padding: 0.7rem 0.85rem;
  min-height: 0;
}
.row:last-child {
  border-bottom: none;
}
.row:hover,
.row.active {
  background: var(--bg-surface-2);
}
.num {
  color: var(--text-muted);
  font-size: 0.8125rem;
}
.main {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}
.title {
  font-weight: 550;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta {
  font-size: 0.75rem;
}
.pane {
  padding: 1rem 1.1rem 1.25rem;
}
.pane-head h2 {
  margin: 0.35rem 0 0.65rem;
  font-size: 1.1rem;
}
.dot {
  color: var(--primary);
  font-size: 0.75rem;
}
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.85rem;
}
.tabs button {
  border-radius: 999px;
  background: transparent;
}
.tabs button.active {
  background: var(--bg-surface-2);
  border-color: var(--border-strong);
}
.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem 0.75rem;
}
@media (max-width: 600px) {
  .grid2 {
    grid-template-columns: 1fr;
  }
}
.check {
  flex-direction: row !important;
  align-items: center;
  gap: 0.5rem;
}
.check input {
  width: auto;
  min-height: 0;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin: 0.5rem 0 0.75rem;
}
.linkish {
  border: none;
  padding: 0;
  min-height: 0;
  color: var(--primary);
  background: transparent;
}
.compose {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.85rem;
  margin-bottom: 0.85rem;
  background: var(--bg-elevated);
}
.detail {
  margin-top: 0.85rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--border);
}
.detail h3 {
  margin: 0.25rem 0;
  font-size: 1rem;
}
.body {
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--bg-code);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.75rem;
  font-size: 0.8125rem;
  max-height: 16rem;
  overflow: auto;
  margin: 0.5rem 0;
}
.reply {
  margin-bottom: 0.65rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-code);
}
.reply .body {
  border: none;
  padding: 0;
  margin: 0.25rem 0 0;
  max-height: 8rem;
}
</style>
