import { intentRegistry } from "./IntentRegistry.ts";
import { sandboxService } from "../Sandbox/SandboxService.ts";

export interface Intent {
  name: string;
  actorId: string;
  targetId?: string;
  args: string[];
}

export interface InterceptorCandidate {
  id: string;
  script: string;
  state: Record<string, unknown>;
}

export class InterceptorService {
  /**
   * Run interceptors for a given intent.
   * @param intent The intent being executed.
   * @param candidates Array of objects (with IDs and scripts) that might intercept.
   * @returns Promise<boolean> True if the intent should proceed, false if it was halted.
   */
  static async intercept(intent: Intent, candidates: InterceptorCandidate[]): Promise<boolean> {
    const order = intentRegistry.getInterceptorOrder();
    const sortedCandidates = order === "FIFO" ? candidates : [...candidates].reverse();

    for (const candidate of sortedCandidates) {
      // We run the script in the sandbox. 
      // The script should return 'false' or call a specific u method to halt.
      
      const wrapperCode = `
        ${candidate.script}
        // If an intercept function is defined, call it.
        if (typeof u.intercept === 'function') {
          return u.intercept(${JSON.stringify(intent)});
        }
      `;

      try {
        const result = await sandboxService.runScript(wrapperCode, {
          id: candidate.id,
          state: candidate.state,
          target: intent.targetId ? { id: intent.targetId } : undefined
        });

        // If any interceptor returns exactly 'false', the intent is halted.
        if (result === false) {
          return false;
        }
      } catch (err) {
        console.error(`Error in interceptor for object ${candidate.id}:`, err);
      }
    }

    return true;
  }
}
