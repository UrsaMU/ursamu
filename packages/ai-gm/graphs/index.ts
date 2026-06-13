// ─── Graph registry ───────────────────────────────────────────────────────────
//
// Builds all GM graphs once from a single model instance and exports them
// as a typed bundle. Call buildAllGraphs(model) in index.ts during init.

import type { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { buildPoseGraph } from "./pose.ts";
import { buildOracleGraph } from "./oracle.ts";
import { buildMoveGraph } from "./move.ts";
import { buildJobReviewGraph } from "./job-review.ts";
import { buildDowntimeGraph } from "./downtime.ts";
import { buildSessionGraph } from "./session.ts";
import { buildWorldEventGraph } from "./world-event.ts";
import { buildScenePageGraph } from "./scene-page.ts";
import { buildSceneSetGraph } from "./scene-set.ts";

export interface IGMGraphs {
  pose: ReturnType<typeof buildPoseGraph>;
  oracle: ReturnType<typeof buildOracleGraph>;
  move: ReturnType<typeof buildMoveGraph>;
  jobReview: ReturnType<typeof buildJobReviewGraph>;
  downtime: ReturnType<typeof buildDowntimeGraph>;
  session: ReturnType<typeof buildSessionGraph>;
  worldEvent: ReturnType<typeof buildWorldEventGraph>;
  scenePage: ReturnType<typeof buildScenePageGraph>;
  sceneSet: ReturnType<typeof buildSceneSetGraph>;
}

export function buildAllGraphs(model: ChatGoogleGenerativeAI): IGMGraphs {
  return {
    pose: buildPoseGraph(model),
    oracle: buildOracleGraph(model),
    move: buildMoveGraph(model),
    jobReview: buildJobReviewGraph(model),
    downtime: buildDowntimeGraph(model),
    session: buildSessionGraph(model),
    worldEvent: buildWorldEventGraph(model),
    scenePage: buildScenePageGraph(model),
    sceneSet: buildSceneSetGraph(model),
  };
}

export { type IPoseGraphInput, runPoseGraph } from "./pose.ts";
export {
  type IOracleGraphInput,
  type OracleProbability,
  runOracleGraph,
} from "./oracle.ts";
export { type IMoveGraphInput, runMoveGraph } from "./move.ts";
export { type IJobReviewGraphInput, runJobReviewGraph } from "./job-review.ts";
export { type IDowntimeGraphInput, runDowntimeGraph } from "./downtime.ts";
export { type ISessionGraphInput, runSessionGraph } from "./session.ts";
export {
  type IWorldEventGraphInput,
  runWorldEventGraph,
} from "./world-event.ts";
export { type IScenePageGraphInput, runScenePageGraph } from "./scene-page.ts";
export { type ISceneSetGraphInput, runSceneSetGraph } from "./scene-set.ts";
