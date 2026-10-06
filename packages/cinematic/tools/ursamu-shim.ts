// Shim for showcase runs — re-exports the local engine but records addCmd.
export * from "../../mush/mod.ts";
export { dbojs } from "../../mush/mod.ts";

import { cmds } from "../../mush/mod.ts";

export function addCmd(
  ...toAdd: Parameters<typeof Object>[0] extends never ? never : unknown[]
): void {
  for (
    const c of toAdd as unknown as {
      name: string;
      pattern: RegExp;
      exec: (u: unknown) => unknown;
    }[]
  ) {
    cmds.push(c as never);
  }
}
