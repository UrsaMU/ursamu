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
  flagsToString,
  isStaffFlags,
  locationLabel,
  normalizeFlags,
  stripMushCodes,
} from "@/utils/text";

const props = defineProps<{ id?: string }>();
const live = useLiveStore();
const { players, objectsLoaded, playerCount } =
  storeToRefs(live);
const session = useSessionStore();
const route = useRoute();
const router = useRouter();

type Filter = "all" | "online" | "staff" | "offline";

const q = ref("");
const filter = ref<Filter>("all");
const selectedKey = ref("");
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

watch(
  () => route.query.filter,
  (f) => {
    if (
      f === "online" ||
      f === "staff" ||
      f === "offline" ||
      f === "all"
    ) {
      filter.value = f;
    } else if (!f) {
      filter.value = "all";
    }
  },
  { immediate: true },
);

function playerPlainName(o: DboStub): string {
  return String(o.data?.name ?? o.id ?? "—");
}

function playerMonikerPlain(o: DboStub): string {
  return stripMushCodes(o.data?.moniker) || "";
}

function isStaffPlayer(o: DboStub): boolean {
  return isStaffFlags(normalizeFlags(o.flags));
}

const onlineCount = computed(() =>
  players.value.filter((o) => live.isOnline(o.id)).length,
);

const staffCount = computed(() =>
  players.value.filter((o) => isStaffPlayer(o)).length,
);

const rows = computed(() => {
  let list = [...players.value];
  if (filter.value === "online") {
    list = list.filter((o) => live.isOnline(o.id));
  } else if (filter.value === "offline") {
    list = list.filter((o) => !live.isOnline(o.id));
  } else if (filter.value === "staff") {
    list = list.filter((o) => isStaffPlayer(o));
  }
  const needle = q.value.trim().toLowerCase();
  if (needle) {
    list = list.filter((o) => {
      const id = String(o.id || "").toLowerCase();
      const name = playerPlainName(o).toLowerCase();
      const mono = playerMonikerPlain(o).toLowerCase();
      const fl = flagsToString(o.flags).toLowerCase();
      const loc = String(o.location || "").toLowerCase();
      return (
        id.includes(needle) ||
        name.includes(needle) ||
        mono.includes(needle) ||
        fl.includes(needle) ||
        loc.includes(needle)
      );
    });
  }
  return list.sort((a, b) => {
    const ao = live.isOnline(a.id) ? 0 : 1;
    const bo = live.isOnline(b.id) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return playerPlainName(a).localeCompare(
      playerPlainName(b),
    );
  });
});

async function openPlayer(id: string): Promise<void> {
  const key = id.replace(/^#/, "");
  if (selectedKey.value !== key) {
    if (!confirmLeave("Discard player edits?")) return;
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
      name: "player-detail",
      params: { id: key },
      query: route.query,
    });
  }
}

function clearSelection(): void {
  if (!confirmLeave("Discard player edits?")) return;
  selectedKey.value = "";
  void router.replace({
    name: "players",
    query: route.query,
  });
}

watch(
  () => props.id || (route.params.id as string | undefined),
  (id) => {
    if (id) void openPlayer(String(id));
    else if (route.name === "players") {
      selectedKey.value = "";
    }
  },
  { immediate: true },
);

onBeforeRouteLeave(() =>
  confirmLeave("Discard player edits?"),
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
  const fl = flagsToString(o.flags)
    .split(/\s+/)
    .filter((t) => t && t !== "player" && t !== "connected")
    .join(" ");
  return fl.length > 36
    ? fl.slice(0, 33) + "…"
    : fl || "—";
}

function locLabel(o: DboStub): string {
  return locationLabel(o.location, (id) => live.getObject(id));
}

async function refresh(): Promise<void> {
  await Promise.all([
    live.refreshObjects(),
    live.refreshOnline(),
  ]);
}
</script>

