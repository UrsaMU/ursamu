import { getConfig } from "@ursamu/core";

export interface IntentDefinition {
  priority: number;
  enabled:  boolean;
  metadata?: Record<string, unknown>;
}

const DEFAULT_INTENTS: Record<string, IntentDefinition> = {
  say:  { priority: 10, enabled: true },
  look: { priority:  1, enabled: true },
  get:  { priority:  5, enabled: true },
  drop: { priority:  5, enabled: true },
  give: { priority:  5, enabled: true },
  use:  { priority:  5, enabled: true },
};

class IntentRegistry {
  private static _instance: IntentRegistry;
  private _intents: Record<string, IntentDefinition> = { ...DEFAULT_INTENTS };

  private constructor() {
    const fromConfig = getConfig<Record<string, IntentDefinition>>("intents.registry");
    if (fromConfig) this._intents = { ...DEFAULT_INTENTS, ...fromConfig };
  }

  static getInstance(): IntentRegistry {
    if (!IntentRegistry._instance) IntentRegistry._instance = new IntentRegistry();
    return IntentRegistry._instance;
  }

  getIntent(name: string): IntentDefinition | undefined {
    return this._intents[name];
  }

  listIntents(): string[] {
    return Object.keys(this._intents).filter((n) => this._intents[n].enabled);
  }

  getInterceptorOrder(): "FIFO" | "LIFO" {
    return getConfig<"FIFO" | "LIFO">("intents.interceptorOrder") ?? "FIFO";
  }
}

export const intentRegistry: IntentRegistry = IntentRegistry.getInstance();

export type { IntentRegistry };
