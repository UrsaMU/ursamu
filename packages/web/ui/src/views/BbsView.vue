<script setup lang="ts">
/**
 * In-console BBS — wiki visual language:
 * dash-header, pages-toolbar, dash-table list;
 * board detail mirrors wiki-edit (editor-header + form/table).
 */
import { computed, onMounted, ref, watch } from "vue";
import {
  onBeforeRouteLeave,
  useRoute,
  useRouter,
} from "vue-router";
import { storeToRefs } from "pinia";
import { api } from "@/api/client";
import type {
  BbsBoard,
  BbsPost,
  BbsPostsResponse,
} from "@/api/types";
import { useLiveStore } from "@/stores/live";
import PlayerSelect from "@/components/PlayerSelect.vue";
import CategoryCombobox from "@/components/CategoryCombobox.vue";
import { mergeLockSuggestions } from "@/utils/locks";
import { stripMushCodes } from "@/utils/text";

const props = defineProps<{
  boardId?: string;
  postNum?: string;
}>();

const live = useLiveStore();
const {
  boards,
  boardsLoaded,
  boardCount,
  boardPostTotal,
  boardFlaggedTotal,
  bbsCategories,
  staffNav,
} = storeToRefs(live);

const route = useRoute();
const router = useRouter();

/** Title/lede from plugin registerStaffNav — not host hardcodes. */
const pluginMeta = computed(() => {
  const hit = staffNav.value.find((p) => p.id === "bbs");
  return {
    title: hit?.label?.trim() || "Boards",
    lede: hit?.description?.trim() ||
      "Browse boards — filters live in the side nav.",
  };
});

const q = ref("");
const catFilter = ref("");
const selectedKey = ref("");
const posts = ref<BbsPost[]>([]);
const postsLoading = ref(false);
const postDetail = ref<BbsPost | null>(null);
const postLoading = ref(false);
const loadError = ref("");
const saveError = ref("");
const saveOk = ref("");
const busy = ref(false);
const creating = ref(false);
const newTitle = ref("");
const newCategory = ref("General");
const paneTab = ref<"settings" | "posts">("posts");
const composing = ref(false);
const newPostSubject = ref("");
const newPostBody = ref("");
const newPostSticky = ref(false);
const postError = ref("");
const replyBody = ref("");
const replyBusy = ref(false);

type BoardForm = {
  title: string;
  category: string;
  type: string;
  readLock: string;
  writeLock: string;
  timeout: string;
  anonymous: boolean;
  moderators: string[];
  webhookUrl: string;
};

const boardForm = ref<BoardForm | null>(null);
const boardSnap = ref("");
const boardDirty = computed(() => {
  if (!boardForm.value) return false;
  return JSON.stringify(boardForm.value) !== boardSnap.value;
});

const selectedBoard = computed((): BbsBoard | null => {
  if (!selectedKey.value) return null;
  return live.getBoard(selectedKey.value) ?? null;
});

const showList = computed(
  () => !selectedKey.value || !boardForm.value,
);

watch(
  () => route.query.cat,
  (c) => {
    catFilter.value = typeof c === "string" ? c : "";
  },
  { immediate: true },
);

const filterBits = computed(() => {
  const bits: string[] = [];
  if (catFilter.value) bits.push(`category “${catFilter.value}”`);
  return bits;
});

