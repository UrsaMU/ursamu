/**
 * @module SandboxService
 *
 * Manages sandboxed script execution for UrsaMU game scripts.
 * Uses short-lived Deno Workers via runInWorker(). Message handler
 * logic lives in the sandbox-handlers-* companion modules.
 */
import { Sandbox, type SandboxOptions } from "../../../deps.ts";
import type { ISandboxConfig } from "../../@types/ISandboxConfig.ts";
import { SDKService, type SDKContext } from "./SDKService.ts";
import { runInWorker } from "./workerRunner.ts";
import {
  handleSend, handleBroadcast, handleRoomBroadcast, handlePatch,
  handleTeleport, emitResultHooks,
} from "./sandbox-handlers-output.ts";
import { handleDbMessage, handleAuthMessage } from "./sandbox-handlers-db.ts";
import { handleSysMessage, handleChanMessage, handleTextMessage } from "./sandbox-handlers-sys.ts";
import {
  handleAttrMessage, handleFlagsMessage, handleUtilTargetMessage,
  handleUtilParseDescMessage, handleTriggerMessage, handleEventsMessage,
} from "./sandbox-handlers-objects.ts";
import { handleForceMessage, handleEvalMessage } from "./sandbox-handlers-exec.ts";

// ---------------------------------------------------------------------------
// Transpile cache — source-keyed, avoids re-transpiling identical scripts
// ---------------------------------------------------------------------------

const _transpileCache = new Map<string, string>();
const _TRANSPILE_CACHE_MAX = 200;

// ---------------------------------------------------------------------------
// Exported helpers
// ---------------------------------------------------------------------------

/**
 * Scoped DB update — writes only specified dot-notation field paths.
 * Prevents full-object $set from clobbering concurrent writes.
 */
export async function scopedUpdate(id: string, fields: Record<string, unknown>): Promise<void> {
  const { dbojs } = await import("../Database/index.ts");
  await dbojs.modify({ id }, "$set", fields);
}

// ---------------------------------------------------------------------------
// LocalSandbox
// ---------------------------------------------------------------------------

const WORKER_URL = new URL("./worker.ts", import.meta.url);

class LocalSandbox {
  private terminated = false;

  eval(code: string, options?: { sdk?: unknown; context?: SDKContext }): Promise<unknown> {
    if (this.terminated) throw new Error("Sandbox is terminated");
    const context = options?.context;

    return runInWorker<unknown>(
      WORKER_URL,
      { code, sdk: options?.sdk },
      async (msg, worker, resolve, reject) => {
        const type = msg.type as string;

        // Lifecycle
        if (type === "result") {
          emitResultHooks(msg.data, context)
            .catch(e => console.error("[GameHooks] emit error:", e));
          resolve(msg.data);
          return;
        }
        if (type === "error")  { reject(new Error(String(msg.data))); return; }
        if (type === "patch")  { handlePatch(msg, context); return; }

        // Output routing
        if (type === "send")           { handleSend(msg, context); return; }
        if (type === "broadcast")      { handleBroadcast(msg); return; }
        if (type === "room:broadcast") { await handleRoomBroadcast(msg); return; }
        if (type === "teleport")       { handleTeleport(msg, context); return; }

        // Database + auth
        if (type.startsWith("db:") || type === "lock:check") {
          await handleDbMessage(msg, worker, context); return;
        }
        if (type.startsWith("auth:")) { await handleAuthMessage(msg, worker, context); return; }

        // System + channels + text
        if (type.startsWith("sys:"))  { await handleSysMessage(msg, worker, context); return; }
        if (type.startsWith("chan:")) { await handleChanMessage(msg, worker, context); return; }
        if (type.startsWith("text:")) { await handleTextMessage(msg, worker); return; }

        // Game objects
        if (type.startsWith("attr:"))    { await handleAttrMessage(msg, worker, context); return; }
        if (type === "flags:set")        { await handleFlagsMessage(msg, worker, context); return; }
        if (type === "util:target")      { await handleUtilTargetMessage(msg, worker, context); return; }
        if (type === "util:parseDesc")   { await handleUtilParseDescMessage(msg, worker); return; }
        if (type === "util:resolveFormat") {
          const { handleUtilResolveFormatMessage } = await import("./sandbox-handlers-format.ts");
          await handleUtilResolveFormatMessage(msg, worker);
          return;
        }
        if (type === "util:resolveFormatOr") {
          const { handleUtilResolveFormatOrMessage } = await import("./sandbox-handlers-format.ts");
          await handleUtilResolveFormatOrMessage(msg, worker);
          return;
        }
        if (type === "util:resolveGlobalFormat") {
          const { handleUtilResolveGlobalFormatMessage } = await import("./sandbox-handlers-format.ts");
          await handleUtilResolveGlobalFormatMessage(msg, worker);
          return;
        }
        if (type === "util:resolveGlobalFormatOr") {
          const { handleUtilResolveGlobalFormatOrMessage } = await import("./sandbox-handlers-format.ts");
          await handleUtilResolveGlobalFormatOrMessage(msg, worker);
          return;
        }
        if (type === "trigger:attr")     { await handleTriggerMessage(msg, worker, context); return; }
        if (type.startsWith("events:")) { await handleEventsMessage(msg, worker, context); return; }

        // Command execution + softcode evaluation
        if (type === "execute" || type === "force" || type === "force:as") {
          await handleForceMessage(msg, worker, context); return;
        }
        if (type.startsWith("eval:")) { await handleEvalMessage(msg, worker, context); return; }
      },
    );
  }

