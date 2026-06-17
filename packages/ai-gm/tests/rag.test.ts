import { assert, assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { cosineSimilarity } from "../rag.ts";

describe("RAG Vector Utilities", () => {
  it("computes cosine similarity correctly", () => {
    const v1 = [1, 0, 0];
    const v2 = [1, 0, 0];
    assertEquals(cosineSimilarity(v1, v2), 1.0);

    const v3 = [0, 1, 0];
    assertEquals(cosineSimilarity(v1, v3), 0.0);

    const v4 = [1, 1, 0]; // 45 degrees
    const sim = cosineSimilarity(v1, v4);
    assert(Math.abs(sim - 0.7071) < 0.001);
  });

  it("returns 0 for mismatched vector lengths", () => {
    assertEquals(cosineSimilarity([1, 2], [1, 2, 3]), 0.0);
  });
});
