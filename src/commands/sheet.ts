import { format } from "path";
import { Obj, addCmd, allStats, flags, send } from "../services";
import { divider, formatStat, header, moniker, target } from "../utils";
import { getStat } from "../utils/getStats";

const bio = (obj: Obj) => {
  const splat = getStat(obj.dbobj, "splat");

  const bioList =
    allStats
      .filter(
        (stat) =>
          stat.type === "bio" && (!stat.category || stat.category === splat)
      )
      .map((stat) =>
        formatStat(stat.name, getStat(obj.dbobj, stat.name), 28, true)
      ) || [];

  let output = "";
  for (let i = 0; i < bioList.length; i++) {
    if (i % 2 === 0) {
      output += "%r%b";
    }
    output += bioList[i] + "  ";
  }

  return output + "%r";
};

const attributes = (obj: Obj) => {
  const physical = [
    formatStat("strength", getStat(obj.dbobj, "strength")),
    formatStat("dexterity", getStat(obj.dbobj, "dexterity")),
    formatStat("stamina", getStat(obj.dbobj, "stamina")),
  ];

  const social = [
    formatStat("charisma", getStat(obj.dbobj, "charisma")),
    formatStat("manipulation", getStat(obj.dbobj, "manipulation")),
    formatStat("composure", getStat(obj.dbobj, "composure")),
  ];

  const mental = [
    formatStat("intelligence", getStat(obj.dbobj, "intelligence")),
    formatStat("wits", getStat(obj.dbobj, "wits")),
    formatStat("resolve", getStat(obj.dbobj, "resolve")),
  ];

  let output = divider("Attributes");

  for (let i = 0; i < 3; i++) {
    output += ` ${physical[i]}  ${social[i]}  ${mental[i]}\n`;
  }

  return output;
};

const skills = (obj: Obj) => {
  const physical = allStats.filter(
    (stat) => stat.type === "skill" && stat.category === "physical"
  );

  const totalPhysical = [];

  for (const stat of physical) {
    totalPhysical.push(formatStat(stat.name, getStat(obj.dbobj, stat.name)));

    obj.data?.stats?.filter((s) => s.type === stat.name);
    for (const s of obj.data?.stats?.filter((s) => s.type === stat.name) ||
      []) {
      totalPhysical.push(
        "   " + formatStat(s.name, getStat(obj.dbobj, s.name), 21)
      );
    }
  }

  const social = allStats.filter(
    (stat) => stat.type === "skill" && stat.category === "social"
  );

  const totalSocial = [];

  for (const stat of social) {
    totalSocial.push(formatStat(stat.name, getStat(obj.dbobj, stat.name)));

    obj.data?.stats
      ?.filter((s) => s.type === stat.name)
      .forEach((s) => {
        totalSocial.push(formatStat(s.name, getStat(obj.dbobj, s.name)));
      });
  }

  const mental = allStats.filter(
    (stat) => stat.type === "skill" && stat.category === "mental"
  );

  const totalMental = [];

  for (const stat of mental) {
    totalMental.push(formatStat(stat.name, getStat(obj.dbobj, stat.name)));

    obj.data?.stats
      ?.filter((s) => s.type === stat.name)
      .forEach((s) => {
        totalMental.push(formatStat(s.name, getStat(obj.dbobj, s.name)));
      });
  }

  const total = Math.max(
    totalPhysical.length,
    totalSocial.length,
    totalMental.length
  );

  // fill the left over space with empty strings.
  totalPhysical.push(
    ...Array(total - totalPhysical.length).fill("                      ")
  );
  totalMental.push(
    ...Array(total - totalMental.length).fill("                      ")
  );
  totalSocial.push(
    ...Array(total - totalSocial.length).fill("                      ")
  );

  let output = divider("Skills");
  for (let i = 0; i < total; i++) {
    output += ` ${totalPhysical[i] || ""}  ${totalSocial[i] || ""}  ${
      totalMental[i] || ""
    }\n`;
  }

  return output;
};

export default () => {
  addCmd({
    name: "sheet",
    pattern: /^[@\+]?sheet(?:\s+(.*))?$/i,
    lock: "connected",
    exec: async (ctx, [tar]) => {
      let tarObj;

      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      // handle target.
      if (tar) {
        tarObj = await Obj.get((await target(en.dbobj, tar))?.id);
      } else {
        tarObj = en;
      }

      if (!tarObj)
        return send([ctx.socket.id], "%chGame>%cn Target not found.");
      let output = header(` Sheet for: %ch${moniker(tarObj.dbobj)}%cn `);
      output += bio(tarObj);
      output += attributes(tarObj);
      output += skills(tarObj);
      send([ctx.socket.id], output);
    },
  });
};