  kill(): Promise<void> {
    this.terminated = true;
    return Promise.resolve();
  }
}

export type SandboxInstance = Sandbox | LocalSandbox;

// ---------------------------------------------------------------------------
// SandboxService
// ---------------------------------------------------------------------------

export class SandboxService {
  private static instance: SandboxService;
  private pool: SandboxInstance[] = [];
  private readonly poolSize       = 5;
  private readonly defaultTimeout = 10_000;

  private constructor() {}

  static getInstance(): SandboxService {
    if (!SandboxService.instance) SandboxService.instance = new SandboxService();
    return SandboxService.instance;
  }

  async initPool(): Promise<void> {
    const needed = this.poolSize - this.pool.length;
    if (needed <= 0) return;
    const sandboxes = await Promise.all(
      Array.from({ length: needed }, () => this.createSandbox()),
    );
    this.pool.push(...sandboxes);
  }

  async createSandbox(_config?: ISandboxConfig): Promise<SandboxInstance> {
    const options: SandboxOptions = {};
    try {
      if (Deno.env.get("DENO_DEPLOY_TOKEN")) return await Sandbox.create(options);
    } catch (e) {
      console.warn("Failed to create Deno Sandbox, falling back to LocalSandbox:", e);
    }
    return new LocalSandbox();
  }

  getSandbox(): Promise<SandboxInstance> {
    const sandbox = this.pool.shift();
    if (sandbox) {
      this.initPool().catch(console.error);
      return Promise.resolve(sandbox);
    }
    return this.createSandbox();
  }

  async runScript(code: string, context: SDKContext, config?: ISandboxConfig): Promise<unknown> {
    const sandbox = await this.getSandbox();
    const timeout = config?.timeout || this.defaultTimeout;

    let execCode = _transpileCache.get(code);
    if (execCode === undefined) {
      let compiled: string;
      try {
        const { transform } = await import("npm:sucrase@3.35.0");
        compiled = transform(code, { transforms: ["typescript"] }).code;
        compiled = compiled.replace(/^import\s+.*?;?\s*$/gm, "");
      } catch (e) {
        console.warn("[Sandbox] Transpilation failed, stripping imports:", e);
        compiled = code.replace(/^import\s+.*?;?\s*$/gm, "");
      }
      if (_transpileCache.size >= _TRANSPILE_CACHE_MAX) _transpileCache.clear();
      _transpileCache.set(code, compiled);
      execCode = compiled;
    }

    const sdkData = SDKService.prepareSDK(context);
    let timeoutId: number | undefined;
    try {
      const result = await Promise.race([
        (sandbox as LocalSandbox).eval(execCode, { sdk: sdkData, context }),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("Script execution timed out")), timeout);
        }),
      ]);
      return result;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      await sandbox.kill();
    }
  }
}

export const sandboxService = SandboxService.getInstance();
