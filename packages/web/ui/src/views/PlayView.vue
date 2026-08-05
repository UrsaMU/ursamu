<script setup lang="ts">
/**
 * Staff Play — same chat layout as public /play:
 * scrollable output + fixed prompt below.
 */
import { nextTick, onMounted, ref, watch } from "vue";
import GameOutput from "@/components/GameOutput.vue";
import { useGameSocket } from "@/composables/useGameSocket";

const {
  messages,
  status,
  error,
  connect,
  disconnect,
  sendCmd,
} = useGameSocket();

const input = ref("");
const scroller = ref<HTMLElement | null>(null);
/** Stick to bottom unless the user scrolls up. */
const stickBottom = ref(true);
const STICK_PX = 48;

function isNearBottom(el: HTMLElement): boolean {
  const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
  return gap <= STICK_PX;
}

function onStageScroll(): void {
  const el = scroller.value;
  if (!el) return;
  stickBottom.value = isNearBottom(el);
}

async function maybeScrollBottom(): Promise<void> {
  await nextTick();
  const el = scroller.value;
  if (!el) return;
  if (stickBottom.value || isNearBottom(el)) {
    el.scrollTop = el.scrollHeight;
    stickBottom.value = true;
  }
}

watch(messages, () => {
  void maybeScrollBottom();
});

onMounted(() => {
  void connect();
});

function onSubmit(e: Event): void {
  e.preventDefault();
  const line = input.value;
  input.value = "";
  sendCmd(line);
}

/** Enter sends; Shift+Enter keeps a newline for long lines. */
function onPromptKey(e: KeyboardEvent): void {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    onSubmit(e);
  }
}

function reconnect(): void {
  disconnect();
  void connect();
}
</script>

<template>
  <article
    id="main-play"
    class="play-client play-client--chat"
  >
    <header class="play-client__bar">
      <div class="play-client__bar-text">
        <p class="muted dash-kicker">
          Game
        </p>
        <h1 class="page-title play-client__title">
          Play
          <span
            class="muted play-client__status"
            :data-status="status"
          >({{ status }})</span>
        </h1>
      </div>
      <div class="dash-header-actions">
        <button
          type="button"
          class="secondary outline"
          @click="reconnect"
        >
          Reconnect
        </button>
      </div>
    </header>

    <p
      v-if="error"
      class="play-client__error"
      role="alert"
    >
      {{ error }}
    </p>

    <div
      ref="scroller"
      class="play-client__stage"
      @scroll.passive="onStageScroll"
    >
      <GameOutput
        :messages="messages"
        :empty-hint="status === 'connecting'
          ? 'Connecting to world…'
          : 'No output yet — type a command below.'"
      />
    </div>

    <form
      class="play-client__prompt"
      @submit="onSubmit"
    >
      <span
        class="play-client__gt muted"
        aria-hidden="true"
      >&gt;</span>
      <label class="play-client__label">
        <span class="visually-hidden">Command</span>
        <textarea
          v-model="input"
          name="cmd"
          rows="1"
          autocomplete="off"
          spellcheck="false"
          placeholder="Enter something..."
          :disabled="status !== 'open'"
          @keydown="onPromptKey"
        />
      </label>
      <button
        type="submit"
        :disabled="status !== 'open' || !input.trim()"
      >
        Send
      </button>
    </form>
  </article>
</template>
