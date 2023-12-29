import { Context, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { dbojs, flags, Obj } from "../services/index.ts";
import { canEdit } from "../utils/index.ts";
import authMiddleware from "../middleware/authMiddleware.ts";

const router = new Router();

router.use(authMiddleware);

router.get("/dbos", async (ctx: Context) => {
  const en = await Obj.get(ctx.state.id);
  const queryParams = ctx.request.url.searchParams;

  const flgs = queryParams.get("flags") || "";

  if (!en) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Not Found" };
    return;
  }

  const dbos = (await dbojs.all())
    .filter((dbo) => canEdit(en.dbobj, dbo) && flags.check(dbo.flags, flgs))
    .map((dbo) => {
      delete dbo.data?.password;
      return dbo;
    });

  ctx.response.status = 200;
  ctx.response.body = dbos;
  return;
});

export const dbObjRouter = router;
