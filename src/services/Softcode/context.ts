/**
 * Bridge: re-exports softcode evaluator context types from @ursamu/mush.
 * The canonical definitions live in packages/mush/src/softcode/context.ts.
 */
export type {
  SoftcodeDbAccessor as DbAccessor,
  SoftcodeOutputAccessor as OutputAccessor,
  SoftcodeEvalContext as EvalContext,
} from "@ursamu/mush";

export { isTooDeep, isTimedOut, snapshotRegisters, restoreRegisters } from "@ursamu/mush";
