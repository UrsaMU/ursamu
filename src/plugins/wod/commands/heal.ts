import { addCmd, Obj, send } from "../../../services";
import { moniker } from "../../../utils";
import { heal } from "../services/damage";

export default () => {
  addCmd({
    name: "heal",
    pattern: /^[\+@]?heal\s+(\d+)\s+(\w+)(?:\s+(\w+))?(?:\s+(\w+))?/i,
    lock: "connected",
    category: "rp",
    exec: async (ctx, [amount, damageType, type = "physical", target]) => {
      const en = await Obj.get(target ? target : ctx.socket.cid);
      if (!en) return;

      // Convert amount to number
      const healAmount = parseInt(amount);
      if (isNaN(healAmount) || healAmount <= 0) {
        return send(
          [ctx.socket.id],
          "%ch%crERROR>%cn Invalid healing amount. Must be a positive number."
        );
      }

      // Validate damage type
      const validDamageTypes = ["superficial", "aggravated"];
      if (!validDamageTypes.includes(damageType.toLowerCase())) {
        return send(
          [ctx.socket.id],
          "%ch%crERROR>%cn Invalid damage type. Must be 'superficial' or 'aggravated'."
        );
      }

      // Validate track type
      const validTypes = ["physical", "social", "mental"];
      if (!validTypes.includes(type.toLowerCase())) {
        return send(
          [ctx.socket.id],
          "%ch%crERROR>%cn Invalid type. Must be 'physical', 'social', or 'mental'."
        );
      }

      // Apply healing
      const result = await heal(
        en,
        damageType.toLowerCase() === "superficial" ? healAmount : 0,
        damageType.toLowerCase() === "aggravated" ? healAmount : 0,
        type.toLowerCase()
      );

      if (!result.success && result.error) {
        return send([ctx.socket.id], `%ch%crERROR>%cn ${result.error}`);
      }

      // Broadcast healing message
      const message = `%ch%cgHEAL>%cn ${moniker(en)} heals ${healAmount} ${damageType} ${type} damage.`;
      await send([`#${en.location}`], message);

      // Save the updated entity
      await en.save();
    },
  });
};
