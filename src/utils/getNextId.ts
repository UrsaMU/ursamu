import { counters } from "../services/Database/index.ts";

export async function getNextId(name: string) {
  const ret = await counters.modify({ _id: name }, "$inc", { seq: 1 });

  if (ret.length) {
    return ret[0].seq;
  } else {
    throw new Error("No ID generated.");
  }
}
