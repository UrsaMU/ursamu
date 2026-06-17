/**
 * @module sdk-service
 *
 * Builds and serializes SDK injection objects for the sandbox worker.
 */
import type { IDBOBJ } from "../world/types.ts";
import { hydrate } from "../world/dbobjs.ts";

export interface SDKObject {
  id: string;
  name?: string;
  flags?: string[] | Set<string>;
  location?: string;
  state?: Record<string, unknown>;
  contents?: SDKObject[];
}

export interface SDKContext {
  id: string;
  me?: SDKObject;
  here?: SDKObject;
  target?: SDKObject;
  location?: string;
  state: Record<string, unknown>;
  cmd?: { name: string; original?: string; args: string[]; switches?: string[] };
  socketId?: string;
  [key: string]: unknown;
}

export class SDKService {
  static createStateProxy(
    initialState: Record<string, unknown>,
    onPatch: (prop: string, value: unknown) => void,
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

  static prepareSDK(context: SDKContext): Partial<Record<string, unknown>> {
    return {
      ...context,
      state: context.state,
      me:    context.me || { id: context.id },
      here:  context.here || { id: context.location || "limbo" },
      target: context.target,
      cmd:   context.cmd || { name: "", args: [] },
    };
  }

  static async hydrate(obj: IDBOBJ, fetchContents = false): Promise<SDKObject> {
    const sdkObj = hydrate(obj) as unknown as SDKObject;

    if (fetchContents) {
      const { dbojs } = await import("../world/dbobjs.ts");
      const contents  = await dbojs.query({ location: obj.id });
      sdkObj.contents = await Promise.all(
        contents.map(c => this.hydrate(c as IDBOBJ)),
      );
    }

    return sdkObj;
  }
}
