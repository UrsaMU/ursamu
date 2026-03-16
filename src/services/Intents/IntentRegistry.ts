import { getConfig } from "../Config/mod.ts";

export interface IntentDefinition {
  priority: number;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

export class IntentRegistry {
  private static instance: IntentRegistry;
  private intents: Record<string, IntentDefinition> = {};

  private constructor() {
    this.loadFromConfig();
  }

  static getInstance(): IntentRegistry {
    if (!IntentRegistry.instance) {
      IntentRegistry.instance = new IntentRegistry();
    }
    return IntentRegistry.instance;
  }

  private loadFromConfig() {
    const registry = getConfig<Record<string, IntentDefinition>>("intents.registry");
    if (registry) {
      this.intents = registry;
    }
  }

  getIntent(name: string): IntentDefinition | undefined {
    return this.intents[name];
  }

  listIntents(): string[] {
    return Object.keys(this.intents).filter(name => this.intents[name].enabled);
  }

  getInterceptorOrder(): "FIFO" | "LIFO" {
    return getConfig<"FIFO" | "LIFO">("intents.interceptorOrder") || "FIFO";
  }
}

export const intentRegistry = IntentRegistry.getInstance();
