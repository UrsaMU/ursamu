<script setup lang="ts">
/**
 * Staff dashboard — stacked sections (pre-regression layout):
 * Open jobs → Wiki drafts table → Who's online → Recent wiki table.
 */
import { computed } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useSessionStore } from "@/stores/session";
import { useLiveStore } from "@/stores/live";
import { onlineDisplayName } from "@/utils/text";
import { isOpenJob } from "@/utils/jobs";
import type { Job, WikiStub } from "@/api/types";

const session = useSessionStore();
const live = useLiveStore();
const {
  onlineLoaded,
  onlineCount,
  pagesLoaded,
  wikiDrafts,
  jobsLoaded,
  jobsOpen,
  onlineSorted,
  recentPages,
  pages,
  jobs,
} = storeToRefs(live);
const router = useRouter();

const summaryLine = computed(() => {
  const online = onlineLoaded.value ? String(onlineCount.value) : "—";
  const open = jobsLoaded.value ? String(jobsOpen.value) : "—";
  const drafts = pagesLoaded.value ? String(wikiDrafts.value) : "—";
  return `${online} online · ${open} open jobs · ${drafts} drafts`;
});

const openJobRows = computed((): Job[] => {
  return [...jobs.value]
    .filter((j) => isOpenJob(String(j.status)))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 8);
});

const draftRows = computed((): WikiStub[] => {
  return [...pages.value]
    .filter((p) => p.draft === true)
    .sort((a, b) => {
      const da = String(a.date || "");
      const db = String(b.date || "");
      if (da !== db) return db.localeCompare(da);
      return String(a.path).localeCompare(String(b.path));
    })
    .slice(0, 12);
});

async function refresh(): Promise<void> {
  await live.refreshAll();
}

function goWiki(filter?: string): void {
  void router.push({
    name: "wiki",
    query: filter ? { filter } : {},
  });
}

function goPlayers(id?: string): void {
  if (id) {
    void router.push({
      name: "db-detail",
      params: { id },
    });
  } else {
    void router.push({
      name: "db",
      query: { filter: "online" },
    });
  }
}

function goJobs(filter?: string): void {
  void router.push({
    name: "jobs",
    query: filter ? { filter } : {},
  });
}

function openWiki(path: string): void {
  void router.push({
    name: "wiki-edit",
    params: { path },
  });
}

function openJob(id: string): void {
  void router.push({ name: "job-detail", params: { id } });
}

function wikiUpdated(p: WikiStub): string {
  return [p.date, p.author].filter(Boolean).join(" · ") || "—";
}
</script>

