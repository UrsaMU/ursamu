<script setup lang="ts">
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useSessionStore } from "@/stores/session";
import { useLiveStore } from "@/stores/live";
import { onlineDisplayName } from "@/utils/text";

const session = useSessionStore();
const live = useLiveStore();
// Destructure refs so template stays reactive to store updates
const {
  onlineLoaded,
  onlineCount,
  pagesLoaded,
  wikiTotal,
  wikiDrafts,
  wikiPublished,
  wikiSections,
  objectsLoaded,
  objectCount,
  playerCount,
  roomCount,
  jobsLoaded,
  jobsOpen,
  jobsNew,
  jobsUnassigned,
  onlineSorted,
  recentPages,
} = storeToRefs(live);
const router = useRouter();

async function refresh(): Promise<void> {
  await live.refreshAll();
}

function goWiki(filter?: string): void {
  void router.push({
    name: "wiki",
    query: filter ? { filter } : {},
  });
}

function goDb(id?: string): void {
  if (id) void router.push({ name: "db-detail", params: { id } });
  else void router.push({ name: "db" });
}

function goPlayers(id?: string, filter?: string): void {
  if (id) {
    void router.push({
      name: "player-detail",
      params: { id },
      query: filter ? { filter } : {},
    });
  } else {
    void router.push({
      name: "players",
      query: filter ? { filter } : {},
    });
  }
}

function goJobs(filter?: string): void {
  void router.push({
    name: "jobs",
    query: filter ? { filter } : {},
  });
}
</script>

