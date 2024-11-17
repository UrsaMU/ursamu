import { IDBOBJ } from "../../../@types";
import { getStat } from "../../../services";

export const calculateDamage = async (
  obj: IDBOBJ,
  superficial: number,
  aggravated: number,
  type: string,
) => {
  const maxBoxes = +(await getStat(obj, "stamina")) + 3;
  const characterType = await getStat(obj, "splat");

  // Initialize damage structure if it doesn't exist
  if (!obj.data?.damage) {
    obj.data = { ...obj.data, damage: {} };
  }
  if (!obj.data.damage[type]) {
    obj.data.damage[type] = {
      superficial: 0,
      aggravated: 0
    };
  }

  aggravated = +obj.data.damage[type].aggravated + aggravated;
  superficial = +obj.data.damage[type].superficial + superficial;

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

export const heal = async (
  obj: IDBOBJ,
  superficialAmount: number = 0,
  aggravatedAmount: number = 0,
  type: string = "physical"
) => {
  // Initialize damage structure if it doesn't exist
  if (!obj.data?.damage) {
    obj.data = { ...obj.data, damage: {} };
  }
  if (!obj.data.damage[type]) {
    obj.data.damage[type] = {
      superficial: 0,
      aggravated: 0
    };
    return {
      success: false,
      error: "No damage of that type to heal",
      newState: await calculateDamage(obj, 0, 0, type)
    };
  }

  let currentSuperficial = +obj.data.damage[type].superficial;
  let currentAggravated = +obj.data.damage[type].aggravated;

  // Check if there's damage to heal
  if (superficialAmount > 0 && currentSuperficial === 0) {
    return {
      success: false,
      error: "No superficial damage to heal",
      newState: await calculateDamage(obj, 0, 0, type)
    };
  }

  if (aggravatedAmount > 0 && currentAggravated === 0) {
    return {
      success: false,
      error: "No aggravated damage to heal",
      newState: await calculateDamage(obj, 0, 0, type)
    };
  }

  // Heal superficial damage first
  if (superficialAmount > 0) {
    currentSuperficial = Math.max(0, currentSuperficial - superficialAmount);
  }

  // Heal aggravated damage
  if (aggravatedAmount > 0) {
    currentAggravated = Math.max(0, currentAggravated - aggravatedAmount);
  }

  // Update the damage values
  obj.data.damage[type] = {
    ...obj.data.damage[type],
    superficial: currentSuperficial,
    aggravated: currentAggravated
  };

  // Calculate new damage track state
  const newState = await calculateDamage(obj, 0, 0, type);

  return {
    success: true,
    message: `Healed ${superficialAmount} superficial and ${aggravatedAmount} aggravated damage`,
    newState,
    error: null
  };
};
