+DEV/DEV-HOOKS

Adding new gameHooks events to the CPR plugin.

STEPS
  1. Declare event and payload in hooks/augment.ts inside GameHookMap
  2. Add a typed emit helper in hooks/emitters.ts
  3. Call the emitter from the relevant command
  4. Document the event in `ai-gm-hooks.md`

AUGMENT PATTERN (hooks/augment.ts)
  declare module "@ursamu/mush" {
    interface GameHookMap {
      "cpr:my:event": { actorId: string; value: number };
    }
  }

EMITTER PATTERN (hooks/emitters.ts)
  export function emitMyEvent(payload: { actorId: string; value: number }) {
    gameHooks.emit("cpr:my:event", payload);
  }

SECURITY RULES
  Handlers must null-check any resolved DB object before acting.
  Handlers cannot call u.send() — use gameHooks.emit() or mu() instead.
  Every gameHooks.on() in init() must have a matching .off() in remove()
  using the same named function reference (not an inline arrow).

SEE ALSO: `ai-gm-hooks.md`, `development.md`
