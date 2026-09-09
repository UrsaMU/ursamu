// db/domainDb.ts -- City / domain claims (Prince, Primogen, etc.).

import { DBO } from "@ursamu/mush";

export type DomainOffice =
  | "prince"
  | "primogen"
  | "sheriff"
  | "seneschal"
  | "keeper"
  | "harpy"
  | "bishop"
  | "archbishop"
  | "other";

export interface IDomainOfficeHolder {
  office: DomainOffice | string;
  charId: string;
  label?: string;
}

export interface IDomain {
  id: string;
  name: string;
  /** camarilla | sabbat | anarch | independent | contested */
  sect: string;
  /** Room id or free-form area description. */
  area: string;
  /** charId of ranking authority (Prince/Bishop/etc.). */
  ruler: string;
  offices: IDomainOfficeHolder[];
  notes: string;
  createdAt: number;
  updatedAt: number;
}

const db = new DBO<IDomain>("wod20th.domains");

export async function createDomain(
  name: string,
  ruler: string,
  sect = "camarilla",
): Promise<IDomain> {
  const now = Date.now();
  const rec: IDomain = {
    id: crypto.randomUUID(),
    name,
    sect,
    area: "",
    ruler,
    offices: ruler
      ? [{ office: "prince", charId: ruler }]
      : [],
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
  await db.create(rec);
  return rec;
}

export async function findDomainById(id: string): Promise<IDomain | null> {
  const r = await db.find({ id });
  return r[0] ?? null;
}

export async function findDomainByName(name: string): Promise<IDomain | null> {
  const all = await db.find({});
  const lower = name.toLowerCase().trim();
  return all.find((d) => d.name.toLowerCase() === lower) ?? null;
}

export async function findAllDomains(): Promise<IDomain[]> {
  return (await db.find({})).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveDomain(d: IDomain): Promise<void> {
  d.updatedAt = Date.now();
  await db.modify({ id: d.id }, "$set", {
    name: d.name,
    sect: d.sect,
    area: d.area,
    ruler: d.ruler,
    offices: d.offices,
    notes: d.notes,
    updatedAt: d.updatedAt,
  } as Partial<IDomain>);
}

export async function deleteDomain(id: string): Promise<void> {
  await db.delete({ id });
}