<template>
  <article id="main-players">
    <header class="pl-top">
      <div class="pl-top-text">
        <p class="muted dash-kicker">
          Accounts
        </p>
        <h1 class="page-title">
          Players
          <span
            v-if="objectsLoaded"
            class="pl-count muted"
          >
            {{ rows.length }}{{
              rows.length !== playerCount
                ? ` of ${playerCount}`
                : ""
            }}
          </span>
        </h1>
      </div>
      <div class="pl-top-actions">
        <button
          type="button"
          class="secondary outline"
          @click="refresh"
        >
          Refresh
        </button>
      </div>
    </header>

    <p
      v-if="objectsLoaded"
      class="pl-summary muted"
    >
      <strong>{{ onlineCount }}</strong> online
      · <strong>{{
        playerCount - onlineCount
      }}</strong> offline
      · <strong>{{ staffCount }}</strong> staff
      · <strong>{{ playerCount }}</strong> total
    </p>

    <div class="pl-toolbar">
      <input
        v-model="q"
        type="search"
        class="pl-search"
        placeholder="Search name, moniker, id, flags…"
        autocomplete="off"
        aria-label="Search players"
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
      class="pl-list"
      aria-label="Player list"
    >
      <div
        v-if="!objectsLoaded"
        class="pl-empty muted"
      >
        Loading players…
      </div>
      <div
        v-else-if="!rows.length"
        class="pl-empty muted"
      >
        No players match this filter.
      </div>
      <ul
        v-else
        class="pl-rows"
      >
        <li
          v-for="o in rows"
          :key="String(o.id)"
        >
          <button
            type="button"
            class="pl-row"
            :class="{
              active: selectedKey === String(o.id),
            }"
            @click="openPlayer(String(o.id))"
          >
            <span class="pl-row-num">
              <code>#{{ o.id }}</code>
            </span>
            <span class="pl-row-main">
              <span class="pl-row-title">
                {{ playerPlainName(o) }}
                <span
                  v-if="playerMonikerPlain(o)"
                  class="pl-row-mono muted"
                >
                  · {{ playerMonikerPlain(o) }}
                </span>
              </span>
              <span class="pl-row-meta muted">
                {{ locLabel(o) }}
                · {{ shortFlags(o) }}
              </span>
            </span>
            <span class="pl-row-badges">
              <span
                v-if="isStaffPlayer(o)"
                class="badge"
              >staff</span>
              <span
                class="badge"
                :class="
                  live.isOnline(o.id)
                    ? 'badge-live'
                    : ''
                "
              >
                {{
                  live.isOnline(o.id)
                    ? "Online"
                    : "Offline"
                }}
              </span>
            </span>
          </button>
        </li>
      </ul>
    </section>

    <aside
      v-if="selectedKey"
      class="pl-pane"
      aria-label="Player detail"
    >
      <p
        v-if="loadingDetail && !selected"
        class="muted pl-pane-loading"
      >
        Loading player…
      </p>
      <template v-else-if="selected && form">
        <header class="pl-pane-head">
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
          <h2 class="pl-pane-title">
            {{ form.name || playerPlainName(selected) }}
          </h2>
          <p class="muted pl-pane-sub">
            <span
              class="badge"
              :class="
                live.isOnline(selected.id)
                  ? 'badge-live'
                  : ''
              "
            >
              {{
                live.isOnline(selected.id)
                  ? "Online"
                  : "Offline"
              }}
            </span>
            <span
              v-if="isStaffPlayer(selected)"
              class="badge"
            >staff</span>
            <span>{{ locLabel(selected) }}</span>
          </p>
        </header>

        <form
          class="pl-pane-form"
          @submit.prevent="save"
        >
          <div class="pl-pane-grid">
            <label>
              Name
              <input v-model="form.name">
            </label>
            <label>
              Moniker
              <input
                v-model="form.moniker"
                class="mono"
              >
            </label>
          </div>
          <label>
            Flags
            <input
              v-model="form.flags"
              class="mono"
            >
          </label>
          <div class="pl-pane-grid pl-pane-grid-3">
            <label>
              Location
              <input
                v-model="form.location"
                class="mono"
              >
            </label>
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
          </div>
          <label>
            Image
            <input v-model="form.image">
          </label>
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
          <div class="pl-pane-actions">
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
              Save player
            </button>
          </div>
        </form>
      </template>
    </aside>
  </article>
