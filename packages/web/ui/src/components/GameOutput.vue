<script setup lang="ts">
/**
 * Game client message stream.
 *
 * - data.ui present → structured GameLayout (host tables / headers)
 * - otherwise → mono <pre class="game-pre"> with MUSH colors
 *
 * @see packages/web/design.md § Game client output
 */
import { computed } from "vue";
import MushText from "@/components/MushText.vue";
import GameLayout from "@/components/GameLayout.vue";
import {
  gameLayoutOf,
  hasGameLayout,
} from "@/utils/mushText";

export type GameMessage = {
  msg?: string;
  data?: Record<string, unknown>;
  at?: number;
};

const props = defineProps<{
  messages: GameMessage[];
  emptyHint?: string;
}>();

const hint = computed(
  () => props.emptyHint ?? "Connecting…",
);

function isLayout(m: GameMessage): boolean {
  return hasGameLayout(m.data);
}

function layoutOf(m: GameMessage) {
  return gameLayoutOf(m.data);
}
</script>

<template>
  <div
    id="game-output"
    class="game-output"
    role="log"
    aria-live="polite"
    aria-relevant="additions"
  >
    <p
      v-if="messages.length === 0"
      class="muted game-output__empty"
    >
      {{ hint }}
    </p>

    <div
      v-for="(m, idx) in messages"
      :key="idx"
      class="game-output__item"
    >
      <GameLayout
        v-if="isLayout(m) && layoutOf(m)"
        :components="layoutOf(m)!.components"
        :meta="layoutOf(m)!.meta"
      />
      <div
        v-else-if="m.msg"
        class="game-pre"
      >
        <MushText :text="m.msg" />
      </div>
    </div>
  </div>
</template>
