<script setup lang="ts">
/**
 * Colored MUSH text for the game client (design.md tokens).
 */
import { computed } from "vue";
import { mushTextToHtml } from "@/utils/mushText";

const props = defineProps<{
  text?: string | null;
}>();

const html = computed(() => mushTextToHtml(props.text ?? ""));
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <span
    class="mush-text"
    v-html="html"
  />
</template>
