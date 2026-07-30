<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  onBeforeRouteLeave,
  useRoute,
  useRouter,
} from "vue-router";
import { storeToRefs } from "pinia";
import { api } from "@/api/client";
import type { DboStub } from "@/api/types";
import { useLiveStore } from "@/stores/live";
import { useSessionStore } from "@/stores/session";
import { useFormSync } from "@/composables/useFormSync";
import {
  dboName,
  dboType,
  flagsToString,
  locationLabel,
} from "@/utils/text";
import PlayerSelect from "@/components/PlayerSelect.vue";

const props = defineProps<{ id?: string }>();
const live = useLiveStore();
const { objects, objectsLoaded, objectCount } =
  storeToRefs(live);
const session = useSessionStore();
const route = useRoute();
const router = useRouter();

type TypeFilter = "all" | "player" | "room" | "exit" | "thing";

const q = ref("");
const typeFilter = ref<TypeFilter>("all");
const selectedKey = ref("");

watch(
  () => route.query.filter,
  (f) => {
    if (
      f === "player" ||
      f === "room" ||
      f === "exit" ||
      f === "thing"
    ) {
      typeFilter.value = f;
    } else {
      typeFilter.value = "all";
    }
  },
  { immediate: true },
);

const loadError = ref("");
const saveError = ref("");
const saveOk = ref("");
const busy = ref(false);
const loadingDetail = ref(false);

const selected = computed((): DboStub | null => {
  if (!selectedKey.value) return null;
  return live.getObject(selectedKey.value) ?? null;
});

