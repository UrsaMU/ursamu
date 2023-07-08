import Datastore from "nedb-promises";
import { IDBOBJ } from "../../@types/IDBObj";
import config from "../../ursamu.config";
import { IChannel } from "../../@types/Channels";

export class DBO<T> {
  db: Datastore<T>;

  constructor(path: string) {
    this.db = Datastore.create(path);
  }

  async insert(data: T) {
    return await this.db.insert(data);
  }

  async find(query?: any) {
    return await this.db.find<T>(query);
  }

  async findAll() {
    return await this.db.find<T>({});
  }

  async findOne(query: any) {
    return await this.db.findOne<T>(query);
  }

  async update(query: any, data: any) {
    return await this.db.update<T>(query, data, {
      upsert: true,
      returnUpdatedDocs: true,
    });
  }

  async remove(query: any) {
    return await this.db.remove(query, { multi: true });
  }

  async count(query: any) {
    return await this.db.count(query);
  }
}

export interface ICounters {
  _id: string;
  seq: number;
}

export const counters = new DBO<ICounters>(config.server.counters);

export const dbojs = new DBO<IDBOBJ>(config.server.db);
export const chans = new DBO<IChannel>(config.server.chans);
