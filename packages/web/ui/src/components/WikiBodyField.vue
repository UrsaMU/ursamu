<script setup lang="ts">
import { ref, watch } from "vue";

const body = defineModel<string>({ required: true });

defineProps<{
  id?: string;
  rows?: number;
  disabled?: boolean;
}>();

const emit = defineEmits<{ change: [] }>();
const mode = ref<"edit" | "preview">("edit");

watch(body, () => {
  /* parent dirty tracking via @input */
});
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
    <div
      v-show="mode === 'preview'"
      class="preview"
      aria-live="polite"
    >
      <pre>{{ body }}</pre>
    </div>
  </fieldset>
</template>
