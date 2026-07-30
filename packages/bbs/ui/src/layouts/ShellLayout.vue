<script setup lang="ts">
import { RouterView, useRouter } from "vue-router";
import { session, signOut } from "../session";

const router = useRouter();

function logout(): void {
  signOut();
  void router.replace({ name: "login" });
}
</script>

<template>
  <div id="view-app">
    <header class="topbar">
      <nav
        class="top-nav"
        aria-label="Staff console"
      >
        <div class="top-nav-left">
          <a
            class="brand"
            href="/admin/"
          >UrsaMU</a>
          <span
            class="top-divider"
            aria-hidden="true"
          />
          <ul class="top-primary">
            <li>
              <a
                class="top-tab"
                href="/admin/"
              >
                <span class="top-tab-label">Console</span>
              </a>
            </li>
            <li>
              <a
                class="top-tab"
                href="/admin/bbs"
              >
                <span class="top-tab-label">Console BBS</span>
              </a>
            </li>
            <li>
              <a
                class="top-tab active"
                href="/admin/bbs-app/"
                aria-current="page"
              >
                <span class="top-tab-label">BBS app</span>
              </a>
            </li>
          </ul>
        </div>
        <div class="top-nav-right">
          <span class="top-user muted">{{
            session.displayName
          }}</span>
          <button
            type="button"
            class="ghost top-signout"
            @click="logout"
          >
            Sign out
          </button>
        </div>
      </nav>
    </header>

    <main class="main-pane">
      <RouterView />
    </main>
  </div>
</template>
