/// <reference no-default-lib="true" />
/// <reference lib="deno.worker" />

/**
 * Worker script for the Ursamu Scripting Engine.
 * Supports ESM-style scripts: export default async (u) => { ... }
 */
interface IDBObj {
  id: string;
  name?: string;
  location?: string;
  flags: Set<string>;
  state: Record<string, unknown>;
  contents: IDBObj[];
}

interface SDKDBObj extends IDBObj {
  broadcast?: (message: string, options?: Record<string, unknown>) => void;
}

interface IMail {
  id?: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  message: string;
  read: boolean;
  date: number;
}

interface IUrsamuSDK {
  state: Record<string, unknown>;
  me: IDBObj;
  here: IDBObj;
  target?: IDBObj;
  ui: {
    panel(options: unknown): unknown;
    render(template: string, data: Record<string, unknown>): string;
    layout(options: unknown): void;
  };
  util: {
    displayName(obj: IDBObj, actor: IDBObj): string;
    target(actor: IDBObj, query: string): Promise<IDBObj | undefined>;
    [key: string]: unknown;
  };
  db: {
    search(query: string | Record<string, unknown>): Promise<IDBObj[]>;
    create(template: Partial<IDBObj>): Promise<IDBObj>;
    destroy(id: string): Promise<void>;
    modify(id: string, op: string, data: unknown): Promise<void>;
  };
  cmd: {
    name: string;
    original?: string;
    args: string[];
    switches?: string[];
  };
  canEdit(actor: IDBObj, target: IDBObj): boolean;
  send(message: string, target?: string, options?: Record<string, unknown>): void;
  broadcast(message: string, options?: Record<string, unknown>): void;
  execute(command: string): void;
  force(command: string): void;
  teleport(target: string, destination: string): void;
  checkLock(target: string | IDBObj, lock: string): Promise<boolean>;
  auth: {
    verify(name: string, password: string): Promise<boolean>;
    login(id: string): Promise<void>;
    hash(password: string): Promise<string>;
    setPassword(id: string, password: string): Promise<void>;
  };
  sys: {
    setConfig(key: string, value: unknown): Promise<void>;
    disconnect(id: string): Promise<void>;
    reboot(): Promise<void>;
    shutdown(): Promise<void>;
  };
  chan: {
    join(channel: string, alias: string): Promise<void>;
    leave(alias: string): Promise<void>;
    list(): Promise<unknown[]>;
    create(name: string, options?: { header?: string; lock?: string; hidden?: boolean }): Promise<unknown>;
    destroy(name: string): Promise<unknown>;
    set(name: string, options: { header?: string; lock?: string; hidden?: boolean; masking?: boolean }): Promise<unknown>;
  };
  mail: {
    send(mail: Partial<IMail>): Promise<void>;
    read(query: Record<string, unknown>): Promise<IMail[]>;
    delete(id: string): Promise<void>;
  };
  setFlags(target: string | IDBObj, flags: string): Promise<void>;
  text: {
    read(id: string): Promise<string>;
    set(id: string, content: string): Promise<void>;
  };
  bb: {
    listBoards(): Promise<unknown[]>;
    listPosts(boardId: string): Promise<unknown[]>;
    readPost(boardId: string, postNum: number): Promise<unknown | null>;
    post(boardId: string, subject: string, body: string): Promise<{ id: string }>;
    editPost(boardId: string, postNum: number, body: string): Promise<void>;
    deletePost(boardId: string, postNum: number): Promise<void>;
    createBoard(name: string, options?: { description?: string; order?: number }): Promise<unknown>;
    destroyBoard(boardId: string): Promise<void>;
    markRead(boardId: string): Promise<void>;
    newPostCount(boardId: string): Promise<number>;
    totalNewCount(): Promise<number>;
  };
  events: {
    emit(event: string, data: unknown, context?: Record<string, unknown>): Promise<void>;
    on(event: string, handler: string): Promise<string>;
  };
}

let msgId = 0;
const pending = new Map<number, (value: unknown) => void>();

const request = <T>(type: string, payload: Record<string, unknown>): Promise<T> => {
  const id = msgId++;
  return new Promise((resolve) => {
    pending.set(id, resolve as (value: unknown) => void);
    self.postMessage({ type, msgId: id, ...payload });
  });
};