<template>
  <article
    id="main-dashboard"
    class="dash-browser"
  >
    <header class="dash-header">
      <div>
        <p class="muted dash-kicker">
          Staff console
        </p>
        <h1 class="page-title">
          Welcome<span v-if="session.displayName">,
            {{ session.displayName }}</span>
        </h1>
        <p
          id="dash-subtitle"
          class="muted"
        >
          {{ summaryLine }}
        </p>
      </div>
      <div class="dash-header-actions">
        <button
          type="button"
          class="secondary outline"
          @click="refresh"
        >
          Refresh
        </button>
      </div>
    </header>

    <!-- Open jobs -->
    <section
      class="dash-section dash-stack-section"
      aria-labelledby="dash-jobs-h"
    >
      <div class="dash-section-head">
        <h2
          id="dash-jobs-h"
          class="dash-h2"
        >
          Open jobs
        </h2>
        <button
          type="button"
          class="secondary outline"
          @click="goJobs('open')"
        >
          All open
        </button>
      </div>
      <p
        v-if="!jobsLoaded"
        class="muted dash-stack-empty"
      >
        Loading…
      </p>
      <p
        v-else-if="!openJobRows.length"
        class="muted dash-stack-empty"
      >
        No open jobs.
      </p>
      <div
        v-else
        class="table-wrap"
      >
        <table class="dash-table">
          <thead>
            <tr>
              <th scope="col">
                Title
              </th>
              <th scope="col">
                Status
              </th>
              <th scope="col">
                Assignee
              </th>
              <th scope="col">
                <span class="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="j in openJobRows"
              :key="j.id"
              tabindex="0"
              @click="openJob(j.id)"
              @keydown.enter.prevent="openJob(j.id)"
            >
              <td>
                <span class="muted">#{{ j.number }}</span>
                {{ j.title }}
              </td>
              <td class="muted">
                {{ j.status }}
              </td>
              <td class="muted">
                {{ j.assigneeName || "—" }}
              </td>
              <td class="row-open">
                <button
                  type="button"
                  class="secondary outline"
                  @click.stop="openJob(j.id)"
                >
                  Open
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Wiki drafts -->
    <section
      class="dash-section dash-stack-section"
      aria-labelledby="dash-drafts-h"
    >
      <div class="dash-section-head">
        <h2
          id="dash-drafts-h"
          class="dash-h2"
        >
          Wiki drafts
          <span
            v-if="pagesLoaded"
            class="muted"
          >({{ wikiDrafts }})</span>
        </h2>
        <button
          type="button"
          class="secondary outline"
          @click="goWiki('drafts')"
        >
          All drafts
        </button>
      </div>
      <p
        v-if="!pagesLoaded"
        class="muted dash-stack-empty"
      >
        Loading…
      </p>
      <p
        v-else-if="!draftRows.length"
        class="muted dash-stack-empty"
      >
        No wiki drafts.
      </p>
      <div
        v-else
        class="table-wrap"
      >
        <table class="dash-table">
          <thead>
            <tr>
              <th scope="col">
                Title
              </th>
              <th scope="col">
                Path
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
            <tr
              v-for="p in draftRows"
              :key="p.path"
              tabindex="0"
              @click="openWiki(p.path)"
              @keydown.enter.prevent="openWiki(p.path)"
            >
              <td>
                {{ p.title || p.path }}
                <span class="badge badge-draft">Draft</span>
              </td>
              <td>
                <code>{{ p.path }}</code>
              </td>
              <td class="muted">
                {{ wikiUpdated(p) }}
              </td>
              <td class="row-open">
                <button
                  type="button"
                  class="secondary outline"
                  @click.stop="openWiki(p.path)"
                >
                  Open
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Who's online -->
    <section
      class="dash-section dash-stack-section"
      aria-labelledby="dash-online-h"
    >
      <div class="dash-section-head">
        <h2
          id="dash-online-h"
          class="dash-h2"
        >
          Who’s online
          <span
            v-if="onlineLoaded"
            class="muted"
          >({{ onlineCount }})</span>
        </h2>
        <button
          type="button"
          class="secondary outline"
          @click="goPlayers()"
        >
          Players
        </button>
      </div>
      <p
        v-if="!onlineLoaded"
        class="muted dash-stack-empty"
      >
        Loading…
      </p>
      <p
        v-else-if="!onlineSorted.length"
        class="muted dash-stack-empty"
      >
        No one connected right now.
      </p>
      <div
        v-else
        class="table-wrap"
      >
        <table class="dash-table">
          <thead>
            <tr>
              <th scope="col">
                Name
              </th>
              <th scope="col">
                Id
              </th>
              <th scope="col">
                <span class="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in onlineSorted.slice(0, 16)"
              :key="String(p.id)"
              tabindex="0"
              @click="goPlayers(p.id ? String(p.id) : undefined)"
              @keydown.enter.prevent="
                goPlayers(p.id ? String(p.id) : undefined)
              "
            >
              <td>{{ onlineDisplayName(p) }}</td>
              <td class="muted">
                {{ p.id ? `#${p.id}` : "—" }}
              </td>
              <td class="row-open">
                <button
                  type="button"
                  class="secondary outline"
                  @click.stop="
                    goPlayers(p.id ? String(p.id) : undefined)
                  "
                >
                  Open
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Recent wiki -->
    <section
      class="dash-section dash-stack-section"
      aria-labelledby="dash-recent-h"
    >
      <div class="dash-section-head">
        <h2
          id="dash-recent-h"
          class="dash-h2"
        >
          Recent wiki
        </h2>
        <button
          type="button"
          class="secondary outline"
          @click="goWiki()"
        >
          All pages
        </button>
      </div>
      <p
        v-if="!pagesLoaded"
        class="muted dash-stack-empty"
      >
        Loading…
      </p>
      <p
        v-else-if="!recentPages.length"
        class="muted dash-stack-empty"
      >
        No pages yet — create one to get started.
      </p>
      <div
        v-else
        class="table-wrap"
      >
        <table class="dash-table">
          <thead>
            <tr>
              <th scope="col">
                Title
              </th>
              <th scope="col">
                Path
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
            <tr
              v-for="p in recentPages"
              :key="p.path"
              tabindex="0"
              @click="openWiki(p.path)"
              @keydown.enter.prevent="openWiki(p.path)"
            >
              <td>
                {{ p.title || p.path }}
                <span
                  v-if="p.draft"
                  class="badge badge-draft"
                >Draft</span>
              </td>
              <td>
                <code>{{ p.path }}</code>
              </td>
              <td class="muted">
                {{ wikiUpdated(p) }}
              </td>
              <td class="row-open">
                <button
                  type="button"
                  class="secondary outline"
                  @click.stop="openWiki(p.path)"
                >
                  Open
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </article>
</template>

<style scoped>
.dash-stack-section {
  margin-bottom: 1.75rem;
}

.dash-stack-empty {
  margin: 0.15rem 0 0;
  font-size: 0.875rem;
}

#main-dashboard .dash-section-head {
  margin-bottom: 0.65rem;
}

#main-dashboard .dash-table .badge {
  margin-inline-start: 0.4rem;
  vertical-align: middle;
}
</style>