/** Categories for create/edit autocomplete (always include General). */
const categoryOptions = computed(() => {
  const set = new Set<string>(["General"]);
  for (const c of bbsCategories.value) {
    const t = String(c ?? "").trim();
    if (t) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
});

/** Read/write lock suggestions: presets + locks already on boards. */
const lockOptions = computed(() => {
  const used: string[] = [];
  for (const b of boards.value) {
    if (b.readLock) used.push(String(b.readLock));
    if (b.writeLock) used.push(String(b.writeLock));
  }
  return mergeLockSuggestions(used);
});

const rows = computed(() => {
  let list = [...boards.value];
  if (catFilter.value) {
    list = list.filter(
      (b) => String(b.category || "General") === catFilter.value,
    );
  }
  const needle = q.value.trim().toLowerCase();
  if (needle) {
    list = list.filter((o) =>
      [
        o.title,
        o.category,
        o.id,
        o.num,
        o.readLock,
        o.writeLock,
      ]
        .map((x) => String(x ?? "").toLowerCase())
        .join(" ")
        .includes(needle)
    );
  }
  return list.sort((a, b) => a.num - b.num);
});

function formFromBoard(b: BbsBoard): BoardForm {
  return {
    title: String(b.title ?? ""),
    category: String(b.category || "General"),
    type: String(b.type || "normal"),
    readLock: String(b.readLock ?? "all()"),
    writeLock: String(b.writeLock ?? "all()"),
    timeout: String(b.timeout ?? 0),
    anonymous: Boolean(b.anonymous),
    moderators: [...(b.moderators ?? [])].map(String),
    webhookUrl: String(b.webhookUrl ?? ""),
  };
}

function markClean(f: BoardForm): void {
  boardSnap.value = JSON.stringify(f);
}

function confirmLeave(msg: string): boolean {
  if (!boardDirty.value) return true;
  return confirm(msg);
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

/** Job-bridge subjects often start with "#3 — …"; avoid double #. */
function displaySubject(subject: string, num: number): string {
  const s = stripMushCodes(String(subject ?? "")).trim();
  const re = new RegExp(
    `^#?\\s*${num}\\s*[—–\\-:]\\s*`,
    "i",
  );
  const stripped = s.replace(re, "").trim();
  return stripped || s;
}

/** Post/reply body for web — no %c sheet codes. */
function displayBody(body: unknown): string {
  return stripMushCodes(body);
}

function clearFilters(): void {
  q.value = "";
  void router.replace({ name: "bbs", query: {} });
}

async function fetchBoards(): Promise<void> {
  loadError.value = "";
  const { res, data } = await api<
    BbsBoard[] | { error?: string }
  >("/api/v1/boards");
  if (res.status === 401) {
    await router.replace({ name: "login" });
    return;
  }
  if (!res.ok) {
    loadError.value =
      (data as { error?: string })?.error ||
      `Boards failed (${res.status})`;
    return;
  }
  if (Array.isArray(data)) {
    for (const b of data) live.upsertBoard(b);
  }
}

async function loadPosts(board: BbsBoard): Promise<void> {
  postsLoading.value = true;
  postError.value = "";
  try {
    const enc = encodeURIComponent(board.id);
    const { res, data } = await api<
      BbsPostsResponse & { error?: string }
    >(`/api/v1/boards/${enc}/posts?limit=200&offset=0`);
    if (!res.ok) {
      postError.value =
        data?.error || `Posts failed (${res.status})`;
      posts.value = [];
      return;
    }
    posts.value = data?.posts ?? [];
  } finally {
    postsLoading.value = false;
  }
}

async function loadPostDetail(
  board: BbsBoard,
  num: number,
): Promise<void> {
  postLoading.value = true;
  try {
    const enc = encodeURIComponent(board.id);
    const { res, data } = await api<
      BbsPost & { error?: string }
    >(`/api/v1/boards/${enc}/posts/${num}`);
    if (!res.ok) {
      postError.value =
        data?.error || `Post failed (${res.status})`;
      postDetail.value = null;
      return;
    }
    postDetail.value = data;
  } finally {
    postLoading.value = false;
  }
}

async function openBoard(
  key: string,
  opts: { fromRoute?: boolean } = {},
): Promise<void> {
  if (!confirmLeave("Discard board edits?")) return;
  loadError.value = "";
  saveError.value = "";
  saveOk.value = "";
  composing.value = false;
  postDetail.value = null;
  paneTab.value = "posts";

  let b = live.getBoard(key);
  if (!b) {
    const enc = encodeURIComponent(key);
    const { res, data } = await api<
      BbsBoard & { error?: string }
    >(`/api/v1/boards/${enc}`);
    if (!res.ok || !data?.id) {
      loadError.value = data?.error || "Board not found.";
      return;
    }
    live.upsertBoard(data);
    b = live.getBoard(data.id) ?? data;
  }
  if (!b) return;

  selectedKey.value = b.id;
  const f = formFromBoard(b);
  boardForm.value = f;
  markClean(f);
  await loadPosts(b);

  if (
    !opts.fromRoute &&
    String(route.params.boardId) !== b.id
  ) {
    void router.replace({
      name: "bbs-board",
      params: { boardId: b.id },
      query: route.query,
    });
  }
}

async function openPost(num: number): Promise<void> {
  const b = selectedBoard.value;
  if (!b) return;
  paneTab.value = "posts";
  await loadPostDetail(b, num);
  if (String(route.params.postNum) !== String(num)) {
    void router.replace({
      name: "bbs-post",
      params: { boardId: b.id, postNum: String(num) },
      query: route.query,
    });
  }
}

function clearPost(): void {
  postDetail.value = null;
  const b = selectedBoard.value;
  if (b && route.name === "bbs-post") {
    void router.replace({
      name: "bbs-board",
      params: { boardId: b.id },
      query: route.query,
    });
  }
}

function clearBoard(): void {
  if (!confirmLeave("Discard board edits?")) return;
  selectedKey.value = "";
  postDetail.value = null;
  boardForm.value = null;
  posts.value = [];
  void router.replace({ name: "bbs", query: route.query });
}

function resetBoardForm(): void {
  const b = selectedBoard.value;
  if (!b) return;
  const f = formFromBoard(b);
  boardForm.value = f;
  markClean(f);
}

async function saveBoard(): Promise<void> {
  const b = selectedBoard.value;
  const f = boardForm.value;
  if (!b || !f || !boardDirty.value) return;
  busy.value = true;
  saveError.value = "";
  saveOk.value = "";
  try {
    const enc = encodeURIComponent(b.id);
    const { res, data } = await api<
      BbsBoard & { error?: string }
    >(`/api/v1/boards/${enc}`, {
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
    });
    if (!res.ok) {
      saveError.value =
        data?.error || `Save failed (${res.status})`;
      return;
    }
    live.upsertBoard({ ...b, ...data });
    const next = formFromBoard(live.getBoard(b.id) ?? b);
    boardForm.value = next;
    markClean(next);
    saveOk.value = "Saved.";
  } finally {
    busy.value = false;
  }
}

async function createBoard(): Promise<void> {
  const title = newTitle.value.trim();
  if (!title) return;
  busy.value = true;
  saveError.value = "";
  try {
    const { res, data } = await api<
      BbsBoard & { error?: string }
    >("/api/v1/boards", {
      method: "POST",
      body: JSON.stringify({
        name: title,
        category: newCategory.value.trim() || "General",
      }),
    });
    if (!res.ok || !data?.id) {
      saveError.value =
        data?.error || `Create failed (${res.status})`;
      return;
    }
    live.upsertBoard(data);
    newTitle.value = "";
    newCategory.value = "General";
    creating.value = false;
    await openBoard(data.id);
  } finally {
    busy.value = false;
  }
}

async function deleteBoard(): Promise<void> {
  const b = selectedBoard.value;
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
      saveError.value =
        data?.error || `Delete failed (${res.status})`;
      return;
    }
    live.removeBoard(b.id);
    boardForm.value = null;
    selectedKey.value = "";
    void router.replace({ name: "bbs", query: route.query });
  } finally {
    busy.value = false;
  }
}

