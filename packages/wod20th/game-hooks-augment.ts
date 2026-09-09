// game-hooks-augment.ts -- IDE/type-only GameHookMap merge.
// Import side-effect from monorepo consumers. Not in JSR publish.include.
import type {
  ChargenStartedEvent, ChargenStepEvent, ChargenSubmittedEvent,
  ChargenApprovedEvent, ChargenDeniedEvent, ChargenResetEvent,
  SheetViewedEvent, StatChangedEvent, CharCreatedEvent, CharUpdatedEvent,
  HealthChangedEvent, PoolChangedEvent, FormChangedEvent,
  RenownAwardedEvent, RenownLostEvent, RankAdvancedEvent,
} from "./core/types.ts";
import type {
  RiteLearnedEvent, RiteCastEvent, FrenzyEvent, SteppedSidewaysEvent,
  CombatAttackEvent, GiftUsedEvent, FetishUsedEvent, FetishReleasedEvent,
  XpSpentEvent, InitRolledEvent, VoteCastEvent,
} from "./hooks.ts";

// -- Declaration merge -- adds wod20th events to the engine's GameHooks type --

declare module "@ursamu/mush" {
  interface GameHookMap {
    "wod20th:chargen:started":    (e: ChargenStartedEvent)    => void;
    "wod20th:chargen:step":       (e: ChargenStepEvent)       => void;
    "wod20th:chargen:submitted":  (e: ChargenSubmittedEvent)  => void;
    "wod20th:chargen:approved":   (e: ChargenApprovedEvent)   => void;
    "wod20th:chargen:denied":     (e: ChargenDeniedEvent)     => void;
    "wod20th:chargen:reset":      (e: ChargenResetEvent)      => void;
    "wod20th:sheet:viewed":       (e: SheetViewedEvent)       => void;
    "wod20th:stat:changed":       (e: StatChangedEvent)       => void;
    "wod20th:char:created":       (e: CharCreatedEvent)       => void;
    "wod20th:char:updated":       (e: CharUpdatedEvent)       => void;
    "wod20th:health:changed":     (e: HealthChangedEvent)     => void;
    "wod20th:pool-spent":         (e: PoolChangedEvent)       => void;
    "wod20th:pool-regained":      (e: PoolChangedEvent)       => void;
    "wod20th:form-changed":       (e: FormChangedEvent)       => void;
    "wod20th:frenzy-entered":     (e: FrenzyEvent)            => void;
    "wod20th:frenzy-cleared":     (e: FrenzyEvent)            => void;
    "wod20th:renown-awarded":     (e: RenownAwardedEvent)     => void;
    "wod20th:renown-lost":        (e: RenownLostEvent)        => void;
    "wod20th:rank-advanced":      (e: RankAdvancedEvent)      => void;
    "wod20th:stepped-sideways":   (e: SteppedSidewaysEvent)   => void;
    "wod20th:rite-learned":       (e: RiteLearnedEvent)       => void;
    "wod20th:rite-cast":          (e: RiteCastEvent)          => void;
    "wod20th:combat:attack":      (e: CombatAttackEvent)      => void;
    "wod20th:gift-used":          (e: GiftUsedEvent)          => void;
    "wod20th:fetish-used":        (e: FetishUsedEvent)        => void;
    "wod20th:fetish-released":    (e: FetishReleasedEvent)    => void;
    "wod20th:xp-spent":           (e: XpSpentEvent)           => void;
    "wod20th:init-rolled":        (e: InitRolledEvent)        => void;
    "wod20th:vote-cast":          (e: VoteCastEvent)          => void;
  }
}


declare module "@ursamu/ursamu" {
  // re-export same map under legacy alias if used
  interface GameHookMap {}
}
