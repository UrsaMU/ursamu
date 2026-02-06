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
  state: Record<string, unknown>;
  contents: IDBObj[];
}

interface SDKDBObj extends IDBObj {
  broadcast?: (message: string) => void;
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
    args: string[];
  };
  canEdit(actor: IDBObj, target: IDBObj): boolean;
  send(message: string, target?: string, options?: Record<string, unknown>): void;
  broadcast(message: string, options?: Record<string, unknown>): void;
  execute(command: string): void;
  teleport(target: string, destination: string): void;
  checkLock(target: string | IDBObj, lock: string): Promise<boolean>;
  auth: {
    verify(name: string, password: string): Promise<boolean>;
    login(id: string): Promise<void>;
  };
  chan: {
    join(channel: string, alias: string): Promise<void>;
    leave(alias: string): Promise<void>;
    list(): Promise<unknown[]>;
  };
  setFlags(target: string | IDBObj, flags: string): Promise<void>;
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
  
  const hydrateFlags = (obj: unknown): IDBObj => {
    const raw = obj as Record<string, unknown>;
    if (raw) {
      raw.flags = new Set(Array.isArray(raw.flags) ? (raw.flags as string[]) : []);
      if (raw.contents) {
        raw.contents = (raw.contents as unknown[]).map(hydrateFlags);
      }
    }
    return raw as unknown as IDBObj;
  };

  const u: IUrsamuSDK = {
    state: createStateProxy(sdkData.state, (p: string, v: unknown) => self.postMessage({ type: 'patch', prop: p, value: v })),
    me: hydrateFlags(sdkData.me),
    here: {
      ...(hydrateFlags(sdkData.here) as SDKDBObj),
      broadcast: (msg: string) => self.postMessage({ type: 'broadcast', message: msg })
    } as IDBObj,
    target: sdkData.target ? ({
      ...(hydrateFlags(sdkData.target) as SDKDBObj),
      broadcast: (msg: string) => self.postMessage({ type: 'broadcast', message: msg, target: (sdkData.target as IDBObj).id })
    } as IDBObj) : undefined,
    ui: {
      panel: (opt: unknown) => opt,
      render: (tpl: string, ctx: Record<string, unknown>) => tpl.replace(/\{\{(.+?)\}\}/g, (_, k) => String(ctx[k.trim()] || "")),
      layout: (opt: unknown) => self.postMessage({ type: "result", data: opt })
    },
    util: {
      displayName: (o: IDBObj) => (o.state?.moniker as string) || (o.state?.name as string) || (o.name as string) || "Unknown",
      target: (actor: IDBObj, query: string) => request<IDBObj | undefined>("util:target", { actor: actor.id, query }),
      ...sdkData.util
    },
    db: {
      search: async (q: string | Record<string, unknown>) => {
        const results = await request<unknown[]>("db:search", { query: q });
        return (results || []).map(hydrateFlags);
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
      self.postMessage({ type: "force", command }),
    teleport: (target: string, destination: string) =>
      self.postMessage({ type: "teleport", target, destination }),
    checkLock: (target: string | IDBObj, lock: string) => 
      request<boolean>("lock:check", { target: typeof target === "string" ? target : target.id, lock }),
    auth: {
      verify: (name: string, password: string) => request<boolean>("auth:verify", { name, password }),
      login: (id: string) => request<void>("auth:login", { id })
    },
    chan: {
      join: (channel: string, alias: string) => request<void>("chan:join", { channel, alias }),
      leave: (alias: string) => request<void>("chan:leave", { alias }),
      list: () => request<unknown[]>("chan:list", {})
    },
    setFlags: (target: string | IDBObj, flags: string) => 
      request<void>("flags:set", { target: typeof target === "string" ? target : target.id, flags })
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
