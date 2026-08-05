<script setup lang="ts">
/**
 * In-console Jobs — same app pattern as BBS/Wiki:
 * list = dash-header + pages-toolbar + dash-table;
 * detail = editor-header + form (full page, not list+pane).
 */
import { computed, ref, watch } from "vue";
import {
  onBeforeRouteLeave,
  useRoute,
  useRouter,
} from "vue-router";
import { storeToRefs } from "pinia";
import { api } from "@/api/client";
import type { Job, JobComment } from "@/api/types";
import { useLiveStore } from "@/stores/live";
import { useSessionStore } from "@/stores/session";
import { useFormSync } from "@/composables/useFormSync";
import {
  formatJobWhen,
  isOpenJob,
  jobBucket,
  JOB_PRIORITIES,
  JOB_STATUSES,
  priorityClass,
  statusClass,
} from "@/utils/jobs";
import { stripMushCodes } from "@/utils/text";
import PlayerSelect from "@/components/PlayerSelect.vue";

const props = defineProps<{ id?: string }>();
const live = useLiveStore();
const {
  jobs,
  jobsLoaded,
  jobStats,
  jobsOpen,
  jobsNew,
  jobsUnassigned,
} = storeToRefs(live);
const session = useSessionStore();
const route = useRoute();
const router = useRouter();

type Filter =
  | "open"
  | "new"
  | "unassigned"
  | "mine"
  | "all"
  | "closed";

const FILTER_LABELS: Record<Filter, string> = {
  open: "open",
  new: "new",
  unassigned: "unassigned",
  mine: "mine",
  all: "all",
  closed: "closed",
};

const q = ref("");
const filter = ref<Filter>("open");
const selectedKey = ref("");
const loadError = ref("");
const saveError = ref("");
const saveOk = ref("");
const commentError = ref("");
const busy = ref(false);
const commentBusy = ref(false);
const loadingDetail = ref(false);
const commentText = ref("");
const commentStaffOnly = ref(true);

const selected = computed((): Job | null => {
  if (!selectedKey.value) return null;
  return live.getJob(selectedKey.value) ?? null;
});

const showList = computed(
  () => !selectedKey.value || (!selected.value && !loadingDetail.value),
);

