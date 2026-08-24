<script setup lang="ts">
/**
 * Staff events console — calendar list + detail + create.
 */
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "@/api/client";

export type GameEvent = {
  id: string;
  number: number;
  title: string;
  description: string;
  location?: string;
  startTime: number;
  endTime?: number;
  status: string;
  tags?: string[];
  maxAttendees?: number;
  createdByName?: string;
  attendingCount?: number;
  maybeCount?: number;
  myRsvp?: string | null;
  attendees?: { id: string; name: string }[];
  maybes?: { id: string; name: string }[];
};

const props = defineProps<{ id?: string }>();
const route = useRoute();
const router = useRouter();

const rows = ref<GameEvent[]>([]);
const selected = ref<GameEvent | null>(null);
const loadError = ref("");
const saveError = ref("");
const saveOk = ref("");
const busy = ref(false);
const loading = ref(false);
const creating = ref(false);
const q = ref("");
const statusFilter = ref<"all" | "upcoming" | "active" | "completed" | "cancelled">("all");

const newForm = ref({
  title: "",
  description: "",
  startTime: "",
  location: "",
  maxAttendees: 0,
});

function when(ms: number | undefined): string {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

const filtered = computed(() => {
  const n = q.value.trim().toLowerCase();
  let list = [...rows.value];
  if (statusFilter.value !== "all") {
    list = list.filter((e) => e.status === statusFilter.value);
  }
  if (n) {
    list = list.filter((e) =>
      `${e.number} ${e.title} ${e.description} ${e.location || ""} ${e.createdByName || ""}`
        .toLowerCase()
        .includes(n)
    );
  }
  return list;
});

async function loadList(): Promise<void> {
  loading.value = true;
  loadError.value = "";
  try {
    const { res, data } = await api<{
      total?: number;
      events?: GameEvent[];
      error?: string;
    }>("/api/v1/events?limit=200");
    if (!res.ok) {
      loadError.value = data?.error || `Load failed (${res.status})`;
      rows.value = [];
      return;
    }
    rows.value = data?.events ?? [];
  } finally {
    loading.value = false;
  }
}

async function openEvent(idOrNum: string | number): Promise<void> {
  loadError.value = "";
  saveOk.value = "";
  creating.value = false;
  const key = encodeURIComponent(String(idOrNum));
  const { res, data } = await api<GameEvent & { error?: string }>(
    `/api/v1/events/${key}`,
  );
  if (!res.ok) {
    loadError.value = data?.error || `Open failed (${res.status})`;
    return;
  }
  selected.value = data as GameEvent;
  const routeId = String(data.number ?? data.id);
  if (props.id !== routeId) {
    await router.replace({
      name: "event-detail",
      params: { id: routeId },
    });
  }
}

async function createEvent(): Promise<void> {
  saveError.value = "";
  saveOk.value = "";
  const title = newForm.value.title.trim();
  const description = newForm.value.description.trim();
  const startTime = newForm.value.startTime.trim();
  if (!title || !description || !startTime) {
    saveError.value = "Title, description, and start time are required.";
    return;
  }
  busy.value = true;
  try {
    const { res, data } = await api<GameEvent & { error?: string }>(
      "/api/v1/events",
      {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          startTime,
          location: newForm.value.location.trim() || undefined,
          maxAttendees: Number(newForm.value.maxAttendees) || 0,
        }),
      },
    );
    if (!res.ok) {
      saveError.value = data?.error || `Create failed (${res.status})`;
      return;
    }
    saveOk.value = `Created #${data.number}`;
    creating.value = false;
    newForm.value = {
      title: "",
      description: "",
      startTime: "",
      location: "",
      maxAttendees: 0,
    };
    await loadList();
    await openEvent(data.number);
  } finally {
    busy.value = false;
  }
}

