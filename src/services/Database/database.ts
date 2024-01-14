import { MongoClient } from "../../../deps.ts";
import { IDBOBJ } from "../../@types/IDBObj.ts";
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
  connector: string | undefined;

  constructor(path: string, connector?: string) {
    this.collection = path.replace(".", "_");
    this.connector = connector;
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

  async length(query: any) {
    return await this.coll()?.countDocuments(query);
  }

  async init() {
    this.client = new MongoClient(
      this.connector || gameConfig.server?.db || "",
    );
    this.client.connect();
    return this;
  }
}

const models = gameConfig.server?.dbModel;
let dbojs: DBO<IDBOBJ>,
  chans: DBO<IChannel>,
  mail: DBO<IMail>,
  wiki: DBO<IArticle>,
  bboard: DBO<IBoard>;

if (models && models["dbojs"]) {
  dbojs = models["dbojs"];
} else {
  dbojs = new DBO<IDBOBJ>("dbojs");
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

export { bboard, chans, dbojs, mail, wiki };
