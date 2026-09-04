import { assertEquals, assertMatch, assertStringIncludes } from "@std/assert";
import {
  execLangPose,
  execLangSay,
  installSpeechCmds,
  restoreSpeechCmds,
} from "../src/speech.ts";
import { mockPlayer, mockU } from "./helpers/mockU.ts";
import { cmds } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test(
  "execLangSay: no active language broadcasts clear",
  OPTS,
  async () => {
  const broadcast: string[] = [];
  const u = mockU({
    args: ["Hello there"],
    me: { state: {} },
  });
  (u.here as { broadcast: (m: string) => void }).broadcast = (m) => {
    broadcast.push(m);
  };

  await execLangSay(u);

  assertEquals(
    (u as unknown as { _sent: string[] })._sent.length,
    0,
  );
  assertEquals(broadcast.length, 1);
  assertStringIncludes(broadcast[0], 'says, "Hello there"');
  },
);

Deno.test(
  "execLangSay: active language tags speaker output",
  OPTS,
  async () => {
    const listener = mockPlayer({
      id: "listener1",
      name: "Listener",
      flags: new Set(["player", "connected"]),
      state: { languages: { known: {} } },
    });
    const sentTo: Record<string, string[]> = {};
    const u = mockU({
      args: ["Testing."],
      me: {
        id: "speaker1",
        name: "Speaker",
        state: { languages: { active: "spanish", known: { spanish: 100 } } },
      },
    });
    u.here.contents = [u.me, listener];
    u.send = (m: string, target?: string) => {
      const key = target ?? "self";
      (sentTo[key] ??= []).push(m);
      (u as unknown as { _sent: string[] })._sent.push(m);
    };

    await execLangSay(u);

    const self = sentTo["self"] ?? [];
    assertEquals(self.length, 1);
    assertEquals(self[0], 'You say in spanish, "Testing."');

    const toListener = sentTo["listener1"] ?? [];
    assertEquals(toListener.length, 1);
    assertMatch(toListener[0], /Speaker says in spanish, "/);
    // Listener has 0 skill — text should not be the clear original.
    assertEquals(toListener[0].includes('"Testing."'), false);
  },
);

Deno.test(
  "execLangSay: skill-100 listener hears clear text",
  OPTS,
  async () => {
    const listener = mockPlayer({
      id: "listener2",
      name: "Fluent",
      flags: new Set(["player", "connected"]),
      state: {
        languages: { known: { spanish: 100 } },
      },
    });
    const sentTo: Record<string, string[]> = {};
    const u = mockU({
      args: ["Hola amigo"],
      me: {
        id: "speaker2",
        name: "Speaker",
        state: { languages: { active: "spanish", known: { spanish: 100 } } },
      },
    });
    u.here.contents = [u.me, listener];
    u.send = (m: string, target?: string) => {
      const key = target ?? "self";
      (sentTo[key] ??= []).push(m);
    };

    await execLangSay(u);

    assertEquals(
      sentTo["listener2"]?.[0],
      'Speaker says in spanish, "Hola amigo"',
    );
  },
);

Deno.test(
  "execLangPose: garbles only quoted spans",
  OPTS,
  async () => {
    const listener = mockPlayer({
      id: "listener3",
      name: "L",
      flags: new Set(["player", "connected"]),
      state: { languages: { known: {} } },
    });
    const sentTo: Record<string, string[]> = {};
    const u = mockU({
      args: ['growls and says "Leave now." coldly.'],
      me: {
        id: "speaker3",
        name: "Wolf",
        state: {
          languages: {
            active: "first-tongue",
            known: { "first-tongue": 100 },
          },
        },
      },
    });
    u.here.contents = [u.me, listener];
    u.cmd.original = ':growls and says "Leave now." coldly.';
    u.send = (m: string, target?: string) => {
      const key = target ?? "self";
      (sentTo[key] ??= []).push(m);
    };

    await execLangPose(u);

    assertEquals(
      sentTo["self"]?.[0],
      'Wolf growls and says "Leave now." coldly.',
    );
    const heard = sentTo["listener3"]?.[0] ?? "";
    assertStringIncludes(heard, "Wolf growls and says ");
    assertStringIncludes(heard, " coldly.");
    assertEquals(heard.includes('"Leave now."'), false);
  },
);

Deno.test("installSpeechCmds replaces stock say/pose once", OPTS, () => {
  // Seed fake stock cmds
  restoreSpeechCmds();
  const before = cmds.length;
  cmds.push(
    {
      name: "say",
      pattern: /^say/i,
      exec: () => {},
    },
    {
      name: "pose",
      pattern: /^pose/i,
      exec: () => {},
    },
  );
  installSpeechCmds();
  const says = cmds.filter((c) => c.name === "say");
  const poses = cmds.filter((c) => c.name === "pose");
  assertEquals(says.length, 1);
  assertEquals(poses.length, 1);
  // help mentions language
  assertStringIncludes(says[0].help ?? "", "active language");

  installSpeechCmds(); // idempotent
  assertEquals(cmds.filter((c) => c.name === "say").length, 1);

  restoreSpeechCmds();
  // cleaned back to whatever was stock (our fakes)
  assertEquals(cmds.filter((c) => c.name === "say").length, 1);
  // remove fakes we pushed
  for (let i = cmds.length - 1; i >= before; i--) {
    if (cmds[i]?.name === "say" || cmds[i]?.name === "pose") {
      cmds.splice(i, 1);
    }
  }
});
