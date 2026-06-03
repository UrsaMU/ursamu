export interface ICoreHandler {
  name: string;
  pattern: RegExp | string;
  exec: (ctx: ICoreContext) => void | Promise<void>;
}

export interface ICoreContext {
  socketId: string;
  sessionId: string | null;
  input: string;
  args: string[];
  send: (msg: string) => void;
}

export type IMiddlewareFn = (
  ctx: ICoreContext,
  next: () => Promise<void>,
) => Promise<void>;
