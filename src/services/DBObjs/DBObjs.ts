import type { IDBOBJ } from "../../@types/IDBObj.ts";
import { getNextId } from "../../utils/getNextId.ts";
import { moniker } from "../../utils/moniker.ts";
import { dbojs } from "../Database/index.ts";
import { flags } from "../flags/flags.ts";
import type { IEntity } from "../../interfaces/IEntity.ts";

import type { IAttribute } from "../../@types/IAttribute.ts";

/**
 * Create a new database object.
 * @param flgs - The initial flags for the object (e.g., "room safe").
 * @param datas - The initial data/attributes for the object.
 * @returns The created object(s).
 */
export const createObj = async (flgs: string, datas: Record<string, unknown>): Promise<IDBOBJ[]> => {
  const id = await getNextId("objid");
  const { tags, data } = flags.set("", datas, flgs);
  const obj = {
    id,
    flags: tags,
    data,
  };

  await dbojs.create(obj);
  return await dbojs.query({ id });
};

/**
 * Represents a database object wrapper with utility methods.
 */
export class Obj implements IEntity {
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

  static async get(obj: string | number | undefined, _en?: Obj): Promise<Obj | null> {
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
        const returnObj = await dbojs.queryOne({
          $or: [{ "data.name": new RegExp(obj, "i") },
          { id: `${obj}` },
          { "data.alias": new RegExp(obj, "i") }
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

  set dbobj(obj: IDBOBJ) {
    if (!this.obj) return;
    this.obj = { ...this.obj, ...obj };
    this.save();
  }

  get id() {
    return this.obj?.id;
  }

  get name() {
    if (!this.obj) return "";
    return moniker(this.obj) || "";
  }

  get flags() {
    return this.obj.flags;
  }

  get dbref() {
    return `#${this.obj.id}`;
  }

  get data(): Record<string, unknown> {
    return (this.obj.data || {}) as Record<string, unknown>;
  }

  set data(data: Record<string, unknown>) {
    if (!this.obj) return;
    this.obj.data = { ...this.obj.data, ...data };
    this.save();
  }

  get splat() {
    return this.obj.data?.attributes?.find((s: IAttribute) => s.name === "splat")?.value;
  }

  get location() {
    return this.obj.location;
  }

  set location(loc: string | undefined) {
    if (!this.obj) return;
    this.obj.location = loc;
    this.save();
  }

  get description() {
    return this.obj.description;
  }

  get stats(): IAttribute[] | undefined {
    return this.obj.data?.attributes;
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
}