async function createPost(): Promise<void> {
  const b = selectedBoard.value;
  if (!b || b.type === "archive") {
    postError.value = "Archive boards are read-only.";
    return;
  }
  const subject = newPostSubject.value.trim();
  const body = newPostBody.value.trim();
  if (!subject || !body) {
    postError.value = "Subject and body required.";
    return;
  }
  busy.value = true;
  postError.value = "";
  try {
    const enc = encodeURIComponent(b.id);
    const { res, data } = await api<
      BbsPost & { error?: string }
    >(`/api/v1/boards/${enc}/posts`, {
      method: "POST",
      body: JSON.stringify({ subject, body }),
    });
    if (!res.ok || !data?.num) {
      postError.value =
        data?.error || `Post failed (${res.status})`;
      return;
    }
    if (newPostSticky.value) {
      await api(`/api/v1/boards/${enc}/posts/${data.num}`, {
        method: "PATCH",
        body: JSON.stringify({ sticky: true }),
      });
    }
    composing.value = false;
    newPostSubject.value = "";
    newPostBody.value = "";
    newPostSticky.value = false;
    live.upsertBoard({
      ...b,
      postCount: (Number(b.postCount) || 0) + 1,
    });
    await loadPosts(b);
    await openPost(data.num);
  } finally {
    busy.value = false;
  }
}

