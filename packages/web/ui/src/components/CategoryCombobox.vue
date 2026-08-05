<script setup lang="ts">
/**
 * Text + dropdown of established options; free-type for new values.
 * Options may be plain strings or { value, label } for lock hints.
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";

export type ComboOption = {
  value: string;
  /** Dropdown text; defaults to value */
  label?: string;
};

type OptIn = string | ComboOption;

const model = defineModel<string>({ default: "" });
const props = withDefaults(
  defineProps<{
    id?: string;
    options?: OptIn[];
    placeholder?: string;
    disabled?: boolean;
    maxlength?: number;
    /** Extra class on the text input (e.g. mono) */
    inputClass?: string;
    /** Empty-list copy when no options and no typed value */
    emptyHint?: string;
    /** Prefix when typed value is not in the list */
    newHint?: string;
    listLabel?: string;
  }>(),
  {
    id: "cat-combo",
    options: () => [],
    placeholder: "Pick existing or type new",
    disabled: false,
    maxlength: 120,
    inputClass: "",
    emptyHint: "No suggestions — type a value.",
    newHint: "Custom:",
    listLabel: "suggestions",
  },
);

const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);

function normalize(opts: OptIn[]): ComboOption[] {
  const byVal = new Map<string, ComboOption>();
  for (const o of opts) {
    if (typeof o === "string") {
      const v = o.trim();
      if (!v || byVal.has(v)) continue;
      byVal.set(v, { value: v, label: v });
      continue;
    }
    const v = String(o?.value ?? "").trim();
    if (!v || byVal.has(v)) continue;
    const label = String(o.label ?? v).trim() || v;
    byVal.set(v, { value: v, label });
  }
  return [...byVal.values()];
}

const normalized = computed(() => normalize(props.options));

const filtered = computed(() => {
  const needle = model.value.trim().toLowerCase();
  const opts = normalized.value;
  if (!needle) return opts;
  return opts.filter((o) => {
    const hay = `${o.value} ${o.label ?? ""}`.toLowerCase();
    return hay.includes(needle);
  });
});

const exactMatch = computed(() => {
  const v = model.value.trim().toLowerCase();
  if (!v) return false;
  return normalized.value.some(
    (o) => o.value.toLowerCase() === v,
  );
});

function showList(): void {
  if (props.disabled) return;
  open.value = true;
}

function hideList(): void {
  open.value = false;
}

function toggleList(): void {
  if (props.disabled) return;
  open.value = !open.value;
  if (open.value) {
    void nextTick(() => inputEl.value?.focus());
  }
}

function pick(value: string): void {
  model.value = value;
  hideList();
  void nextTick(() => inputEl.value?.focus());
}

function onKeydown(ev: KeyboardEvent): void {
  if (ev.key === "Escape") {
    hideList();
    return;
  }
  if (ev.key === "ArrowDown") {
    ev.preventDefault();
    showList();
    return;
  }
  if (
    ev.key === "Enter" &&
    open.value &&
    filtered.value.length === 1
  ) {
    ev.preventDefault();
    pick(filtered.value[0]!.value);
  }
}

function onDocPointer(ev: Event): void {
  const t = ev.target as Node | null;
  if (!rootEl.value || !t) return;
  if (!rootEl.value.contains(t)) hideList();
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocPointer, true);
});
onUnmounted(() => {
  document.removeEventListener("pointerdown", onDocPointer, true);
});
</script>

<template>
  <div
    ref="rootEl"
    class="cat-combo"
    :class="{ open, disabled: props.disabled }"
  >
    <div class="cat-combo-row">
      <input
        :id="props.id"
        ref="inputEl"
        v-model="model"
        type="text"
        class="cat-combo-input"
        :class="props.inputClass"
        :placeholder="props.placeholder"
        :maxlength="props.maxlength"
        :disabled="props.disabled"
        autocomplete="off"
        spellcheck="false"
        role="combobox"
        :aria-expanded="open"
        aria-autocomplete="list"
        :aria-controls="`${props.id}-list`"
        @focus="showList"
        @input="showList"
        @keydown="onKeydown"
      >
      <button
        type="button"
        class="cat-combo-toggle secondary outline"
        tabindex="-1"
        :disabled="props.disabled"
        :aria-label="open
          ? `Hide ${props.listLabel}`
          : `Show ${props.listLabel}`"
        @click="toggleList"
      >
        ▾
      </button>
    </div>

    <ul
      v-if="open"
      :id="`${props.id}-list`"
      class="cat-combo-list"
      role="listbox"
    >
      <li
        v-if="!filtered.length && !model.trim()"
        class="cat-combo-empty muted"
      >
        {{ props.emptyHint }}
      </li>
      <li
        v-else-if="!filtered.length"
        class="cat-combo-empty muted"
      >
        No match —
        {{ props.newHint }}
        “{{ model.trim() }}”.
      </li>
      <li
        v-for="opt in filtered"
        :key="opt.value"
        role="option"
        class="cat-combo-option"
        :class="{ active: model.trim() === opt.value }"
        :title="opt.value"
        @mousedown.prevent="pick(opt.value)"
      >
        <code class="cat-combo-val">{{ opt.value }}</code>
        <span
          v-if="opt.label && opt.label !== opt.value"
          class="cat-combo-lab"
        >{{ opt.label }}</span>
      </li>
      <li
        v-if="model.trim() && !exactMatch"
        class="cat-combo-new muted"
      >
        {{ props.newHint }}
        <strong class="mono">{{ model.trim() }}</strong>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.cat-combo {
  position: relative;
  width: 100%;
  min-width: 0;
}

.cat-combo-row {
  display: flex;
  align-items: stretch;
  gap: 0.4rem;
  width: 100%;
}

.cat-combo-input {
  flex: 1 1 auto;
  min-width: 0;
  width: 100% !important;
  margin: 0 !important;
}

.cat-combo-toggle {
  flex: 0 0 auto !important;
  width: 2.5rem !important;
  min-width: 2.5rem !important;
  margin: 0 !important;
  padding: 0 !important;
  min-height: 2.5rem !important;
  font-size: 0.85rem !important;
  line-height: 1;
}

.cat-combo-list {
  position: absolute;
  z-index: 40;
  top: calc(100% + 0.25rem);
  left: 0;
  right: 0;
  margin: 0;
  padding: 0.25rem 0;
  list-style: none;
  max-height: 14rem;
  overflow-x: hidden;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 6px);
  background: var(--bg-surface);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}

.cat-combo-option {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  margin: 0;
  padding: 0.45rem 0.85rem;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--text);
}

.cat-combo-option:hover,
.cat-combo-option.active {
  background: var(--bg-surface-2);
}

.cat-combo-val {
  font-size: 0.8125rem;
  color: var(--text) !important;
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
  font-family: ui-monospace, Menlo, Consolas, monospace;
}

.cat-combo-lab {
  color: var(--text-muted);
  font-size: 0.75rem;
  line-height: 1.35;
}

.cat-combo-empty,
.cat-combo-new {
  margin: 0;
  padding: 0.55rem 0.85rem;
  font-size: 0.8125rem;
  line-height: 1.4;
}

.cat-combo-new strong {
  color: var(--text);
  font-weight: 600;
}

.cat-combo.disabled {
  opacity: 0.6;
  pointer-events: none;
}

.mono {
  font-family: ui-monospace, Menlo, Consolas, monospace;
}
</style>
