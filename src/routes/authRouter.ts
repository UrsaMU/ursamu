import { Request, Response, Router } from "../../deps.ts";
import { Obj, dbojs } from "../services/index.ts";
import { compare } from "../../deps.ts";
import { sign } from "../services/jwt/index.ts";
import { config } from "../../deps.ts";

config();

const router = Router();

router.post("/", async (req: Request, res: Response, next) => {
  const { username, password } = req.body;
  const ob = await dbojs.findOne({
    $or: [
      { "data.alias": new RegExp(username, "i") },
      { "data.name": new RegExp(username, "i") },
    ],
  });

  if (!ob) return next(new Error("Invalid username or password."));

  const obj = new Obj().load(ob);

  obj.dbobj.data ||= {};
  obj.dbobj.data.password ||= "";

  compare(password, obj.dbobj.data.password, async (err, isMatch) => {
    if (err) return res.status(500).send("Internal server error.");
    if (!isMatch) return res.status(400).send("Invalid username or password.");

    const token = await sign({ id: obj.dbobj.id });
    if (token) {
      res.status(200).json({ token });
    } else {
      next(err);
    }
  });
});

export const authRouter = router;