async function setStatus(status: string): Promise<void> {
  if (!selected.value) return;
  saveError.value = "";
  saveOk.value = "";
  busy.value = true;
  try {
    const key = encodeURIComponent(String(selected.value.number));
    const { res, data } = await api<GameEvent & { error?: string }>(
      `/api/v1/events/${key}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status }),
      },
    );
    if (!res.ok) {
      saveError.value = data?.error || `Update failed (${res.status})`;
      return;
    }
    selected.value = data as GameEvent;
    saveOk.value = `Status → ${status}`;
    await loadList();
  } finally {
    busy.value = false;
  }
}

async function removeEvent(): Promise<void> {
  if (!selected.value) return;
  if (!confirm(`Permanently delete event #${selected.value.number}?`)) {
    return;
  }
  busy.value = true;
  saveError.value = "";
  try {
    const key = encodeURIComponent(String(selected.value.number));
    const { res, data } = await api<{ error?: string }>(
      `/api/v1/events/${key}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      saveError.value = data?.error || `Delete failed (${res.status})`;
      return;
    }
    selected.value = null;
    await router.replace({ name: "events" });
    await loadList();
  } finally {
    busy.value = false;
  }
}

watch(
  () => props.id ?? route.params.id,
  (id) => {
    if (id) void openEvent(String(id));
    else selected.value = null;
  },
  { immediate: true },
);

onMounted(() => {
  void loadList();
});
</script>

<template>
  <div class="dash-page events-view">
    <header class="dash-header">
      <div>
        <h1>Events</h1>
        <p class="lede">
          In-game calendar — create, RSVP roster, cancel or complete.
        </p>
      </div>
      <div class="pages-toolbar">
        <input
          v-model="q"
          type="search"
          class="input"
          placeholder="Search…"
          aria-label="Search events"
        />
        <select v-model="statusFilter" class="input" aria-label="Status filter">
          <option value="all">All statuses</option>
          <option value="upcoming">Upcoming</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button
          type="button"
          class="btn"
          :disabled="loading || busy"
          @click="loadList"
        >
          Refresh
        </button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="busy"
          @click="creating = true; selected = null"
        >
          New event
        </button>
      </div>
    </header>

    <p v-if="loadError" class="error">{{ loadError }}</p>
    <p v-if="saveError" class="error">{{ saveError }}</p>
    <p v-if="saveOk" class="ok">{{ saveOk }}</p>

    <div class="split">
      <section class="list-pane">
        <p v-if="loading" class="muted">Loading…</p>
        <table v-else class="dash-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Title</th>
              <th>When</th>
              <th>RSVPs</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="e in filtered"
              :key="e.id"
              :class="{ active: selected?.id === e.id }"
              @click="openEvent(e.number)"
            >
              <td>{{ e.number }}</td>
              <td>{{ e.title }}</td>
              <td>{{ when(e.startTime) }}</td>
              <td>
                {{ e.attendingCount ?? 0 }}{{ e.maxAttendees ? `/${e.maxAttendees}` : "" }}
              </td>
              <td>
                <span class="pill" :data-status="e.status">{{ e.status }}</span>
              </td>
            </tr>
            <tr v-if="!filtered.length">
              <td colspan="5" class="muted">No events.</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="creating" class="detail-pane">
        <h2>Create event</h2>
        <label>
          Title
          <input v-model="newForm.title" class="input" />
        </label>
        <label>
          Start (YYYY-MM-DD HH:MM)
          <input v-model="newForm.startTime" class="input" placeholder="2030-08-01 19:00" />
        </label>
        <label>
          Location
          <input v-model="newForm.location" class="input" />
        </label>
        <label>
          Max attendees (0 = unlimited)
          <input v-model.number="newForm.maxAttendees" type="number" min="0" class="input" />
        </label>
        <label>
          Description
          <textarea v-model="newForm.description" class="input" rows="5" />
        </label>
        <div class="row-actions">
          <button type="button" class="btn btn-primary" :disabled="busy" @click="createEvent">
            Create
          </button>
          <button type="button" class="btn" :disabled="busy" @click="creating = false">
            Cancel
          </button>
        </div>
      </section>

      <section v-else-if="selected" class="detail-pane">
        <h2>#{{ selected.number }} — {{ selected.title }}</h2>
        <p class="muted">
          {{ when(selected.startTime) }}
          <template v-if="selected.endTime"> → {{ when(selected.endTime) }}</template>
        </p>
        <p v-if="selected.location"><strong>Where:</strong> {{ selected.location }}</p>
        <p v-if="selected.createdByName"><strong>Host:</strong> {{ selected.createdByName }}</p>
        <p>
          <span class="pill" :data-status="selected.status">{{ selected.status }}</span>
        </p>
        <p class="body">{{ selected.description }}</p>

        <h3>
          RSVPs
          ({{ selected.attendingCount ?? 0 }} attending,
          {{ selected.maybeCount ?? 0 }} maybe)
        </h3>
        <ul v-if="selected.attendees?.length" class="plain">
          <li v-for="a in selected.attendees" :key="a.id">{{ a.name }}</li>
        </ul>
        <p v-else class="muted">No attendees yet.</p>

        <div class="row-actions">
          <button
            type="button"
            class="btn"
            :disabled="busy || selected.status === 'active'"
            @click="setStatus('active')"
          >
            Mark active
          </button>
          <button
            type="button"
            class="btn"
            :disabled="busy || selected.status === 'completed'"
            @click="setStatus('completed')"
          >
            Complete
          </button>
          <button
            type="button"
            class="btn"
            :disabled="busy || selected.status === 'cancelled'"
            @click="setStatus('cancelled')"
          >
            Cancel event
          </button>
          <button type="button" class="btn btn-danger" :disabled="busy" @click="removeEvent">
            Delete
          </button>
        </div>
      </section>

      <section v-else class="detail-pane muted">
        Select an event or create a new one.
      </section>
    </div>
  </div>
</template>

<style scoped>
.events-view .split {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}
.list-pane,
.detail-pane {
  background: var(--surface, #141414);
  border: 1px solid var(--border, #2a2a2a);
  border-radius: 8px;
  padding: 0.75rem 1rem;
}
.dash-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.dash-table th,
.dash-table td {
  text-align: left;
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid var(--border, #2a2a2a);
}
.dash-table tr {
  cursor: pointer;
}
.dash-table tr.active {
  background: rgba(80, 140, 255, 0.12);
}
.pages-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.input {
  background: var(--bg, #0d0d0d);
  border: 1px solid var(--border, #333);
  color: inherit;
  border-radius: 6px;
  padding: 0.35rem 0.5rem;
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.65rem;
  font-size: 0.85rem;
}
.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.btn {
  border: 1px solid var(--border, #444);
  background: transparent;
  color: inherit;
  border-radius: 6px;
  padding: 0.35rem 0.7rem;
  cursor: pointer;
}
.btn-primary {
  background: #2f6fed;
  border-color: #2f6fed;
  color: #fff;
}
.btn-danger {
  border-color: #a33;
  color: #f88;
}
.pill {
  display: inline-block;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-size: 0.75rem;
  background: #333;
}
.pill[data-status="upcoming"] {
  background: #1a5c2e;
}
.pill[data-status="active"] {
  background: #7a5b00;
}
.pill[data-status="cancelled"] {
  background: #6b1d1d;
}
.muted {
  opacity: 0.7;
}
.error {
  color: #f66;
}
.ok {
  color: #6c6;
}
.plain {
  margin: 0.25rem 0 0.75rem;
  padding-left: 1.1rem;
}
.body {
  white-space: pre-wrap;
}
@media (max-width: 900px) {
  .events-view .split {
    grid-template-columns: 1fr;
  }
}
</style>
