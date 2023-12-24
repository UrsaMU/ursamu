import { IContext } from "../../@types/IContext.ts";
import { IMiddlewareFunction } from "../../@types/IMiddlewareFunction.ts";

export class MiddlewareStack {
  private middlewares: IMiddlewareFunction[] = [];

  use(middleware: IMiddlewareFunction) {
    this.middlewares.push(middleware);
  }

  async run(ctx: IContext) {
    let index = 0;
    const next = async () => {
      if (index < this.middlewares.length) {
        await this.middlewares[index++](ctx, next);
      }
    };
    await next();
  }
}
