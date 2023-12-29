import { bboard, DBO, dbojs } from "../index.ts";

function findMissingNumbers(numbers: number[]): number[] {
  const sortedNumbers = numbers.slice().sort((a, b) => a - b);
  const missingNumbers = [];

  for (let i = 0, j = 0; i <= sortedNumbers[sortedNumbers.length - 1]; i++) {
    if (i !== sortedNumbers[j]) {
      missingNumbers.push(i);
    } else {
      j++;
    }
  }

  return missingNumbers;
}

interface IdbMap {
  [key: string]: DBO<any>;
}

const dbMap: IdbMap = {
  "boards": bboard,
  "dbobjs": dbojs,
};

export const getNextId = async (counterName: string) => {
  const db = dbMap[counterName] || dbojs;
  const numbers = (await db.all()).map((item: any) => item.id);
  const missingNumbers = findMissingNumbers(numbers);

  return missingNumbers.length ? missingNumbers[0] : numbers.length;
};
