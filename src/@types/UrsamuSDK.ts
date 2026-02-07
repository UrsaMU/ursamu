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
  me: IDBObj;
  here: IDBObj & { broadcast(message: string): void };
  target?: IDBObj & { broadcast(message: string): void };
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
  intercept?(intent: { name: string, actorId: string, targetId?: string, args: string[] }): boolean | void;
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

declare global {
  const u: IUrsamuSDK;
}
