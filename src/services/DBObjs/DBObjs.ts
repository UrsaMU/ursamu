import { IAttribute } from "../../@types";
import { IDBOBJ } from "../../@types/IDBObj";
import { getNextId } from "../../utils/getNextId";
import { moniker } from "../../utils/moniker";
import { dbojs } from "../Database";
import { flags } from "../flags/flags";

export const createObj = async (flgs: string, datas: any) => {
  const id = await getNextId();
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

  get _id() {
    return this.obj?._id;
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

  get data(): IDBOBJ["data"] {
    return this.obj.data;
  }

  set data(data: IDBOBJ["data"]) {
    this.obj.data = data;
  }

  get location() {
    return this.obj.location || 0;
  }

  set location(loc: number) {
    this.obj.location = loc;
  }

  get description() {
    return this.obj.description || "You see nothing special.";
  }

  set description(desc: string) {
    this.obj.description = desc;
  }

  async exits() {
    return await dbojs.find({ location: this.id, flags: "exit" });
  }

  async contents() {
    return await dbojs.find({ location: this.id });
  }

  async save() {
    const updateData = {
      flags: this.obj.flags,
      data: this.obj.data,
      location: this.obj.location,
      description: this.obj.description,
    };
    await dbojs.update({ id: this.id }, { $set: updateData });
  }

  set dbobj(obj: IDBOBJ) {
    if (!this.obj) return;
    this.obj = { ...this.obj, ...obj };
    this.save();
  }

  get attributes(): IAttribute[] {
    return this.obj.data?.attributes || [];
  }

  set attributes(attributes: IAttribute[]) {
    this.obj.data ||= {};
    this.obj.data.attributes = attributes;
  }

  get splat() {
    return this.obj.data?.splat;
  }

  async attribute(name: string): Promise<IAttribute | void> {
    return this.attributes.find((a) => a.name === name);
  }
}
