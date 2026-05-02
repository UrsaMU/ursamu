// RED: force:as in sandbox-handlers-exec.ts executes commands as an arbitrary
// target without checking whether the calling actor has sufficient privilege.
// A non-admin script can impersonate any player by sending { type: "force:as",
// targetId: "<victimId>" } from the sandbox worker.
//
// Fix: resolve the calling actor and reject if actor privilege < wizard.

import { assertEquals } from "jsr:@std/assert@^1";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const SRC = new URL(
  "../../src/services/Sandbox/sandbox-handlers-exec.ts",
  import.meta.url,
);

Deno.test(
  "sandbox force:as requires actor privilege check before executing",
  OPTS,
  async () => {
    const src = await Deno.readTextFile(SRC);

    // Isolate the force:as block
    const forceAsIdx = src.indexOf('type === "force:as"');
    const blockEnd   = src.indexOf("\n  }", forceAsIdx + 1);
    const block      = src.slice(forceAsIdx, blockEnd + 4);

    // Must resolve the calling actor AND check privilege before calling force()
    const resolvesActor = /resolveSocket\(context\)/.test(block) ||
      /actorId\s*=/.test(block);
    const checksPrivilege =
      /isStaff|isWizard|flags.*wizard|flags.*admin|priv/.test(block) ||
      /respond\(worker,\s*msgId,\s*null\)/.test(
        // check there's an early-return on priv fail (not just the null check at top)
        block.replace('if (!msg.targetId || !msg.command)', '')
      ) && /actorId/.test(block);

    assertEquals(
      resolvesActor && checksPrivilege,
      true,
      "VULNERABLE: force:as does not verify caller privilege — any sandbox script can impersonate any player.",
    );
  },
);
