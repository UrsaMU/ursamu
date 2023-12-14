import { MongoClient } from "../../../deps.ts";
import { IDBOBJ } from "../../@types/IDBObj.ts";
import config from "../../ursamu.config.ts";
import { IChannel } from "../../@types/Channels.ts";
import { IMail } from "../../@types/IMail.ts";
import { IArticle, IBoard } from "../../@types/index.ts";

function d(...args) {
  const e = new Error();
  const level = e.stack.split("\n")[3];
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
    await this.coll().insertOne(data);
    const ret = this.find(data);
    d("[database insert]", data, ret);
    return ret;
  }

  async find(query?: any) {
    const ret = await (await this.coll().find(query)).toArray();
    d("[database find]", query, ret);
    return ret;
  }

  async findAll() {
    const ret = await (await this.coll().find({})).toArray();
    d("[database findAll]", ret);
    return ret;
  }

  async findOne(query: any) {
    const ret = await this.coll().findOne(query);
    d("[database findOne]", query, ret);
    return ret;
}

  async update(query: any, data: any) {
    try {
      d("[database update]", query, data)
      await this.coll().update(query, data, {
        upsert: true,
      });
    } catch(e) {
      if(e.type == "MongoInvalidArgumentError") {
        d("[database update replaceOne]", query, data)
        await this.coll().replaceOne(query, data, {
          upsert: true,
        });
      }
    }
    const ret = this.find(query);
    d("[database update]", ret);
    return ret;
  }

  async remove(query: any) {
    await this.coll().deleteMany(query);
    d("[database remove]", query);
  }

  async count(query: any) {
    const ret = await this.coll().count(query);
    d("[database count]", query, ret);
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
