import { Router } from "../../deps.ts";
import { getView } from "../index.ts";

const router = new Router();

router.get("/", (ctx) => {
  const view = getView("index.hbs");
  if (view) return ctx.response.body = view;
  throw new Error("View not found");
});

export { router as webRouter };
