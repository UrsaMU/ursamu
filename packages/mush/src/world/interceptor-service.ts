import { intentRegistry } from "./intent-registry.ts";
import { sandboxService } from "../softcode/sandbox.ts";

export interface Intent {
  name:      string;
  actorId:   string;
  targetId?: string;
  args:      string[];
}

export interface InterceptorCandidate {
  id:     string;
  script: string;
  state:  Record<string, unknown>;
}

export class InterceptorService {
  /**
   * Run all interceptor scripts in candidate objects for a given intent.
   *
   * Each candidate object's script may call `u.intercept(intent)`.
   * If any interceptor returns `false`, the intent is cancelled and the
   * command does not execute.
   *
   * @returns `true` if the intent should proceed; `false` if cancelled.
   */
  static async intercept(
    intent:     Intent,
    candidates: InterceptorCandidate[],
  ): Promise<boolean> {
    const order  = intentRegistry.getInterceptorOrder();
    const sorted = order === "FIFO" ? candidates : [...candidates].reverse();

    for (const candidate of sorted) {
      const code = `
        ${candidate.script}
        if (typeof u.intercept === "function") {
          return u.intercept(${JSON.stringify(intent)});
        }
      `;

      try {
        const result = await sandboxService.runScript(code, {
          id:     candidate.id,
          state:  candidate.state,
          target: intent.targetId ? { id: intent.targetId } : undefined,
        });

        if (result === false) return false;
      } catch (e: unknown) {
        console.error(`[InterceptorService] candidate ${candidate.id}:`, e);
      }
    }

    return true;
  }
}
