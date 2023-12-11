import { counters, dbojs } from "../services/Database";

function findMissingNumbers(arr: number[]): number[] {
  const missingNumbers: number[] = [];
  const maxNumber = Math.max(...arr);
  const minNumber = Math.min(...arr);

  for (let i = minNumber; i <= maxNumber; i++) {
    if (!arr.includes(i)) {
      missingNumbers.push(i);
    }
  }

  return missingNumbers;
}

export async function getNextId() {
  const ids = (await dbojs.db.find({}, { id: 1 })).map((x) => x.id);
  if (!ids.length) ids.push(0);
  const missing = findMissingNumbers(ids);
  if (missing.length) return missing[0];
  return Math.max(...ids) + 1 || 1;
}
