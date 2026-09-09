// db/eqTemplateDb.ts -- Typed DBO wrapper for wod20th.eqtemplates collection.
//
// A template is a named snapshot of an item's reusable equipment definition
// (static eq fields + display name/desc + verb attrs). Staff capture items
// with @eq/copy and reapply them to new objects with @eq/give, so a single
// well-built weapon can be duplicated onto many instances without rebuilding
// the metadata each time.

import { DBO } from "@ursamu/ursamu";
import type { IEqTemplatePayload } from "../core/eq.ts";

export interface IEqTemplate {
  id: string;
  /** Display name. Unique-ish (case-insensitive); enforced at save time. */
  name: string;
  /** The captured equipment definition. */
  payload: IEqTemplatePayload;
  createdAt: number;
  updatedAt: number;
}

const db = new DBO<IEqTemplate>("wod20th.eqTemplates");

export async function createEqTemplate(name: string, payload: IEqTemplatePayload): Promise<IEqTemplate> {
  const now = Date.now();
  const rec: IEqTemplate = {
    id: crypto.randomUUID(),
    name,
    payload,
    createdAt: now,
    updatedAt: now,
  };
  await db.create(rec);
  return rec;
}

export async function findEqTemplateById(id: string): Promise<IEqTemplate | null> {
  const r = await db.find({ id });
  return r[0] ?? null;
}

export async function findEqTemplateByName(name: string): Promise<IEqTemplate | null> {
  const all = await db.find({});
  const lower = name.toLowerCase().trim();
  return all.find((t) => t.name.toLowerCase() === lower) ?? null;
}

export async function findAllEqTemplates(): Promise<IEqTemplate[]> {
  const all = await db.find({});
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveEqTemplate(tpl: IEqTemplate): Promise<void> {
  tpl.updatedAt = Date.now();
  await db.modify({ id: tpl.id }, "$set", {
    name: tpl.name,
    payload: tpl.payload,
    updatedAt: tpl.updatedAt,
  } as Partial<IEqTemplate>);
}

export async function deleteEqTemplate(id: string): Promise<void> {
  await db.delete({ id });
}