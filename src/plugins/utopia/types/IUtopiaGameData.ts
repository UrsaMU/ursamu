export interface CharacterOptions {
  origin: string;
  specialization: string;
  skills: string[];
  equipment: string[];
}

// Specialization Interfaces
export interface ChooseFromOption {
  count: number;
  from: string[];
}

export interface SkillRequirement {
  required?: string[];
  choose?: ChooseFromOption;
}

export interface KnowledgeRequirement {
  required?: string[];
  choose?: {
    count: number;
    from: string[];
  };
}

export interface SpecialAbilityAction {
  name: string;
  description: string;
}

export interface SpecialAbilityBase {
  type: "equipment" | "skill" | "action" | "ability";
  name: string;
  description: string;
  uses?: number;
  period?: string;
}

export interface EquipmentSpecial extends SpecialAbilityBase {
  type: "equipment";
  actions?: SpecialAbilityAction[];
  features?: string[];
}

export interface AbilitySpecial extends SpecialAbilityBase {
  type: "ability";
  rewards?: string[];
  abilities?: {
    [key: string]: SpecialAbilityAction[];
  };
}

export interface SkillSpecial extends SpecialAbilityBase {
  type: "skill";
}

export interface ActionSpecial extends SpecialAbilityBase {
  type: "action";
}

export type SpecialAbility =
  | EquipmentSpecial
  | AbilitySpecial
  | SkillSpecial
  | ActionSpecial;

export interface Specialization {
  name: string;
  description: string;
  skills: string[] | SkillRequirement;
  knowledge: string[] | KnowledgeRequirement;
  special: SpecialAbility;
  restrictions?: string;
}

export interface Specializations {
  specializations: {
    [key: string]: Specialization;
  };
}

// Origin Interfaces
export interface OriginAbility {
  name: string;
  description: string;
}

export interface OriginTypeSpecialAbility {
  name: string;
  description: string;
}

export interface OriginType {
  name: string;
  description: string;
  knowledge: string[];
  specialAbility?: OriginTypeSpecialAbility;
}

export interface Origin {
  description: string;
  startingResources: number;
  abilities: OriginAbility[];
  types: {
    [key: string]: OriginType;
  };
}

export interface Origins {
  [key: string]: Origin;
}

// Additional game data structures for the Utopia plugin can be added here
