import { IDBOBJ } from "../../@types/IDBObj.ts";
import { getNextId } from "../../utils/getNextId.ts";
import { moniker } from "../../utils/moniker.ts";
import { dbojs } from "../Database/index.ts";
import { flags } from "../flags/flags.ts";

export const createObj = async (flgs: string, datas: any) => {
  const id = await getNextId("objid");
  const { tags, data } = flags.set("", datas, flgs);
  const obj = {
    id,
    flags: tags,
    data,
  };

  const ret = await dbojs.create(obj);
  if(ret.length) {
    return ret[0]
  } else {
    return false
  }
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
      let returnObj = [];

      if (obj.startsWith("#")) {
        returnObj = await dbojs.query({ id: +obj.slice(1) });
      } else {
        returnObj = await dbojs.query({ "data.name": new RegExp(obj, "i") });
      }
      if (returnObj.length) {
        return new Obj().load(returnObj[0]);
      }
    } else if (typeof obj === "number") {
      const returnObj = await dbojs.query({ id: obj });
      if (returnObj.length) {
        return new Obj().load(returnObj[0]);
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

  get splat() {
    return this.obj.data?.stats?.find((s) => s.name === "splat")?.value;
  }

  get location() {
    return this.obj.location;
  }

  get description() {
    return this.obj.description;
  }

  get stats() {
    return this.obj.data?.stats;
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
