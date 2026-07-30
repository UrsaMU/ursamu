<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSessionStore } from "@/stores/session";

const session = useSessionStore();
const router = useRouter();
const route = useRoute();

const username = ref("");
const password = ref("");
const busy = ref(false);

async function onSubmit(): Promise<void> {
  busy.value = true;
  session.error = "";
  try {
    const result = await session.login(
      username.value.trim(),
      password.value,
    );
    if (result === "ok") {
      const redirect = String(route.query.redirect || "/");
      await router.replace(redirect.startsWith("/") ? redirect : "/");
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
        <p class="muted">UrsaMU · Web</p>
        <h1>Sign in</h1>
        <p class="lede">
          Staff console — admin, wizard, or superuser only.
        </p>
      </header>
      <form @submit.prevent="onSubmit">
        <label for="login-user">
          Username
          <input
            id="login-user"
            v-model="username"
            name="username"
            type="text"
            autocomplete="username"
            required
            maxlength="64"
            autocapitalize="none"
            spellcheck="false"
          />
        </label>
        <label for="login-pass">
          Password
          <input
            id="login-pass"
            v-model="password"
            name="password"
            type="password"
            autocomplete="current-password"
            required
            maxlength="128"
          />
        </label>
        <p
          v-if="session.error"
          class="error"
          role="alert"
        >
          {{ session.error }}
        </p>
        <button
          type="submit"
          :aria-busy="busy"
          :disabled="busy"
        >
          Sign in
        </button>
      </form>
    </div>
  </div>
</template>
