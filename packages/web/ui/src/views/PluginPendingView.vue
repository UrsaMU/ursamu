<script setup lang="ts">
/**
 * Host stub for plugins that registerStaffNav({ route }) before a
 * full console page ships. Keeps top-nav links resolvable.
 */
import { computed } from "vue";
import { useRoute } from "vue-router";
import { storeToRefs } from "pinia";
import { useLiveStore } from "@/stores/live";

const route = useRoute();
const live = useLiveStore();
const { staffNav } = storeToRefs(live);

const pluginId = computed(() => {
  const meta = route.meta?.pluginId;
  if (typeof meta === "string" && meta.trim()) return meta.trim();
  return String(route.name ?? "").trim();
});

const entry = computed(() =>
  staffNav.value.find((p) =>
    p.id === pluginId.value || p.route === pluginId.value
  )
);

const title = computed(() =>
  entry.value?.label || pluginId.value || "Plugin"
);

const lede = computed(() =>
  entry.value?.description?.trim() ||
  "This plugin is loaded on the game, but its staff console " +
    "page is not installed yet."
);
</script>

<template>
  <div class="panel plugin-pending">
    <header class="page-head">
      <h1>{{ title }}</h1>
      <p class="lede muted">
        {{ lede }}
      </p>
    </header>
    <div class="card plugin-pending-card">
      <p>
        Use the matching in-game commands for now. When a full
        staff UI ships for this plugin, this tab will open it
        automatically.
      </p>
      <p
        v-if="pluginId"
        class="muted mono"
      >
        plugin: {{ pluginId }}
      </p>
    </div>
  </div>
</template>
