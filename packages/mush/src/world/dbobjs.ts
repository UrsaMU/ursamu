import { DBO } from "@ursamu/core";
import type { IDBOBJ, IDBObj, IAttribute } from "./types.ts";
import { flags } from "./flags.ts";

// Namespace names match the existing engine KV layout for data compatibility.
export const dbojs      = new DBO<IDBOBJ>("server.db");
export const counters   = new DBO<{ id: string; value: number }>("server.counters");
export const chans      = new DBO<Record<string, unknown> & { id: string; name: string }>("server.chans");
export const texts      = new DBO<{ id: string; content: string }>("server.texts");
// deno-lint-ignore no-explicit-any
export const scenes      = new DBO<any & { id: string }>("server.scenes");
// deno-lint-ignore no-explicit-any
export const chanHistory = new DBO<any & { id: string }>("server.chan_history");

/** Get the next numeric object ID from the counters collection. */
async function getNextId(name: string): Promise<string> {
  return (await counters.atomicIncrement(name)).toString();
}

/** Return the object's display name (moniker → data.name → "Unknown"). */
function moniker(obj: IDBOBJ): string {
  return (
    (obj.data?.moniker as string | undefined) ||
    (obj.data?.name as string | undefined) ||
    "Unknown"
  );
}

/**
 * Create a new database object.
 * @param flgs - Initial flags string (e.g., "room safe").
 * @param datas - Initial data/attributes for the object.
 * @returns The created IDBOBJ records.
 */
export const createObj = async (
  flgs: string,
  datas: Record<string, unknown>,
): Promise<IDBOBJ[]> => {
  const id = await getNextId("objid");
  const { tags, data } = flags.set("", datas, flgs);
  const obj: IDBOBJ = { id, flags: tags, data };
  await dbojs.create(obj);
  return await dbojs.query({ id });
};

/** Convert a raw IDBOBJ from KV storage into the SDK-facing IDBObj shape. */
export const hydrate = (obj: IDBOBJ): IDBObj => ({
  id: obj.id,
  name: moniker(obj),
  flags: new Set(obj.flags.split(" ")),
  location: obj.location,
  state: obj.data || {},
  contents: [],
});

/**
 * SDK-facing wrapper around a IDBOBJ with utility accessors and save logic.
 */
export class Obj {
  private obj: IDBOBJ = {} as IDBOBJ;

  constructor(obj?: IDBOBJ) {
    if (obj) this.obj = obj;
  }

  load(obj: IDBOBJ): this {
    this.obj = obj;
    return this;
  }

  static async get(
    obj: string | number | undefined,
  ): Promise<Obj | null> {
    if (obj === undefined || obj === "") return null;

    if (typeof obj === "string") {
      if (obj.startsWith("#")) {
        const id = obj.slice(1);
        const found = await dbojs.queryOne({ id });
        if (found) return new Obj().load(found);
      } else {
        const found = await dbojs.queryOne({
          $or: [
            { "data.name": new RegExp(obj, "i") },
            { id: `${obj}` },
            { "data.alias": new RegExp(obj, "i") },
          ],
        });
        if (found) return new Obj().load(found);
      }
    } else if (typeof obj === "number") {
      const found = await dbojs.queryOne({ id: String(obj) });
      if (found) return new Obj().load(found);
    }

    return null;
  }

  get dbobj(): IDBOBJ {
    return this.obj;
  }

  set dbobj(obj: IDBOBJ) {
    if (!this.obj?.id) return;
    this.obj = { ...this.obj, ...obj };
    this.save();
  }

  get id(): string {
    return this.obj?.id;
  }

  get name(): string {
    if (!this.obj) return "";
    return moniker(this.obj);
  }

  get flags(): string {
    return this.obj.flags;
  }

  get dbref(): string {
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

  get splat(): string | undefined {
    return this.obj.data?.attributes?.find(
      (s: IAttribute) => s.name === "splat",
    )?.value;
  }

  get location(): string | undefined {
    return this.obj.location;
  }

  set location(loc: string | undefined) {
    if (!this.obj) return;
    this.obj.location = loc;
    this.save();
  }

  get description(): string | undefined {
    return this.obj.description;
  }

  get stats(): IAttribute[] | undefined {
    return this.obj.data?.attributes;
  }

  async exits(): Promise<IDBOBJ[]> {
    return await dbojs.query({ location: this.id, flags: "exit" });
  }

  async contents(): Promise<IDBOBJ[]> {
    return await dbojs.query({ location: this.id });
  }

  async save(): Promise<void> {
    await dbojs.modify({ id: this.id }, "$set", this.obj);
  }
}
