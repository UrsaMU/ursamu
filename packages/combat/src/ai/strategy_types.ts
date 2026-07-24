// Types for resources/ai/*.json — mirror ai-strategy.schema.json.

export type AiActionKind =
  | "attack"
  | "move"
  | "reload"
  | "flee"
  | "posture"
  | "wait"
  | "defend"
  | "aim"
  | "use";

export type AiTargetPick =
  | "highest-threat"
  | "weakest"
  | "first"
  | "random"
  | "isolated";

export type AiPostureType =
  | "ambush"
  | "overwatch"
  | "guard"
  | "first-fire-on-adjacent";

export interface AiCondition {
  selfHealthBelow?: number;
  selfHealthAtMost?: number;
  selfHealthAbove?: number;
  selfHealthAtLeast?: number;
  unrevealed?: boolean;
  revealed?: boolean;
  frenzied?: boolean;
  damagedThisRound?: boolean;
  noRecentDamage?: boolean;
  hasThreat?: boolean;
  packMateDown?: boolean;
  livingPackMatesAtLeast?: number;
  enemyCountAtLeast?: number;
  enemyCountAtMost?: number;
  enemyCountEquals?: number;
  hasEnemies?: boolean;
  hasCover?: boolean;
  /** Require all of these tags on selfView.tags. */
  hasTags?: string[];
  /** Fail if any of these tags are present. */
  missingTags?: string[];
  /** resource name → minimum value on selfView.resources. */
  resourceAtLeast?: Record<string, number>;
  /** resource name → maximum value. */
  resourceAtMost?: Record<string, number>;
  /** Match participant/view side label. */
  sideIs?: string;
}

export interface AiActionSpec {
  action: AiActionKind;
  target?: AiTargetPick;
  posture?: AiPostureType;
  /** Optional host mode string on the resulting CombatAction. */
  mode?: string;
}

export interface AiRule {
  id: string;
  when: AiCondition;
  then: AiActionSpec;
  priority: number;
  weight?: number;
  reason?: string;
}

export interface AiStrategy {
  $schema?: string;
  slug: string;
  name: string;
  blurb?: string;
  book?: string;
  tags?: string[];
  rules: AiRule[];
  fallback?: AiActionSpec;
}
