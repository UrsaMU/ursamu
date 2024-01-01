import { get } from "../../deps.ts";
import { IDBOBJ } from "../@types/index.ts";
import { addCmd, allStats, getStat, Obj, send } from "../services/index.ts";
import {
  center,
  divider,
  footer,
  formatStat,
  header,
  moniker,
  target,
} from "../utils/index.ts";

const bio = async (obj: Obj) => {
  const splat = await getStat(obj.dbobj, "splat");

  let bioList = allStats
    .filter(
      (stat) =>
        stat.type === "bio" && (!stat.splat || stat.splat.includes(splat)),
    )
    .map(async (stat) =>
      formatStat(stat.name, await getStat(obj.dbobj, stat.name), 28, true)
    ) || [];

  const bio = await Promise.all(bioList);

  let output = "";
  for (let i = 0; i < bio.length; i++) {
    if (i % 2 === 0) {
      output += "%r%b";
    }
    output += bio[i] + "  ";
  }

  return output + "%r";
};

const attributes = async (obj: Obj) => {
  const physical = [
    center("Physical", 24, " "),
    formatStat("strength", await getStat(obj.dbobj, "strength")),
    formatStat("dexterity", await getStat(obj.dbobj, "dexterity")),
    formatStat("stamina", await getStat(obj.dbobj, "stamina")),
  ];

  const social = [
    center("Social", 24, " "),

    formatStat("charisma", await getStat(obj.dbobj, "charisma")),
    formatStat("manipulation", await getStat(obj.dbobj, "manipulation")),
    formatStat("composure", await getStat(obj.dbobj, "composure")),
  ];

  const mental = [
    center("Mental", 24, " "),
    formatStat("intelligence", await getStat(obj.dbobj, "intelligence")),
    formatStat("wits", await getStat(obj.dbobj, "wits")),
    formatStat("resolve", await getStat(obj.dbobj, "resolve")),
  ];

  let output = divider("Attributes") + "%r";

  for (let i = 0; i < 4; i++) {
    output += ` ${physical[i]}  ${social[i]}  ${mental[i]}\n`;
  }

  return output;
};

const skills = async (obj: Obj) => {
  const physical = allStats.filter(
    (stat) => stat.type === "skill" && stat.category === "physical",
  );

  const totalPhysical = [];

  for (const stat of physical) {
    totalPhysical.push(
      formatStat(stat.name, await getStat(obj.dbobj, stat.name)),
    );

    obj.data?.stats?.filter((s) => s.type === stat.name);
    for (
      const s of obj.data?.stats?.filter((s) => s.type === stat.name) ||
        []
    ) {
      totalPhysical.push(
        "   " + formatStat(s.name, await getStat(obj.dbobj, s.name), 21),
      );
    }
  }

  const social = allStats.filter(
    (stat) => stat.type === "skill" && stat.category === "social",
  );

  const totalSocial = [];

  for (const stat of social) {
    totalSocial.push(
      formatStat(stat.name, await getStat(obj.dbobj, stat.name)),
    );

    obj.data?.stats
      ?.filter((s) => s.type === stat.name)
      .forEach(async (s) => {
        totalSocial.push(formatStat(s.name, await getStat(obj.dbobj, s.name)));
      });
  }

  const mental = allStats.filter(
    (stat) => stat.type === "skill" && stat.category === "mental",
  );

  const totalMental = [];

  for (const stat of mental) {
    totalMental.push(
      formatStat(stat.name, await getStat(obj.dbobj, stat.name)),
    );

    obj.data?.stats
      ?.filter((s) => s.type === stat.name)
      .forEach(async (s) => {
        totalMental.push(formatStat(s.name, await getStat(obj.dbobj, s.name)));
      });
  }

  const total = Math.max(
    totalPhysical.length,
    totalSocial.length,
    totalMental.length,
  );

  // fill the left over space with empty strings.
  totalPhysical.push(
    ...Array(total - totalPhysical.length).fill("                      "),
  );
  totalMental.push(
    ...Array(total - totalMental.length).fill("                      "),
  );
  totalSocial.push(
    ...Array(total - totalSocial.length).fill("                      "),
  );

  let output = divider("Skills") + "%r";
  for (let i = 0; i < total; i++) {
    output += ` ${totalPhysical[i] || ""}  ${totalSocial[i] || ""}  ${
      totalMental[i] || ""
    }\n`;
  }

  return output;
};

/*sheet
 ===========================[  Sheet for: Kumakun  ]===========================
 Full Name:                             Concept:
 Birth Date:                            Splat:
 Ambition:                              Desire:
--------------------------------- Attributes ---------------------------------
         Physical                   Social                    Mental
 Strength...............1  Charisma...............1  Intelligence...........1
 Dexterity..............1  Manipulation...........1  Wits...................1
 Stamina................1  Composure..............1  Resolve................1
----------------------------------- Skills -----------------------------------
 Athletics..............0  Animal Ken.............0  Academics..............0
 Brawl..................0  Etiquette..............0  Awareness..............0
 Craft..................0  Insight................0  Finance................0
 Driving................0  Intimidation...........0  Investigation..........0
 Firearms...............0  Leadership.............0  Medicine...............0
 Larceny................0  Performance............0  Occult.................0
 Melee..................0  Persuasion.............0  Politics...............0
 Stealth................0  Streetwise.............0  Science................0
 Survival...............0  Subterfuge.............0  Technology.............0
 */
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

      if (!tarObj) {
        return send([ctx.socket.id], "%chGame>%cn Target not found.");
      }
      let output = header(` Sheet for: %ch${moniker(tarObj.dbobj)}%cn `);
      output += await bio(tarObj);
      output += await attributes(tarObj);
      output += await skills(tarObj);
      output += footer();

      if (await getStat(tarObj.dbobj, "splat")) {
        send([ctx.socket.id], output);
      } else {
        if (tarObj.dbref === en.dbref) {
          send(
            [ctx.socket.id],
            "%chGame>%cn You have no splat set. See: %ch+help splat%cn",
          );
        } else {
          send([ctx.socket.id], "%chGame>%cn That character has no splat set.");
        }
      }
    },
  });
};
