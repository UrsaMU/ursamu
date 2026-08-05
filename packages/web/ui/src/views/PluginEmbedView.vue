<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { storeToRefs } from "pinia";
import { useLiveStore } from "@/stores/live";

const route = useRoute();
const live = useLiveStore();
const { staffNav } = storeToRefs(live);
const frameEl = ref<HTMLIFrameElement | null>(null);

const pluginId = computed(() =>
  String(route.params.pluginId ?? "").trim()
);

const entry = computed(() =>
  staffNav.value.find((p) => p.id === pluginId.value)
);

const isCrossOrigin = computed(() => {
  const src = entry.value?.embed?.trim() ?? "";
  return /^https?:\/\//i.test(src);
});

/** Block embed if cross-origin without matching allowlist. */
const blocked = computed(() => {
  if (!isCrossOrigin.value) return false;
  const src = entry.value?.embed?.trim() ?? "";
  const allow = entry.value?.embedOrigin?.trim() ?? "";
  if (!allow) return true;
  try {
    return new URL(src).origin !== allow;
  } catch {
    return true;
  }
});

const embedSrc = computed(() => {
  if (blocked.value) return "";
  const src = entry.value?.embed?.trim();
  if (!src) return "";
  // Forward host query (side-nav tabs) into the iframe URL
  const q = route.fullPath.includes("?")
    ? route.fullPath.slice(route.fullPath.indexOf("?"))
    : "";
  if (!q) return src;
  if (src.includes("?")) return `${src}&${q.slice(1)}`;
  return `${src}${q}`;
});

const title = computed(() =>
  entry.value?.label || pluginId.value || "Plugin"
);

const missing = computed(() =>
  !pluginId.value || !entry.value?.embed || blocked.value
);

const sandbox = computed(() => {
  // Cross-origin: no allow-same-origin (harder cookie theft)
  if (isCrossOrigin.value) {
    return "allow-scripts allow-forms allow-popups";
  }
  return "allow-scripts allow-same-origin allow-forms allow-popups";
});

/** staff-embed/v1 — notify child of query / theme (best-effort). */
function postEmbedQuery(): void {
  const win = frameEl.value?.contentWindow;
  if (!win) return;
  const target = entry.value?.embedOrigin ||
    (isCrossOrigin.value ? "*" : window.location.origin);
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(route.query)) {
    if (v == null) continue;
    query[k] = Array.isArray(v) ? String(v[0] ?? "") : String(v);
  }
  try {
    win.postMessage(
      {
        type: "staff-embed/v1",
        event: "query",
        pluginId: pluginId.value,
        query,
      },
      target === "*" ? "*" : target,
    );
  } catch {
    /* ignore */
  }
}

watch(
  () => route.fullPath,
  () => {
    // src update handles most cases; postMessage helps SPAs that ignore URL
    postEmbedQuery();
  },
);
</script>

<template>
  <article
    id="main-plugin-embed"
    class="plugin-embed-pane"
  >
    <header
      v-if="missing"
      class="dash-header"
    >
      <div>
        <p class="muted dash-kicker">
          Plugin
        </p>
        <h1 class="page-title">
          {{ blocked ? "Embed blocked" : "Not available" }}
        </h1>
        <p class="muted">
          <template v-if="blocked">
            Cross-origin embed requires a matching
            <code>embedOrigin</code> allowlist on
            <code>registerStaffPage</code>.
          </template>
          <template v-else>
            No embedded staff page is registered for
            <code>{{ pluginId || "…" }}</code>.
          </template>
        </p>
      </div>
    </header>
    <template v-else>
      <iframe
        ref="frameEl"
        class="staff-embed"
        :src="embedSrc"
        :title="title"
        :referrerpolicy="isCrossOrigin ? 'no-referrer' : 'same-origin'"
        :sandbox="sandbox"
        @load="postEmbedQuery"
      />
    </template>
  </article>
</template>

<style scoped>
.plugin-embed-pane {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  margin: 0;
  padding: 0;
}

.staff-embed {
  flex: 1 1 auto;
  width: 100%;
  min-height: calc(100vh - var(--header-h, 3.5rem) - 2rem);
  border: 0;
  background: var(--bg, transparent);
}
</style>
