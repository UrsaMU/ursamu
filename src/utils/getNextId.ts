import { counters } from "../services/Database/index.ts";

export async function getNextId(name: string): Promise<string> {
  return (await counters.atomicIncrement(name)).toString();
}
