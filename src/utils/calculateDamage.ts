import { IDBOBJ } from "../@types";
import { getStat } from "../services";

const calculateDamage = async (
  obj: IDBOBJ,
  superficial: number,
  aggravated: number,
  type: string
) => {
  const maxBoxes = +(await getStat(obj, "stamina")) + 3;
  const characterType = await getStat(obj, "splat");

  aggravated = +obj.data?.damage[type].aggravated + aggravated;
  superficial = +obj.data?.damage[type].superficial + superficial;

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
    0
  );

  if (filledBoxes >= maxBoxes) {
    // Special rule for mortal and ghoul characters when they reach impaired
    if (
      (characterType === "mortal" || characterType === "ghoul") &&
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
