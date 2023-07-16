import { IDBOBJ } from "../../@types/IDBObj";
import { getNextId } from "../../utils/getNextId";
import { moniker } from "../../utils/moniker";
import { target } from "../../utils/target";
import { dbojs } from "../Database";
import { flags } from "../flags/flags";

export const createObj = async (flgs: string, datas: any) => {
  const id = await getNextId("objid");
  const { tags, data } = flags.set("", datas, flgs);
  const obj = {
    id,
    flags: tags,
    data,
  };

  return await dbojs.insert(obj);
};

export class Obj {
  private obj: IDBOBJ = {} as IDBOBJ;

  constructor(obj?: IDBOBJ) {
    if (obj) {
      this.obj = obj;
    }
  }

  load(obj: IDBOBJ) {
    this.obj = obj;
    return this;
  }

  static async get(obj: string | number | undefined, en?: Obj) {
    if (typeof obj === "string") {
      let returnObj;

      if (obj.startsWith("#")) {
        returnObj = await dbojs.findOne({ id: +obj.slice(1) });
      } else {
        returnObj = await dbojs.findOne({ "data.name": new RegExp(obj, "i") });
      }
      if (returnObj) {
        return new Obj().load(returnObj);
      }
    } else if (typeof obj === "number") {
      const returnObj = await dbojs.findOne({ id: obj });
      if (returnObj) {
        return new Obj().load(returnObj);
      }
    }
  }

  get dbobj() {
    return this.obj;
  }

  get id() {
    return this.obj?.id;
  }

  get name() {
    if (!this.obj) return "";
    return moniker(this.obj);
  }

  get flags() {
    return this.obj.flags;
  }

  get dbref() {
    return `#${this.obj.id}`;
  }

  get data() {
    return this.obj.data;
  }

  get location() {
    return this.obj.location;
  }

  get description() {
    return this.obj.description;
  }

  async exits() {
    return await dbojs.find({ location: this.id, flags: "exit" });
  }

  async contents() {
    return await dbojs.find({ location: this.id });
  }

  async save() {
    await dbojs.update({ id: this.id }, this.obj);
  }

  set dbobj(obj: IDBOBJ) {
    if (!this.obj) return;
    this.obj = { ...this.obj, ...obj };
    this.save();
  }
}
