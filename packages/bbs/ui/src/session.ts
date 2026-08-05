import { reactive } from "vue";
import {
  api,
  getToken,
  isStaffFlags,
  setToken,
  type Me,
} from "./api";

export const session = reactive({
  me: null as Me | null,
  error: "",
  ready: false,
  get token() {
    return getToken();
  },
  get isStaff() {
    return isStaffFlags(this.me?.flags);
  },
  get displayName() {
    return this.me?.name || "Staff";
  },
});

export async function bootstrap(): Promise<
  "login" | "forbidden" | "ok"
> {
  session.error = "";
  if (!getToken()) {
    session.ready = true;
    return "login";
  }
  const { res, data } = await api<Me & { error?: string }>(
    "/api/v1/me",
  );
  session.ready = true;
  if (res.status === 401) {
    setToken(null);
    session.me = null;
    return "login";
  }
  if (!res.ok) {
    session.error = data?.error || `Session failed (${res.status})`;
    return "login";
  }
  session.me = data;
  if (!isStaffFlags(data?.flags)) return "forbidden";
  return "ok";
}

export async function login(
  name: string,
  password: string,
): Promise<"ok" | "forbidden" | "error"> {
  session.error = "";
  const { res, data } = await api<
    { token?: string; error?: string } & Me
  >("/api/v1/login", {
    method: "POST",
    // Engine expects `username` (same as @ursamu/web).
    body: JSON.stringify({ username: name, password }),
  });
  if (!res.ok || !data?.token) {
    session.error = data?.error || "Login failed.";
    return "error";
  }
  setToken(data.token);
  const gate = await bootstrap();
  if (gate === "ok") return "ok";
  if (gate === "forbidden") return "forbidden";
  return "error";
}

export function signOut(): void {
  setToken(null);
  session.me = null;
}
