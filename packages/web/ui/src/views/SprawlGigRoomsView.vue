<script setup lang="ts">
/**
 * Staff: set image URLs for Sprawl gig room types.
 * Applied to instanced site rooms when players +gig/push.
 */
import { onMounted, ref } from "vue";
import { api } from "@/api/client";

type RoomRow = {
  slug: string;
  name: string;
  blurb?: string;
  image: string | null;
};

const rooms = ref<RoomRow[]>([]);
const drafts = ref<Record<string, string>>({});
const loading = ref(true);
const saving = ref<string | null>(null);
const error = ref("");
const okMsg = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const data = await api.get<{
      rooms: RoomRow[];
    }>("/api/v1/sprawl/gig-rooms");
    rooms.value = data.rooms ?? [];
    const d: Record<string, string> = {};
    for (const r of rooms.value) {
      d[r.slug] = r.image ?? "";
    }
    drafts.value = d;
  } catch (e: unknown) {
    error.value = e instanceof Error
      ? e.message
      : "Failed to load";
  } finally {
    loading.value = false;
  }
}

async function saveOne(slug: string) {
  saving.value = slug;
  error.value = "";
  okMsg.value = "";
  try {
    const image = (drafts.value[slug] ?? "").trim() || "clear";
    await api.put("/api/v1/sprawl/gig-rooms", {
      slug,
      image,
    });
    okMsg.value = `Saved ${slug}`;
    await load();
  } catch (e: unknown) {
    error.value = e instanceof Error
      ? e.message
      : "Save failed";
  } finally {
    saving.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div class="sprawl-gigs">
    <header class="sprawl-gigs__head">
      <h1>Sprawl gig room art</h1>
      <p class="muted">
        Image URLs for each room type. When a runner
        <code>+gig/enter</code> / <code>+gig/push</code>,
        their private site room uses the matching image
        and description.
      </p>
    </header>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="okMsg" class="ok">{{ okMsg }}</p>
    <p v-if="loading" class="muted">Loading…</p>

    <div v-else class="sprawl-gigs__list">
      <article
        v-for="r in rooms"
        :key="r.slug"
        class="sprawl-gigs__card"
      >
        <div class="sprawl-gigs__meta">
          <strong>{{ r.name }}</strong>
          <code>{{ r.slug }}</code>
          <p v-if="r.blurb" class="muted">{{ r.blurb }}</p>
        </div>
        <div
          v-if="drafts[r.slug]"
          class="sprawl-gigs__preview"
        >
          <img
            :src="drafts[r.slug]"
            :alt="r.name"
            loading="lazy"
          />
        </div>
        <div class="sprawl-gigs__form">
          <input
            v-model="drafts[r.slug]"
            type="url"
            placeholder="https://… or /images/…"
          />
          <button
            type="button"
            :disabled="saving === r.slug"
            @click="saveOne(r.slug)"
          >
            {{ saving === r.slug ? "Saving…" : "Save" }}
          </button>
          <button
            type="button"
            class="ghost"
            :disabled="saving === r.slug"
            @click="drafts[r.slug] = ''; saveOne(r.slug)"
          >
            Clear
          </button>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.sprawl-gigs {
  max-width: 56rem;
  padding: 1rem 1.25rem 2rem;
}
.sprawl-gigs__head h1 {
  margin: 0 0 0.35rem;
  font-size: 1.35rem;
}
.muted {
  color: var(--muted, #8a8f98);
  font-size: 0.9rem;
}
.err {
  color: #f87171;
}
.ok {
  color: #4ade80;
}
.sprawl-gigs__list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}
.sprawl-gigs__card {
  border: 1px solid var(--border, #2a2f3a);
  border-radius: 8px;
  padding: 0.85rem 1rem;
  background: var(--panel, #12151c);
}
.sprawl-gigs__meta code {
  margin-left: 0.5rem;
  font-size: 0.8rem;
  opacity: 0.8;
}
.sprawl-gigs__preview {
  margin: 0.6rem 0;
  max-height: 140px;
  overflow: hidden;
  border-radius: 6px;
}
.sprawl-gigs__preview img {
  display: block;
  width: 100%;
  max-height: 140px;
  object-fit: cover;
}
.sprawl-gigs__form {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.sprawl-gigs__form input {
  flex: 1 1 14rem;
  min-width: 12rem;
  padding: 0.4rem 0.55rem;
  border-radius: 4px;
  border: 1px solid var(--border, #2a2f3a);
  background: var(--input-bg, #0c0e14);
  color: inherit;
}
.sprawl-gigs__form button {
  padding: 0.4rem 0.75rem;
  border-radius: 4px;
  border: none;
  background: var(--accent, #3b82f6);
  color: #fff;
  cursor: pointer;
}
.sprawl-gigs__form button.ghost {
  background: transparent;
  border: 1px solid var(--border, #2a2f3a);
  color: inherit;
}
.sprawl-gigs__form button:disabled {
  opacity: 0.5;
  cursor: wait;
}
</style>
