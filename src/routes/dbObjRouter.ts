import { Router } from "express";
import { dbojs, flags, Obj } from "../services";
import { IMError } from "../@types";
import { canEdit } from "../utils";

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
