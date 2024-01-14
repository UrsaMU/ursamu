import { MongoClient } from "../../../deps.ts";
import { IDBOBJ } from "../../@types/IDBObj.ts";
import config from "../../ursamu.config.ts";
import { IChannel } from "../../@types/Channels.ts";
import { IMail } from "../../@types/IMail.ts";
import { IArticle, IBoard } from "../../@types/index.ts";
import { Obj } from "../DBObjs/DBObjs.ts";
import { gameConfig } from "../../config.ts";

function d(...args: any) {
  const e = new Error();
  const level = e.stack?.split("\n").slice(3, 5);
  console.log(...args, level);
}

export class DBO<T> {
  db: any;
  collection: string;
  client: MongoClient | undefined;

  constructor(path: string) {
    this.collection = path.replace(".", "_");
  }

  coll() {
    return this.client?.db().collection(this.collection);
  }

  async create(data: any) {
    await this.coll()?.insertOne(data);
    return await this.queryOne({ id: data.id });
  }

  async query(query?: any) {
    const ret = await this.coll()?.find(query);
    return (await ret?.toArray()) as T[];
  }

  async queryOne(query?: any) {
    const ret = await this.query(query);
    return ret.length ? ret[0] : undefined;
  }

  async all() {
    const ret = await this.coll()?.find({});
    return (await ret?.toArray()) as T[];
  }

  async modify(query: any, operator: string, data: any) {
    var body = {} as any;

    // check if data is of type Obj
    if (data instanceof Obj) data = data.dbobj;

    if (data?._id) delete data?._id;
    body[operator] = data;
    const ret = await this.coll()?.updateMany(query, body);
    return await this.query(query);
  }

  async delete(query: any) {
    return await this.coll()?.deleteMany(query);
  }

  async length(query: any) {}

  async init(connector: string) {
    this.client = new MongoClient(connector);
    this.client.connect();
    return this;
  }
}

export interface ICounters {
  _id: string;
  seq: number;
}

const models = gameConfig.server?.dbModel;
let counters: DBO<ICounters>,
  dbojs: DBO<IDBOBJ>,
  chans: DBO<IChannel>,
  mail: DBO<IMail>,
  wiki: DBO<IArticle>,
  bboard: DBO<IBoard>;

if (models && models["dbojs"]) {
  dbojs = models["dbojs"];
} else {
  dbojs = new DBO<IDBOBJ>("dbojs");
}

if (models && models["counters"]) {
  counters = models["counters"];
} else {
  counters = new DBO<ICounters>("counters");
}

if (models && models["chans"]) {
  chans = models["chans"];
} else {
  chans = new DBO<IChannel>("chans");
}

if (models && models["mail"]) {
  mail = models["mail"];
} else {
  mail = new DBO<IMail>("mail");
}

if (models && models["wiki"]) {
  wiki = models["wiki"];
} else {
  wiki = new DBO<IArticle>("wiki");
}

if (models && models["bboard"]) {
  bboard = models["bboard"];
} else {
  bboard = new DBO<IBoard>("bboard");
}

export { bboard, chans, counters, dbojs, mail, wiki };
