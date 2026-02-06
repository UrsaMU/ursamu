import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";

export interface SDKObject {
  id: string;
  name?: string;
  flags?: string[] | Set<string>;
  state?: Record<string, unknown>;
  contents?: SDKObject[];
}

export interface SDKContext {
  id: string; // ID of the object running the script (deprecated, use 'me')
  me?: SDKObject;
  here?: SDKObject;
  target?: SDKObject;
  location?: string; // (deprecated, use 'here')
  state: Record<string, unknown>;
  cmd?: { name: string; args: string[] };
  socketId?: string;
  [key: string]: unknown; // Allow additional context fields
}

export class SDKService {
  /**
   * Create the reactive state proxy.
   * @param initialState The initial state from the DB.
   * @param onPatch Callback when a property is modified.
   */
  static createStateProxy(
    initialState: Record<string, unknown>,
    onPatch: (prop: string, value: unknown) => void
  ): Record<string, unknown> {
    return new Proxy(initialState, {
      set(target, prop, value) {
        if (typeof prop === "string") {
          target[prop] = value;
          onPatch(prop, value);
          return true;
        }
        return false;
      },
    });
  }

  /**
   * Prepare the SDK injection for a given context.
   * This is serialized and sent to the worker/sandbox.
   */
  static prepareSDK(context: SDKContext): Partial<IUrsamuSDK> {
    return {
      ...context,
      state: context.state,
      me: context.me || { id: context.id },
      here: context.here || { id: context.location || "limbo" },
      target: context.target,
      cmd: context.cmd || { name: "", args: [] }
    } as unknown as Partial<IUrsamuSDK>;
  }
}
