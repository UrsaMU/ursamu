import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api, getToken, setToken } from "@/api/client";
import type { Me } from "@/api/types";
import { useLiveStore } from "@/stores/live";
import { isStaffFlags, normalizeFlags, stripMushCodes } from "@/utils/text";

export const useSessionStore = defineStore("session", () => {
  const me = ref<Me | null>(null);
  const bootstrapped = ref(false);
  const error = ref("");
  const forbidden = ref(false);

  const displayName = computed(() => {
    const n = stripMushCodes(me.value?.name || "").trim();
    return n || "Staff";
  });

  const isStaff = computed(() =>
    isStaffFlags(normalizeFlags(me.value?.flags ?? [])),
  );

  function applyMe(data: Me): "ok" | "forbidden" {
    const flags = normalizeFlags(data.flags);
    me.value = { ...data, flags };
    if (!isStaffFlags(flags)) {
      forbidden.value = true;
      return "forbidden";
    }
    return "ok";
  }

  /**
   * Bootstrap via admin WebSocket snapshot (not REST poll).
   * Login remains the only HTTP call.
   */
  async function bootstrap(): Promise<"login" | "forbidden" | "app"> {
    error.value = "";
    forbidden.value = false;
    const token = getToken();
    if (!token) {
      bootstrapped.value = true;
      return "login";
    }

    const live = useLiveStore();
    const ok = await live.connect();
    bootstrapped.value = true;

    if (!ok) {
      error.value = "Could not open staff WebSocket.";
      setToken(null);
      me.value = null;
      live.stopPolling();
      return "login";
    }

    const fromSnap = live.meFromWs;
    if (fromSnap) {
      const gate = applyMe(fromSnap);
      if (gate === "forbidden") {
        live.stopPolling();
        return "forbidden";
      }
      return "app";
    }

    // Snapshot without me — one RPC over WS
    const { res, data } = await api<Me & { error?: string }>(
      "/api/v1/me",
    );
    if (res.status === 401 || !res.ok) {
      setToken(null);
      me.value = null;
      live.stopPolling();
      return "login";
    }
    const gate = applyMe(data);
    if (gate === "forbidden") {
      live.stopPolling();
      return "forbidden";
    }
    return "app";
  }

  async function login(
    username: string,
    password: string,
  ): Promise<"ok" | "forbidden" | "error"> {
    error.value = "";
    const { res, data } = await api<{
      token?: string;
      name?: string;
      id?: string;
      flags?: unknown;
      error?: string;
    }>("/api/v1/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok || !data?.token) {
      error.value = data?.error || "Login failed.";
      return "error";
    }
    setToken(data.token);

    const live = useLiveStore();
    live.stopPolling();
    const ok = await live.connect();
    if (!ok) {
      error.value = "Logged in but WebSocket failed.";
      setToken(null);
      return "error";
    }

    if (live.meFromWs) {
      const gate = applyMe(live.meFromWs);
      return gate === "forbidden" ? "forbidden" : "ok";
    }

    const meRes = await api<Me>("/api/v1/me");
    if (meRes.res.ok && meRes.data) {
      const gate = applyMe(meRes.data);
      return gate === "forbidden" ? "forbidden" : "ok";
    }

    const flags = normalizeFlags(data.flags);
    me.value = {
      id: String(data.id ?? ""),
      name: String(data.name ?? username),
      flags,
    };
    if (!isStaffFlags(flags)) {
      forbidden.value = true;
      live.stopPolling();
      return "forbidden";
    }
    return "ok";
  }

  function signOut(): void {
    const live = useLiveStore();
    live.stopPolling();
    setToken(null);
    me.value = null;
    forbidden.value = false;
    error.value = "";
  }

  return {
    me,
    bootstrapped,
    error,
    forbidden,
    displayName,
    isStaff,
    bootstrap,
    login,
    signOut,
  };
});
