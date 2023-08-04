import { Obj, addCmd, allStats, send } from "../services";
import {
  center,
  divider,
  footer,
  formatStat,
  header,
  moniker,
  target,
} from "../utils";
import { getStat, getTempStat } from "../services/characters/getStats";
import { repeat } from "lodash";

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
    center("Physical", 24, " "),
    formatStat("strength", getStat(obj.dbobj, "strength")),
    formatStat("dexterity", getStat(obj.dbobj, "dexterity")),
    formatStat("stamina", getStat(obj.dbobj, "stamina")),
  ];

  const social = [
    center("Social", 24, " "),

    formatStat("charisma", getStat(obj.dbobj, "charisma")),
    formatStat("manipulation", getStat(obj.dbobj, "manipulation")),
    formatStat("composure", getStat(obj.dbobj, "composure")),
  ];

  const mental = [
    center("Mental", 24, " "),
    formatStat("intelligence", getStat(obj.dbobj, "intelligence")),
    formatStat("wits", getStat(obj.dbobj, "wits")),
    formatStat("resolve", getStat(obj.dbobj, "resolve")),
  ];

  let output = divider("Attributes") + "%r";

  for (let i = 0; i < 4; i++) {
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

  let output = divider("Skills") + "%r";
  for (let i = 0; i < total; i++) {
    output += ` ${totalPhysical[i] || ""}  ${totalSocial[i] || ""}  ${
      totalMental[i] || ""
    }\n`;
  }

  return output;
};

const advantages = (obj: Obj) => {
  let output = `${divider("Backgrounds", "%cr-%cn", 26)}${divider(
    "Merits",
    "%cr-%cn",
    26
  )}${divider("Flaws", "%cr-%cn", 26)}\n`;

  const backgrounds =
    obj.data?.stats
      ?.filter((s) => s.type === "background")
      .map((s) => formatStat(s.name, getStat(obj.dbobj, s.name))) || [];

  const merits =
    obj.data?.stats
      ?.filter((s) => s.type === "merit")
      .map((s) => formatStat(s.name, getStat(obj.dbobj, s.name))) || [];
  const flaws =
    obj.data?.stats
      ?.filter((s) => s.type === "flaw")
      .map((s) => formatStat(s.name, getStat(obj.dbobj, s.name))) || [];

  const max = Math.max(backgrounds.length, merits.length, flaws.length);
  const totalBackgrounds = [];
  const totalMerits = [];
  const totalFlaws = [];

  totalBackgrounds.push(
    ...backgrounds,
    ...Array(max - backgrounds.length).fill(" ".repeat(24))
  );
  totalMerits.push(
    ...merits,
    ...Array(max - merits.length).fill(" ".repeat(24))
  );
  totalFlaws.push(...flaws, ...Array(max - flaws.length).fill(" ".repeat(24)));

  for (let i = 0; i < max; i++) {
    output += ` ${totalBackgrounds[i]}  ${totalMerits[i]}  ${totalFlaws[i]}\n`;
  }
  if (max) {
    return output;
  }

  return "";
};

const disciplines = (obj: Obj) => {
  const splat = getStat(obj.dbobj, "splat");

  const totalDisciplines: any[] = [];

  const disciplines =
    obj.data?.stats
      ?.filter((s) => s.type === "discipline")
      .sort((a, b) => a.name.localeCompare(b.name)) || [];

  // split the disciplines into two columns. using a columns array.

  const columns: any[][] = [[], []];
  for (let i = 0; i < disciplines.length; i++) {
    columns[i % 2].push(disciplines[i]);
  }

  columns[0] = columns[0].sort((a, b) => a.name.localeCompare(b.name));
  columns[1] = columns[1].sort((a, b) => a.name.localeCompare(b.name));

  for (const col of columns) {
    const colDisciplines = [];
    for (const stat of col) {
      colDisciplines.push(
        formatStat(stat.name, getStat(obj.dbobj, stat.name), 37)
      );

      for (const s of obj.data?.stats
        ?.filter((s) => s.type === stat.name)
        .sort((a, b) => a.value - b.value) || []) {
        colDisciplines.push(
          "   " + formatStat(s.name, getStat(obj.dbobj, s.name), 34)
        );
      }

      colDisciplines.push(" ".repeat(37));
    }
    totalDisciplines.push(colDisciplines);
  }

  let output = divider("Disciplines") + "%r ";
  const max = Math.max(totalDisciplines[0].length, totalDisciplines[1].length);
  totalDisciplines[0].push(
    ...Array(max - totalDisciplines[0].length).fill(" ".repeat(37))
  );
  totalDisciplines[1].push(
    ...Array(max - totalDisciplines[1].length).fill(" ".repeat(37))
  );

  output += totalDisciplines[0]
    .map((d: any, i: number) => ` ${d}  ${totalDisciplines[1][i]}`)
    .join("\n")
    .trim();

  if (!max) return "";
  return output + "%r";
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
      output += advantages(tarObj);
      output += disciplines(tarObj);
      output += footer();
      send([ctx.socket.id], output);
    },
  });
};
