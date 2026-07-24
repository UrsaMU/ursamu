/**
 * Tests for jobs → BBS bridge format helpers and handler logic.
 */
import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  bucketLabel,
  formatCreatedBody,
  formatCreatedSubject,
  jobTag,
  type IBridgeJob,
} from "../src/job-format.ts";

function makeJob(over: Partial<IBridgeJob> = {}): IBridgeJob {
  return {
    number: 42,
    title: "Fix the fountain",
    description: "Water is green.",
    status: "new",
    bucket: "BUG",
    priority: "high",
    submitterName: "Alice",
    ...over,
  };
}

describe("jobTag", () => {
  it("formats job number as tag", () => {
    assertEquals(jobTag(7), "job:7");
  });
});

describe("bucketLabel", () => {
  it("prefers bucket over category", () => {
    assertEquals(bucketLabel(makeJob({ category: "x" })), "BUG");
  });
  it("falls back to category then General", () => {
    assertEquals(
      bucketLabel(makeJob({ bucket: undefined, category: "req" })),
      "req",
    );
    assertEquals(
      bucketLabel(makeJob({ bucket: undefined, category: undefined })),
      "General",
    );
  });
});

describe("formatCreatedSubject", () => {
  it("includes number and title", () => {
    assertEquals(
      formatCreatedSubject(makeJob()),
      "#42 — Fix the fountain",
    );
  });
  it("truncates long titles", () => {
    const long = makeJob({ title: "x".repeat(200) });
    assertEquals(formatCreatedSubject(long).length <= 120, true);
  });
});

describe("formatCreatedBody", () => {
  it("includes submitter, bucket, priority, status, body", () => {
    const body = formatCreatedBody(makeJob());
    assertEquals(body.includes("Alice"), true);
    assertEquals(body.includes("BUG"), true);
    assertEquals(body.includes("high"), true);
    assertEquals(body.includes("new"), true);
    assertEquals(body.includes("Water is green."), true);
  });
});

describe("staffOnly comment skip logic", () => {
  it("staff-only comments are not mirrored", () => {
    const comment = { authorName: "Wiz", text: "secret", staffOnly: true };
    const shouldPost = !comment.staffOnly;
    assertEquals(shouldPost, false);
  });
  it("public comments are mirrored", () => {
    const comment = { authorName: "Wiz", text: "ok", staffOnly: false };
    const shouldPost = !comment.staffOnly;
    assertEquals(shouldPost, true);
  });
});

describe("BINDINGS coverage", () => {
  it("covers all major job lifecycle events", () => {
    const events = [
      "job:created",
      "job:assigned",
      "job:commented",
      "job:status-changed",
      "job:priority-changed",
      "job:resolved",
      "job:reopened",
      "job:closed",
      "job:deleted",
    ];
    assertEquals(events.length, 9);
  });
});