/** Hydrate a raw DB/SDK object, converting flags strings/arrays to Sets. */
const hydrateSDKObject = (obj: unknown): IDBObj => {
  const raw = obj as Record<string, unknown>;
  if (raw) {
    if (!(raw.flags instanceof Set)) {
      raw.flags = new Set(
        Array.isArray(raw.flags)
          ? (raw.flags as string[])
          : typeof raw.flags === "string"
          ? (raw.flags as string).split(" ").filter(Boolean)
          : []
      );
    }
    raw.state = (raw.state as Record<string, unknown>) || {};
    if (raw.contents) {
      raw.contents = (raw.contents as unknown[]).map(hydrateSDKObject);
    }
  }
  return raw as unknown as IDBObj;
};

// --- Formatting utilities available via u.util ---

const _padStr = (str: string, width: number, align: string, fill = " "): string => {
  const s = String(str);
  const len = s.length;
  if (len >= width) return s.slice(0, width);
  const pad = width - len;
  if (align === "right") return fill.repeat(pad) + s;
  if (align === "center") {
    const left = Math.floor(pad / 2);
    const right = pad - left;
    return fill.repeat(left) + s + fill.repeat(right);
  }
  return s + fill.repeat(pad);
};

const _getRawVal = (raw: unknown, idx: number): string => {
  if (Array.isArray(raw)) return idx < raw.length ? String(raw[idx]) : "";
  if (raw && typeof raw === "object" && "value" in raw) {
    const v = (raw as { value: unknown }).value;
    return Array.isArray(v) ? (idx < v.length ? String(v[idx]) : "") : String(v);
  }
  return raw != null ? String(raw) : "";
};

const _getRawAlign = (raw: unknown): string => {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "align" in raw) {
    return String((raw as { align: unknown }).align);
  }
  return "left";
};

const ljust = (str = "", width: number, fill = " "): string => _padStr(str, width, "left", fill);
const rjust = (str = "", width: number, fill = " "): string => _padStr(str, width, "right", fill);
const center = (str = "", width: number, fill = " "): string => _padStr(str, width, "center", fill);