</template>

<style scoped>
#main-players {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: calc(100vh - var(--header-h) - 3rem);
  max-height: calc(100vh - var(--header-h) - 2rem);
  padding: 0.25rem 0 0;
  overflow: hidden;
}

.pl-top {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem 1rem;
  margin-bottom: 0.35rem;
}

.pl-top .page-title {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.pl-count {
  font-size: 1rem;
  font-weight: 500;
}

.pl-top-actions button {
  width: auto;
  margin: 0;
}

.pl-summary {
  margin: 0 0 1rem;
  font-size: 0.8125rem;
}

.pl-summary strong {
  color: var(--text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.pl-toolbar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
}

.pl-search {
  width: 100% !important;
  max-width: none !important;
  margin: 0 !important;
  min-height: 2.5rem !important;
}

.pl-list {
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

#main-players:has(.pl-pane) .pl-list {
  flex: 0 1 42vh;
  max-height: 42vh;
  min-height: 8rem;
}

.pl-empty {
  margin: 0;
  padding: 2rem 1.25rem;
  text-align: center;
}

.pl-rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

.pl-rows > li {
  margin: 0;
  border-bottom: 1px solid var(--border-subtle);
}

.pl-rows > li:last-child {
  border-bottom: none;
}

.pl-row {
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

.pl-row:hover,
.pl-row:focus-visible {
  background: var(--bg-surface-2);
  outline: none !important;
  box-shadow: none !important;
}

.pl-row.active {
  background: var(--bg-surface-2);
  box-shadow: none !important;
}

.pl-row-num code {
  font-size: 0.8125rem;
  color: var(--text-muted);
  background: transparent;
  padding: 0;
}

.pl-row-main {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.pl-row-title {
  font-weight: 550;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pl-row-mono {
  font-weight: 400;
}

.pl-row-meta {
  font-size: 0.75rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pl-row-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  justify-content: flex-end;
}

@media (max-width: 700px) {
  .pl-row {
    grid-template-columns: 3rem minmax(0, 1fr);
  }

  .pl-row-badges {
    grid-column: 2;
    justify-content: flex-start;
  }
}

.pl-pane {
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

.pl-pane-loading {
  margin: 0;
  padding: 1rem 0;
}

.pl-pane-head {
  margin-bottom: 1.1rem;
  padding-bottom: 0.9rem;
  border-bottom: 1px solid var(--border-subtle);
}

.pl-pane-title {
  margin: 0.25rem 0 0.4rem;
  font-size: 1.15rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.3;
  color: var(--text);
}

.pl-pane-sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.5rem;
  margin: 0;
  font-size: 0.8125rem;
}

.pl-pane-form label {
  margin-bottom: 0.75rem !important;
}

.pl-pane-form input,
.pl-pane-form select,
.pl-pane-form textarea {
  width: 100% !important;
  max-width: none !important;
}

.pl-pane-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem 0.75rem;
}

.pl-pane-grid-3 {
  grid-template-columns: 1fr 1fr 1fr;
}

@media (max-width: 700px) {
  .pl-pane-grid,
  .pl-pane-grid-3 {
    grid-template-columns: 1fr;
  }
}

.pl-pane-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.5rem 0 1rem;
}

.pl-pane-actions button {
  width: auto !important;
  margin: 0 !important;
  flex: 0 0 auto;
}

.mono {
  font-family: ui-monospace, Menlo, Consolas, monospace;
}
</style>
