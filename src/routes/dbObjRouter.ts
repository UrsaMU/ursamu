import { Router } from "express";
import { Obj } from "../services";

const router = Router();

router.get("/", async (req, res, next) => {
  const obi = Obj.get(req.body.id);
});

export const dbObjRouter = router;
