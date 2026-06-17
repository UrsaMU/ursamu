/**
 * @module sandbox
 *
 * Manages sandboxed script execution for UrsaMU game scripts.
 * Uses short-lived Deno Workers via runInWorker(). Message handler
 * logic lives in the handlers/ companion modules.
 */
import type { SDKContext } from "./sdk-service.ts";
import { SDKService } from "./sdk-service.ts";
import { runInWorker } from "./worker-runner.ts";
import {
  handleSend, handleBroadcast, handleNotify, handleRoomBroadcast,
  handlePatch, handleTeleport, emitResultHooks,
} from "./handlers/output.ts";
import { handleDbMessage, handleAuthMessage } from "./handlers/db.ts";
import { handleSysMessage, handleTextMessage } from "./handlers/sys.ts";
import { handleChanMessage } from "./handlers/chan.ts";
import {
  handleAttrMessage, handleFlagsMessage, handleUtilTargetMessage,
  handleUtilParseDescMessage, handleTriggerMessage, handleEventsMessage,
} from "./handlers/objects.ts";
import { handleForceMessage, handleEvalMessage } from "./handlers/exec.ts";

// ---------------------------------------------------------------------------
// Transpile cache
// ---------------------------------------------------------------------------

const _transpileCache = new Map<string, string>();
const _TRANSPILE_CACHE_MAX = 200;

// ---------------------------------------------------------------------------
// Scoped DB update helper
// ---------------------------------------------------------------------------

export async function scopedUpdate(id: string, fields: Record<string, unknown>): Promise<void> {
  const { dbojs } = await import("../world/dbobjs.ts");
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

        if (type === "result") {
          emitResultHooks(msg.data, context)
            .catch(e => console.error("[GameHooks] emit error:", e));
          resolve(msg.data);
          return;
        }
        if (type === "error")  { reject(new Error(String(msg.data))); return; }
        if (type === "patch")  { handlePatch(msg, context); return; }

        if (type === "send")           { handleSend(msg, context); return; }
        if (type === "notify")         { handleNotify(msg, worker); return; }
        if (type === "broadcast")      { handleBroadcast(msg); return; }
        if (type === "room:broadcast") { await handleRoomBroadcast(msg); return; }
        if (type === "teleport")       { handleTeleport(msg, context); return; }

        if (type.startsWith("db:") || type === "lock:check") {
          await handleDbMessage(msg, worker, context); return;
        }
        if (type.startsWith("auth:")) { await handleAuthMessage(msg, worker, context); return; }

        if (type.startsWith("sys:"))  { await handleSysMessage(msg, worker, context); return; }
        if (type.startsWith("chan:")) { await handleChanMessage(msg, worker, context); return; }
        if (type.startsWith("text:")) { await handleTextMessage(msg, worker); return; }

        if (type.startsWith("attr:"))    { await handleAttrMessage(msg, worker, context); return; }
        if (type === "flags:set")        { await handleFlagsMessage(msg, worker, context); return; }
        if (type === "util:target")      { await handleUtilTargetMessage(msg, worker, context); return; }
        if (type === "util:parseDesc")   { await handleUtilParseDescMessage(msg, worker); return; }

        if (type === "util:resolveFormat") {
          const { handleUtilResolveFormatMessage } = await import("./handlers/format.ts");
          await handleUtilResolveFormatMessage(msg, worker);
          return;
        }
        if (type === "util:resolveFormatOr") {
          const { handleUtilResolveFormatOrMessage } = await import("./handlers/format.ts");
          await handleUtilResolveFormatOrMessage(msg, worker);
          return;
        }
        if (type === "util:resolveGlobalFormat") {
          const { handleUtilResolveGlobalFormatMessage } = await import("./handlers/format.ts");
          await handleUtilResolveGlobalFormatMessage(msg, worker);
          return;
        }
        if (type === "util:resolveGlobalFormatOr") {
          const { handleUtilResolveGlobalFormatOrMessage } = await import("./handlers/format.ts");
          await handleUtilResolveGlobalFormatOrMessage(msg, worker);
          return;
        }

        if (type === "trigger:attr")     { await handleTriggerMessage(msg, worker, context); return; }
        if (type.startsWith("events:")) { await handleEventsMessage(msg, worker, context); return; }

        if (type === "execute" || type === "force" || type === "force:as") {
          await handleForceMessage(msg, worker, context); return;
        }
        if (type.startsWith("eval:")) { await handleEvalMessage(msg, worker, context); return; }

        const customHandler = SandboxService.getRpcHandler(type);
        if (customHandler) {
          try {
            const out = await customHandler(msg, worker, context);
            if (msg.msgId !== undefined) {
              worker.postMessage({ type: "response", msgId: msg.msgId, data: out });
            }
          } catch (e: unknown) {
            console.error(`[Sandbox] Dynamic RPC handler failed for "${type}":`, e);
            if (msg.msgId !== undefined) {
              worker.postMessage({ type: "response", msgId: msg.msgId, data: { error: String(e) } });
            }
          }
          return;
        }
      },
    );
  }

  kill(): Promise<void> {
    this.terminated = true;
    return Promise.resolve();
  }
}

export type SandboxRpcHandler = (msg: unknown, worker: Worker, context?: SDKContext) => Promise<unknown> | unknown;

// ---------------------------------------------------------------------------
// SandboxService
// ---------------------------------------------------------------------------

export class SandboxService {
  private static instance: SandboxService;
  private static rpcHandlers = new Map<string, SandboxRpcHandler>();

  static registerRpcHandler(type: string, handler: SandboxRpcHandler): void {
    this.rpcHandlers.set(type, handler);
  }

  static getRpcHandler(type: string): SandboxRpcHandler | undefined {
    return this.rpcHandlers.get(type);
  }

  private pool: LocalSandbox[] = [];
  private readonly poolSize       = 5;
  private readonly defaultTimeout = 10_000;

  private constructor() {}

  static getInstance(): SandboxService {
    if (!SandboxService.instance) SandboxService.instance = new SandboxService();
    return SandboxService.instance;
  }

  initPool(): void {
    const needed = this.poolSize - this.pool.length;
    if (needed <= 0) return;
    for (let i = 0; i < needed; i++) this.pool.push(new LocalSandbox());
  }

  getSandbox(): LocalSandbox {
    const sandbox = this.pool.shift();
    if (sandbox) {
      this.initPool();
      return sandbox;
    }
    return new LocalSandbox();
  }

  async runScript(code: string, context: SDKContext, config?: { timeout?: number }): Promise<unknown> {
    const sandbox = this.getSandbox();
    const timeout = config?.timeout || this.defaultTimeout;

    let execCode = _transpileCache.get(code);
    if (execCode === undefined) {
      let compiled: string;
      try {
        const { transform } = await import("npm:sucrase@3.35.0");
        compiled = transform(code, { transforms: ["typescript"] }).code;
        compiled = compiled.replace(/^import\s+.*?;?\s*$/gm, "");
      } catch (e: unknown) {
        console.warn("[Sandbox] Transpilation failed, stripping imports:", e);
        compiled = code.replace(/^import\s+.*?;?\s*$/gm, "");
      }
      if (_transpileCache.size >= _TRANSPILE_CACHE_MAX) _transpileCache.clear();
      _transpileCache.set(code, compiled);
      execCode = compiled;
    }

    const sdkData = SDKService.prepareSDK(context);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        sandbox.eval(execCode, { sdk: sdkData, context }),
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

export const sandboxService: SandboxService = SandboxService.getInstance();
