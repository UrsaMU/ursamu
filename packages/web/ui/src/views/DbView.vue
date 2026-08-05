<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
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
  isStaffFlags,
  locationLabel,
  normalizeFlags,
} from "@/utils/text";
import PlayerSelect from "@/components/PlayerSelect.vue";

const props = defineProps<{ id?: string }>();
const live = useLiveStore();
const { objects, objectsLoaded, objectCount } =
  storeToRefs(live);
const session = useSessionStore();
const route = useRoute();
const router = useRouter();

/** Type + player-status filters (Players section folded into DB). */
type TypeFilter =
  | "all"
  | "player"
  | "online"
  | "offline"
  | "staff"
  | "room"
  | "exit"
  | "thing";

const q = ref("");
const typeFilter = ref<TypeFilter>("all");
const selectedKey = ref("");

watch(
  () => route.query.filter,
  (f) => {
    if (
      f === "player" ||
      f === "online" ||
      f === "offline" ||
      f === "staff" ||
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
const imageBusy = ref(false);
const imageError = ref("");
const imageUrlIn = ref("");
const imageFileInput = ref<HTMLInputElement | null>(null);


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

const filterBits = computed(() => {
  const bits: string[] = [];
  const labels: Record<TypeFilter, string> = {
    all: "",
    player: "players only",
    online: "online players",
    offline: "offline players",
    staff: "staff only",
    room: "rooms only",
    exit: "exits only",
    thing: "things only",
  };
  if (typeFilter.value !== "all") {
    bits.push(labels[typeFilter.value]);
  }
  if (q.value.trim()) {
    bits.push(`search “${q.value.trim()}”`);
  }
  return bits;
});

function isPlayerObj(o: DboStub): boolean {
  return dboType(o) === "player";
}

const rows = computed(() => {
  let list = [...objects.value];
  const f = typeFilter.value;
  if (f === "player") {
    list = list.filter((o) => isPlayerObj(o));
  } else if (f === "online") {
    list = list.filter(
      (o) => isPlayerObj(o) && live.isOnline(o.id),
    );
  } else if (f === "offline") {
    list = list.filter(
      (o) => isPlayerObj(o) && !live.isOnline(o.id),
    );
  } else if (f === "staff") {
    list = list.filter(
      (o) =>
        isPlayerObj(o) &&
        isStaffFlags(normalizeFlags(o.flags)),
    );
  } else if (f === "room" || f === "exit" || f === "thing") {
    list = list.filter((o) => dboType(o) === f);
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
    // Players: online first when in a player-ish filter
    if (
      f === "player" || f === "online" || f === "offline" ||
      f === "staff"
    ) {
      const ao = live.isOnline(a.id) ? 0 : 1;
      const bo = live.isOnline(b.id) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return dboName(a).localeCompare(dboName(b));
    }
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

/** List browser vs object editor (Wiki list / Wiki edit). */
const isDetail = computed(
  () =>
    Boolean(selectedKey.value) ||
    route.name === "db-detail" ||
    Boolean(props.id || route.params.id),
);

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
  void router.replace({
    name: "db",
    query: { ...route.query },
  });
}

function clearFilters(): void {
  q.value = "";
  void router.replace({ name: "db", query: {} });
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

function onKey(ev: KeyboardEvent): void {
  if ((ev.metaKey || ev.ctrlKey) && (ev.key === "s" || ev.key === "S")) {
    if (!isDetail.value || !dirty.value || busy.value) return;
    ev.preventDefault();
    void save();
  }
}

onMounted(() => {
  document.addEventListener("keydown", onKey);
});
onUnmounted(() => {
  document.removeEventListener("keydown", onKey);
});

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


const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function applyImageResult(
  data: DboStub & { imageUrl?: string },
): void {
  const url = String(
    data.imageUrl ||
      data.data?.image ||
      "",
  ).trim();
  if (url) {
    form.value.image = url;
    // Keep live store + form in sync for preview
    const merged: DboStub = {
      ...data,
      data: {
        ...(data.data || {}),
        image: url,
      },
    };
    live.upsertObject(merged);
    markSaved(merged);
  } else {
    live.upsertObject(data);
    markSaved(data);
  }
}

async function uploadObjectImage(file: File): Promise<void> {
  if (!selected.value?.id) return;
  imageBusy.value = true;
  imageError.value = "";
  saveOk.value = "";
  try {
    if (file.size > MAX_UPLOAD_BYTES) {
      imageError.value =
        "Image must be 8 MB or smaller. " +
        "Compress or resize, then try again.";
      return;
    }
    if (!/^image\/(png|jpeg|jpg|gif|webp)$/i.test(file.type) &&
      !/\.(png|jpe?g|gif|webp)$/i.test(file.name)) {
      imageError.value =
        "Use PNG, JPEG, GIF, or WebP.";
      return;
    }
    const fd = new FormData();
    fd.append("file", file, file.name);
    const enc = encodeURIComponent(String(selected.value.id));
    const { res, data } = await api<
      DboStub & { error?: string; imageUrl?: string }
    >(`/api/v1/dbobj/${enc}/image`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      imageError.value = data?.error ||
        `Upload failed (${res.status})`;
      return;
    }
    applyImageResult(data);
    saveOk.value = "Image uploaded.";
  } catch (e: unknown) {
    imageError.value = e instanceof Error
      ? e.message
      : "Upload failed.";
  } finally {
    imageBusy.value = false;
  }
}

async function onImageFile(ev: Event): Promise<void> {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    await uploadObjectImage(file);
  } finally {
    input.value = "";
  }
}

async function importImageUrl(): Promise<void> {
  if (!selected.value?.id) return;
  const url = imageUrlIn.value.trim();
  if (!url) {
    imageError.value = "Paste an image URL first.";
    return;
  }
  imageBusy.value = true;
  imageError.value = "";
  saveOk.value = "";
  try {
    const enc = encodeURIComponent(String(selected.value.id));
    const { res, data } = await api<
      DboStub & { error?: string; imageUrl?: string }
    >(`/api/v1/dbobj/${enc}/image`, {
      method: "POST",
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      imageError.value = data?.error ||
        `Import failed (${res.status})`;
      return;
    }
    applyImageResult(data);
    imageUrlIn.value = "";
    saveOk.value = "Image imported.";
  } catch (e: unknown) {
    imageError.value = e instanceof Error
      ? e.message
      : "Import failed.";
  } finally {
    imageBusy.value = false;
  }
}

async function clearObjectImage(): Promise<void> {
  if (!selected.value?.id) return;
  if (!globalThis.confirm("Clear this object's image?")) return;
  imageBusy.value = true;
  imageError.value = "";
  try {
    const enc = encodeURIComponent(String(selected.value.id));
    const { res, data } = await api<DboStub & { error?: string }>(
      `/api/v1/dbobj/${enc}/image`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      imageError.value = data?.error || `Clear failed (${res.status})`;
      return;
    }
    live.upsertObject(data);
    markSaved(data);
    form.value.image = "";
    saveOk.value = "Image cleared.";
  } finally {
    imageBusy.value = false;
  }
}

function shortFlags(o: DboStub): string {
  const fl = flagsToString(o.flags);
  return fl.length > 40
    ? fl.slice(0, 37) + "…"
    : fl || "—";
}

function locLabel(o: DboStub): string {
  return locationLabel(o.location, (id) => live.getObject(id));
}

function zoneLabel(o: DboStub): string {
  const z = o.data?.zone;
  return z ? `#${z}` : "—";
}

function typeBadgeClass(t: string): string {
  if (t === "player") return "badge-live";
  if (t === "room") return "badge";
  return "badge";
}
</script>

<template>
  <!-- ── List (Wiki browser pattern) ─────────────────────────── -->
  <article
    v-if="!isDetail"
    id="main-db"
    class="dash-browser"
  >
    <header class="dash-header">
      <div>
        <p class="muted dash-kicker">
          Game world
        </p>
        <h1 class="page-title">
          Database
          <span class="muted">
            ({{ rows.length }}{{
              objectsLoaded && rows.length !== objectCount
                ? ` of ${objectCount}`
                : ""
            }})
          </span>
        </h1>
        <p class="muted">
          Browse and open objects — type filters live in the
          side nav.
        </p>
      </div>
      <div class="dash-header-actions">
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
      class="muted"
    >
      <strong>{{ typeCounts.player }}</strong> players
      · <strong>{{ typeCounts.room }}</strong> rooms
      · <strong>{{ typeCounts.exit }}</strong> exits
      · <strong>{{ typeCounts.thing }}</strong> things
    </p>

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
      aria-label="Search objects"
    >
      <label class="pages-search-label">
        <span class="sr-only">Search objects</span>
        <input
          v-model="q"
          type="search"
          placeholder="Search id, name, flags, zone…"
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
              Id
            </th>
            <th scope="col">
              Name
            </th>
            <th scope="col">
              Type
            </th>
            <th scope="col">
              Status
            </th>
            <th scope="col">
              Location
            </th>
            <th scope="col">
              Zone
            </th>
            <th scope="col">
              Flags
            </th>
            <th scope="col">
              <span class="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!objectsLoaded">
            <td
              colspan="8"
              class="muted"
            >
              Loading objects…
            </td>
          </tr>
          <tr v-else-if="!rows.length">
            <td
              colspan="8"
              class="muted"
            >
              No objects match this filter.
            </td>
          </tr>
          <tr
            v-for="o in rows"
            :key="String(o.id)"
          >
            <td>
              <code>#{{ o.id }}</code>
            </td>
            <td>
              {{ dboName(o) }}
            </td>
            <td>
              <span
                class="badge"
                :class="typeBadgeClass(dboType(o))"
              >
                {{ dboType(o) }}
              </span>
            </td>
            <td>
              <span
                v-if="isPlayerObj(o) && live.isOnline(o.id)"
                class="badge badge-live"
              >online</span>
              <span
                v-else-if="isPlayerObj(o)"
                class="muted"
              >offline</span>
              <span
                v-else
                class="muted"
              >—</span>
            </td>
            <td class="muted">
              {{ locLabel(o) }}
            </td>
            <td class="muted">
              {{ zoneLabel(o) }}
            </td>
            <td class="muted">
              {{ shortFlags(o) }}
            </td>
            <td class="row-open">
              <button
                type="button"
                class="secondary outline"
                @click="openObject(String(o.id))"
              >
                Open
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </article>

  <!-- ── Detail (Wiki edit pattern) ──────────────────────────── -->
  <article
    v-else
    id="main-db-editor"
  >
    <header class="editor-header">
      <div>
        <p class="editor-path-line">
          <button
            type="button"
            class="back-link"
            @click="clearSelection"
          >
            ← Database
          </button>
          <code v-if="selectedKey">#{{ selectedKey }}</code>
          <span
            v-if="dirty"
            class="dirty-dot"
            title="Unsaved changes"
            aria-label="Unsaved changes"
          >●</span>
          <small
            v-if="selected"
            class="muted"
          >
            {{ dboType(selected) }}
          </small>
        </p>
        <h1 class="page-title page-title-tight">
          {{
            form?.name ||
              (selected ? dboName(selected) : "Object")
          }}
        </h1>
        <p
          v-if="selected"
          class="muted"
        >
          {{ locLabel(selected) }}
          · zone {{ zoneLabel(selected) }}
        </p>
      </div>
      <div class="editor-actions">
        <button
          type="button"
          class="secondary outline"
          :disabled="!dirty || busy || !selected"
          @click="selected && resetFrom(selected)"
        >
          Discard
        </button>
        <button
          type="button"
          :disabled="!dirty || busy || !selected"
          :aria-busy="busy"
          @click="save"
        >
          Save
        </button>
      </div>
    </header>

    <p
      v-if="loadingDetail && !selected"
      class="muted"
      aria-busy="true"
    >
      Loading object…
    </p>
    <p
      v-else-if="loadError"
      class="error"
      role="alert"
    >
      {{ loadError }}
    </p>

    <form
      v-else-if="selected && form"
      @submit.prevent="save"
    >
      <div class="db-edit-grid">
        <label>
          Name
          <input
            v-model="form.name"
            maxlength="200"
          >
        </label>
        <label>
          Moniker
          <input
            v-model="form.moniker"
            maxlength="500"
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
      <div class="db-edit-grid">
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
      <div class="db-edit-grid">
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
        <label class="db-image-field settings-span-2">
          Image
          <input
            v-model="form.image"
            type="text"
            class="mono"
            placeholder="/images/… or paste URL then Import"
            autocomplete="off"
          >
          <div
            v-if="form.image"
            class="db-image-preview"
          >
            <img
              :key="form.image"
              :src="form.image"
              alt="Object image"
              loading="lazy"
            >
          </div>
          <div class="db-image-actions">
            <input
              ref="imageFileInput"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              class="sr-only"
              @change="onImageFile"
            >
            <button
              type="button"
              class="secondary outline"
              :disabled="imageBusy"
              @click="imageFileInput?.click()"
            >
              Upload file
            </button>
            <input
              v-model="imageUrlIn"
              type="url"
              class="mono db-image-url"
              placeholder="https://… to import"
              :disabled="imageBusy"
              @keydown.enter.prevent="importImageUrl"
            >
            <button
              type="button"
              class="secondary outline"
              :disabled="imageBusy"
              @click="importImageUrl"
            >
              Import URL
            </button>
            <button
              type="button"
              class="secondary outline"
              :disabled="imageBusy || !form.image"
              @click="clearObjectImage"
            >
              Clear
            </button>
          </div>
          <p
            v-if="imageError"
            class="error"
            role="alert"
          >
            {{ imageError }}
          </p>
          <p class="muted db-image-hint">
            Stored under <code>/images/</code>.
            Full width on web look
            (<code>object-fit: contain</code>,
            max ~512px / 50vh tall).
            PNG, JPEG, GIF, WebP · max 8&nbsp;MB.
            In-game: <code>@image here=&lt;url&gt;</code>.
          </p>
        </label>
      </div>
      <label>
        Description
        <textarea
          v-model="form.description"
          class="mono"
          rows="8"
        />
      </label>

      <p
        v-if="saveError"
        class="error"
        role="alert"
      >
        {{ saveError }}
      </p>
      <p
        v-if="saveOk"
        class="muted"
      >
        {{ saveOk }}
      </p>
      <p>
        <small class="muted">
          Save with the button or Ctrl/⌘+S when focused in the
          form.
        </small>
      </p>
    </form>

    <section
      v-if="selected"
      class="db-raw-block"
    >
      <h2 class="dash-h2">
        Raw object
      </h2>
      <pre class="db-raw mono">{{
        JSON.stringify(selected, null, 2)
      }}</pre>
    </section>
  </article>
</template>

<style scoped>
/* Host chrome only — minimal extras for raw JSON */
.db-raw-block {
  margin-top: 1.75rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--border-subtle);
}

.db-raw {
  margin: 0;
  padding: 0.85rem 1rem;
  max-height: 18rem;
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

.db-image-field {
  grid-column: 1 / -1;
  width: 100%;
  max-width: none !important;
}
.db-image-preview {
  display: block;
  width: 100%;
  max-width: 100%;
  margin: 0.5rem 0;
  box-sizing: border-box;
  background: var(--bg-code, #0e0c16);
  border: 1px solid var(--border-subtle, #333);
  border-radius: var(--radius-sm, 4px);
  overflow: hidden;
}
.db-image-preview img {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
  max-height: min(50vh, 512px);
  object-fit: contain;
  object-position: center top;
  box-sizing: border-box;
  margin: 0;
  border: 0;
}
.db-image-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin-top: 0.5rem;
  width: 100%;
}
.db-image-url {
  flex: 1 1 12rem;
  min-width: 10rem;
}
.db-image-hint {
  margin: 0.4rem 0 0;
  font-size: 0.8rem;
  line-height: 1.4;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
</style>
