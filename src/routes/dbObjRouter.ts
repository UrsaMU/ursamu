import { Router } from "../../deps.ts";
import { Obj, dbojs, flags } from "../services/index.ts";
import { IMError } from "../@types/index.ts";
import { canEdit } from "../utils/index.ts";

const router = Router();

router.get("/dbos", async (req, res, next) => {
  const en = await Obj.get(req.body.id);
  const flgs = (req.query.flags as string) || "";

  if (!en) {
    const err: IMError = new Error("Not Found");
    err.status = 404;
    return next(err);
  }

  const dbos = (await dbojs.find({}))
    .filter((dbo) => canEdit(en.dbobj, dbo) && flags.check(dbo.flags, flgs))
    .map((dbo) => {
      delete dbo.data?.password;
      return dbo;
    });
  res.status(200).json(dbos);
});

export const dbObjRouter = router;
