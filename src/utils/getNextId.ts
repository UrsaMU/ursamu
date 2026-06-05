import { counters } from "@ursamu/mush";

/** Atomically increment and return the next object ID for the given counter. */
export async function getNextId(name: string): Promise<string> {
  return (await counters.atomicIncrement(name)).toString();
}
