import type { IDBObj, IGameTime } from "../world/types.ts";

export type { IDBObj, IGameTime } from "../world/types.ts";

export type FormatSlot =
  | "NAMEFORMAT"
  | "DESCFORMAT"
  | "CONFORMAT"
  | "EXITFORMAT"
  | "WHOFORMAT"
  | "WHOROWFORMAT"
  | "PSFORMAT"
  | "PSROWFORMAT"
  // deno-lint-ignore ban-types
  | (string & {});

export interface DbAccessor {
  search(query: string | Record<string, unknown>): Promise<IDBObj[]>;
  create(template: Partial<IDBObj>): Promise<IDBObj>;
  destroy(id: string): Promise<void>;
  modify(id: string, op: "$set" | "$inc" | "$unset" | string, data: unknown): Promise<void>;
}

export interface OutputAccessor {
  send(message: string, target?: string, options?: Record<string, unknown>): void;
  roomBroadcast(roomId: string, message: string, options?: Record<string, unknown>): void;
  broadcast(message: string, options?: Record<string, unknown>): void;
}

export interface ICmd {
  name:      string;
  pattern:   RegExp;
  lock?:     string;      // optional for backwards compat; default ""
  category?: string;
  help?:     string;
  exec:      (u: IUrsamuSDK) => void | Promise<void>;
}

export interface IUrsamuSDK {
  state: Record<string, unknown>;
  socketId?: string;
  me: IDBObj;
  here: IDBObj & { broadcast(message: string, options?: Record<string, unknown>): void };
  target?: IDBObj & { broadcast(message: string, options?: Record<string, unknown>): void };

  ui: {
    panel(options: {
      type?: "header" | "list" | "grid" | "table" | "panel";
      title?: string;
      content: unknown;
      style?: string;
    }): unknown;
    render(template: string, data: Record<string, unknown>): string;
    layout(options: { components: unknown[]; meta?: Record<string, unknown> }): void;
  };

  util: {
    displayName(obj: IDBObj, actor: IDBObj): string;
    // deno-lint-ignore no-node-globals
    target(actor: IDBObj, query: string, global?: boolean): Promise<IDBObj | undefined>;
    center(string: string, length: number, filler?: string): string;
    ljust(string: string, length: number, filler?: string): string;
    rjust(string: string, length: number, filler?: string): string;
    header(string?: string, filler?: string, width?: number): string;
    divider(string?: string, filler?: string, width?: number): string;
    footer(string?: string, filler?: string, width?: number): string;
    template(
      string: string,
      data?: Record<string, string | string[] | { value: string | string[]; align?: "left" | "right" | "center" }>
    ): string;
    sprintf(format: string, ...args: unknown[]): string;
    stripSubs(str: string): string;
    parseDesc?(desc: string, actor: IDBObj, target: IDBObj): Promise<string>;
    resolveFormat?(target: IDBObj, slot: string, defaultArg: string): Promise<string | null>;
    resolveFormatOr?(target: IDBObj, slot: string, defaultArg: string, fallback: string): Promise<string>;
    resolveGlobalFormat?(slot: string, defaultArg: string): Promise<string | null>;
    resolveGlobalFormatOr?(slot: string, defaultArg: string, fallback: string): Promise<string>;
    [key: string]: unknown;
  };

  db: DbAccessor;

  cmd: {
    name: string;
    original?: string;
    args: string[];
    switches?: string[];
  };

  canEdit(actor: IDBObj, target: IDBObj): Promise<boolean>;
  send(message: string, target?: string, options?: Record<string, unknown>): void;
  notify(actorId: string, message: string, options?: Record<string, unknown>): Promise<boolean>;
  broadcast(message: string, options?: Record<string, unknown>): void;
  execute(command: string): void;
  force(command: string): void;
  forceAs(targetId: string, command: string): Promise<void>;
  teleport(target: string, destination: string): void;
  checkLock(target: string | IDBObj, lock: string): Promise<boolean>;
  intercept?(intent: { name: string; actorId: string; targetId?: string; args: string[] }): boolean | void;

  auth: {
    verify(name: string, password: string): Promise<IDBObj | false>;
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
    update(branch?: string): Promise<void>;
    gameTime(): Promise<IGameTime>;
    setGameTime(t: IGameTime): Promise<void>;
  };

  chan: {
    join(channel: string, alias: string): Promise<void>;
    leave(alias: string): Promise<void>;
    list(): Promise<unknown[]>;
    create(name: string, options?: { header?: string; lock?: string; hidden?: boolean }): Promise<unknown>;
    destroy(name: string): Promise<unknown>;
    set(name: string, options: {
      header?: string;
      lock?: string;
      hidden?: boolean;
      masking?: boolean;
      logHistory?: boolean;
      historyLimit?: number;
    }): Promise<unknown>;
    history(name: string, limit?: number): Promise<{ id: string; playerName: string; message: string; timestamp: number }[]>;
  };

  attr: {
    get(id: string, name: string): Promise<string | null>;
    set(id: string, name: string, value: string, type?: string): Promise<void>;
    clear(id: string, name: string): Promise<boolean>;
  };

  setFlags(target: string | IDBObj, flags: string): Promise<void>;
  trigger(target: string, attr: string, args?: string[]): Promise<void>;

  text: {
    read(id: string): Promise<string>;
    set(id: string, content: string): Promise<void>;
  };

  events: {
    emit(event: string, data: unknown, context?: Record<string, unknown>): Promise<void>;
    on(event: string, handler: string): Promise<string>;
  };

  eval(targetId: string, attr: string, args?: string[]): Promise<string>;
  evalString(str: string): Promise<string>;
}