/** Strip MUSH-style substitution codes (%ch, %cn, etc.) and raw ANSI escapes. */
const stripSubs = (str = ""): string =>
  str.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "").replace(/\x1b\[[0-9;]*m/g, "");

const sprintf = (fmt: string, ...args: unknown[]): string => {
  let i = 0;
  return fmt.replace(/%([+\- ]?)(\d*)(?:\.(\d+))?([sdifebotxX%])/g, (_, flag: string, width: string, prec: string, spec: string) => {
    if (spec === "%") return "%";
    const arg = args[i++];
    let s: string;
    switch (spec) {
      case "s": s = String(arg ?? ""); break;
      case "d": case "i": s = String(Math.trunc(Number(arg))); break;
      case "f": s = prec !== undefined ? Number(arg).toFixed(Number(prec)) : String(Number(arg)); break;
      case "e": s = prec !== undefined ? Number(arg).toExponential(Number(prec)) : Number(arg).toExponential(); break;
      case "b": s = Number(arg).toString(2); break;
      case "o": s = Number(arg).toString(8); break;
      case "x": s = Number(arg).toString(16); break;
      case "X": s = Number(arg).toString(16).toUpperCase(); break;
      case "t": s = String(Boolean(arg)); break;
      default: s = String(arg ?? "");
    }
    const w = Number(width);
    if (w > s.length) {
      return flag === "-" ? s + " ".repeat(w - s.length) : " ".repeat(w - s.length) + s;
    }
    return s;
  });
};

const template = (
  str: string,
  data?: Record<string, string | string[] | { value: string | string[]; align?: "left" | "right" | "center" }>
): string => {
  if (!data) return str;
  let maxRows = 1;
  for (const v of Object.values(data)) {
    if (Array.isArray(v)) maxRows = Math.max(maxRows, v.length);
    else if (v && typeof v === "object" && "value" in v && Array.isArray(v.value)) {
      maxRows = Math.max(maxRows, v.value.length);
    }
  }
  const processRow = (rowIdx: number) =>
    str.replace(
      /\[([A-Z])\1*\]|\[([a-z])\2*\]|([a-z])\3+/g,
      (match: string, ucKey: string, lcBracketed: string, lcNoBracket: string) => {
        if (ucKey) {
          const width = match.length - 2;
          const raw = data[ucKey];
          return "[" + _padStr(_getRawVal(raw, rowIdx), width, _getRawAlign(raw)) + "]";
        } else if (lcBracketed) {
          const width = match.length;
          const raw = data[lcBracketed];
          return _padStr(_getRawVal(raw, rowIdx), width, _getRawAlign(raw));
        } else {
          const width = match.length;
          const raw = data[lcNoBracket];
          return _padStr(_getRawVal(raw, rowIdx), width, _getRawAlign(raw));
        }
      }
    );
  const rows: string[] = [];
  for (let i = 0; i < maxRows; i++) rows.push(processRow(i));
  return rows.join("\n");
};

// --- End formatting utilities ---

const createStateProxy = (initialState: Record<string, unknown>, onPatch: (prop: string, value: unknown) => void) => {
  return new Proxy(initialState || {}, {
    set(target, prop, value) {
      if (typeof prop === "string") {
        target[prop] = value;
        onPatch(prop, value);
        return true;
      }
      return false;
    }
  });
};

self.onmessage = async (e: MessageEvent) => {
  if (!e.data) return;

  if (e.data.type === "response") {
    const resolve = pending.get(e.data.msgId);
    if (resolve) {
      resolve(e.data.data);
      pending.delete(e.data.msgId);
    }
    return;
  }

  const { code, sdk: sdkData = {} } = e.data;

  const u: IUrsamuSDK = {
    state: createStateProxy(sdkData.state, (p: string, v: unknown) => self.postMessage({ type: 'patch', prop: p, value: v })),
    me: hydrateSDKObject(sdkData.me),
    here: {
      ...(hydrateSDKObject(sdkData.here) as SDKDBObj),
      broadcast: (msg: string, options?: Record<string, unknown>) => self.postMessage({ type: 'broadcast', message: msg, data: options })
    } as IDBObj,
    target: sdkData.target ? ({
      ...(hydrateSDKObject(sdkData.target) as SDKDBObj),
      broadcast: (msg: string, options?: Record<string, unknown>) => self.postMessage({ type: 'broadcast', message: msg, target: (sdkData.target as IDBObj).id, data: options })
    } as IDBObj) : undefined,
    ui: {
      panel: (opt: unknown) => opt,
      render: (tpl: string, ctx: Record<string, unknown>) => tpl.replace(/\{\{(.+?)\}\}/g, (_, k) => String(ctx[k.trim()] || "")),
      layout: (opt: unknown) => self.postMessage({ type: "result", data: opt })
    },
    util: {
      displayName: (o: IDBObj) => (o.state?.moniker as string) || (o.state?.name as string) || (o.name as string) || "Unknown",
      target: async (actor: IDBObj, query: string) => {
        const result = await request<IDBObj | undefined>("util:target", { actor: actor.id, query });
        return result ? hydrateSDKObject(result) : undefined;
      },
      center,
      ljust,
      rjust,
      template,
      sprintf,
      stripSubs,
      ...sdkData.util
    },
    db: {
      search: async (q: string | Record<string, unknown>) => {
        const results = await request<unknown[]>("db:search", { query: q });
        return (results || []).map(hydrateSDKObject);
      },
      create: (template: Partial<IDBObj>) => request<IDBObj>("db:create", { template }),
      destroy: (id: string) => request<void>("db:destroy", { id }),
      modify: (id: string, op: string, data: unknown) => request<void>("db:modify", { id, op, data })
    },
    cmd: sdkData.cmd || { name: "", args: [] },
    canEdit: (_a: IDBObj, t: IDBObj) => (sdkData.permissions?.[t?.id] as boolean) ?? true,
    send: (msg: string, target?: string, options?: Record<string, unknown>) =>
      self.postMessage({ type: "send", message: msg, target, data: options }),
    broadcast: (msg: string, options?: Record<string, unknown>) =>
      self.postMessage({ type: "broadcast", message: msg, data: options }),
    execute: (command: string) =>
      self.postMessage({ type: "execute", command }),
    force: (command: string) =>
      self.postMessage({ type: "force", command }),
    teleport: (target: string, destination: string) =>
      self.postMessage({ type: "teleport", target, destination }),
    checkLock: (target: string | IDBObj, lock: string) =>
      request<boolean>("lock:check", { target: typeof target === "string" ? target : target.id, lock }),
    auth: {
      verify: (name: string, password: string) => request<boolean>("auth:verify", { name, password }),
      login: (id: string) => request<void>("auth:login", { id }),
      hash: (password: string) => request<string>("auth:hash", { password }),
      setPassword: (id: string, password: string) => request<void>("auth:setPassword", { id, password })
    },
    sys: {
      setConfig: (key: string, value: unknown) => request<void>("sys:setConfig", { key, value }),
      disconnect: (id: string) => request<void>("sys:disconnect", { id }),
      reboot: () => request<void>("sys:reboot", {}),
      shutdown: () => request<void>("sys:shutdown", {}),
      uptime: () => request<number>("sys:uptime", {})
    },
    chan: {
      join: (channel: string, alias: string) => request<void>("chan:join", { channel, alias }),
      leave: (alias: string) => request<void>("chan:leave", { alias }),
      list: () => request<unknown[]>("chan:list", {}),
      create: (name: string, options?: { header?: string; lock?: string; hidden?: boolean }) =>
        request<unknown>("chan:create", { name, ...options }),
      destroy: (name: string) => request<unknown>("chan:destroy", { name }),
      set: (name: string, options: { header?: string; lock?: string; hidden?: boolean; masking?: boolean }) =>
        request<unknown>("chan:set", { name, ...options })
    },
    mail: {
      send: (mail: Partial<IMail>) => request<void>("mail:send", { mail }),
      read: (query: Record<string, unknown>) => request<IMail[]>("mail:read", { query }),
      delete: (id: string) => request<void>("mail:delete", { id })
    },
    setFlags: (target: string | IDBObj, flags: string) =>
      request<void>("flags:set", { target: typeof target === "string" ? target : target.id, flags }),
    text: {
      read: (id: string) => request<string>("text:read", { id }),
      set: (id: string, content: string) => request<void>("text:set", { id, content })
    },
    bb: {
      listBoards: () => request<unknown[]>("bb:listBoards", {}),
      listPosts: (boardId: string) => request<unknown[]>("bb:listPosts", { boardId }),
      readPost: (boardId: string, postNum: number) => request<unknown | null>("bb:readPost", { boardId, postNum }),
      post: (boardId: string, subject: string, body: string) => request<{ id: string }>("bb:post", { boardId, subject, body }),
      editPost: (boardId: string, postNum: number, body: string) => request<void>("bb:editPost", { boardId, postNum, body }),
      deletePost: (boardId: string, postNum: number) => request<void>("bb:deletePost", { boardId, postNum }),
      createBoard: (name: string, options?: { description?: string; order?: number }) =>
        request<unknown>("bb:createBoard", { name, ...(options || {}) }),
      destroyBoard: (boardId: string) => request<void>("bb:destroyBoard", { boardId }),
      markRead: (boardId: string) => request<void>("bb:markRead", { boardId }),
      newPostCount: (boardId: string) => request<number>("bb:newPostCount", { boardId }),
      totalNewCount: () => request<number>("bb:totalNewCount", {})
    },
    events: {
      emit: (event: string, data: unknown, context?: Record<string, unknown>) =>
        request<void>("events:emit", { event, data, context }),
      on: (event: string, handler: string) =>
        request<string>("events:subscribe", { event, handler })
    }
  };

  (self as unknown as { u: IUrsamuSDK }).u = u;

  try {
    if (!code) throw new Error("Empty script.");

    // Dynamic Module Execution
    // Check if it's an ESM module (contains export)
    if (code.includes('export ')) {
      const blob = new Blob([code], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      try {
        const module = await import(url);
        const result = await (module.default || module.run || module)(u);
        self.postMessage({ type: 'result', data: result ?? null });
      } finally {
        URL.revokeObjectURL(url);
      }
    } else {
      // Legacy Block Execution
      const fn = new Function('u', `return (async () => { ${code} })()`);
      const result = await fn(u);
      self.postMessage({ type: 'result', data: result ?? null });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: 'error', data: message });
  }
};
