<script setup lang="ts">
/**
 * Dual-mode JSON editor.
 * Form mode: labeled fields for admins.
 * JSON mode: raw text for developers.
 */
import { ref, watch } from "vue";
import type { JsonPath } from "@/utils/jsonForm";
import {
  addArrayItem,
  removeAt,
  setAt,
} from "@/utils/jsonForm";
import JsonFormNode from "./JsonFormNode.vue";

const props = withDefaults(
  defineProps<{
    modelValue: unknown;
    mode?: "form" | "json";
  }>(),
  { mode: "form" },
);

const emit = defineEmits<{
  "update:modelValue": [unknown];
  "update:mode": ["form" | "json"];
  dirty: [];
}>();

const localMode = ref<"form" | "json">(props.mode ?? "form");
const jsonText = ref("");
const jsonError = ref("");

watch(
  () => props.mode,
  (m) => {
    if (m && m !== localMode.value) localMode.value = m;
  },
);

watch(
  () => props.modelValue,
  (v) => {
    if (localMode.value !== "json") return;
    try {
      jsonText.value = JSON.stringify(v, null, 2) + "\n";
      jsonError.value = "";
    } catch {
      /* keep existing text */
    }
  },
  { deep: true, immediate: true },
);

function setMode(m: "form" | "json"): void {
  if (m === localMode.value) return;
  if (m === "json") {
    syncJsonFromModel();
    localMode.value = "json";
    emit("update:mode", "json");
    return;
  }
  // leaving JSON → parse into model
  if (!applyJsonText(true)) return;
  localMode.value = "form";
  emit("update:mode", "form");
}

function syncJsonFromModel(): void {
  try {
    jsonText.value =
      JSON.stringify(props.modelValue, null, 2) + "\n";
    jsonError.value = "";
  } catch (e: unknown) {
    jsonError.value = e instanceof Error
      ? e.message
      : String(e);
  }
}

function applyJsonText(showError: boolean): boolean {
  try {
    const parsed = JSON.parse(jsonText.value);
    jsonError.value = "";
    emit("update:modelValue", parsed);
    emit("dirty");
    return true;
  } catch (e: unknown) {
    if (showError) {
      jsonError.value = e instanceof Error
        ? e.message
        : String(e);
    }
    return false;
  }
}

function onJsonInput(): void {
  applyJsonText(false);
  emit("dirty");
}

function formatJson(): void {
  if (!applyJsonText(true)) return;
  syncJsonFromModel();
}

function touch(next: unknown): void {
  emit("update:modelValue", next);
  emit("dirty");
}

function onSet(path: JsonPath, value: unknown): void {
  touch(setAt(props.modelValue, path, value));
}

function onRemove(path: JsonPath): void {
  touch(removeAt(props.modelValue, path));
}

function onAddItem(path: JsonPath, sample: unknown): void {
  touch(addArrayItem(props.modelValue, path, sample));
}
</script>

<template>
  <div class="jfe">
    <div
      class="jfe-mode"
      role="group"
      aria-label="Editor mode"
    >
      <button
        type="button"
        class="jfe-mode-btn"
        :class="{ active: localMode === 'form' }"
        @click="setMode('form')"
      >
        Form
      </button>
      <button
        type="button"
        class="jfe-mode-btn"
        :class="{ active: localMode === 'json' }"
        @click="setMode('json')"
      >
        JSON
      </button>
      <button
        v-if="localMode === 'json'"
        type="button"
        class="secondary outline jfe-format"
        @click="formatJson"
      >
        Format
      </button>
    </div>

    <p
      v-if="jsonError && localMode === 'json'"
      class="error"
      role="alert"
    >
      {{ jsonError }}
    </p>

    <textarea
      v-if="localMode === 'json'"
      v-model="jsonText"
      class="mono jfe-raw"
      rows="24"
      spellcheck="false"
      aria-label="Raw JSON"
      @input="onJsonInput"
    />

    <div
      v-else
      class="jfe-form"
    >
      <JsonFormNode
        :value="modelValue"
        :path="[]"
        :depth="0"
        @set="onSet"
        @remove="onRemove"
        @add-item="onAddItem"
      />
    </div>
  </div>
</template>

<script lang="ts">
export default {
  name: "JsonFormEditor",
};
</script>

<style scoped>
.jfe {
  width: 100%;
}

