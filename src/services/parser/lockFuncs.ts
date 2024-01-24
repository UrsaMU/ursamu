import { MuFunction } from "npm:@ursamu/parser@1.3.1";
import { Parser } from "../../../deps.ts";
import { flags, Obj } from "../index.ts";

class Locks {
  private _parser: Parser;

  constructor() {
    this._parser = new Parser();
  }

  add(name: string, func: MuFunction) {
    this._parser.add(name, func);
    return this;
  }

  eval(str: string) {
    this._parser.run({ msg: str, data: {}, scope: {} });
  }
}

export const locks = new Locks();

locks.add("bit", async (args) => {
  const en = await Obj.get(args[0]);
  if (!en) return -1;
  return flags.lvl(en.flags);
});

locks.add("hasflags", async (args) => {
  const en = await Obj.get(args[0]);
  if (!en) return -1;
  return flags.check(en.flags, args[1]);
});

locks.add("gt", async (args) => args[0] > args[1]);
locks.add("lt", async (args) => args[0] < args[1]);
locks.add("gte", async (args) => args[0] >= args[1]);
locks.add("lte", async (args) => args[0] <= args[1]);
locks.add("eq", async (args) => args[0] == args[1]);
locks.add("neq", async (args) => args[0] != args[1]);

locks.add("and", async (args) => {
  for (const arg of args) {
    if (!arg) return false;
  }
  return true;
});

locks.add("or", async (args) => {
  for (const arg of args) {
    if (arg) return true;
  }
  return false;
});

locks.add("not", async (args) => !args[0]);
locks.add("isnum", async (args) => !isNaN(args[0]));

locks.add("owner", async (args) => (await Obj.get(args[0]))?.owner);
locks.add("strmatch", async (args) => args[0].match(args[1]));

export default locks;
