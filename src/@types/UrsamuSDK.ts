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
    stripSubs(str: string): string;
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
  canEdit(actor: IDBObj, target: IDBObj): Promise<boolean>;
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
    uptime(): Promise<number>;
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
  trigger(target: string, attr: string, args?: string[]): Promise<void>;
  text: {
    read(id: string): Promise<string>;
    set(id: string, content: string): Promise<void>;
  };
  bb: {
    listBoards(): Promise<{ id: string; name: string; description?: string; order: number; postCount: number; newCount: number }[]>;
    listPosts(boardId: string): Promise<{ id: string; num: number; subject: string; authorName: string; date: number; edited?: number }[]>;
    readPost(boardId: string, postNum: number): Promise<{ id: string; subject: string; body: string; authorName: string; date: number; edited?: number } | null>;
    post(boardId: string, subject: string, body: string): Promise<{ id?: string; error?: string }>;
    editPost(boardId: string, postNum: number, body: string): Promise<void>;
    deletePost(boardId: string, postNum: number): Promise<void>;
    createBoard(name: string, options?: { description?: string; order?: number }): Promise<{ id?: string; name?: string; error?: string }>;
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