/* No focus / selection rings inside the JSON editor */
.jfe :focus,
.jfe :focus-visible,
.jfe :focus-within,
.jfe input:focus,
.jfe input:focus-visible,
.jfe textarea:focus,
.jfe textarea:focus-visible,
.jfe button:focus,
.jfe button:focus-visible,
.jfe fieldset:focus,
.jfe fieldset:focus-within,
.jfe label:focus-within {
  outline: none !important;
  outline-offset: 0 !important;
  box-shadow: none !important;
  --pico-box-shadow: none !important;
  --box-shadow: none !important;
}

.jfe input:focus,
.jfe input:focus-visible,
.jfe textarea:focus,
.jfe textarea:focus-visible {
  border-color: var(--border-strong) !important;
  background-color: var(--bg-code) !important;
  --pico-border-color: var(--border-strong) !important;
}

.jfe-card:focus-within,
.jfe-nest:focus-within {
  border-color: var(--border) !important;
  box-shadow: none !important;
}

.jfe-mode {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.85rem;
}

.jfe-mode-btn {
  margin: 0 !important;
  min-height: 2rem !important;
  padding: 0.3rem 0.85rem !important;
  font-size: 0.8125rem !important;
  border-radius: 999px !important;
  background: transparent !important;
  border: 1px solid var(--border) !important;
  color: var(--text-secondary) !important;
  box-shadow: none !important;
  width: auto !important;
}

.jfe-mode-btn.active {
  background: var(--bg-surface-2) !important;
  border-color: var(--border-strong) !important;
  color: var(--text) !important;
}

.jfe-mode-btn:focus,
.jfe-mode-btn:focus-visible,
.jfe-mode-btn:active {
  outline: none !important;
  box-shadow: none !important;
}

.jfe-format {
  margin: 0 0 0 0.35rem !important;
  min-height: 2rem !important;
  padding: 0.3rem 0.75rem !important;
  font-size: 0.75rem !important;
  width: auto !important;
}

.jfe-raw {
  width: 100% !important;
  max-width: none !important;
  min-height: 28rem;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 0.8125rem;
  line-height: 1.45;
  tab-size: 2;
  white-space: pre;
  box-sizing: border-box;
}

.jfe-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

/* Deep styles for recursive form nodes */
.jfe-form :deep(.jfe-field) {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: 100%;
  margin: 0 0 0.75rem;
  font-size: 0.8125rem;
  font-weight: 550;
  color: var(--text-secondary);
}

.jfe-form :deep(.jfe-field input),
.jfe-form :deep(.jfe-field textarea) {
  width: 100% !important;
  max-width: none !important;
  font-weight: 400;
  box-sizing: border-box;
}

.jfe-form :deep(.jfe-check) {
  flex-direction: row !important;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
  color: var(--text);
}

.jfe-form :deep(.jfe-check input) {
  width: auto !important;
  margin: 0;
}

.jfe-form :deep(.jfe-label) {
  font-weight: 550;
  color: var(--text-secondary);
}

.jfe-form :deep(.jfe-hint) {
  font-weight: 400;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.jfe-form :deep(.jfe-section-title) {
  font-size: 1rem;
  font-weight: 650;
  margin: 0.5rem 0 0.35rem;
  color: var(--text);
}

.jfe-form :deep(.jfe-nested-title) {
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0 0 0.65rem;
  color: var(--text);
}

.jfe-form :deep(.jfe-nest) {
  padding: 0.85rem 1rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  margin-bottom: 0.85rem;
}

.jfe-form :deep(.jfe-card) {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 0.35rem 0.9rem 0.5rem;
  margin: 0 0 0.65rem;
  background: var(--bg-elevated);
}

.jfe-form :deep(.jfe-card-leg) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  padding: 0;
}

.jfe-form :deep(.jfe-card-toggle) {
  margin: 0 !important;
  padding: 0.15rem 0 !important;
  min-height: 0 !important;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
  color: var(--text) !important;
  font-weight: 600 !important;
  font-size: 0.8125rem !important;
  width: auto !important;
  cursor: pointer;
}

.jfe-form :deep(.jfe-mini) {
  margin: 0 !important;
  min-height: 1.75rem !important;
  padding: 0.2rem 0.55rem !important;
  font-size: 0.6875rem !important;
  width: auto !important;
}

.jfe-form :deep(.jfe-array-head) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin: 0.25rem 0 0.65rem;
}

.jfe-form :deep(.jfe-list-block) {
  margin-bottom: 1rem;
}

.mono {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 0.8125rem;
}
</style>
