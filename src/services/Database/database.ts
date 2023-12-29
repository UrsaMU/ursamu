import { MongoClient } from "../../../deps.ts";
import { IDBOBJ } from "../../@types/IDBObj.ts";
import config from "../../ursamu.config.ts";
import { IChannel } from "../../@types/Channels.ts";
import { IMail } from "../../@types/IMail.ts";
import { IArticle, IBoard } from "../../@types/index.ts";

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
    return ret.length ? ret[0] : false;
  }

  async all() {
    const ret = await this.coll()?.find({});
    return (await ret?.toArray()) as T[];
  }

  async modify(query: any, operator: string, data: any) {
    var body = {} as any;
    if (data._id) delete data._id;
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
  }
}

export interface ICounters {
  _id: string;
  seq: number;
}

export const counters = new DBO<ICounters>(`counters`);
export const bboard = new DBO<IBoard>(`bboards`);
export const dbojs = new DBO<IDBOBJ>(`dbojs`);
export const chans = new DBO<IChannel>(`chans`);
export const mail = new DBO<IMail>(`mail`);
export const wiki = new DBO<IArticle>(`wiki`);
