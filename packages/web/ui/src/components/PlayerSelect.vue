<script setup lang="ts">
/**
 * Player picker — names from the live object store, optional
 * flag filter. Single or multi. Values are bare player ids.
 */
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useLiveStore } from "@/stores/live";
import type { DboStub } from "@/api/types";
import {
  dboName,
  dboType,
  normalizeFlags,
} from "@/utils/text";

const props = withDefaults(
  defineProps<{
    modelValue?: string | string[] | null;
    /** Any of these flags (OR). Empty = all players. */
    flags?: string[];
    /** Require every listed flag (AND). */
    requireAll?: boolean;
    /** Only type=player objects (default true). */
    playersOnly?: boolean;
    multiple?: boolean;
    allowEmpty?: boolean;
    emptyLabel?: string;
    disabled?: boolean;
    id?: string;
  }>(),
  {
    modelValue: "",
    flags: () => [],
    requireAll: false,
    playersOnly: true,
    multiple: false,
    allowEmpty: true,
    emptyLabel: "— none —",
    disabled: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [string | string[]];
}>();

const live = useLiveStore();
const { objects } = storeToRefs(live);

function bareId(raw: unknown): string {
  return String(raw ?? "").replace(/^#/, "").trim();
}

function playerLabel(o: DboStub): string {
  const id = bareId(o.id);
  const name = dboName(o);
  const online = live.isOnline(id) ? " · online" : "";
  return `${name} (#${id})${online}`;
}

const options = computed(() => {
  const want = (props.flags ?? [])
    .map((f) => f.toLowerCase().trim())
    .filter(Boolean);

  let list = objects.value.filter((o) => {
    if (props.playersOnly && dboType(o) !== "player") {
      return false;
    }
    if (!want.length) return true;
    const have = new Set(normalizeFlags(o.flags));
    if (props.requireAll) {
      return want.every((f) => have.has(f));
    }
    return want.some((f) => have.has(f));
  });

  list = [...list].sort((a, b) =>
    dboName(a).localeCompare(dboName(b)),
  );
  return list;
});

const singleValue = computed({
  get: () => bareId(
    Array.isArray(props.modelValue)
      ? (props.modelValue[0] ?? "")
      : (props.modelValue ?? ""),
  ),
  set: (v: string) => emit("update:modelValue", bareId(v)),
});

const multiValue = computed({
  get: (): string[] => {
    const v = props.modelValue;
    if (Array.isArray(v)) return v.map(bareId).filter(Boolean);
    if (typeof v === "string" && v.trim()) {
      return v.split(/[\s,]+/).map(bareId).filter(Boolean);
    }
    return [];
  },
  set: (ids: string[]) => {
    emit(
      "update:modelValue",
      ids.map(bareId).filter(Boolean),
    );
  },
});

/** For multi: add from dropdown */
const addPick = computed({
  get: () => "",
  set: (id: string) => {
    const bare = bareId(id);
    if (!bare) return;
    const cur = multiValue.value;
    if (cur.includes(bare)) return;
    multiValue.value = [...cur, bare];
  },
});

function removeId(id: string): void {
  multiValue.value = multiValue.value.filter((x) => x !== id);
}

function labelForId(id: string): string {
  const o = live.getObject(id);
  if (o) return playerLabel(o);
  return `#${id}`;
}

const availableToAdd = computed(() => {
  const have = new Set(multiValue.value);
  return options.value.filter(
    (o) => !have.has(bareId(o.id)),
  );
});
</script>

<template>
  <div
    class="player-select"
    :class="{ multi: multiple }"
  >
    <!-- Single select -->
    <select
      v-if="!multiple"
      :id="id"
      v-model="singleValue"
      class="player-select-el"
      :disabled="disabled"
    >
      <option
        v-if="allowEmpty"
        value=""
      >
        {{ emptyLabel }}
      </option>
      <option
        v-for="o in options"
        :key="bareId(o.id)"
        :value="bareId(o.id)"
      >
        {{ playerLabel(o) }}
      </option>
      <!-- Keep unknown current value visible -->
      <option
        v-if="
          singleValue &&
            !options.some((o) => bareId(o.id) === singleValue)
        "
        :value="singleValue"
      >
        #{{ singleValue }} (unknown)
      </option>
    </select>

    <!-- Multi: chips + add dropdown -->
    <div
      v-else
      class="player-multi"
    >
      <ul
        v-if="multiValue.length"
        class="player-chips"
      >
        <li
          v-for="id in multiValue"
          :key="id"
        >
          <span>{{ labelForId(id) }}</span>
          <button
            type="button"
            class="player-chip-x"
            :disabled="disabled"
            :aria-label="'Remove ' + labelForId(id)"
            @click="removeId(id)"
          >
            ×
          </button>
        </li>
      </ul>
      <p
        v-else
        class="muted player-multi-empty"
      >
        None selected.
      </p>
      <select
        v-model="addPick"
        class="player-select-el"
        :disabled="disabled || !availableToAdd.length"
        aria-label="Add player"
      >
        <option value="">
          {{
            availableToAdd.length
              ? "Add player…"
              : "No more matches"
          }}
        </option>
        <option
          v-for="o in availableToAdd"
          :key="bareId(o.id)"
          :value="bareId(o.id)"
        >
          {{ playerLabel(o) }}
        </option>
      </select>
    </div>
  </div>
</template>

<style scoped>
.player-select {
  width: 100%;
}

.player-select-el {
  width: 100% !important;
  max-width: none !important;
  margin: 0 !important;
  min-height: 2.35rem !important;
}

.player-multi {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  width: 100%;
}

.player-multi-empty {
  margin: 0;
  font-size: 0.8125rem;
}

.player-chips {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.player-chips li {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.35rem 0.2rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-surface-2);
  font-size: 0.75rem;
  color: var(--text);
  max-width: 100%;
}

.player-chips li span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 16rem;
}

.player-chip-x {
  width: auto !important;
  min-height: 0 !important;
  min-width: 0 !important;
  margin: 0 !important;
  padding: 0 0.35rem !important;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
  color: var(--text-muted) !important;
  font-size: 1rem !important;
  line-height: 1 !important;
  cursor: pointer;
}

.player-chip-x:hover {
  color: var(--text) !important;
}
</style>
