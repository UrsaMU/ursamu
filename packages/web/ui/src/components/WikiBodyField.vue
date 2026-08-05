<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { useLiveStore } from "@/stores/live";
import {
  renderWikiMarkdown,
  type WikiTitleIndex,
} from "@/utils/wikiMarkdown";

const body = defineModel<string>({ required: true });

const props = defineProps<{
  id?: string;
  rows?: number;
  disabled?: boolean;
  /** Page path — resolves ![alt](file.png) in preview. */
  pagePath?: string;
}>();

const emit = defineEmits<{ change: [] }>();
const mode = ref<"edit" | "preview">("edit");

const live = useLiveStore();
const { pages } = storeToRefs(live);

const wikiIndex = computed((): WikiTitleIndex => {
  const idx: WikiTitleIndex = {};
  for (const p of pages.value) {
    if (p.path) idx[String(p.path)] = String(p.title || p.path);
  }
  return idx;
});

const previewHtml = computed(() =>
  renderWikiMarkdown(body.value || "", {
    wikiIndex: wikiIndex.value,
    pagePath: props.pagePath ?? "",
  })
);
</script>

<template>
  <fieldset class="wiki-body-field">
    <legend>Body</legend>
    <div
      class="mode-row"
      role="radiogroup"
      aria-label="Body view"
    >
      <label>
        <input
          v-model="mode"
          type="radio"
          value="edit"
        >
        Edit
      </label>
      <label>
        <input
          v-model="mode"
          type="radio"
          value="preview"
        >
        Preview
      </label>
    </div>
    <textarea
      v-show="mode === 'edit'"
      :id="id"
      v-model="body"
      class="mono"
      :rows="rows ?? 16"
      required
      maxlength="500000"
      :disabled="disabled"
      @input="emit('change')"
    />
    <!-- FE-parity markdown (same rules as /site wiki reader) -->
    <div
      v-show="mode === 'preview'"
      class="preview wiki-md-preview"
      aria-live="polite"
      v-html="previewHtml"
    />
  </fieldset>
</template>
