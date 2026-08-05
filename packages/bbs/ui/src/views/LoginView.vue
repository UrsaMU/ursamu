<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { login, session } from "../session";

const route = useRoute();
const router = useRouter();
const username = ref("");
const password = ref("");
const busy = ref(false);

async function onSubmit(): Promise<void> {
  busy.value = true;
  try {
    const result = await login(
      username.value.trim(),
      password.value,
    );
    if (result === "ok") {
      const redirect = String(route.query.redirect || "/");
      await router.replace(
        redirect.startsWith("/") ? redirect : "/",
      );
      return;
    }
    if (result === "forbidden") {
      await router.replace({ name: "forbidden" });
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="gate">
    <div class="gate-card">
      <header>
        <p class="muted">
          UrsaMU · BBS
        </p>
        <h1>Staff sign in</h1>
        <p class="lede">
          Bulletin boards — admin, wizard, or superuser.
          Same credentials as the staff console.
        </p>
      </header>
      <form @submit.prevent="onSubmit">
        <label>
          Username
          <input
            v-model="username"
            autocomplete="username"
            required
            maxlength="64"
            spellcheck="false"
          >
        </label>
        <label>
          Password
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            maxlength="128"
          >
        </label>
        <p
          v-if="session.error"
          class="error"
          role="alert"
        >
          {{ session.error }}
        </p>
        <button
          class="primary"
          type="submit"
          :disabled="busy"
        >
          Sign in
        </button>
      </form>
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
</style>
