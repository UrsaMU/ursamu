export interface IDBObj {
  id: string;
  name?: string;
  flags: Set<string>;
  location?: string;
  state: Record<string, unknown>;
  contents: IDBObj[];
}

export interface IUrsamuSDK {
  state: Record<string, unknown>;
  socketId?: string;
  me: IDBObj;
  here: IDBObj & { broadcast(message: string, options?: Record<string, unknown>): void };
  target?: IDBObj & { broadcast(message: string, options?: Record<string, unknown>): void };
  ui: {
    panel(options: {
      type?: "header" | "list" | "grid" | "table" | "panel",
      title?: string,
      content: unknown,
      style?: string
    }): unknown;
    render(template: string, data: Record<string, unknown>): string;
    layout(options: {
      components: unknown[],
      meta?: Record<string, unknown>
    }): void;
  };
  util: {
    displayName(obj: IDBObj, actor: IDBObj): string;
    getMapData?(targetId: string, radius: number): unknown;
    // deno-lint-ignore no-node-globals
    target(actor: IDBObj, query: string, global?: boolean): Promise<IDBObj | undefined>;
    center(string: string, length: number, filler?: string): string;
    ljust(string: string, length: number, filler?: string): string;
    rjust(string: string, length: number, filler?: string): string;
    template(
      string: string,
      data?: Record<string, string | string[] | { value: string | string[]; align?: "left" | "right" | "center" }>
    ): string;
    sprintf(format: string, ...args: unknown[]): string;
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
  intercept?(intent: { name: string, actorId: string, targetId?: string, args: string[] }): boolean | void;
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
  setFlags(target: string | IDBObj, flags: string): Promise<void>;
  events: {
    emit(event: string, data: unknown, context?: Record<string, unknown>): Promise<void>;
    on(event: string, handler: string): Promise<string>;
  };
}

declare global {
  const u: IUrsamuSDK;
}
