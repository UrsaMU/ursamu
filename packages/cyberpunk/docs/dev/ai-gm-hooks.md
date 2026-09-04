+DEV/AI-GM-HOOKS

The plugin emits typed cpr:* events on the UrsaMU gameHooks bus.
Consume them in any plugin to build AI-GM integrations.

QUICK START
  import { gameHooks } from "@ursamu/mush";
  import type {} from "jsr:@ursamu/cpr/hooks/augment.ts";

  gameHooks.on("cpr:combat:start", ({ roomId, participants }) => {
    // AI narrates combat opening
  });

  Use hooks/emitters.ts typed helpers instead of raw gameHooks.emit()
  to get payload type-checking at call sites inside this plugin.

COMBAT EVENTS
  cpr:combat:start      First combatant rolls initiative in a room
  cpr:combat:end        +combat/end closes the tracker
  cpr:combat:turn       Turn advances to the next actor
  cpr:attack:resolved   Attack roll resolved (hit or miss)
  cpr:wound:changed     HP or wound state changes on any character
  cpr:death_save:rolled Mortally wounded character makes a death save
  cpr:death_save:failed Death save fails — character is dead
  cpr:critical_injury   Critical injury rolled and applied
  cpr:stabilized        Mortally wounded character is stabilized

SEE ALSO: `hooks-payloads.md`, `hooks-other.md`,
          `dev-hooks.md`
