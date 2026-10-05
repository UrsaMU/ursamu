import { DBO } from "@ursamu/mush";
import { defaultChar } from "./char.ts";
import { CITY_ID, defaultCity } from "./city.ts";
import type { IChar, ICity, ISphereNpc } from "./types.ts";

export interface IUtopiaStore {
  loadCity(): Promise<ICity>;
  saveCity(city: ICity): Promise<void>;
  loadChar(
    id: string,
    name: string,
    location: string,
  ): Promise<IChar>;
  saveChar(ch: IChar): Promise<void>;
  listCrew(location: string): Promise<IChar[]>;
  listSphere(playerId: string): Promise<ISphereNpc[]>;
  saveNpc(n: ISphereNpc): Promise<void>;
}

const cities = new DBO<ICity>("utopia.cities");
const chars = new DBO<IChar>("utopia.chars");
const spheres = new DBO<ISphereNpc>("utopia.spheres");

function withSheet(ch: IChar): IChar {
  return {
    ...ch,
    playerId: ch.playerId ?? ch.id,
    status: ch.status ?? "approved",
    system: ch.system ?? "utopia",
    data: {
      danger: ch.danger,
      resources: ch.resources,
      bravado: ch.bravado,
      plan: ch.plan,
      lockedDv: ch.lockedDv,
      lifestyle: ch.lifestyle,
    },
  };
}

export const dboStore: IUtopiaStore = {
  async loadCity() {
    const row = await cities.findOne({ id: CITY_ID });
    if (row) return row;
    const city = defaultCity();
    await cities.create(city);
    return city;
  },
  async saveCity(city) {
    const row = await cities.findOne({ id: city.id });
    if (row) await cities.update({ id: city.id }, city);
    else await cities.create(city);
  },
  async loadChar(id, name, location) {
    const row = await chars.findOne({ id });
    if (row) return { ...row, name, location };
    const ch = defaultChar(id, name, location);
    await chars.create(ch);
    return ch;
  },
  async saveChar(ch) {
    const sheet = withSheet(ch);
    const row = await chars.findOne({ id: ch.id });
    if (row) await chars.update({ id: ch.id }, sheet);
    else await chars.create(sheet);
  },
  async listCrew(location) {
    const all = await chars.find({ location });
    return all;
  },
  async listSphere(playerId) {
    return await spheres.find({ playerId });
  },
  async saveNpc(n) {
    const row = await spheres.findOne({ id: n.id });
    if (row) await spheres.update({ id: n.id }, n);
    else await spheres.create(n);
  },
};

export function memoryStore(): IUtopiaStore {
  let city: ICity | null = null;
  const people = new Map<string, IChar>();
  const npcs: ISphereNpc[] = [];
  return {
    async loadCity() {
      if (!city) city = defaultCity();
      return city;
    },
    async saveCity(next) {
      city = next;
    },
    async loadChar(id, name, location) {
      const row = people.get(id);
      if (row) return { ...row, name, location };
      const ch = defaultChar(id, name, location);
      people.set(id, ch);
      return ch;
    },
    async saveChar(ch) {
      people.set(ch.id, withSheet(ch));
    },
    async listCrew(location) {
      return [...people.values()].filter((c) =>
        c.location === location
      );
    },
    async listSphere(playerId) {
      return npcs.filter((n) => n.playerId === playerId);
    },
    async saveNpc(n) {
      const i = npcs.findIndex((x) => x.id === n.id);
      if (i >= 0) npcs[i] = n;
      else npcs.push(n);
    },
  };
}
