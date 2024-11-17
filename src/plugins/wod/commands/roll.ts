import { isNumber } from "lodash";
import { addCmd, Obj, send } from "../../../services";
import { moniker } from "../../../utils";
import { getStat, statObj } from "../services";
import { roll } from "../services/dice";

export default () => {
  addCmd({
    name: "roll",
    pattern: /^[\+@]?roll\s+(.*)/i,
    lock: "connected",
    category: "rp",
    exec: async (ctx, [input]) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      const pool = input
        .replace(/\s+/g, " ")
        .replace(" + ", " +")
        .replace(" - ", " -")
        .split(" ")
        .map((item: string) => {
          if (item.includes("+") || item.includes("-")) {
            const [, sign, stat] = item.split(/(\+|\-)/);
            const statO = statObj(stat);

            if (!statO || stat == "") return `${sign} ${stat}`;
            return `${sign} ${statO.name}`;
          } else {
            const stat = statObj(item);
            if (!stat) return item;
            return stat.name;
          }
        })
        .join(" ")
        .replace(/\s+/g, " ");

      const poolNum = pool
        .replace(/\s\+\s/g, " +")
        .replace(/\s\-\s/g, " -")
        .split(" ")
        .map(async (item: string) => {
          if (!item.includes("+") && !item.includes("-")) {
            const stat = await getStat(en, item);
            if (stat) return getStat(en, item);
            if (!isNaN(+item)) return item;
            return 0;
          }

          const [, sign, stat] = item.split(/(\+|\-)/);
          const statVal = await getStat(en, stat);
          if (statVal) return `${sign}${statVal}`;
          if (!isNaN(+stat)) return `${sign}${stat}`;
          return 0;
        });

      const pools = (await Promise.all(poolNum))
        .map((item: string) => +item)
        .reduce((a: number, b: number) => a + b);

      let critical = false;
      const dice = roll(pools);
      const diceColor = dice
        .sort((a, b) => a - b)
        .map((d) => {
          if (d === 1) return `%ch%cr${d}%cn`;
          if (d > 1 && d < 6) return `%ch%cy${d}%cn`;
          if (d >= 6) return `%ch%cg${d}%cn`;
          return `%ch%cw${d}%cn`;
        });
      const tens = dice.filter((d) => d === 10).length;
      let successes = dice.filter((d) => d >= 6).length;
      if (tens >= 2 && tens % 2 === 0) {
        successes += 2 * (tens / 2);
        critical = true;
      }

      const succsessesColor = successes > 0
        ? `%ch%cg${successes}%cn`
        : `%ch%cy${successes}%cn`;

      let output = `%ch%cyROLL>%cn ${
        moniker(
          en,
        )
      } rolls ${pool} -> ${succsessesColor} success(es) (${
        diceColor.join(
          " ",
        )
      })`;

      await send([`#${en.location}`], output);
    },
  });
};
