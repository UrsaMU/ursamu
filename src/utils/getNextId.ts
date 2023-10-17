import { counters } from "../services/Database";

export async function getNextId(name: string) {
  await counters.update({ _id: name }, { $inc: { seq: 1 } });
  const ret = await counters.findOne({ _id: name });

  if (ret) {
    return ret.seq;
  } else {
    throw new Error("No ID generated.");
  }
}
