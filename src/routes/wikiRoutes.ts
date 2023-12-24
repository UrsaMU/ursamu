import { Router } from "../../deps.ts";
import { Obj, flags, wiki } from "../services/index.ts";
import { IMError } from "../@types/index.ts";
import authMiddleware from "../middleware/authMiddleware.ts";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const en = await Obj.get(req.body.id);
    const entries = (await wiki.find({})).filter((entry) =>
      flags.check(en?.flags || "", entry.lock || "")
    );

    res.status(200).json(entries);
  } catch (err) {
    next(err);
  }
});

router.post("/", authMiddleware, async (req, res, next) => {
  try {
    const en = await Obj.get(req.body.id);
    if (!en) {
      const err: IMError = new Error("Not Found");
      err.status = 404;
      return next(err);
    }

    if (!flags.check(en?.flags || "", "admin+")) {
      const err: IMError = new Error("Not Found");
      err.status = 404;
      return next(err);
    }

    delete req.body.id;
    const entry = await wiki.insert({
      ...req.body,
      createdBy: en?.dbref,
      createdAt: new Date(),
    });

    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const en = await Obj.get(req.body.id);
    const entry = await wiki.findOne({
      $or: [{ id: req.params.id }, { slug: req.params.id.toLowerCase() }],
    });

    if (!entry) {
      const err: IMError = new Error("Not Found");
      err.status = 404;
      return next(err);
    }

    if (!flags.check(en?.flags || "", entry.lock || "")) {
      const err: IMError = new Error("Not Found");
      err.status = 404;
      return next(err);
    }

    res.status(200).json(entry);
  } catch (err) {
    next(err);
  }
});

router.put("/:id", authMiddleware, async (req, res, next) => {
  try {
    const en = await Obj.get(req.body.id);
    const entry = await wiki.findOne({
      $or: [{ id: req.params.id }, { slug: req.params.id.toLowerCase() }],
    });

    if (!entry) {
      const err: IMError = new Error("Not Found");
      err.status = 404;
      return next(err);
    }

    if (!flags.check(en?.flags || "", entry.lock || "")) {
      const err: IMError = new Error("Not Found");
      err.status = 404;
      return next(err);
    }

    delete req.body.id;
    const updatedEntry = await wiki.update(
      { _id: entry._id },
      {
        ...req.body,
        updatedBy: en?.dbref,
        updatedAt: new Date(),
      }
    );

    res.status(200).json(updatedEntry);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", authMiddleware, async (req, res, next) => {
  try {
    const en = await Obj.get(req.body.id);
    const entry = await wiki.findOne({
      $or: [{ id: req.params.id }, { slug: req.params.id.toLowerCase() }],
    });

    if (!entry) {
      const err: IMError = new Error("Not Found");
      err.status = 404;
      return next(err);
    }

    if (!flags.check(en?.flags || "", entry.lock || "")) {
      const err: IMError = new Error("Not Found");
      err.status = 404;
      return next(err);
    }

    await wiki.remove({ _id: entry._id });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export { router as wikiRouter };
