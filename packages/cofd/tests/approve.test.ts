import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockU, mockPlayer } from "./helpers/mockU.ts";
import { approveExec, unapproveExec } from "../src/commands/approve.ts";
import { jobs, type IJob } from "@ursamu/jobs-plugin";
import type { CofdCgState } from "../src/chargen/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function fakeCgState(num: number): CofdCgState {
  return {
    stage: 6,
    sheet: {
      template: "Mortal",
      concept: "Test Subject",
      attributes: { strength: 2 },
      skills: {},
      specialties: {},
    } as unknown as CofdCgState["sheet"],
    isSubmitted: true,
    isApproved: false,
    submittedJob: num,
    submittedAt: Date.now(),
  };
}

async function seedJob(num: number, submittedBy: string): Promise<IJob> {
  const job: IJob = {
    id: `job-${num}`,
    number: num,
    title: `Chargen test job ${num}`,
    bucket: "CGEN",
    status: "new",
    submittedBy,
    submitterName: "Alice",
    description: "snapshot",
    comments: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await jobs.create(job);
  return job;
}

describe("+approve", OPTS, () => {
  it("copies submitted sheet, clears cg state, closes the job", async () => {
    const num = 9001;
    const target = mockPlayer({ id: "5", name: "Alice", state: { cofd_cg: fakeCgState(num) } });
    await seedJob(num, target.id);

    const me = mockPlayer({ id: "1", name: "Wiz", flags: new Set(["player", "connected", "admin"]) });
    const u = mockU({
      me,
      args: ["", "Alice=Welcome aboard."],
    });
    u.util.target = () => Promise.resolve(target);
    u.util.displayName = (o) => o.name ?? "Unknown";
    u.db.modify = (_id: string, op: string, data: Record<string, unknown>) => {
      if (op === "$set" && data["data.cofd"] !== undefined) target.state.cofd = data["data.cofd"];
      if (op === "$unset" && "data.cofd_cg" in data) delete target.state.cofd_cg;
      return Promise.resolve();
    };

    await approveExec(u);

    assertStringIncludes(u._sent.join("\n"), "Character Approved");
    assertEquals(target.state.cofd_cg, undefined);
    assertEquals((target.state.cofd as { concept: string }).concept, "Test Subject");

    const job = await jobs.findOne({ number: num });
    assertEquals(job?.status, "closed");
    assertEquals(job?.comments.length, 1);
    assertStringIncludes(job!.comments[0].text, "Welcome aboard");
  });

  it("refuses when no submitted job exists", async () => {
    const target = mockPlayer({ id: "6", name: "Bob", state: {} });
    const u = mockU({ me: mockPlayer({ id: "1", name: "Wiz" }), args: ["", "Bob"] });
    u.util.target = () => Promise.resolve(target);
    u.util.displayName = (o) => o.name ?? "Unknown";

    await approveExec(u);
    assertStringIncludes(u._sent.join("\n"), "no submitted character");
  });

  it("refuses when target is not found", async () => {
    const u = mockU({ args: ["", "Ghost"] });
    u.util.target = () => Promise.resolve(undefined);
    await approveExec(u);
    assertStringIncludes(u._sent.join("\n"), "No player matches");
  });
});

describe("+unapprove", OPTS, () => {
  it("reopens job, posts staff comment, clears submittedJob marker", async () => {
    const num = 9002;
    const target = mockPlayer({ id: "7", name: "Carol", state: { cofd_cg: fakeCgState(num) } });
    await seedJob(num, target.id);

    const me = mockPlayer({ id: "1", name: "Wiz" });
    const u = mockU({ me, args: ["", "Carol=Concept too thin."] });
    u.util.target = () => Promise.resolve(target);
    u.util.displayName = (o) => o.name ?? "Unknown";
    u.db.modify = (_id: string, op: string, data: Record<string, unknown>) => {
      if (op === "$set" && data["data.cofd_cg"] !== undefined) {
        target.state.cofd_cg = data["data.cofd_cg"];
      }
      return Promise.resolve();
    };

    await unapproveExec(u);

    assertStringIncludes(u._sent.join("\n"), "Character Returned");
    const cg = target.state.cofd_cg as CofdCgState;
    assertEquals(cg.submittedJob, undefined);
    assertEquals(cg.sheet.concept, "Test Subject");

    const job = await jobs.findOne({ number: num });
    assertEquals(job?.status, "open");
    assertStringIncludes(job!.comments[0].text, "Concept too thin");
  });

  it("refuses without a reason", async () => {
    const target = mockPlayer({ id: "8", name: "Dave", state: { cofd_cg: fakeCgState(9003) } });
    const u = mockU({ args: ["", "Dave"] });
    u.util.target = () => Promise.resolve(target);

    await unapproveExec(u);
    assertStringIncludes(u._sent.join("\n"), "reason is required");
  });
});
