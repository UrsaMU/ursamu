import { counters, ICounters } from "../services/Database/index.ts";

export async function getNextId(name: string) {
  const counter = await counters.queryOne({ id: name });
  if (!counter) {
    const newCounter = { id: name, seq: 1 } as ICounters;
    await counters.create(newCounter);
    return "1";
  }
  counter.seq += 1;
  await counters.modify({ id: name }, "$set", counter);
  return counter.seq.toString();
}
