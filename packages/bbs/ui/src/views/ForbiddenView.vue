<script setup lang="ts">
import { useRouter } from "vue-router";
import { signOut } from "../session";

const router = useRouter();

function back(): void {
  signOut();
  void router.replace({ name: "login" });
}
</script>

<template>
  <div class="gate">
    <div class="gate-card">
      <header>
        <p class="muted">
          UrsaMU · BBS
        </p>
        <h1>Staff only</h1>
        <p class="lede">
          This console requires admin, wizard, or superuser.
        </p>
      </header>
      <button
        type="button"
        class="primary"
        @click="back"
      >
        Sign in as staff
      </button>
      <p class="muted back-link">
        <a href="/admin/">← Staff console</a>
      </p>
    </div>
  </div>
</template>

<style scoped>
.back-link {
  margin: 1rem 0 0;
  font-size: 0.8125rem;
  text-align: center;
}
button.primary {
  width: 100%;
}
</style>
