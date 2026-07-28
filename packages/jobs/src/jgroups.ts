/**
 * Named player lists (Anomaly jgroups).
 */
import { DBO } from "@ursamu/mush";

export interface IJobGroup {
  id: string;
  name: string;
  memberIds: string[];
  ownerId: string;
}

export const jobGroups = new DBO<IJobGroup>("server.jobs_jgroups");

export function slugGroup(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "group";
}

export async function expandJobGroup(
  nameOrId: string,
): Promise<string[]> {
  const id = slugGroup(nameOrId.replace(/^@/, ""));
  const g = await jobGroups.queryOne({ id }) ??
    await jobGroups.queryOne({ name: nameOrId });
  return g?.memberIds ?? [];
}

export async function listGroups(): Promise<IJobGroup[]> {
  return await jobGroups.query({});
}

export async function createGroup(
  name: string,
  ownerId: string,
): Promise<IJobGroup> {
  const id = slugGroup(name);
  const existing = await jobGroups.queryOne({ id });
  if (existing) throw new Error("group exists");
  const g: IJobGroup = {
    id,
    name: name.trim(),
    memberIds: [],
    ownerId,
  };
  await jobGroups.create(g);
  return g;
}

export async function addMember(
  name: string,
  playerId: string,
): Promise<void> {
  const id = slugGroup(name);
  const g = await jobGroups.queryOne({ id });
  if (!g) throw new Error("no such group");
  if (!g.memberIds.includes(playerId)) {
    g.memberIds.push(playerId);
    await jobGroups.update({ id }, g);
  }
}

export async function delMember(
  name: string,
  playerId: string,
): Promise<void> {
  const id = slugGroup(name);
  const g = await jobGroups.queryOne({ id });
  if (!g) throw new Error("no such group");
  g.memberIds = g.memberIds.filter((m) => m !== playerId);
  await jobGroups.update({ id }, g);
}

export async function destroyGroup(name: string): Promise<void> {
  const id = slugGroup(name);
  await jobGroups.delete({ id });
}
