import { IContext } from "./IContext.ts";

export type IMiddlewareFunction = (
  ctx: IContext,
  next: () => Promise<void>
) => Promise<void>;
