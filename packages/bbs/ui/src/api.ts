// Share JWT with @ursamu/web so /admin/ and /admin/bbs/ stay signed in.
const TOKEN_KEY = "ursamu.webAdmin.token";
const TOKEN_KEY_LEGACY = "ursamu.wikiAdmin.token";
const TOKEN_KEY_BBS = "ursamu.bbsAdmin.token";

export function getToken(): string {
  try {
    const cur = sessionStorage.getItem(TOKEN_KEY) ?? "";
    if (cur) return cur;
    for (const k of [TOKEN_KEY_LEGACY, TOKEN_KEY_BBS]) {
      const legacy = sessionStorage.getItem(k) ?? "";
      if (legacy) {
        sessionStorage.setItem(TOKEN_KEY, legacy);
        sessionStorage.removeItem(k);
        return legacy;
      }
    }
    return "";
  } catch {
    return "";
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.removeItem(TOKEN_KEY_LEGACY);
      sessionStorage.removeItem(TOKEN_KEY_BBS);
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY_LEGACY);
      sessionStorage.removeItem(TOKEN_KEY_BBS);
    }
  } catch {
    /* private mode */
  }
}

export type ApiResult<T = unknown> = {
  res: Response;
  data: T;
};

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  let data: T = null as T;
  try {
    data = (text ? JSON.parse(text) : null) as T;
  } catch {
    data = { error: text || res.statusText } as T;
  }
  return { res, data };
}

export type Me = {
  id?: string;
  name?: string;
  flags?: string | string[];
};

export type Board = {
  id: string;
  num: number;
  title: string;
  category?: string;
  type?: string;
  readLock?: string;
  writeLock?: string;
  timeout?: number;
  anonymous?: boolean;
  moderators?: string[];
  webhookUrl?: string;
  postCount?: number;
  unreadCount?: number;
  flaggedCount?: number;
};

export type Post = {
  id: string;
  boardId: number;
  num: number;
  subject: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  sticky?: boolean;
  flags?: { playerName: string; reason: string }[];
  replies?: {
    num: number;
    subject: string;
    body: string;
    authorName: string;
    createdAt: number;
  }[];
  editCount?: number;
};

export function isStaffFlags(raw: unknown): boolean {
  let list: string[] = [];
  if (Array.isArray(raw)) {
    list = raw.map((f) => String(f).toLowerCase());
  } else if (typeof raw === "string") {
    list = raw.toLowerCase().split(/[\s,|]+/).filter(Boolean);
  }
  return list.some((f) =>
    f === "admin" || f === "wizard" || f === "superuser"
  );
}
