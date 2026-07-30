<script setup lang="ts">
import { useRouter } from "vue-router";
import { useSessionStore } from "@/stores/session";

const session = useSessionStore();
const router = useRouter();

function signOut(): void {
  session.signOut();
  void router.replace({ name: "login" });
}
</script>

<template>
  <div class="gate">
    <div class="gate-card">
      <header>
        <h1>Staff only</h1>
        <p class="lede">
          Signed in, but missing admin, wizard, or superuser.
          Ask a wizard if you need access.
        </p>
        <p
          v-if="session.me?.flags?.length"
          class="muted"
        >
          Flags: {{ session.me.flags.join(", ") }}
        </p>
      </header>
      <button
        type="button"
        class="secondary"
        @click="signOut"
      >
        Sign out
      </button>
    </div>
  </div>
</template>
