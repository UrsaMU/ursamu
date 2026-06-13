import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockPlayer, mockU } from "./helpers/mockU.ts";
import { extendedExec } from "../src/commands/extended.ts";
import { jobs, type IJob } from "@ursamu/jobs-plugin";
import { createExtendedAction } from "../src/subsystems/extended.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const RUN_ID = crypto.randomUUID().slice(0, 8);
const U = (s: string) => `${s}-${RUN_ID}`;
const baseNum = Math.floor(Math.random() * 100000) + 10000;

async function seedJob(num: number, submittedBy: string): Promise<IJob> {
  const job: IJob = {
    id: `job-${num}`,
    number: num,
    title: `Job Title ${num}`,
    bucket: "CGEN",
    status: "new",
    submittedBy,
    submitterName: "Alice",
    description: "Job Description",
    comments: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await jobs.create(job);
  return job;
}

describe("Extended action /job switch", OPTS, () => {
  it("happy path: user rolls and posts results to their job", async () => {
    const jobNum = baseNum + 1;
    await seedJob(jobNum, U("player-1"));

    await createExtendedAction({
      ownerId: U("player-1"),
      ownerName: "Alice",
      roomId: U("room-1"),
      description: "Decipher the ancient runes",
      pool: "intelligence+occult",
      target: 5,
      maxRolls: 5,
    });

    const me = mockPlayer({
      id: U("player-1"),
      name: "Alice",
      state: {
        cofd: {
          attributes: { resolve: 2, composure: 2, intelligence: 3 },
          skills: { occult: 2 },
          advantages: { willpowerCurrent: 4, willpowerMax: 4 },
          template: "mortal",
          specialties: {},
          powers: {},
          conditions: [],
          tilts: [],
          health: { bashing: 0, lethal: 0, aggravated: 0 },
        },
      },
    });

    const u = mockU({
      me,
      args: [`roll/job=${jobNum}`, ""],
    });

    await extendedExec(u as unknown as Parameters<typeof extendedExec>[0]);

    // Verify it succeeded and printed lines
    const sent = u._sent.join("\n");
    assertStringIncludes(sent, `Posted roll results to Job #${jobNum}`);

    // Fetch the job and verify comment was appended
    const job = await jobs.findOne({ number: jobNum });
    assert(job, "job should be found");
    assertEquals(job.comments.length, 1);
    assertStringIncludes(job.comments[0].text, "Decipher the ancient runes");
    assertStringIncludes(job.comments[0].text, "Attempt #1");
  });

  it("fails if job does not exist", async () => {
    const jobNum = baseNum + 2; // Not seeded

    await createExtendedAction({
      ownerId: U("player-2"),
      ownerName: "Bob",
      roomId: U("room-1"),
      description: "Decipher the ancient runes",
      pool: "intelligence+occult",
      target: 5,
      maxRolls: 5,
    });

    const me = mockPlayer({
      id: U("player-2"),
      name: "Bob",
      state: {
        cofd: {
          attributes: { resolve: 2, composure: 2, intelligence: 3 },
          skills: { occult: 2 },
          advantages: { willpowerCurrent: 4, willpowerMax: 4 },
          template: "mortal",
          specialties: {},
          powers: {},
          conditions: [],
          tilts: [],
          health: { bashing: 0, lethal: 0, aggravated: 0 },
        },
      },
    });

    const u = mockU({
      me,
      args: [`roll/job=${jobNum}`, ""],
    });

    await extendedExec(u as unknown as Parameters<typeof extendedExec>[0]);

    const sent = u._sent.join("\n");
    assertStringIncludes(sent, `Job #${jobNum} not found`);
  });

  it("fails if user is not job owner and not staff", async () => {
    const jobNum = baseNum + 3;
    await seedJob(jobNum, U("player-other")); // Owned by player-other

    await createExtendedAction({
      ownerId: U("player-3"),
      ownerName: "Charlie",
      roomId: U("room-1"),
      description: "Decipher the ancient runes",
      pool: "intelligence+occult",
      target: 5,
      maxRolls: 5,
    });

    const me = mockPlayer({
      id: U("player-3"),
      name: "Charlie",
      state: {
        cofd: {
          attributes: { resolve: 2, composure: 2, intelligence: 3 },
          skills: { occult: 2 },
          advantages: { willpowerCurrent: 4, willpowerMax: 4 },
          template: "mortal",
          specialties: {},
          powers: {},
          conditions: [],
          tilts: [],
          health: { bashing: 0, lethal: 0, aggravated: 0 },
        },
      },
    });

    const u = mockU({
      me,
      args: [`roll/job=${jobNum}`, ""],
    });

    await extendedExec(u as unknown as Parameters<typeof extendedExec>[0]);

    const sent = u._sent.join("\n");
    assertStringIncludes(sent, "Permission denied. You cannot post to that job");
  });

  it("allows staff to post results to another player's job", async () => {
    const jobNum = baseNum + 4;
    await seedJob(jobNum, U("player-victim"));

    await createExtendedAction({
      ownerId: U("staff-1"),
      ownerName: "Wiz",
      roomId: U("room-1"),
      description: "Staff audit of the runes",
      pool: "intelligence+occult",
      target: 5,
      maxRolls: 5,
    });

    const me = mockPlayer({
      id: U("staff-1"),
      name: "Wiz",
      flags: new Set(["player", "connected", "admin"]),
      state: {
        cofd: {
          attributes: { resolve: 2, composure: 2, intelligence: 3 },
          skills: { occult: 2 },
          advantages: { willpowerCurrent: 4, willpowerMax: 4 },
          template: "mortal",
          specialties: {},
          powers: {},
          conditions: [],
          tilts: [],
          health: { bashing: 0, lethal: 0, aggravated: 0 },
        },
      },
    });

    const u = mockU({
      me,
      args: [`roll/job=${jobNum}`, ""],
    });

    await extendedExec(u as unknown as Parameters<typeof extendedExec>[0]);

    const sent = u._sent.join("\n");
    assertStringIncludes(sent, `Posted roll results to Job #${jobNum}`);

    const job = await jobs.findOne({ number: jobNum });
    assert(job, "job should be found");
    assertEquals(job.comments.length, 1);
    assertStringIncludes(job.comments[0].text, "Staff audit of the runes");
  });

  it("fails if job is closed", async () => {
    const jobNum = baseNum + 5;
    const seeded = await seedJob(jobNum, U("player-5"));
    seeded.status = "closed";
    await jobs.update({ id: seeded.id }, seeded);

    await createExtendedAction({
      ownerId: U("player-5"),
      ownerName: "Eve",
      roomId: U("room-1"),
      description: "Decipher the ancient runes",
      pool: "intelligence+occult",
      target: 5,
      maxRolls: 5,
    });

    const me = mockPlayer({
      id: U("player-5"),
      name: "Eve",
      state: {
        cofd: {
          attributes: { resolve: 2, composure: 2, intelligence: 3 },
          skills: { occult: 2 },
          advantages: { willpowerCurrent: 4, willpowerMax: 4 },
          template: "mortal",
          specialties: {},
          powers: {},
          conditions: [],
          tilts: [],
          health: { bashing: 0, lethal: 0, aggravated: 0 },
        },
      },
    });

    const u = mockU({
      me,
      args: [`roll/job=${jobNum}`, ""],
    });

    await extendedExec(u as unknown as Parameters<typeof extendedExec>[0]);

    const sent = u._sent.join("\n");
    assertStringIncludes(sent, `Job #${jobNum} is closed.`);
  });

  it("fails if job switch specifies no number", async () => {
    await createExtendedAction({
      ownerId: U("player-4"),
      ownerName: "Dave",
      roomId: U("room-1"),
      description: "Runes",
      pool: "intelligence+occult",
      target: 5,
      maxRolls: 5,
    });

    const me = mockPlayer({
      id: U("player-4"),
      name: "Dave",
      state: {
        cofd: {
          attributes: { resolve: 2, composure: 2, intelligence: 3 },
          skills: { occult: 2 },
          advantages: { willpowerCurrent: 4, willpowerMax: 4 },
          template: "mortal",
          specialties: {},
          powers: {},
          conditions: [],
          tilts: [],
          health: { bashing: 0, lethal: 0, aggravated: 0 },
        },
      },
    });

    const u = mockU({
      me,
      args: ["roll/job", ""],
    });

    await extendedExec(u as unknown as Parameters<typeof extendedExec>[0]);

    const sent = u._sent.join("\n");
    assertStringIncludes(sent, "Please specify a job number: /job=<number>");
  });
});
