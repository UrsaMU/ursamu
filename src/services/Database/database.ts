import Datastore from "nedb-promises";
import { IDBOBJ } from "../../@types/IDBObj";
import config from "../../ursamu.config";

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
    return await this.db.update<T>(query, data, { upsert: true });
  }

  async remove(query: any) {
    return await this.db.remove(query, { multi: true });
  }

  async count(query: any) {
    return await this.db.count(query);
  }
}

export const dbojs = new DBO<IDBOBJ>(config.server.db);
