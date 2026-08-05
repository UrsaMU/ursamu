<script setup lang="ts">
import { ref } from "vue";
import { addTag } from "@/utils/wiki";

const tags = defineModel<string[]>({ required: true });
const props = withDefaults(
  defineProps<{
    id?: string;
    placeholder?: string;
    disabled?: boolean;
  }>(),
  {
    id: "tag-input",
    placeholder: "Tag + Enter",
    disabled: false,
  },
);

const emit = defineEmits<{ change: [] }>();
const draft = ref("");

function commit(): void {
  const next = addTag(tags.value, draft.value);
  if (next !== tags.value) {
    tags.value = next;
    emit("change");
  }
  draft.value = "";
}

function remove(tag: string): void {
  tags.value = tags.value.filter((t) => t !== tag);
  emit("change");
}

function onKeydown(ev: KeyboardEvent): void {
  if (ev.key === "Enter" || ev.key === ",") {
    ev.preventDefault();
    commit();
  } else if (
    ev.key === "Backspace" &&
    !draft.value &&
    tags.value.length
  ) {
    tags.value = tags.value.slice(0, -1);
    emit("change");
  }
}
</script>

<template>
  <div class="tag-input-wrap">
    <input
      :id="props.id"
      v-model="draft"
      type="text"
      :placeholder="props.placeholder"
      maxlength="40"
      autocomplete="off"
      :disabled="props.disabled"
      @keydown="onKeydown"
      @blur="commit"
    >
    <div
      class="tag-list"
      aria-live="polite"
    >
      <span
        v-for="tag in tags"
        :key="tag"
        class="tag"
      >
        {{ tag }}
        <button
          type="button"
          :aria-label="`Remove ${tag}`"
          :disabled="props.disabled"
          @click="remove(tag)"
        >
          ×
        </button>
      </span>
    </div>
    <small class="muted">Enter or comma to add.</small>
  </div>
</template>