async function toggleSticky(p: BbsPost): Promise<void> {
  const b = selectedBoard.value;
  if (!b) return;
  busy.value = true;
  try {
    const enc = encodeURIComponent(b.id);
    const { res, data } = await api<
      BbsPost & { error?: string }
    >(`/api/v1/boards/${enc}/posts/${p.num}`, {
      method: "PATCH",
      body: JSON.stringify({ sticky: !p.sticky }),
    });
    if (!res.ok) {
      postError.value =
        data?.error || `Sticky failed (${res.status})`;
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

async function deletePost(p: BbsPost): Promise<void> {
  const b = selectedBoard.value;
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
      postError.value =
        data?.error || `Delete failed (${res.status})`;
      return;
    }
    postDetail.value = null;
    await loadPosts(b);
  } finally {
    busy.value = false;
  }
}

async function createReply(): Promise<void> {
  const b = selectedBoard.value;
  const p = postDetail.value;
  if (!b || !p) return;
  if (b.type === "archive") {
    postError.value = "Archive boards are read-only.";
    return;
  }
  const body = replyBody.value.trim();
  if (!body) {
    postError.value = "Reply body required.";
    return;
  }
  replyBusy.value = true;
  postError.value = "";
  try {
    const enc = encodeURIComponent(b.id);
    const { res, data } = await api<
      { num?: number; error?: string }
    >(`/api/v1/boards/${enc}/posts/${p.num}/replies`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
    if (!res.ok) {
      postError.value =
        data?.error || `Reply failed (${res.status})`;
      return;
    }
    replyBody.value = "";
    await loadPostDetail(b, p.num);
    await loadPosts(b);
  } finally {
    replyBusy.value = false;
  }
}

watch(
  () => [
    props.boardId ?? route.params.boardId,
    props.postNum ?? route.params.postNum,
    route.name,
  ] as const,
  async ([id, pn, name]) => {
    if (id) {
      await openBoard(String(id), { fromRoute: true });
      if (pn) await openPost(Number(pn));
      else if (name !== "bbs-post") {
        postDetail.value = null;
      }
    } else if (name === "bbs") {
      selectedKey.value = "";
      postDetail.value = null;
      boardForm.value = null;
      posts.value = [];
    }
  },
  { immediate: true },
);

onBeforeRouteLeave(() =>
  confirmLeave("Discard board edits?"),
);

onMounted(() => {
  void fetchBoards();
});
</script>

<template>
  <!-- ── Board list (wiki browser language) ─────────────────── -->
  <article
    v-if="showList"
    id="main-bbs"
    class="dash-browser"
  >
    <header class="dash-header">
      <div>
        <p class="muted dash-kicker">
          Plugin
        </p>
        <h1 class="page-title">
          {{ pluginMeta.title }}
          <span class="muted">
            ({{ rows.length }}{{
              rows.length !== boardCount && boardsLoaded
                ? ` of ${boardCount}`
                : ""
            }})
          </span>
        </h1>
        <p class="muted">
          {{ pluginMeta.lede }}
        </p>
        <p
          v-if="boardsLoaded"
          class="muted bbs-stat-line"
        >
          <strong>{{ boardCount }}</strong> boards
          · <strong>{{ boardPostTotal }}</strong> posts
          · <strong>{{ boardFlaggedTotal }}</strong> flagged
        </p>
      </div>
      <div class="dash-header-actions">
        <button
          type="button"
          @click="creating = !creating"
        >
          {{ creating ? "Cancel" : "New board" }}
        </button>
        <button
          type="button"
          class="secondary outline"
          @click="fetchBoards"
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
      v-if="creating"
      class="pages-toolbar bbs-create"
      aria-label="Create board"
    >
      <p class="bbs-create-title">
        New board
      </p>
      <label class="bbs-create-field">
        Title
        <input
          v-model="newTitle"
          type="text"
          placeholder="e.g. Player Announcements"
          maxlength="120"
          autocomplete="off"
          @keydown.enter.prevent="createBoard"
        >
      </label>
      <label class="bbs-create-field">
        Category
        <CategoryCombobox
          id="bbs-create-category"
          v-model="newCategory"
          :options="categoryOptions"
          placeholder="Pick existing or type new"
          :disabled="busy"
        />
      </label>
      <p class="muted bbs-create-hint">
        Categories group boards in the side nav. Open the
        list to reuse one, or type a new name.
      </p>
      <div class="action-row">
        <button
          type="button"
          class="secondary outline"
          :disabled="busy"
          @click="creating = false"
        >
          Cancel
        </button>
        <button
          type="button"
          :disabled="busy || !newTitle.trim()"
          :aria-busy="busy"
          @click="createBoard"
        >
          Create board
        </button>
      </div>
    </section>

    <section
      class="pages-toolbar"
      aria-label="Search boards"
    >
      <label class="pages-search-label">
        <span class="sr-only">Search boards</span>
        <input
          v-model="q"
          type="search"
          placeholder="Search title, category, lock…"
          autocomplete="off"
        >
      </label>
    </section>

    <p
      v-if="loadError || saveError"
      class="error"
      role="alert"
    >
      {{ loadError || saveError }}
    </p>

    <div class="table-wrap">
      <table class="dash-table">
        <thead>
          <tr>
            <th scope="col">
              #
            </th>
            <th scope="col">
              Title
            </th>
            <th scope="col">
              Category
            </th>
            <th scope="col">
              Type
            </th>
            <th scope="col">
              Posts
            </th>
            <th scope="col">
              Read lock
            </th>
            <th scope="col">
              <span class="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!boardsLoaded && !rows.length">
            <td
              colspan="7"
              class="muted"
            >
              Loading…
            </td>
          </tr>
          <tr v-else-if="!rows.length && !boardCount">
            <td
              colspan="7"
              class="muted"
            >
              No boards yet.
              <button
                type="button"
                class="secondary"
                @click="creating = true"
              >
                Create the first board
              </button>
            </td>
          </tr>
          <tr v-else-if="!rows.length">
            <td
              colspan="7"
              class="muted"
            >
              No boards match this filter.
            </td>
          </tr>
          <tr
            v-for="b in rows"
            :key="b.id"
            tabindex="0"
            @click="openBoard(b.id)"
            @keydown.enter.prevent="openBoard(b.id)"
          >
            <td><code>#{{ b.num }}</code></td>
            <td>{{ stripMushCodes(b.title) }}</td>
            <td class="muted">
              {{ b.category || "General" }}
            </td>
            <td>
              <span
                class="badge"
                :class="b.type === 'archive'
                  ? 'badge-draft'
                  : 'badge-live'"
              >
                {{ b.type === "archive" ? "Archive" : "Live" }}
              </span>
              <span
                v-if="(b.flaggedCount ?? 0) > 0"
                class="badge badge-draft"
              >{{ b.flaggedCount }} flagged</span>
            </td>
            <td class="muted">
              {{ Number(b.postCount) || 0 }}
            </td>
            <td class="muted">
              {{ b.readLock || "all()" }}
            </td>
            <td class="row-open">
              <button
                type="button"
                class="secondary outline"
                @click.stop="openBoard(b.id)"
              >
                Open
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </article>

  <!-- ── Board detail (wiki-edit language) ──────────────────── -->
  <article
    v-else
    id="main-bbs"
    class="dash-browser"
  >
    <header class="editor-header">
      <div>
        <p class="editor-path-line">
          <button
            type="button"
            class="back-link"
            @click="clearBoard"
          >
            ← Boards
          </button>
          <code>#{{ selectedBoard?.num }}</code>
          <span
            v-if="boardDirty"
            class="dirty-dot"
            title="Unsaved changes"
            aria-label="Unsaved changes"
          >●</span>
          <small
            v-if="saveOk"
            class="muted"
          >{{ saveOk }}</small>
        </p>
        <h1 class="page-title page-title-tight">
          {{
            stripMushCodes(
              boardForm?.title || selectedBoard?.title || "",
            )
          }}
        </h1>
      </div>
      <div class="editor-actions">
        <button
          type="button"
          class="secondary outline"
          :class="{ 'pages-chip-active': paneTab === 'posts' }"
          @click="paneTab = 'posts'"
        >
          Posts
        </button>
        <button
          type="button"
          class="secondary outline"
          :class="{ 'pages-chip-active': paneTab === 'settings' }"
          @click="paneTab = 'settings'"
        >
          Settings
        </button>
        <button
          v-if="
            paneTab === 'posts' &&
              selectedBoard?.type !== 'archive'
          "
          type="button"
          @click="composing = !composing"
        >
          {{ composing ? "Cancel" : "New post" }}
        </button>
      </div>
    </header>

    <p
      v-if="loadError || saveError || postError"
      class="error"
      role="alert"
    >
      {{ loadError || saveError || postError }}
    </p>

    <!-- Settings (form, wiki-edit style) -->
    <form
      v-if="paneTab === 'settings' && boardForm"
      @submit.prevent="saveBoard"
    >
      <label>
        Title
        <input v-model="boardForm.title">
      </label>
      <div class="db-edit-grid">
        <label>
          Category
          <CategoryCombobox
            id="bbs-edit-category"
            v-model="boardForm.category"
            :options="categoryOptions"
            placeholder="Pick existing or type new"
            :disabled="busy"
          />
        </label>
        <label>
          Type
          <select v-model="boardForm.type">
            <option value="normal">
              normal
            </option>
            <option value="archive">
              archive
            </option>
          </select>
        </label>
        <label class="bbs-lock-field">
          Read lock
          <CategoryCombobox
            id="bbs-edit-read-lock"
            v-model="boardForm.readLock"
            :options="lockOptions"
            input-class="mono"
            placeholder="all() — or pick a lockfunc"
            :maxlength="256"
            :disabled="busy"
            list-label="lock suggestions"
            empty-hint="Type a lock string or open the list."
            new-hint="Custom lock:"
          />
        </label>
        <label class="bbs-lock-field">
          Write lock
          <CategoryCombobox
            id="bbs-edit-write-lock"
            v-model="boardForm.writeLock"
            :options="lockOptions"
            input-class="mono"
            placeholder="all() — or pick a lockfunc"
            :maxlength="256"
            :disabled="busy"
            list-label="lock suggestions"
            empty-hint="Type a lock string or open the list."
            new-hint="Custom lock:"
          />
        </label>
        <label>
          Timeout (days)
          <input
            v-model="boardForm.timeout"
            type="number"
            min="0"
          >
        </label>
        <label class="chk-row bbs-check">
          <input
            v-model="boardForm.anonymous"
            type="checkbox"
            class="chk"
          >
          <span>Anonymous allowed</span>
        </label>
      </div>
      <label>
        Moderators
        <PlayerSelect
          v-model="boardForm.moderators"
          multiple
          empty-label="— none —"
        />
      </label>
      <label>
        Webhook URL
        <input
          v-model="boardForm.webhookUrl"
          class="mono"
          placeholder="https://…"
        >
      </label>
      <div class="action-row">
        <button
          type="button"
          class="secondary outline"
          :disabled="!boardDirty || busy"
          @click="resetBoardForm"
        >
          Discard
        </button>
        <button
          type="submit"
          :disabled="!boardDirty || busy"
          :aria-busy="busy"
        >
          Save
        </button>
        <button
          type="button"
          class="secondary outline"
          :disabled="busy"
          @click="deleteBoard"
        >
          Delete board
        </button>
      </div>
    </form>

    <!-- Posts table -->
    <template v-else>
      <p
        v-if="selectedBoard?.type === 'archive'"
        class="muted"
      >
        Archive — read only
      </p>

      <div
        v-if="composing"
        class="pages-toolbar bbs-compose"
      >
        <p class="bbs-compose-title">
          New post
        </p>
        <label>
          Subject
          <input v-model="newPostSubject">
        </label>
        <label>
          Body
          <textarea v-model="newPostBody" />
        </label>
        <label class="chk-row bbs-check">
          <input
            v-model="newPostSticky"
            type="checkbox"
            class="chk"
          >
          <span>Sticky</span>
        </label>
        <button
          type="button"
          :disabled="busy"
          @click="createPost"
        >
          Post
        </button>
      </div>

      <div class="table-wrap">
        <table class="dash-table">
          <thead>
            <tr>
              <th scope="col">
                #
              </th>
              <th scope="col">
                Subject
              </th>
              <th scope="col">
                Author
              </th>
              <th scope="col">
                When
              </th>
              <th scope="col">
                <span class="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="postsLoading">
              <td
                colspan="5"
                class="muted"
              >
                Loading posts…
              </td>
            </tr>
            <tr v-else-if="!posts.length">
              <td
                colspan="5"
                class="muted"
              >
                No posts on this board.
              </td>
            </tr>
            <tr
              v-for="p in posts"
              :key="p.num"
              tabindex="0"
              :class="{ 'row-active': postDetail?.num === p.num }"
              @click="openPost(p.num)"
              @keydown.enter.prevent="openPost(p.num)"
            >
              <td><code>#{{ p.num }}</code></td>
              <td>
                <span
                  v-if="p.sticky"
                  class="badge badge-live"
                >Sticky</span>
                {{ displaySubject(p.subject, p.num) }}
              </td>
              <td class="muted">
                {{ stripMushCodes(p.authorName) }}
              </td>
              <td class="muted">
                {{ formatWhen(p.createdAt) }}
              </td>
              <td class="row-open">
                <button
                  type="button"
                  class="secondary outline"
                  @click.stop="openPost(p.num)"
                >
                  Open
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <section
        v-if="postDetail"
        class="bbs-post-detail"
      >
        <p class="editor-path-line">
          <button
            type="button"
            class="back-link"
            @click="clearPost"
          >
            ← Back to list
          </button>
        </p>
        <h2 class="page-title page-title-tight">
          #{{ postDetail.num }}
          ·
          {{ displaySubject(postDetail.subject, postDetail.num) }}
        </h2>
        <p class="muted">
          {{ stripMushCodes(postDetail.authorName) }}
          · {{ formatWhen(postDetail.createdAt) }}
        </p>
        <pre class="bbs-body">{{
          displayBody(postDetail.body)
        }}</pre>
        <div class="action-row">
          <button
            type="button"
            class="secondary outline"
            :disabled="busy"
            @click="toggleSticky(postDetail)"
          >
            {{ postDetail.sticky ? "Unsticky" : "Sticky" }}
          </button>
          <button
            type="button"
            class="secondary outline"
            :disabled="busy"
            @click="deletePost(postDetail)"
          >
            Delete
          </button>
        </div>
        <div class="bbs-replies">
          <h3 class="dash-h2">
            Replies
            <span
              v-if="postDetail.replies?.length"
              class="muted"
            >({{ postDetail.replies.length }})</span>
          </h3>
          <p
            v-if="!postDetail.replies?.length"
            class="muted"
          >
            No replies yet.
          </p>
          <article
            v-for="r in postDetail.replies"
            :key="r.num"
            class="bbs-reply"
          >
            <p class="muted">
              #{{ r.num }} ·
              {{ stripMushCodes(r.authorName) }}
              · {{ formatWhen(r.createdAt) }}
            </p>
            <pre class="bbs-body">{{
              displayBody(r.body)
            }}</pre>
          </article>
          <div
            v-if="selectedBoard?.type !== 'archive'"
            class="bbs-reply-compose"
          >
            <label>
              Reply
              <textarea
                v-model="replyBody"
                rows="3"
                placeholder="Write a reply…"
              />
            </label>
            <button
              type="button"
              :disabled="replyBusy || !replyBody.trim()"
              :aria-busy="replyBusy"
              @click="createReply"
            >
              Post reply
            </button>
          </div>
        </div>
      </section>
    </template>
  </article>
</template>

<style scoped>
/* Only BBS-specific leftovers — chrome comes from shared wiki styles */
.bbs-stat-line {
  margin: 0.45rem 0 0;
  font-size: 0.8125rem;
}

.bbs-stat-line strong {
  color: var(--text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* Create board — stacked labeled fields (wiki form density) */
.bbs-create {
  margin-bottom: 1.25rem;
}

.bbs-create-title {
  margin: 0 0 0.85rem;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text);
}

.bbs-create-field {
  display: flex !important;
  flex-direction: column !important;
  gap: 0.4rem !important;
  margin: 0 0 0.85rem !important;
  min-width: 0;
  width: 100%;
}

.bbs-create-field > input {
  width: 100% !important;
  margin: 0 !important;
}

.bbs-create-hint {
  margin: -0.25rem 0 0.9rem;
  font-size: 0.75rem;
  line-height: 1.45;
  max-width: 36rem;
}

.bbs-create .action-row {
  margin: 0;
}

.bbs-create .action-row button {
  width: auto !important;
  flex: 0 0 auto;
  margin: 0 !important;
}

/* Locks span full grid width — long lockfunc strings need room */
.bbs-lock-field {
  grid-column: 1 / -1;
}

.bbs-check {
  margin-bottom: 0 !important;
}

.bbs-compose-title {
  margin: 0 0 0.75rem;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text);
}

.bbs-compose label {
  margin-bottom: 0.65rem;
}

.bbs-post-detail {
  margin-top: 1.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--border-subtle);
}

.bbs-body {
  margin: 0.65rem 0;
  padding: 0.85rem 1rem;
  max-height: 18rem;
  overflow: auto;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm, 4px);
  background: var(--bg-code);
  font-size: 0.8125rem;
  line-height: 1.55;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.bbs-reply {
  margin: 0 0 0.75rem;
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm, 4px);
  background: var(--bg-code);
}

.bbs-reply .bbs-body {
  max-height: 8rem;
  margin: 0.35rem 0 0;
  padding: 0;
  border: none;
  background: transparent;
}

.bbs-reply-compose {
  margin-top: 1rem;
}

.bbs-reply-compose textarea {
  width: 100% !important;
  margin: 0 0 0.65rem !important;
}

.bbs-reply-compose > button {
  width: auto !important;
  margin: 0 !important;
}

.mono {
  font-family: ui-monospace, Menlo, Consolas, monospace;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

:deep(.dash-table tbody tr.row-active td) {
  background: var(--bg-surface-2);
}

:deep(.editor-actions button),
:deep(.action-row button) {
  width: auto !important;
  flex: 0 0 auto;
  margin: 0 !important;
}
</style>
