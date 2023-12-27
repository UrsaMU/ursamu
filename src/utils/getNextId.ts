import { IBoard } from "../@types/Boards.ts";
import { IChannel } from "../@types/Channels.ts";
import { IDBOBJ } from "../@types/IDBObj.ts";
import { IMail } from "../@types/IMail.ts";
import { IArticle } from "../@types/IWiki.ts";
import {
  bboard,
  chans,
  counters,
  DBO,
  dbojs,
  mail,
  wiki,
} from "../services/Database/index.ts";

// export async function getNextId(name: string) {
//   const ret = await counters.modify({ _id: name }, "$inc", { seq: 1 });

//   if (ret.length) {
//     return ret[0].seq;
//   } else {
//     throw new Error("No ID generated.");
//   }
// }

function findMissingNumbers(arr: number[]) {
  const missing: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (arr[i + 1] - arr[i] > 1) {
      missing.push(arr[i] + 1);
    }
  }
  return missing;
}

async function handleBoards() {}
async function handleChannels() {}
async function handleMail() {}
async function handleWiki() {}

async function handleDBOBJs() {
}

export async function getNextId(name: string) {
  let db: DBO<IBoard | IDBOBJ | IChannel | IMail | IArticle | undefined>;
  switch (name) {
    case "boards":
      db = bboard;
      break;
    case "channels":
      db = chans;
      break;
    case "mail":
      db = mail;
      break;
    case "wiki":
      db = wiki;
      break;
    default:
      db = dbojs;
  }

  const numbers = (await db.all()).map((x: any) => x.id);
  const missing = findMissingNumbers(numbers);
  if (missing.length) {
    return missing[0];
  } else {
    return numbers.length + 1;
  }
}
