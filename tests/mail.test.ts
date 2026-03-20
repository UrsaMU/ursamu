import { assertEquals } from "@std/assert";
import mailScript from "../system/scripts/mail.ts";

Deno.test({
    name: "Mail Script",
    sanitizeResources: false,
    sanitizeOps: false,
    fn: async (t: Deno.TestContext) => {

    // Shared mail store across steps
    // deno-lint-ignore no-explicit-any
    const mails: any[] = [];

    await t.step("compose mail starts a draft", async () => {
        // deno-lint-ignore no-explicit-any
        let capturedDraft: any = null;
        const u = {
            me: { id: "1", flags: new Set(), state: {} },
            // New compose format: "target=subject"
            cmd: { name: "mail", args: ["Bob=Hello World"], switches: [] },
            util: { target: () => Promise.resolve({ id: "2", name: "Bob" }) },
            db: {
                // deno-lint-ignore no-explicit-any
                modify: (_id: string, _op: string, data: any) => {
                    capturedDraft = data["data.tempMail"];
                    return Promise.resolve();
                }
            },
            mail: {
                send: () => Promise.resolve(),
                read: () => Promise.resolve([]),
                delete: () => Promise.resolve(),
                modify: () => Promise.resolve(),
            },
            send: () => {},
            force: () => {}
        // deno-lint-ignore no-explicit-any
        } as any;

        await mailScript(u);
        assertEquals(capturedDraft !== null, true, "draft should have been saved");
        assertEquals(capturedDraft.subject, "Hello World");
        assertEquals(capturedDraft.message, "");
        assertEquals(capturedDraft.to, ["#2"]);
    });

    await t.step("read mail marks as read", async () => {
        // Pre-populate mails with one unread message
        mails.push({
            id: "m1",
            from: "#2",
            to: ["#1"],
            subject: "Hello World",
            message: "Test body",
            read: false,
            date: Date.now(),
        });

        // deno-lint-ignore no-explicit-any
        let markedRead = false;
        const u = {
            me: { id: "1", flags: new Set(), state: {} },
            // "1" resolves to subCmd "read" with subArgs "1"
            cmd: { name: "mail", args: ["1"], switches: [] },
            util: { target: () => Promise.resolve({ id: "2", name: "Bob" }) },
            db: { modify: () => Promise.resolve() },
            mail: {
                send: () => Promise.resolve(),
                // getMyMail calls read twice (to + cc); return mails on first, [] on second
                read: (() => {
                    let calls = 0;
                    // deno-lint-ignore no-explicit-any
                    return (_q: any) => {
                        calls++;
                        return Promise.resolve(calls === 1 ? mails : []);
                    };
                })(),
                delete: () => Promise.resolve(),
                // read case calls mail.modify to mark read:true
                // deno-lint-ignore no-explicit-any
                modify: (_q: any, _op: string, data: any) => {
                    if (data.read === true) {
                        mails[0].read = true;
                        markedRead = true;
                    }
                    return Promise.resolve();
                },
            },
            send: () => {},
            force: () => {}
        // deno-lint-ignore no-explicit-any
        } as any;

        await mailScript(u);
        assertEquals(markedRead, true, "mail should be marked as read");
        assertEquals(mails[0].read, true);
    });

    await t.step("delete mail", async () => {
         const u = {
            me: { id: "1", flags: new Set(), state: {} },
            cmd: { name: "mail", args: ["delete 1", "delete", "1"], switches: [] },
            util: { target: () => Promise.resolve({ id: "2", name: "Bob" }) },
            db: { modify: () => Promise.resolve() },
            mail: {
                send: () => Promise.resolve(),
                read: (() => {
                    let calls = 0;
                    // deno-lint-ignore no-explicit-any
                    return (_q: any) => {
                        calls++;
                        return Promise.resolve(calls === 1 ? [...mails] : []);
                    };
                })(),
                delete: (id: string) => {
                    const idx = mails.findIndex(m => m.id === id);
                    if (idx !== -1) mails.splice(idx, 1);
                    return Promise.resolve();
                },
                modify: () => Promise.resolve(),
            },
            send: () => {},
            force: () => {}
        // deno-lint-ignore no-explicit-any
        } as any;

        await mailScript(u);
        assertEquals(mails.length, 0);
    });

    },
});
