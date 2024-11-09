import { IContext } from "./IContext";

export type IMiddlewareFunction = (
  ctx: IContext,
  next: () => Promise<void>,
) => Promise<void>;
