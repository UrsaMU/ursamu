import { MongoClient } from "../../../deps.ts";
import { IDBOBJ } from "../../@types/IDBObj.ts";
import config from "../../ursamu.config.ts";
import { IChannel } from "../../@types/Channels.ts";
import { IMail } from "../../@types/IMail.ts";
import { IArticle, IBoard } from "../../@types/index.ts";

export class DBO<T> {
  db: any;

  constructor(path: string) {
    this.space = path;
    const uri = `mongodb://root:root@mongo/`;
    this.client = new MongoClient(uri);
    this.client.connect();
  }

  async insert(data: T) {
    return await this.client.db(this.space).insert(data);
  }

  async find(query?: any) {
    return await this.client.db(this.space).find(query);
  }

  async findAll() {
    return await this.client.db(this.space).find({});
  }

  async findOne(query: any) {
    return await this.client.db(this.space).findOne(query);
  }

  async update(query: any, data: any) {
    await this.client.db(this.space).updateOne(query, data, {
      upsert: true,
    });
    return this.find(query);
  }

  async remove(query: any) {
    return await this.client.db(this.space).deleteMany(query);
  }

  async count(query: any) {
    return await this.client.db(this.space).count(query);
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