const {
  form,
  dirty,
  markSaved,
  resetFrom,
  confirmLeave,
} = useFormSync(selected, (o) => {
  const d = o.data || {};
  return {
    name: String(d.name ?? ""),
    moniker: String(d.moniker ?? ""),
    flags: flagsToString(o.flags),
    location: String(o.location ?? "").replace(/^#/, ""),
    zone: String(d.zone ?? "").replace(/^#/, ""),
    owner: String(d.owner ?? "").replace(/^#/, ""),
    money: d.money == null ? "" : String(d.money),
    quota: d.quota == null ? "" : String(d.quota),
    description: String(
      (typeof o.description === "string" && o.description) ||
        d.description ||
        "",
    ),
    image: String(d.image ?? ""),
  };
});

const rows = computed(() => {
  let list = [...objects.value];
  if (typeFilter.value !== "all") {
    list = list.filter(
      (o) => dboType(o) === typeFilter.value,
    );
  }
  const needle = q.value.trim().toLowerCase();
  if (needle) {
    list = list.filter((o) => {
      const id = String(o.id || "").toLowerCase();
      const name = dboName(o).toLowerCase();
      const fl = flagsToString(o.flags).toLowerCase();
      const loc = String(o.location || "").toLowerCase();
      const zone = String(o.data?.zone ?? "").toLowerCase();
      return (
        id.includes(needle) ||
        name.includes(needle) ||
        fl.includes(needle) ||
        loc.includes(needle) ||
        zone.includes(needle)
      );
    });
  }
  return list.sort((a, b) => {
    const na = Number(a.id);
    const nb = Number(b.id);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      return na - nb;
    }
    return String(a.id).localeCompare(String(b.id));
  });
});

const typeCounts = computed(() => {
  const c = {
    all: objects.value.length,
    player: 0,
    room: 0,
    exit: 0,
    thing: 0,
  };
  for (const o of objects.value) {
    const t = dboType(o);
    if (t === "player") c.player++;
    else if (t === "room") c.room++;
    else if (t === "exit") c.exit++;
    else if (t === "thing") c.thing++;
  }
  return c;
});

async function openObject(id: string): Promise<void> {
  const key = id.replace(/^#/, "");
  if (selectedKey.value !== key) {
    if (!confirmLeave("Discard object edits?")) return;
  }
  loadError.value = "";
  loadingDetail.value = true;
  saveOk.value = "";
  selectedKey.value = key;

  const { res, data } = await api<DboStub & { error?: string }>(
    `/api/v1/dbobj/${encodeURIComponent(key)}`,
  );
  loadingDetail.value = false;

  if (res.status === 401) {
    session.signOut();
    await router.replace({ name: "login" });
    return;
  }
  if (!res.ok) {
    loadError.value =
      data?.error || `Load failed (${res.status}).`;
    return;
  }
  live.upsertObject(data);
  markSaved(data);
  if (String(route.params.id) !== key) {
    void router.replace({
      name: "db-detail",
      params: { id: key },
    });
  }
}

function clearSelection(): void {
  if (!confirmLeave("Discard object edits?")) return;
  selectedKey.value = "";
  void router.replace({ name: "db" });
}

watch(
  () => props.id || (route.params.id as string | undefined),
  (id) => {
    if (id) void openObject(String(id));
    else if (route.name === "db") selectedKey.value = "";
  },
  { immediate: true },
);

onBeforeRouteLeave(() =>
  confirmLeave("Discard object edits?"),
);

async function save(): Promise<void> {
  if (!selected.value?.id || !dirty.value) return;
  saveError.value = "";
  saveOk.value = "";
  busy.value = true;
  const f = form.value;
  const dataBag: Record<string, unknown> = {
    name: String(f.name).trim(),
    moniker: String(f.moniker).trim(),
    description: f.description,
    image: String(f.image).trim(),
    owner: String(f.owner).trim(),
    zone: String(f.zone).trim(),
  };
  if (f.money !== "") dataBag.money = Number(f.money);
  if (f.quota !== "") dataBag.quota = Number(f.quota);

  try {
    const enc = encodeURIComponent(String(selected.value.id));
    const { res, data } = await api<
      DboStub & { error?: string }
    >(
      `/api/v1/dbobj/${enc}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          flags: String(f.flags).trim(),
          location: String(f.location).trim(),
          description: f.description,
          data: dataBag,
        }),
      },
    );
    if (res.status === 401) {
      session.signOut();
      await router.replace({ name: "login" });
      return;
    }
    if (!res.ok) {
      saveError.value =
        data?.error || `Save failed (${res.status}).`;
      return;
    }
    live.upsertObject(data);
    markSaved(data);
    saveOk.value = "Saved.";
  } finally {
    busy.value = false;
  }
}

function shortFlags(o: DboStub): string {
  const fl = flagsToString(o.flags);
  return fl.length > 36
    ? fl.slice(0, 33) + "…"
    : fl || "—";
}

function locLabel(o: DboStub): string {
  return locationLabel(o.location, (id) => live.getObject(id));
}

function zoneLabel(o: DboStub): string {
  const z = o.data?.zone;
  return z ? `#${z}` : "—";
}
</script>

<template>
  <article id="main-db">
    <header class="db-top">
      <div class="db-top-text">
        <p class="muted dash-kicker">
          Game world
        </p>
        <h1 class="page-title">
          Database
          <span
            v-if="objectsLoaded"
            class="db-count muted"
          >
            {{ rows.length }}{{
              rows.length !== objectCount
                ? ` of ${objectCount}`
                : ""
            }}
          </span>
        </h1>
      </div>
      <div class="db-top-actions">
        <button
          type="button"
          class="secondary outline"
          @click="live.refreshObjects()"
        >
          Refresh
        </button>
      </div>
    </header>

    <p
      v-if="objectsLoaded"
      class="db-summary muted"
    >
      <strong>{{ typeCounts.player }}</strong> players
      · <strong>{{ typeCounts.room }}</strong> rooms
      · <strong>{{ typeCounts.exit }}</strong> exits
      · <strong>{{ typeCounts.thing }}</strong> things
      · <strong>{{ objectCount }}</strong> total
    </p>

    <div class="db-toolbar">
      <input
        v-model="q"
        type="search"
        class="db-search"
        placeholder="Search id, name, flags, zone…"
        autocomplete="off"
        aria-label="Search objects"
      >
    </div>

    <p
      v-if="loadError"
      class="error"
      role="alert"
    >
      {{ loadError }}
    </p>

    <!-- Scrollable list on top; detail panel stacks below -->
    <section
      class="db-list"
      aria-label="Object list"
    >
      <div
        v-if="!objectsLoaded"
        class="db-empty muted"
      >
        Loading objects…
      </div>
      <div
        v-else-if="!rows.length"
        class="db-empty muted"
      >
        No objects match this filter.
      </div>
      <ul
        v-else
        class="db-rows"
      >
        <li
          v-for="o in rows"
          :key="String(o.id)"
        >
          <button
            type="button"
            class="db-row"
            :class="{
              active: selectedKey === String(o.id),
            }"
            @click="openObject(String(o.id))"
          >
            <span class="db-row-num">
              <code>#{{ o.id }}</code>
            </span>
            <span class="db-row-main">
              <span class="db-row-title">
                {{ dboName(o) }}
              </span>
              <span class="db-row-meta muted">
                {{ locLabel(o) }}
                · zone {{ zoneLabel(o) }}
                · {{ shortFlags(o) }}
              </span>
            </span>
            <span class="db-row-badges">
              <span class="badge">
                {{ dboType(o) }}
              </span>
            </span>
          </button>
        </li>
      </ul>
    </section>

    <aside
      v-if="selectedKey"
      class="db-pane"
      aria-label="Object detail"
    >
      <p
        v-if="loadingDetail && !selected"
        class="muted db-pane-loading"
      >
        Loading object…
      </p>
      <template v-else-if="selected && form">
        <header class="db-pane-head">
          <button
            type="button"
            class="back-link"
            @click="clearSelection"
          >
            ← Close
          </button>
          <p class="muted dash-kicker">
            #{{ selected.id }}
            <span
              v-if="dirty"
              class="dirty-dot"
            >●</span>
          </p>
          <h2 class="db-pane-title">
            {{ form.name || dboName(selected) }}
          </h2>
          <p class="muted db-pane-sub">
            <span class="badge">
              {{ dboType(selected) }}
            </span>
            <span>{{ locLabel(selected) }}</span>
            <span>· zone {{ zoneLabel(selected) }}</span>
          </p>
        </header>

        <form
          class="db-pane-form"
          @submit.prevent="save"
        >
          <div class="db-pane-grid">
            <label>
              Name
              <input v-model="form.name">
            </label>
            <label>
              Moniker
              <input v-model="form.moniker">
            </label>
          </div>
          <label>
            Flags
            <input
              v-model="form.flags"
              class="mono"
            >
          </label>
          <div class="db-pane-grid db-pane-grid-3">
            <label>
              Location
              <input
                v-model="form.location"
                class="mono"
              >
            </label>
            <label>
              Zone
              <input
                v-model="form.zone"
                class="mono"
              >
            </label>
            <label>
              Owner
              <PlayerSelect
                v-model="form.owner"
                empty-label="— none —"
              />
            </label>
          </div>
          <div class="db-pane-grid db-pane-grid-3">
            <label>
              Money
              <input
                v-model="form.money"
                type="number"
                min="0"
              >
            </label>
            <label>
              Quota
              <input
                v-model="form.quota"
                type="number"
                min="0"
              >
            </label>
            <label>
              Image
              <input v-model="form.image">
            </label>
          </div>
          <label>
            Description
            <textarea
              v-model="form.description"
              class="mono"
              rows="6"
            />
          </label>
          <p
            v-if="saveError"
            class="error"
          >
            {{ saveError }}
          </p>
          <p
            v-if="saveOk"
            class="muted"
          >
            {{ saveOk }}
          </p>
          <div class="db-pane-actions">
            <button
              type="button"
              class="secondary outline"
              :disabled="!dirty || busy"
              @click="selected && resetFrom(selected)"
            >
              Reset
            </button>
            <button
              type="submit"
              :disabled="!dirty || busy"
            >
              Save object
            </button>
          </div>
        </form>

        <section class="db-raw-section">
          <h2 class="dash-h2">
            Raw object
          </h2>
          <pre class="db-raw mono">{{
            JSON.stringify(selected, null, 2)
          }}</pre>
        </section>
      </template>
    </aside>
  </article>
</template>

<style scoped>
#main-db {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: calc(100vh - var(--header-h) - 3rem);
  max-height: calc(100vh - var(--header-h) - 2rem);
  padding: 0.25rem 0 0;
  overflow: hidden;
}

.db-top {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem 1rem;
  margin-bottom: 0.35rem;
}

.db-top .page-title {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.db-count {
  font-size: 1rem;
  font-weight: 500;
}

.db-top-actions button {
  width: auto;
  margin: 0;
}

.db-summary {
  margin: 0 0 1rem;
  font-size: 0.8125rem;
}

.db-summary strong {
  color: var(--text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.db-toolbar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
}

.db-search {
  width: 100% !important;
  max-width: none !important;
  margin: 0 !important;
  min-height: 2.5rem !important;
}

.db-list {
  flex: 1 1 auto;
  min-height: 10rem;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  overflow-x: hidden;
  overflow-y: auto;
  max-height: none;
}

#main-db:has(.db-pane) .db-list {
  flex: 0 1 42vh;
  max-height: 42vh;
  min-height: 8rem;
}

.db-empty {
  margin: 0;
  padding: 2rem 1.25rem;
  text-align: center;
}

.db-rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

.db-rows > li {
  margin: 0;
  border-bottom: 1px solid var(--border-subtle);
}

.db-rows > li:last-child {
  border-bottom: none;
}

.db-row {
  display: grid;
  grid-template-columns: 3.5rem minmax(0, 1fr) auto;
  gap: 0.65rem 1rem;
  align-items: center;
  width: 100%;
  margin: 0;
  padding: 0.85rem 1rem;
  border: none;
  border-radius: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: none !important;
  font: inherit;
}

.db-row:hover,
.db-row:focus-visible {
  background: var(--bg-surface-2);
  outline: none !important;
  box-shadow: none !important;
}

.db-row.active {
  background: var(--bg-surface-2);
  box-shadow: none !important;
}

.db-row-num code {
  font-size: 0.8125rem;
  color: var(--text-muted);
  background: transparent;
  padding: 0;
}

.db-row-main {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.db-row-title {
  font-weight: 550;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.db-row-meta {
  font-size: 0.75rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.db-row-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  justify-content: flex-end;
}

@media (max-width: 700px) {
  .db-row {
    grid-template-columns: 3rem minmax(0, 1fr);
  }

  .db-row-badges {
    grid-column: 2;
    justify-content: flex-start;
  }
}

.db-pane {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  margin-top: 0.85rem;
  padding: 1.15rem 1.25rem 1.35rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  overflow-x: hidden;
  overflow-y: auto;
}

.db-pane-loading {
  margin: 0;
  padding: 1rem 0;
}

.db-pane-head {
  margin-bottom: 1.1rem;
  padding-bottom: 0.9rem;
  border-bottom: 1px solid var(--border-subtle);
}

.db-pane-title {
  margin: 0.25rem 0 0.4rem;
  font-size: 1.15rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.3;
  color: var(--text);
}

.db-pane-sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.5rem;
  margin: 0;
  font-size: 0.8125rem;
}

.db-pane-form label {
  margin-bottom: 0.75rem !important;
}

.db-pane-form input,
.db-pane-form select,
.db-pane-form textarea {
  width: 100% !important;
  max-width: none !important;
}

.db-pane-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem 0.75rem;
}

.db-pane-grid-3 {
  grid-template-columns: 1fr 1fr 1fr;
}

@media (max-width: 700px) {
  .db-pane-grid,
  .db-pane-grid-3 {
    grid-template-columns: 1fr;
  }
}

.db-pane-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.5rem 0 1rem;
}

.db-pane-actions button {
  width: auto !important;
  margin: 0 !important;
  flex: 0 0 auto;
}

.db-raw-section {
  margin-top: 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-subtle);
}

.db-raw-section .dash-h2 {
  margin-bottom: 0.65rem !important;
}

.db-raw {
  margin: 0;
  padding: 0.85rem 1rem;
  max-height: 16rem;
  overflow: auto;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-code);
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.mono {
  font-family: ui-monospace, Menlo, Consolas, monospace;
}
</style>
