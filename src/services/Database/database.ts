import { MongoClient } from "../../../deps.ts";
import { IDBOBJ } from "../../@types/IDBObj.ts";
import config from "../../ursamu.config.ts";
import { IChannel } from "../../@types/Channels.ts";
import { IMail } from "../../@types/IMail.ts";
import { IArticle, IBoard } from "../../@types/index.ts";

export class DBO<T> {
  db: any;

  constructor(path: string) {
    this.collection = path.replace('.','_');
    const uri = `mongodb://root:root@mongo/`;
    this.client = new MongoClient(uri);
    this.client.connect();
    this.db = this.client.db()
  }

  coll() {
    return this.client.db().collection(this.space)
  }

  async insert(data: T) {
    return await this.coll().insert(data);
  }

  async find(query?: any) {
    return await this.coll().find(query);
  }

  async findAll() {
    return await this.coll().find({});
  }

  async findOne(query: any) {
    return await this.coll().findOne(query);
  }

  async update(query: any, data: any) {
    await this.coll().updateOne(query, data, {
      upsert: true,
    });
    return this.find(query);
  }

  async remove(query: any) {
    return await this.coll().deleteMany(query);
  }

  async count(query: any) {
    return await this.coll().count(query);
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
