/** +skills, +qualities, +drawbacks — aliases for +cg/catalog. */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { catalog } from "./cg-actions.ts";

export function buildCatalogAliases() {
  const alias = (name: string, pattern: RegExp, what: string, help: string) =>
    addCmd({
      name,
      pattern,
      lock: "connected",
      category: "Cinematic",
      help,
      exec: (u: IUrsamuSDK) => {
        u.send(catalog(what));
      },
    });

  alias("+skills", /^\+skills$/i, "skills", `+skills  — Browse available Skills.

Alias for: +cg/catalog skills

Examples:
  +skills`);

  alias("+qualities", /^\+qualities$/i, "qualities",
    `+qualities  — Browse Qualities and powers.

Alias for: +cg/catalog qualities

Examples:
  +qualities`);

  alias("+drawbacks", /^\+drawbacks$/i, "drawbacks",
    `+drawbacks  — Browse available Drawbacks.

Alias for: +cg/catalog drawbacks

Examples:
  +drawbacks`);

  alias("+powers", /^\+powers$/i, "powers",
    `+powers  — Browse powers catalog (rules supplement).

Alias for: +cg/catalog powers

Examples:
  +powers`);
}
