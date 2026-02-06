import configData from "../../../config/config.json" with { type: "json" };
import type { IConfig } from "../../@types/IConfig.ts";

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
    const config = configData as unknown as IConfig;
    if (config.intents?.registry) {
      this.intents = config.intents.registry as Record<string, IntentDefinition>;
    }
  }

  getIntent(name: string): IntentDefinition | undefined {
    return this.intents[name];
  }

  listIntents(): string[] {
    return Object.keys(this.intents).filter(name => this.intents[name].enabled);
  }

  getInterceptorOrder(): "FIFO" | "LIFO" {
    const config = configData as unknown as IConfig;
    return config.intents?.interceptorOrder || "FIFO";
  }
}

export const intentRegistry = IntentRegistry.getInstance();
