import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mailDb, type IMail } from "@ursamu/mail";
import { mockU, mockPlayer } from "./helpers/mockU.ts";
import { approveExec, denyExec } from "../src/commands/approve.ts";
import { sendCofdMail } from "../src/integrations/mail.ts";
import { jobs, type IJob } from "@ursamu/jobs";
import type { CofdCgState } from "../src/chargen/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function fakeCgState(num: number): CofdCgState {
  return {
    stage: 6,
    sheet: { template: "Mortal", concept: "x", attributes: {}, skills: {}, specialties: {} } as unknown as CofdCgState["sheet"],
    isSubmitted: true,
    isApproved: false,
    submittedJob: num,
    submittedAt: Date.now(),
  };
}

async function seedJob(num: number): Promise<IJob> {
  const job: IJob = {
    id: `job-${num}`, number: num,
    title: `Chargen ${num}`, bucket: "CGEN", status: "new",
    submittedBy: "tgt", submitterName: "Test",
    description: "x", comments: [],
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await jobs.create(job);
  return job;
}

describe("mail integration", OPTS, () => {
  it("sendCofdMail inserts a well-formed message", async () => {
    const to = `mail-unit-${crypto.randomUUID()}`;
    await sendCofdMail({ to, subject: "Test subject", body: "Test body." });
    const all = await mailDb.find({});
    const inbox = all.filter(m => Array.isArray(m.to) && m.to.includes(to));
    assertEquals(inbox.length, 1);
    assertEquals(inbox[0].from, "#0");
    assertEquals(inbox[0].subject, "Test subject");
    assertEquals(inbox[0].message, "Test body.");
    assertEquals(inbox[0].read, false);
    assertEquals(inbox[0].folder, "inbox");
  });

  it("approve calls the mail path (visible in player notification)", async () => {
    const num = 7001;
    const target = mockPlayer({ id: `tgt-approve-${crypto.randomUUID()}`, name: "Eve", state: { cofd_cg: fakeCgState(num) } });
    await seedJob(num);

    const u = mockU({ me: mockPlayer({ id: "wiz", name: "Wiz" }), args: ["", "Eve=Welcome."] });
    u.util.target = () => Promise.resolve(target);
    u.util.displayName = (o) => o.name ?? "?";
    u.db.modify = () => Promise.resolve();

    await approveExec(u);
    assertStringIncludes(u._sent.join("\n"), "approved by Wiz");
  });

  it("deny calls the mail path (visible in player notification)", async () => {
    const num = 7002;
    const target = mockPlayer({
      id: `tgt-deny-${crypto.randomUUID()}`,
      name: "Frank",
      state: { cofd_cg: fakeCgState(num) },
    });
    await seedJob(num);

    const u = mockU({
      me: mockPlayer({ id: "wiz", name: "Wiz" }),
      args: ["", "Frank=Too thin."],
    });
    u.util.target = () => Promise.resolve(target);
    u.util.displayName = (o) => o.name ?? "?";
    u.db.modify = () => Promise.resolve();

    await denyExec(u);
    assertStringIncludes(
      u._sent.join("\n"),
      "returned for revision by Wiz",
    );
    assertStringIncludes(u._sent.join("\n"), "Too thin.");
  });

  it("approve works with no job at all", async () => {
    const target = mockPlayer({
      id: `tgt-approve-noj-${crypto.randomUUID()}`,
      name: "Gina",
      state: {
        cofd_cg: {
          stage: 6,
          sheet: {
            template: "Mortal",
            concept: "x",
            attributes: {},
            skills: {},
            specialties: {},
          },
          isSubmitted: false,
          isApproved: false,
        },
      },
    });
    const u = mockU({
      me: mockPlayer({ id: "wiz", name: "Wiz" }),
      args: ["", "Gina"],
    });
    u.util.target = () => Promise.resolve(target);
    u.util.displayName = (o) => o.name ?? "?";
    u.db.modify = () => Promise.resolve();

    await approveExec(u);
    assertStringIncludes(u._sent.join("\n"), "approved by Wiz");
  });
});
