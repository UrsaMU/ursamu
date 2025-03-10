import { IDBOBJ } from "../../@types/IDBObj.ts";
import { getNextId } from "../../utils/getNextId.ts";
import { moniker } from "../../utils/moniker.ts";
import { dbojs } from "../Database/index.ts";
import { flags } from "../flags/flags.ts";

export const createObj = async (flgs: string, datas: any) => {
  const id = await getNextId();
  const { tags, data } = flags.set("", datas, flgs);
  const obj = {
    id,
    flags: tags,
    data,
  };

  await dbojs.create(obj);
  return await dbojs.query({id});
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

  static async get(obj: string | number | undefined, en?: Obj): Promise<Obj | null> {
    console.log("Obj.get called with:", obj, typeof obj);
    
    if (typeof obj === "string") {
      if (obj.startsWith("#")) {
        const id = obj.slice(1);
        const returnObj = await dbojs.queryOne({ id });
        if (returnObj) {
          console.log("Found by string (id):", returnObj.id);
          return new Obj().load(returnObj);
        }
      } else {
        const returnObj = await dbojs.queryOne({$or:[{ "data.name": new RegExp(obj, "i") },
          {id: `${obj}`},
          {"data.alias": new RegExp(obj, "i")}
        ],
        
      });
        if (returnObj) {
          console.log("Found by string (name):", returnObj.id);
          return new Obj().load(returnObj);
        }
      }
    } else if (typeof obj === "number") {
      const id = String(obj);
      const returnObj = await dbojs.queryOne({ id });
      console.log("Query by number (converted to string):", id, "Result:", returnObj ? returnObj.id : null);
      if (returnObj) {
        return new Obj().load(returnObj);
      }
    }
    
    console.log("No object found, returning null");
    // Return null when no object is found
    return null;
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
    return await dbojs.query({ location: this.id, flags: "exit" });
  }

  async contents() {
    return await dbojs.query({ location: this.id });
  }

  async save() {
    await dbojs.modify({ id: this.id }, "$set", this.obj);
  }

  set data(data: any) {
    if (!this.obj) return;
    this.obj.data = { ...this.obj.data, ...data };
    this.save();
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