<template>
  <article id="main-dashboard">
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
          Live game snapshot — wiki, players, and database.
        </p>
      </div>
      <div class="dash-header-actions">
        <button
          type="button"
          class="secondary"
          @click="goPlayers()"
        >
          Players
        </button>
        <button
          type="button"
          class="secondary"
          @click="goJobs()"
        >
          Jobs
        </button>
        <button
          type="button"
          class="secondary"
          @click="goDb()"
        >
          Database
        </button>
        <button
          type="button"
          class="secondary"
          @click="goWiki()"
        >
          Wiki
        </button>
        <button
          type="button"
          @click="router.push({ name: 'wiki-new' })"
        >
          New page
        </button>
        <button
          type="button"
          class="secondary outline"
          @click="refresh"
        >
          Refresh
        </button>
      </div>
    </header>

    <section
      class="stat-grid"
      aria-label="Live statistics"
    >
      <button
        type="button"
        class="stat-card stat-card-btn"
        @click="goPlayers(undefined, 'online')"
      >
        <p class="stat-label">
          Online
        </p>
        <p class="stat-value">
          {{ onlineLoaded ? onlineCount : "—" }}
        </p>
        <p class="stat-meta muted">
          Connected players
        </p>
      </button>
      <button
        type="button"
        class="stat-card stat-card-btn"
        @click="goWiki()"
      >
        <p class="stat-label">
          Wiki pages
        </p>
        <p class="stat-value">
          {{ pagesLoaded ? wikiTotal : "—" }}
        </p>
        <p class="stat-meta muted">
          Readable entries
        </p>
      </button>
      <button
        type="button"
        class="stat-card stat-card-btn"
        @click="goWiki('drafts')"
      >
        <p class="stat-label">
          Drafts
        </p>
        <p class="stat-value">
          {{ pagesLoaded ? wikiDrafts : "—" }}
        </p>
        <p class="stat-meta muted">
          Needs publish
        </p>
      </button>
      <button
        type="button"
        class="stat-card stat-card-btn"
        @click="goDb()"
      >
        <p class="stat-label">
          Objects
        </p>
        <p class="stat-value">
          {{ objectsLoaded ? objectCount : "—" }}
        </p>
        <p class="stat-meta muted">
          {{
            objectsLoaded
              ? `${playerCount} players · ${roomCount} rooms`
              : "In database"
          }}
        </p>
      </button>
    </section>

    <section
      class="stat-grid stat-grid-secondary"
      aria-label="Breakdown"
    >
      <div class="stat-card">
        <p class="stat-label">
          Published
        </p>
        <p class="stat-value">
          {{ pagesLoaded ? wikiPublished : "—" }}
        </p>
        <p class="stat-meta muted">
          Live wiki
        </p>
      </div>
      <div class="stat-card">
        <p class="stat-label">
          Wiki sections
        </p>
        <p class="stat-value">
          {{ pagesLoaded ? wikiSections : "—" }}
        </p>
        <p class="stat-meta muted">
          Top folders
        </p>
      </div>
      <button
        type="button"
        class="stat-card stat-card-btn"
        @click="goPlayers()"
      >
        <p class="stat-label">
          Players
        </p>
        <p class="stat-value">
          {{ objectsLoaded ? playerCount : "—" }}
        </p>
        <p class="stat-meta muted">
          In DB
        </p>
      </button>
      <button
        type="button"
        class="stat-card stat-card-btn"
        @click="goJobs('open')"
      >
        <p class="stat-label">
          Open jobs
        </p>
        <p class="stat-value">
          {{ jobsLoaded ? jobsOpen : "—" }}
        </p>
        <p class="stat-meta muted">
          {{
            jobsLoaded
              ? `${jobsNew} new · ${jobsUnassigned} free`
              : "Queue"
          }}
        </p>
      </button>
    </section>

    <section
      class="dash-section"
      aria-labelledby="dash-modules-h"
    >
      <h2
        id="dash-modules-h"
        class="dash-h2"
      >
        Modules
      </h2>
      <div class="module-grid module-grid-4">
        <button
          type="button"
          class="module-card"
          @click="goWiki()"
        >
          <span class="module-card-kicker">Content</span>
          <span class="module-card-title">Wiki</span>
          <span class="module-card-desc muted">
            Browse lore, drafts, and page locks.
          </span>
        </button>
        <button
          type="button"
          class="module-card"
          @click="goPlayers()"
        >
          <span class="module-card-kicker">Accounts</span>
          <span class="module-card-title">Players</span>
          <span class="module-card-desc muted">
            Online status, flags, and character data.
          </span>
        </button>
        <button
          type="button"
          class="module-card"
          @click="goJobs()"
        >
          <span class="module-card-kicker">Queue</span>
          <span class="module-card-title">Jobs</span>
          <span class="module-card-desc muted">
            Requests, bugs, and staff tickets.
          </span>
        </button>
        <button
          type="button"
          class="module-card"
          @click="goDb()"
        >
          <span class="module-card-kicker">World</span>
          <span class="module-card-title">Database</span>
          <span class="module-card-desc muted">
            Inspect and edit game objects.
          </span>
        </button>
      </div>
    </section>

    <div class="dash-two-col dash-two-col-wide">
      <section
        class="dash-section"
        aria-labelledby="dash-online-h"
      >
        <div class="dash-section-head">
          <h2
            id="dash-online-h"
            class="dash-h2"
          >
            Who’s online
          </h2>
          <button
            type="button"
            class="secondary outline"
            @click="live.refreshOnline()"
          >
            Refresh
          </button>
        </div>
        <ul class="dash-recent">
          <li
            v-if="!onlineLoaded"
            class="muted"
          >
            Loading…
          </li>
          <li
            v-else-if="!onlineSorted.length"
            class="muted"
          >
            No one connected right now.
          </li>
          <li
            v-for="p in onlineSorted.slice(0, 12)"
            :key="String(p.id)"
          >
            <button
              type="button"
              class="dash-recent-link"
              @click="goPlayers(p.id ? String(p.id) : undefined)"
            >
              {{ onlineDisplayName(p) }}
            </button>
            <span class="dash-recent-meta">
              {{ p.id ? `#${p.id}` : "" }}
            </span>
          </li>
        </ul>
      </section>

      <section
        class="dash-section"
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
        <ul class="dash-recent">
          <li
            v-if="!pagesLoaded"
            class="muted"
          >
            Loading…
          </li>
          <li
            v-else-if="!recentPages.length"
            class="muted"
          >
            No pages yet — create one to get started.
          </li>
          <li
            v-for="p in recentPages"
            :key="p.path"
          >
            <button
              type="button"
              class="dash-recent-link"
              @click="
                router.push({
                  name: 'wiki-edit',
                  params: { path: p.path },
                })
              "
            >
              {{ p.title || p.path }}
            </button>
            <span
              v-if="p.draft"
              class="badge badge-draft"
            >Draft</span>
            <code class="muted">{{ p.path }}</code>
            <span class="dash-recent-meta">
              {{ [p.date, p.author].filter(Boolean).join(" · ") }}
            </span>
          </li>
        </ul>
      </section>
    </div>
  </article>
</template>
