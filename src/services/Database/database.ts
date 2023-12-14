import { MongoClient } from "../../../deps.ts";
import { IDBOBJ } from "../../@types/IDBObj.ts";
import config from "../../ursamu.config.ts";
import { IChannel } from "../../@types/Channels.ts";
import { IMail } from "../../@types/IMail.ts";
import { IArticle, IBoard } from "../../@types/index.ts";

function d(...args) {
  const e = new Error();
  const level = e.stack.split("\n").slice(3, 5);
  console.log(...args, level);
}

export class DBO<T> {
  db: any;

  constructor(path: string) {
    this.collection = path.replace('.','_');
    const uri = `mongodb://root:root@mongo/`;
    this.client = new MongoClient(uri);
    this.client.connect();
  }

  coll() {
    return this.client.db().collection(this.collection);
  }

  async insert(data: T) {
    d("[database insert] gets", data);
    await this.coll().insertOne(data);
    const ret = await this.find(data);
    d("[database insert] returns", ret);
    if(!("length" in ret) || !ret.length) {
      return ret
    }
    return ret[0]
  }

  async find(query?: any) {
    d("[database find] gets", query);
    const ret = await (await this.coll().find(query)).toArray();
    d("[database find] returns", ret);
    return ret;
  }

  async findAll() {
    const ret = await (await this.coll().find({})).toArray();
    d("[database findAll] returns", ret);
    return ret;
  }

  async findOne(query: any) {
    d("[database findOne] gets", query);
    const ret = await this.coll().findOne(query);
    d("[database findOne] returns", ret);
    return ret;
  }

  async update(query: any, data: any) {
    d("[database update] gets", query, data)
    try {
      d("[database update] tries update")
      const r = await this.coll().update(query, data, {
        upsert: true,
      });
      d("[database update] update response", r)
    } catch(e) {
      if(e.type == "MongoInvalidArgumentError") {
        d("[database update replaceOne] tries replaceOne")
        await this.coll().replaceOne(query, data, {
          upsert: true,
        });
      }
    }
    const ret = await this.find(query);
    d("[database update] returns", ret);
    return ret;
  }

  async remove(query: any) {
    d("[database remove] gets", query);
    await this.coll().deleteMany(query);
  }

  async count(query: any) {
    d("[database count] gets", query);
    const ret = await this.coll().count(query);
    d("[database count] returns", ret);
    return ret;
  }
}

export interface ICounters {
  _id: string;
  seq: number;
}

export const counters = new DBO<ICounters>(`${config.server?.counters}`);
export const bboard = new DBO<IBoard>(`${config.server?.bboard}`);
export const dbojs = new DBO<IDBOBJ>(`${config.server?.db}`);
export const chans = new DBO<IChannel>(`${config.server?.chans}`);
export const mail = new DBO<IMail>(`${config.server?.mail}`);
export const wiki = new DBO<IArticle>(`${config.server?.wiki}`);
