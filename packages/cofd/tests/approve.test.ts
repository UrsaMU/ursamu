import {
  assertEquals,
  assertStringIncludes,
  assert,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockU, mockPlayer } from "./helpers/mockU.ts";
import {
  approveExec,
  denyExec,
  unapproveExec,
} from "../src/commands/approve.ts";
import {
  jobs,
  jobArchive,
  type IJob,
} from "@ursamu/jobs";
import type { CofdCgState } from "../src/chargen/index.ts";
import { mailDb, type IMail } from "@ursamu/mail";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function fakeCgState(
  opts: { job?: number } = {},
): CofdCgState {
  return {
    stage: 6,
    sheet: {
      template: "Mortal",
      concept: "Test Subject",
      attributes: { strength: 2 },
      skills: {},
      specialties: {},
    } as unknown as CofdCgState["sheet"],
    isSubmitted: opts.job != null,
    isApproved: false,
    submittedJob: opts.job,
    submittedAt: opts.job != null ? Date.now() : undefined,
  };
}

async function seedJob(
  num: number,
  submittedBy: string,
): Promise<IJob> {
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

function wireDb(
  target: ReturnType<typeof mockPlayer>,
  u: ReturnType<typeof mockU>,
) {
  u._store.put(target);
  u.util.target = () => Promise.resolve(target);
  u.util.displayName = (o) => o.name ?? "Unknown";
  u.db.modify = (
    _id: string,
    op: string,
    data: Record<string, unknown>,
  ) => {
    if (op === "$set" && data["data.cofd"] !== undefined) {
      target.state.cofd = data["data.cofd"];
    }
    if (op === "$set" && data["data.cofd_cg"] !== undefined) {
      target.state.cofd_cg = data["data.cofd_cg"];
    }
    if (op === "$set" && data["data.home"] !== undefined) {
      target.state.home = data["data.home"];
    }
    if (op === "$unset" && "data.cofd_cg" in data) {
      delete target.state.cofd_cg;
    }
    return Promise.resolve();
  };
  u.setFlags = async (t: string | { id: string; flags?: Set<string> }, fl: string) => {
    const id = typeof t === "string" ? t : t.id;
    if (id !== target.id) return;
    for (const part of fl.split(/\s+/)) {
      if (part.startsWith("!")) target.flags.delete(part.slice(1));
      else target.flags.add(part);
    }
  };
}

describe("+approve", OPTS, () => {
  it("promotes draft, completes job, sends + mails player", async () => {
    const num = 9101;
    const target = mockPlayer({
      id: "tgt-apr-1",
      name: "Alice",
      state: { cofd_cg: fakeCgState({ job: num }) },
    });
    await seedJob(num, target.id);
    const u = mockU({
      me: mockPlayer({
        id: "wiz1",
        name: "Wiz",
        flags: new Set(["player", "connected", "admin"]),
      }),
      args: ["", "Alice=Welcome aboard."],
    });
    wireDb(target, u);

    await approveExec(u);

    const all = u._sent.join("\n");
    assertStringIncludes(all, "Character Approved");
    assertStringIncludes(all, `job #${num} completed`);
    // Live notify to player
    assertStringIncludes(all, "approved by Wiz");
    assertStringIncludes(all, "Welcome aboard");

    assertEquals(target.state.cofd_cg, undefined);
    assertEquals(
      (target.state.cofd as { concept: string }).concept,
      "Test Subject",
    );
    assertEquals(target.flags.has("approved"), true);

    // Active queue emptied; archived as closed.
    const active = await jobs.find({});
    assertEquals(
      active.some((j) => j.number === num),
      false,
    );
    const archived = await jobArchive.find({});
    const arch = archived.find((j) => j.number === num);
    assert(arch, "job should be in archive");
    assertEquals(arch!.status, "closed");
    assert(
      arch!.comments.some((c) =>
        c.text.includes("Approved by Wiz")
      ),
      "approval comment on archived job",
    );

    // @mail delivered
    const mails = await mailDb.find({});
    const inbox = mails.filter(
      (m) =>
        Array.isArray(m.to) && m.to.includes(target.id),
    );
    assert(inbox.length >= 1, "expected @mail");
    assertStringIncludes(inbox[0].subject, "approved");
    assertStringIncludes(inbox[0].message, "Welcome aboard");
  });

  it("still approves when no job exists", async () => {
    const target = mockPlayer({
      id: "tgt-apr-2",
      name: "Bob",
      state: { cofd_cg: fakeCgState() },
    });
    const u = mockU({
      me: mockPlayer({ id: "wiz2", name: "Wiz" }),
      args: ["", "Bob"],
    });
    wireDb(target, u);

    await approveExec(u);

    assertStringIncludes(
      u._sent.join("\n"),
      "Character Approved",
    );
    assertEquals(target.state.cofd_cg, undefined);
    assertStringIncludes(
      u._sent.join("\n"),
      "approved by Wiz",
    );
  });

  it("finds open CGEN job by player when number missing", async () => {
    const num = 9102;
    const target = mockPlayer({
      id: "tgt-apr-3",
      name: "Cara",
      // Draft without submittedJob link
      state: { cofd_cg: fakeCgState() },
    });
    await seedJob(num, target.id);
    const u = mockU({
      me: mockPlayer({ id: "wiz3", name: "Wiz" }),
      args: ["", "Cara"],
    });
    wireDb(target, u);

    await approveExec(u);

    const archived = await jobArchive.find({});
    assert(
      archived.some((j) => j.number === num),
      "should complete player-owned CGEN job",
    );
  });

  it("grants fae flag for changeling template", async () => {
    const cg = fakeCgState();
    (cg.sheet as { template: string }).template = "changeling";
    const target = mockPlayer({
      id: "ctl5",
      name: "Pix",
      state: { cofd_cg: cg },
    });
    const u = mockU({
      me: mockPlayer({
        id: "1",
        name: "Wiz",
        flags: new Set(["player", "connected", "admin"]),
      }),
      args: ["", "Pix"],
    });
    wireDb(target, u);

    await approveExec(u);
    assertEquals(target.flags.has("fae"), true);
  });

  it("refuses when no chargen draft exists", async () => {
    const target = mockPlayer({
      id: "6",
      name: "Bob",
      state: {},
    });
    const u = mockU({
      me: mockPlayer({ id: "1", name: "Wiz" }),
      args: ["", "Bob"],
    });
    u.util.target = () => Promise.resolve(target);
    u.util.displayName = (o) => o.name ?? "Unknown";

    await approveExec(u);
    assertStringIncludes(
      u._sent.join("\n"),
      "no chargen draft",
    );
  });

  it("refuses when target is not found", async () => {
    const u = mockU({ args: ["", "Ghost"] });
    u.util.target = () => Promise.resolve(undefined);
    await approveExec(u);
    assertStringIncludes(
      u._sent.join("\n"),
      "No player matches",
    );
  });
});

describe("+deny", OPTS, () => {
  it("comments open job, keeps it open, send + mail", async () => {
    const num = 9201;
    const target = mockPlayer({
      id: "tgt-deny-1",
      name: "Carol",
      state: { cofd_cg: fakeCgState({ job: num }) },
    });
    await seedJob(num, target.id);

    const u = mockU({
      me: mockPlayer({ id: "wiz-d1", name: "Wiz" }),
      args: ["", "Carol=Concept too thin."],
    });
    wireDb(target, u);

    await denyExec(u);

    const all = u._sent.join("\n");
    assertStringIncludes(all, "Character Denied");
    assertStringIncludes(all, `job #${num}`);
    assertStringIncludes(all, "returned for revision by Wiz");
    assertStringIncludes(all, "Concept too thin");

    const cg = target.state.cofd_cg as CofdCgState;
    assertEquals(cg.isSubmitted, false);
    // Job number kept so resubmit updates same ticket
    assertEquals(cg.submittedJob, num);
    assertEquals(cg.sheet.concept, "Test Subject");

    const job = (await jobs.find({})).find(
      (j) => j.number === num,
    );
    assert(job, "job stays in active queue");
    assertEquals(job!.status, "open");
    assert(
      job!.comments.some((c) =>
        c.text.includes("Denied by Wiz") &&
        c.text.includes("Concept too thin")
      ),
      "deny comment on open job",
    );
    // Not archived
    const archived = await jobArchive.find({});
    assertEquals(
      archived.some((j) => j.number === num),
      false,
    );

    const mails = await mailDb.find({});
    const inbox = mails.filter(
      (m) =>
        Array.isArray(m.to) && m.to.includes(target.id),
    );
    assert(inbox.length >= 1, "expected @mail");
    assertStringIncludes(inbox[0].subject, "denied");
    assertStringIncludes(
      inbox[0].message,
      "Concept too thin",
    );
  });

  it("works without a job", async () => {
    const target = mockPlayer({
      id: "tgt-deny-2",
      name: "Dana",
      state: { cofd_cg: fakeCgState() },
    });
    const u = mockU({
      me: mockPlayer({ id: "wiz-d2", name: "Wiz" }),
      args: ["", "Dana=Fix attributes."],
    });
    wireDb(target, u);

    await denyExec(u);

    assertStringIncludes(
      u._sent.join("\n"),
      "Character Denied",
    );
    assertStringIncludes(
      u._sent.join("\n"),
      "returned for revision by Wiz",
    );
    const cg = target.state.cofd_cg as CofdCgState;
    assertEquals(cg.sheet.concept, "Test Subject");
  });

  it("refuses without a reason", async () => {
    const target = mockPlayer({
      id: "8",
      name: "Dave",
      state: { cofd_cg: fakeCgState() },
    });
    const u = mockU({ args: ["", "Dave"] });
    u.util.target = () => Promise.resolve(target);

    await denyExec(u);
    assertStringIncludes(
      u._sent.join("\n"),
      "reason is required",
    );
  });

  it("+unapprove is an alias for +deny", async () => {
    const target = mockPlayer({
      id: "9",
      name: "Eve",
      state: { cofd_cg: fakeCgState() },
    });
    const u = mockU({
      me: mockPlayer({ id: "1", name: "Wiz" }),
      args: ["", "Eve=Needs work."],
    });
    wireDb(target, u);

    await unapproveExec(u);
    assertStringIncludes(
      u._sent.join("\n"),
      "Character Denied",
    );
  });
});
