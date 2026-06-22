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
    // Fast path: most commands have no interceptors — do no work (and no
    // serialization) when there are none.
    if (!candidates.length) return true;

    const order = intentRegistry.getInterceptorOrder();
    const sortedCandidates = order === "FIFO" ? candidates : [...candidates].reverse();

    // Serialize the intent ONCE — it is loop-invariant. JSON.stringify already
    // drops `undefined` and rejects BigInt, so the old parse(stringify())+
    // stringify() round-trip (run per candidate) was redundant. Guard it so a
    // non-serializable intent doesn't throw past the loop.
    let intentJson: string;
    try {
      intentJson = JSON.stringify(intent ?? null);
    } catch (err) {
      console.error("Interceptor: intent is not JSON-serializable, skipping interceptors:", err);
      return true;
    }
    const targetArg = intent.targetId ? { id: intent.targetId } : undefined;

    for (const candidate of sortedCandidates) {
      // Run the script in the sandbox; it should return 'false' or call a
      // specific u method to halt the intent.
      const wrapperCode = `
        ${candidate.script}
        // If an intercept function is defined, call it.
        if (typeof u.intercept === 'function') {
          return u.intercept(${intentJson});
        }
      `;

      try {
        const result = await sandboxService.runScript(wrapperCode, {
          id: candidate.id,
          state: candidate.state,
          target: targetArg,
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
