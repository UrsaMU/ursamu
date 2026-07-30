<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useLiveStore } from "@/stores/live";
import type { WikiStub } from "@/api/types";

const live = useLiveStore();
const { pages, pagesLoaded, wikiTotal } = storeToRefs(live);
const route = useRoute();
const router = useRouter();

const q = ref("");
const status = ref<"all" | "drafts" | "published">("all");
const tagFilter = ref("");
const sectionFilter = ref("");

watch(
  () => route.query,
  (query) => {
    const f = query.filter;
    if (f === "drafts" || f === "published") status.value = f;
    else status.value = "all";
    tagFilter.value = typeof query.tag === "string" ? query.tag : "";
    sectionFilter.value =
      typeof query.section === "string" ? query.section : "";
  },
  { immediate: true, deep: true },
);

function pageSection(p: WikiStub): string {
  const parts = String(p.path).split("/");
  return parts.length > 1 ? parts[0]! : "(root)";
}

const filterBits = computed(() => {
  const bits: string[] = [];
  if (status.value === "drafts") bits.push("drafts only");
  if (status.value === "published") bits.push("published only");
  if (tagFilter.value) bits.push(`tag “${tagFilter.value}”`);
  if (sectionFilter.value) {
    bits.push(`section “${sectionFilter.value}”`);
  }
  return bits;
});

const rows = computed(() => {
  let list: WikiStub[] = [...pages.value];
  if (status.value === "drafts") {
    list = list.filter((p) => p.draft === true);
  } else if (status.value === "published") {
    list = list.filter((p) => p.draft !== true);
  }
  if (tagFilter.value) {
    const tag = tagFilter.value.toLowerCase();
    list = list.filter((p) =>
      (p.tags || []).some((t) => String(t).toLowerCase() === tag),
    );
  }
  if (sectionFilter.value) {
    list = list.filter((p) => pageSection(p) === sectionFilter.value);
  }
  const needle = q.value.trim().toLowerCase();
  if (needle) {
    list = list.filter(
      (p) =>
        String(p.path).toLowerCase().includes(needle) ||
        String(p.title).toLowerCase().includes(needle) ||
        String(p.author || "").toLowerCase().includes(needle) ||
        (p.tags || []).some((t) =>
          String(t).toLowerCase().includes(needle),
        ),
    );
  }
  return list.sort((a, b) =>
    String(a.path).localeCompare(String(b.path)),
  );
});

function clearFilters(): void {
  q.value = "";
  void router.replace({ name: "wiki", query: {} });
}

function open(path: string): void {
  void router.push({ name: "wiki-edit", params: { path } });
}

function formatChars(n?: number): string {
  if (!n || n < 1) return "—";
  if (n < 1000) return `${n} c`;
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}
</script>

<template>
  <article id="main-pages">
    <header class="dash-header">
      <div>
        <p class="muted dash-kicker">
          Library
        </p>
        <h1 class="page-title">
          Wiki
          <span class="muted">
            ({{ rows.length }}{{
              rows.length !== wikiTotal ? ` of ${wikiTotal}` : ""
            }})
          </span>
        </h1>
        <p class="muted">
          Browse and open pages — filters live in the side nav.
        </p>
      </div>
      <div class="dash-header-actions">
        <button
          type="button"
          @click="router.push({ name: 'wiki-new' })"
        >
          New page
        </button>
        <button
          type="button"
          class="secondary outline"
          @click="live.refreshWiki()"
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
      aria-label="Search pages"
    >
      <label class="pages-search-label">
        <span class="sr-only">Search pages</span>
        <input
          v-model="q"
          type="search"
          placeholder="Search title, path, tag, author…"
          autocomplete="off"
        >
      </label>
    </section>

    <div class="table-wrap">
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
              Status
            </th>
            <th scope="col">
              Lock
            </th>
            <th scope="col">
              Updated
            </th>
            <th scope="col">
              Size
            </th>
            <th scope="col">
              Tags
            </th>
            <th scope="col">
              Author
            </th>
            <th scope="col">
              <span class="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!pagesLoaded">
            <td
              colspan="9"
              class="muted"
            >
              Loading…
            </td>
          </tr>
          <tr v-else-if="!rows.length && !wikiTotal">
            <td
              colspan="9"
              class="muted"
            >
              No pages yet.
              <button
                type="button"
                class="secondary"
                @click="router.push({ name: 'wiki-new' })"
              >
                Create the first page
              </button>
            </td>
          </tr>
          <tr v-else-if="!rows.length">
            <td
              colspan="9"
              class="muted"
            >
              No pages match this filter.
            </td>
          </tr>
          <tr
            v-for="p in rows"
            :key="p.path"
            tabindex="0"
            @click="open(p.path)"
            @keydown.enter.prevent="open(p.path)"
          >
            <td>{{ p.title || p.path }}</td>
            <td><code>{{ p.path }}</code></td>
            <td>
              <span
                class="badge"
                :class="p.draft ? 'badge-draft' : 'badge-live'"
              >
                {{ p.draft ? "Draft" : "Live" }}
              </span>
            </td>
            <td class="muted">
              {{ p.readLock || "connected" }}
            </td>
            <td class="muted">
              {{ p.date || "—" }}
            </td>
            <td class="muted">
              {{ formatChars(p.chars) }}
            </td>
            <td class="muted">
              {{ (p.tags || []).join(", ") || "—" }}
            </td>
            <td class="muted">
              {{ p.author || "—" }}
            </td>
            <td class="row-open">
              <button
                type="button"
                class="secondary outline"
                @click.stop="open(p.path)"
              >
                Open
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </article>
</template>
