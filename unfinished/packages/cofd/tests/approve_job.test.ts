// Unit tests for CGEN job complete/comment helpers.

import {
  assertEquals,
  assert,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  jobs,
  jobArchive,
  jobHooks,
  type IJob,
} from "@ursamu/jobs";
import {
  findCgenJob,
  completeCgenJob,
  commentCgenJob,
} from "../src/commands/approve_job.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

async function seed(
  overrides: Partial<IJob> & { number: number },
): Promise<IJob> {
  const job: IJob = {
    id: `job-${overrides.number}`,
    number: overrides.number,
    title: "Chargen test",
    bucket: "CGEN",
    status: "new",
    submittedBy: "42",
    submitterName: "Alice",
    description: "snap",
    comments: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
  await jobs.create(job);
  return job;
}

describe("findCgenJob", OPTS, () => {
  it("matches number stored as number", async () => {
    const n = 77001;
    await seed({ number: n, submittedBy: "p1" });
    const j = await findCgenJob(n, "p1");
    assertEquals(j?.number, n);
  });

  it("matches when caller passes string job number", async () => {
    const n = 77002;
    await seed({ number: n, submittedBy: "p2" });
    const j = await findCgenJob(String(n), "p2");
    assertEquals(j?.number, n);
  });

  it("matches player id with or without #", async () => {
    const n = 77003;
    await seed({ number: n, submittedBy: "99" });
    assertEquals((await findCgenJob(undefined, "#99"))?.number, n);
    assertEquals((await findCgenJob(undefined, "99"))?.number, n);
  });

  it("matches when job stored submittedBy with #", async () => {
    const n = 77004;
    await seed({ number: n, submittedBy: "#77" });
    assertEquals((await findCgenJob(undefined, "77"))?.number, n);
  });
});

describe("completeCgenJob", OPTS, () => {
  it("archives and removes a new CGEN job", async () => {
    const n = 77101;
    await seed({ number: n, submittedBy: "a1" });
    const r = await completeCgenJob(n, "a1", "s1", "Wiz", "ok");
    assertEquals(r.completed, true);
    assertEquals(r.number, n);

    const active = await jobs.find({});
    assertEquals(
      active.some((j) => Number(j.number) === n),
      false,
    );
    const arch = await jobArchive.find({});
    const a = arch.find((j) => Number(j.number) === n);
    assert(a, "archived");
    assertEquals(a!.status, "closed");
    assert(
      a!.comments.some((c) => c.text.includes("Approved by Wiz")),
    );
  });

  it("emits job:commented then job:closed for the BBS bridge", async () => {
    const n = 77110;
    await seed({ number: n, submittedBy: "hook1" });
    const events: string[] = [];
    const onComment = () => {
      events.push("commented");
    };
    const onClosed = () => {
      events.push("closed");
    };
    jobHooks.on("job:commented", onComment);
    jobHooks.on("job:closed", onClosed);
    try {
      const r = await completeCgenJob(
        n,
        "hook1",
        "s1",
        "Wiz",
        "Welcome",
      );
      assertEquals(r.completed, true);
      assertEquals(events, ["commented", "closed"]);
    } finally {
      jobHooks.off("job:commented", onComment);
      jobHooks.off("job:closed", onClosed);
    }
  });

  it("finds by player when job number is wrong type string", async () => {
    const n = 77102;
    await seed({ number: n, submittedBy: "a2" });
    // Simulate cgState.submittedJob coming back as string
    const r = await completeCgenJob(
      String(n) as unknown as number,
      "a2",
      "s1",
      "Wiz",
      "",
    );
    assertEquals(r.completed, true);
  });

  it("finds open CGEN by #player when number missing", async () => {
    const n = 77103;
    await seed({ number: n, submittedBy: "55" });
    const r = await completeCgenJob(
      undefined,
      "#55",
      "s1",
      "Wiz",
      "",
    );
    assertEquals(r.completed, true);
    assertEquals(r.number, n);
  });
});

describe("commentCgenJob", OPTS, () => {
  it("adds comment and flips new → open", async () => {
    const n = 77201;
    await seed({ number: n, submittedBy: "b1", status: "new" });
    const r = await commentCgenJob(
      n,
      "b1",
      "s1",
      "Wiz",
      "Fix concept.",
    );
    assertEquals(r.commented, true);
    const job = (await jobs.find({})).find(
      (j) => Number(j.number) === n,
    );
    assert(job);
    assertEquals(job!.status, "open");
    assert(
      job!.comments.some((c) =>
        c.text.includes("Denied by Wiz")
      ),
    );
  });
});
