import type { ICoreContext } from "./types.ts";
import { getMiddleware } from "./middleware.ts";
import { matchHandler } from "./handler.ts";

export async function runPipeline(ctx: ICoreContext): Promise<boolean> {
  const mw = [...getMiddleware()];
  let handlerRan = false;

  async function dispatch(index: number): Promise<void> {
    if (index < mw.length) {
      await mw[index](ctx, () => dispatch(index + 1));
      return;
    }
    const match = matchHandler(ctx.input);
    if (!match) return;
    ctx = { ...ctx, args: match.args };
    await match.handler.exec(ctx);
    handlerRan = true;
  }

  await dispatch(0);
  return handlerRan;
}
