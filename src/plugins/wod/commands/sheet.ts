import { get } from "lodash";
import { IDBOBJ } from "../../../@types";
import { addCmd, Obj, send } from "../../../services";
import { allStats, getStat } from "../services";
import {
  center,
  divider,
  footer,
  formatStat,
  header,
  moniker,
  repeatString,
  target,
} from "../../../utils";

const bio = async (obj: Obj) => {
  const template = await getStat(obj.dbobj, "template");

  let bioList = allStats
    .filter(
      (stat) =>
        stat.type === "bio" && (!stat.template || stat.template.includes(template)),
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

const advantages = (obj: Obj) => {
  let output = `${divider("Backgrounds", "%cr-%cn", 26)}${
    divider(
      "Advantages",
      "%cr-%cn",
      26,
    )
  }${divider("Flaws", "%cr-%cn", 26)}\n`;

  const backgrounds = obj.data?.stats
    ?.filter((s) => s.type === "background")
    .map(async (s) => formatStat(s.name, await getStat(obj.dbobj, s.name))) ||
    [];

  const merits = obj.data?.stats
    ?.filter((s) => s.type === "merit")
    .map(async (s) => formatStat(s.name, await getStat(obj.dbobj, s.name))) ||
    [];
  const flaws = obj.data?.stats
    ?.filter((s) => s.type === "flaw")
    .map(async (s) => formatStat(s.name, await getStat(obj.dbobj, s.name))) ||
    [];

  const max = Math.max(backgrounds.length, merits.length, flaws.length);
  const totalBackgrounds = [];
  const totalMerits = [];
  const totalFlaws = [];

  totalBackgrounds.push(
    ...backgrounds,
    ...Array(max - backgrounds.length).fill(" ".repeat(24)),
  );
  totalMerits.push(
    ...merits,
    ...Array(max - merits.length).fill(" ".repeat(24)),
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

const disciplines = async (obj: Obj) => {
  const template = await getStat(obj.dbobj, "template");

  const totalDisciplines: any[] = [];

  const disciplines = obj.data?.stats
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
        formatStat(stat.name, await getStat(obj.dbobj, stat.name), 37),
      );

      for (
        const s of obj.data?.stats
          ?.filter((s) => s.type === stat.name)
          .sort((a, b) => a.value - b.value) || []
      ) {
        colDisciplines.push(
          "   " + formatStat(s.name, await getStat(obj.dbobj, s.name), 34),
        );
      }

      colDisciplines.push(" ".repeat(37));
    }
    totalDisciplines.push(colDisciplines);
  }

  let output = divider("Disciplines") + "%r ";
  const max = Math.max(totalDisciplines[0].length, totalDisciplines[1].length);
  totalDisciplines[0].push(
    ...Array(max - totalDisciplines[0].length).fill(" ".repeat(37)),
  );
  totalDisciplines[1].push(
    ...Array(max - totalDisciplines[1].length).fill(" ".repeat(37)),
  );

  output += totalDisciplines[0]
    .map((d: any, i: number) => ` ${d}  ${totalDisciplines[1][i]}`)
    .join("\n")
    .trim();

  if (!max) return "";
  return output + "%r";
};

const other = async (obj: Obj) => {
  const template = await getStat(obj.dbobj, "template");
  let output = "";

  const other = allStats.filter(
    (stat) =>
      stat.type === "other" && (stat.template?.includes(template) || !stat.template),
  );

  let totalOther = [];

  for (const stat of other) {
    totalOther.push(formatStat(stat.name, await getStat(obj.dbobj, stat.name)));
  }
  totalOther = totalOther.sort((a, b) => a.localeCompare(b));
  output += "%cr-%cn".repeat(78);

  for (let i = 0; i < totalOther.length; i++) {
    if (i % 3 === 0) {
      output += "%r%b";
    }
    output += totalOther[i] + "  ";
  }

  return output + "%r";
};

const calculateDamage = (
  superficial: number,
  aggravated: number,
  maxBoxes: number,
  template: string, // Changed from characterType to template to be consistent
) => {
  let damageBoxes = Array(maxBoxes).fill("[ ]");
  let status = "";

  // Apply Aggravated damage
  for (let i = 0; i < aggravated && i < maxBoxes; i++) {
    damageBoxes[i] = "[X]";
  }

  // Apply Superficial damage in remaining boxes if available
  for (let i = 0; i < maxBoxes; i++) {
    if (damageBoxes[i] === "[ ]" && superficial > 0) {
      damageBoxes[i] = "[/]";
      superficial--;
    }
  }

  // Upgrade Superficial to Aggravated if needed
  if (superficial > 0) {
    for (let i = 0; i < maxBoxes && superficial > 0; i++) {
      if (damageBoxes[i] === "[/]") {
        damageBoxes[i] = "[X]";
        superficial--;
      }
    }
  }

  // Check for Impaired or Incapacitated status
  const filledBoxes = damageBoxes.reduce(
    (acc, val) => acc + (val !== "[ ]" ? 1 : 0),
    0,
  );

  if (filledBoxes >= maxBoxes) {
    // Special rule for mortal and ghoul characters when they reach impaired
    if (
      (template === "mortal" || template === "ghoul") &&
      aggravated < maxBoxes
    ) {
      status = "Incapacitated";
    } else if (aggravated === maxBoxes || superficial > 0) {
      // All boxes are aggravated or track is overflowing
      status = "Incapacitated";
    } else {
      status = "Impaired";
    }
  }

  return { damageBoxes, status };
};

const displayDamageTrack = async (obj: IDBOBJ, type: string) => {
  let output = "";
  let template = await getStat(obj, "template");
  obj.data ||= {};
  obj.data.damage ||= {
    damage: {
      physical: {
        superficial: 0,
        aggravated: 0,
      },
      mental: {
        superficial: 0,
        aggravated: 0,
      },
    },
  };

  const superficial = parseInt(obj.data?.damage[type]?.superficial || 0);
  const aggravated = parseInt(obj.data?.damage[type]?.aggravated || 0);
  let maxBoxes;

  if (type === "physical") {
    maxBoxes = (await getStat(obj, "stamina")) + 3;
  } else if (type === "mental") {
    const composure = await getStat(obj, "composure");
    const resolve = await getStat(obj, "resolve");
    maxBoxes = composure + resolve;
  } else {
    throw new Error("Invalid damage type");
  }

  const { damageBoxes, status } = calculateDamage(
    superficial,
    aggravated,
    maxBoxes,
    template,
  );
  let trackLabel = type === "physical" ? "Health:    " : "Willpower: ";

  if (status) {
    output += ` ${trackLabel}%ch%cr${damageBoxes.join("")}%cn`;
    output += ` %ch%cr(${status})%cn`;
  } else {
    output += ` ${trackLabel}${damageBoxes.join("")} `;
  }

  return output;
};

const health = async (obj: IDBOBJ) => {
  let output = divider("Health") + "\n";

  output += await displayDamageTrack(obj, "physical");
  output += "%r";
  output += await displayDamageTrack(obj, "mental");
  output += "%r"; // Include additional tracks or information as needed

  return output;
};

function sheetCommand() {
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
      output += await advantages(tarObj);
      output += await disciplines(tarObj);
      output += await health(tarObj);
      output += await other(tarObj);
      output += footer();

      if (await getStat(tarObj.dbobj, "template")) {
        send([ctx.socket.id], output);
      } else {
        if (tarObj.dbref === en.dbref) {
          send(
            [ctx.socket.id],
            "%chGame>%cn You have no template set. See: %ch+help template%cn",
          );
        } else {
          send([ctx.socket.id], "%chGame>%cn That character has no template set.");
        }
      }
    },
  });
}

export default sheetCommand;