const {
  form,
  dirty,
  markSaved,
  resetFrom,
  confirmLeave,
} = useFormSync(selected, (j) => ({
  title: stripMushCodes(j.title || ""),
  // CGEN / in-game jobs embed %c sheet text — strip for web.
  description: stripMushCodes(j.description || ""),
  status: String(j.status || "new"),
  priority: String(j.priority || "normal"),
  assignedTo: String(j.assignedTo || "").replace(/^#/, ""),
}));

watch(
  () => route.query.filter,
  (f) => {
    const ok = [
      "open",
      "new",
      "unassigned",
      "mine",
      "all",
      "closed",
    ] as const;
    if (
      typeof f === "string" &&
      (ok as readonly string[]).includes(f)
    ) {
      filter.value = f as Filter;
    } else if (!f) {
      filter.value = "open";
    }
  },
  { immediate: true },
);

const myId = computed(() => {
  const me = session.me;
  if (!me) return "";
  return String(me.dbId || me.id || "").replace(/^#/, "");
});

const filterBits = computed(() => {
  const bits: string[] = [];
  if (filter.value && filter.value !== "open") {
    bits.push(FILTER_LABELS[filter.value]);
  }
  return bits;
});

const rows = computed(() => {
  let list = [...jobs.value];
  const f = filter.value;
  if (f === "open") {
    list = list.filter((j) => isOpenJob(String(j.status)));
  } else if (f === "new") {
    list = list.filter((j) => j.status === "new");
  } else if (f === "unassigned") {
    list = list.filter(
      (j) => isOpenJob(String(j.status)) && !j.assignedTo,
    );
  } else if (f === "mine") {
    const id = myId.value;
    list = list.filter(
      (j) => String(j.assignedTo || "").replace(/^#/, "") === id,
    );
  } else if (f === "closed") {
    list = list.filter((j) => !isOpenJob(String(j.status)));
  }

  const needle = q.value.trim().toLowerCase();
  if (needle) {
    list = list.filter((j) => {
      return (
        String(j.number).includes(needle) ||
        j.title.toLowerCase().includes(needle) ||
        j.submitterName.toLowerCase().includes(needle) ||
        jobBucket(j).toLowerCase().includes(needle) ||
        String(j.status).toLowerCase().includes(needle) ||
        String(j.priority || "").toLowerCase().includes(needle) ||
        (j.assigneeName || "").toLowerCase().includes(needle) ||
        (j.tags || []).some((t) =>
          String(t).toLowerCase().includes(needle),
        )
      );
    });
  }

  return list.sort((a, b) => b.number - a.number);
});

const visibleComments = computed(() => {
  const c = selected.value?.comments || [];
  return [...c].sort((a, b) => a.timestamp - b.timestamp);
});

function clearFilters(): void {
  q.value = "";
  void router.replace({ name: "jobs", query: {} });
}

async function openJob(idOrNum: string): Promise<void> {
  const key = String(idOrNum);
  if (selectedKey.value === key && selected.value) {
    // still refresh full record for comments
  } else if (!confirmLeave("Discard unsaved job changes?")) {
    return;
  }

  loadError.value = "";
  loadingDetail.value = true;
  saveOk.value = "";
  selectedKey.value = key;

  const { res, data } = await api<Job & { error?: string }>(
    `/api/v1/jobs/${encodeURIComponent(key)}`,
  );
  loadingDetail.value = false;

  if (res.status === 401) {
    session.signOut();
    await router.replace({ name: "login" });
    return;
  }
  if (!res.ok) {
    loadError.value = data?.error ||
      `Load failed (${res.status}).`;
    selectedKey.value = "";
    return;
  }
  live.upsertJob(data);
  selectedKey.value = String(data.number);
  markSaved(data);

  if (String(route.params.id) !== String(data.number)) {
    void router.replace({
      name: "job-detail",
      params: { id: String(data.number) },
      query: route.query,
    });
  }
}

function clearSelection(): void {
  if (!confirmLeave("Discard unsaved job changes?")) return;
  selectedKey.value = "";
  void router.replace({ name: "jobs", query: route.query });
}

watch(
  () => props.id || (route.params.id as string | undefined),
  (id) => {
    if (id) void openJob(String(id));
    else if (!id && route.name === "jobs") selectedKey.value = "";
  },
  { immediate: true },
);

onBeforeRouteLeave(() =>
  confirmLeave("Discard unsaved job changes?"),
);

async function save(): Promise<void> {
  if (!selected.value || !dirty.value) return;
  saveError.value = "";
  saveOk.value = "";
  busy.value = true;
  const f = form.value;
  try {
    const id = String(selected.value.number);
    const { res, data } = await api<Job & { error?: string }>(
      `/api/v1/jobs/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          title: f.title.trim(),
          description: f.description,
          status: f.status,
          priority: f.priority,
          assignedTo: f.assignedTo.trim() || undefined,
        }),
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
      return;
    }
    live.upsertJob(data);
    markSaved(data);
    saveOk.value = "Saved.";
  } finally {
    busy.value = false;
  }
}

async function claim(): Promise<void> {
  if (!selected.value || !myId.value) return;
  form.value.assignedTo = myId.value;
  if (form.value.status === "new") form.value.status = "open";
  await save();
}

const isCgenJob = computed(() => {
  const j = selected.value;
  if (!j) return false;
  return String(jobBucket(j)).toUpperCase() === "CGEN";
});

const canApproveCgen = computed(() => {
  if (!isCgenJob.value || !selected.value) return false;
  const st = String(selected.value.status || "");
  return st === "new" || st === "open";
});

const approveNotes = ref("");
const approveBusy = ref(false);
const approveMsg = ref("");

/** Staff approve: live sheet + notify + close CGEN job. */
async function approveCharacter(): Promise<void> {
  if (!selected.value || !canApproveCgen.value) return;
  approveBusy.value = true;
  approveMsg.value = "";
  saveError.value = "";
  try {
    const { res, data } = await api<{
      ok?: boolean;
      name?: string;
      already?: boolean;
      error?: string;
      jobNumber?: number | null;
    }>("/api/v1/cofd/approve", {
      method: "POST",
      body: JSON.stringify({
        jobNumber: selected.value.number,
        playerId: selected.value.submittedBy,
        notes: approveNotes.value.trim(),
      }),
    });
    if (res.status === 401) {
      session.signOut();
      await router.replace({ name: "login" });
      return;
    }
    if (!res.ok) {
      saveError.value = data?.error ||
        `Approve failed (${res.status}).`;
      return;
    }
    approveMsg.value = data?.already
      ? `${data.name || "Character"} was already approved.`
      : `Approved ${data?.name || "character"}. They were notified.`;
    // Refresh job (should be closed)
    const id = String(selected.value.number);
    const again = await api<Job>(
      `/api/v1/jobs/${encodeURIComponent(id)}`,
    );
    if (again.res.ok && again.data) {
      live.upsertJob(again.data);
      markSaved(again.data);
    } else {
      // Job archived — drop from open list
      form.value.status = "closed";
      markSaved({
        ...selected.value,
        status: "closed",
      } as Job);
    }
  } finally {
    approveBusy.value = false;
  }
}

async function addComment(): Promise<void> {
  if (!selected.value) return;
  const text = commentText.value.trim();
  if (!text) {
    commentError.value = "Comment text is required.";
    return;
  }
  commentError.value = "";
  commentBusy.value = true;
  try {
    const id = String(selected.value.number);
    const { res, data } = await api<
      JobComment & { error?: string }
    >(
      `/api/v1/jobs/${encodeURIComponent(id)}/comment`,
      {
        method: "POST",
        body: JSON.stringify({
          text,
          staffOnly: commentStaffOnly.value,
        }),
      },
    );
    if (!res.ok) {
      commentError.value = data?.error ||
        `Comment failed (${res.status}).`;
      return;
    }
    commentText.value = "";
    const again = await api<Job>(
      `/api/v1/jobs/${encodeURIComponent(id)}`,
    );
    if (again.res.ok && again.data) {
      live.upsertJob(again.data);
      markSaved(again.data);
    }
  } finally {
    commentBusy.value = false;
  }
}

function assigneeLabel(id: unknown): string {
  const bare = String(id ?? "").replace(/^#/, "").trim();
  if (!bare) return "—";
  const o = live.getObject(bare);
  if (o) {
    const name = String(o.data?.name ?? "").trim();
    if (name) return name;
  }
  return `#${bare}`;
}
</script>

<template>
  <!-- ── Job list (BBS / wiki browser language) ─────────────── -->
  <article
    v-if="showList"
    id="main-jobs"
    class="dash-browser"
  >
    <header class="dash-header">
      <div>
        <p class="muted dash-kicker">
          Requests
        </p>
        <h1 class="page-title">
          Jobs
          <span
            v-if="jobsLoaded"
            class="muted"
          >({{ rows.length }})</span>
        </h1>
        <p class="muted">
          Browse and open jobs — filters live in the side nav.
        </p>
        <p
          v-if="jobsLoaded"
          class="muted jobs-stat-line"
        >
          <strong>{{ jobsOpen }}</strong> open
          · <strong>{{ jobsNew }}</strong> new
          · <strong>{{ jobsUnassigned }}</strong> unassigned
          ·
          <strong>{{
            jobStats?.total ?? jobs.length
          }}</strong> total
        </p>
      </div>
      <div class="dash-header-actions">
        <button
          type="button"
          class="secondary outline"
          @click="live.refreshJobs()"
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
      aria-label="Search jobs"
    >
      <label class="pages-search-label">
        <span class="sr-only">Search jobs</span>
        <input
          v-model="q"
          type="search"
          placeholder="Search #, title, submitter, bucket…"
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
              #
            </th>
            <th scope="col">
              Title
            </th>
            <th scope="col">
              Bucket
            </th>
            <th scope="col">
              Status
            </th>
            <th scope="col">
              Priority
            </th>
            <th scope="col">
              Submitter
            </th>
            <th scope="col">
              Assignee
            </th>
            <th scope="col">
              Updated
            </th>
            <th scope="col">
              <span class="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!jobsLoaded">
            <td
              colspan="9"
              class="muted"
            >
              Loading…
            </td>
          </tr>
          <tr v-else-if="!rows.length">
            <td
              colspan="9"
              class="muted"
            >
              No jobs match this filter.
            </td>
          </tr>
          <tr
            v-for="j in rows"
            :key="j.id"
            tabindex="0"
            @click="openJob(String(j.number))"
            @keydown.enter.prevent="openJob(String(j.number))"
          >
            <td><code>#{{ j.number }}</code></td>
            <td>{{ stripMushCodes(j.title) }}</td>
            <td class="muted">
              {{ jobBucket(j) }}
            </td>
            <td>
              <span
                class="badge"
                :class="statusClass(j.status)"
              >{{ j.status }}</span>
            </td>
            <td>
              <span
                class="badge"
                :class="priorityClass(j.priority)"
              >{{ j.priority || "normal" }}</span>
            </td>
            <td class="muted">
              {{ j.submitterName || "—" }}
            </td>
            <td class="muted">
              {{
                j.assigneeName ||
                  assigneeLabel(j.assignedTo)
              }}
            </td>
            <td class="muted">
              {{ formatJobWhen(j.updatedAt) }}
            </td>
            <td class="row-open">
              <button
                type="button"
                class="secondary outline"
                @click.stop="openJob(String(j.number))"
              >
                Open
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </article>

  <!-- ── Job detail (editor-header, full page) ──────────────── -->
  <article
    v-else
    id="main-jobs"
    class="dash-browser"
  >
    <p
      v-if="loadingDetail && !selected"
      class="muted"
      aria-busy="true"
    >
      Loading job…
    </p>

    <template v-else-if="selected && form">
      <header class="editor-header">
        <div>
          <p class="editor-path-line">
            <button
              type="button"
              class="back-link"
              @click="clearSelection"
            >
              ← Jobs
            </button>
            <code>#{{ selected.number }}</code>
            <span
              v-if="dirty"
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
            {{ form.title || selected.title }}
          </h1>
          <p class="muted jobs-detail-meta">
            <span
              class="badge"
              :class="statusClass(form.status)"
            >{{ form.status }}</span>
            <span
              class="badge"
              :class="priorityClass(form.priority)"
            >{{ form.priority }}</span>
            <span>{{ jobBucket(selected) }}</span>
            · {{ selected.submitterName }}
            · {{ formatJobWhen(selected.createdAt) }}
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
            class="secondary"
            :disabled="busy || !myId"
            @click="claim"
          >
            Claim
          </button>
          <button
            v-if="canApproveCgen"
            type="button"
            :disabled="approveBusy || busy"
            :aria-busy="approveBusy"
            title="Promote chargen draft to live sheet and notify"
            @click="approveCharacter"
          >
            Approve character
          </button>
          <button
            type="button"
            :disabled="!dirty || busy"
            :aria-busy="busy"
            @click="save"
          >
            Save
          </button>
        </div>
      </header>

      <div
        v-if="isCgenJob && canApproveCgen"
        class="jobs-approve-box"
      >
        <p class="muted">
          CGEN job — approve to make the sheet live, mail the
          player, and close this job. Closing the job status also
          auto-approves.
        </p>
        <label>
          Approval notes (optional)
          <input
            v-model="approveNotes"
            type="text"
            placeholder="Welcome notes for the player…"
          >
        </label>
        <p
          v-if="approveMsg"
          class="muted"
          role="status"
        >
          {{ approveMsg }}
        </p>
      </div>

      <p
        v-if="loadError || saveError"
        class="error"
        role="alert"
      >
        {{ loadError || saveError }}
      </p>

      <form @submit.prevent="save">
        <label>
          Title
          <input v-model="form.title">
        </label>
        <div class="db-edit-grid">
          <label>
            Status
            <select v-model="form.status">
              <option
                v-for="s in JOB_STATUSES"
                :key="s"
                :value="s"
              >
                {{ s }}
              </option>
            </select>
          </label>
          <label>
            Priority
            <select v-model="form.priority">
              <option
                v-for="p in JOB_PRIORITIES"
                :key="p"
                :value="p"
              >
                {{ p }}
              </option>
            </select>
          </label>
          <label>
            Assigned to
            <PlayerSelect
              v-model="form.assignedTo"
              :flags="['admin', 'wizard', 'superuser']"
              empty-label="— unassigned —"
            />
          </label>
        </div>
        <label>
          Description
          <textarea
            v-model="form.description"
            class="mono jobs-description"
            rows="16"
            spellcheck="false"
          />
        </label>
      </form>

      <section class="jobs-thread-wrap">
        <h2 class="dash-h2">
          Thread
          <span class="muted">
            ({{ visibleComments.length }})
          </span>
        </h2>
        <p
          v-if="!visibleComments.length"
          class="muted"
        >
          No comments yet.
        </p>
        <article
          v-for="c in visibleComments"
          :key="c.id || String(c.timestamp)"
          class="jobs-comment"
        >
          <p class="muted jobs-comment-meta">
            <strong>{{ c.authorName }}</strong>
            <span
              v-if="c.staffOnly"
              class="badge badge-draft"
            >staff</span>
            · {{ formatJobWhen(c.timestamp) }}
          </p>
          <pre class="jobs-comment-body">{{
            stripMushCodes(c.text)
          }}</pre>
        </article>

        <div class="jobs-comment-compose">
          <label>
            Add comment
            <textarea
              v-model="commentText"
              class="mono"
              rows="3"
              placeholder="Staff note or reply…"
            />
          </label>
          <label class="chk-row jobs-staff-only">
            <input
              v-model="commentStaffOnly"
              type="checkbox"
              class="chk"
            >
            <span>Staff-only note</span>
          </label>
          <p
            v-if="commentError"
            class="error"
          >
            {{ commentError }}
          </p>
          <button
            type="button"
            :disabled="commentBusy || !commentText.trim()"
            :aria-busy="commentBusy"
            @click="addComment"
          >
            Post comment
          </button>
        </div>
      </section>
    </template>
  </article>
</template>

<style scoped>
.jobs-stat-line {
  margin: 0.45rem 0 0;
  font-size: 0.8125rem;
}

.jobs-stat-line strong {
  color: var(--text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* CGEN sheet snapshots — keep layout, strip happens in script */
.jobs-description {
  white-space: pre;
  overflow-x: auto;
  min-height: 14rem;
  line-height: 1.35;
  font-size: 0.8125rem;
}

.jobs-approve-box {
  margin: 0 0 1rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm, 4px);
  background: var(--bg-code);
}

.jobs-approve-box label {
  margin-bottom: 0;
}

.jobs-approve-box input {
  margin-top: 0.35rem;
}

.jobs-detail-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.5rem;
  margin: 0.35rem 0 0;
  font-size: 0.8125rem;
}

.jobs-thread-wrap {
  margin-top: 1.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--border-subtle);
}

.jobs-thread-wrap .dash-h2 {
  margin: 0 0 0.85rem;
  font-size: 1rem;
  font-weight: 600;
}

.jobs-comment {
  margin: 0 0 0.75rem;
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm, 4px);
  background: var(--bg-code);
}

.jobs-comment-meta {
  margin: 0 0 0.35rem;
  font-size: 0.8125rem;
}

.jobs-comment-meta strong {
  color: var(--text);
  font-weight: 600;
}

.jobs-comment-body {
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  white-space: pre-wrap;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--text-secondary);
  font-family: inherit;
}

.jobs-comment-compose {
  margin-top: 1rem;
}

.jobs-comment-compose textarea {
  width: 100% !important;
  margin: 0 0 0.65rem !important;
}

.jobs-comment-compose > button {
  width: auto !important;
  margin: 0 !important;
}

.jobs-staff-only {
  margin-bottom: 0.65rem !important;
}

:deep(.editor-actions button),
:deep(.action-row button) {
  width: auto !important;
  flex: 0 0 auto;
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
</style>
