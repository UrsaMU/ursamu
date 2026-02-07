import { assertEquals } from "@std/assert";
import mailScript from "../system/scripts/mail.ts";

Deno.test({
    name: "Mail Script",
    sanitizeResources: false,
    sanitizeOps: false,
    fn: async (t: Deno.TestContext) => {
    
    const mails: any[] = [];

    await t.step("send mail (oneliner)", async () => {
        const u = {
            me: { id: "1", flags: new Set(), state: { } },
            cmd: { name: "mail", args: ["Bob Subject = Body", "Bob", "Subject", "=", "Body"] }, // Mocking varied args, actually raw string is args[0]
            util: { target: () => Promise.resolve({ id: "2", name: "Bob" }) },
            db: { modify: () => Promise.resolve() },
            mail: {
                send: (m: any) => { mails.push({...m, id: "m1", from: "#1"}); return Promise.resolve(); },
                read: () => Promise.resolve(mails),
                delete: () => Promise.resolve()
            },
            send: () => {},
            force: () => {}
        } as any;
        
        await mailScript(u);
        assertEquals(mails.length, 1);
        assertEquals(mails[0].subject, "Subject");
        assertEquals(mails[0].message, "Body");
    });

    await t.step("read mail (smart)", async () => {
         const u = {
            me: { id: "1", flags: new Set(), state: {} },
            cmd: { name: "mail", args: ["1", "1"] }, // args[0]="1", args[1]="1"
            util: { target: () => Promise.resolve({ id: "2", name: "Bob" }) },
            db: { modify: () => Promise.resolve() },
            mail: {
                send: (m: any) => { 
                    const idx = mails.findIndex(old => old.id === m.id);
                    if (idx !== -1) mails[idx] = m;
                    return Promise.resolve(); 
                },
                read: () => Promise.resolve(mails),
                delete: () => Promise.resolve()
            },
            send: (msg: string) => {
                 if (msg.includes("Subject:")) assertEquals(true, true);
            },
            force: () => {}
        } as any;
        
        await mailScript(u);
        assertEquals(mails[0].read, true);
    });
    
    await t.step("delete mail", async () => {
         const u = {
            me: { id: "1", flags: new Set(), state: {} },
            cmd: { name: "mail", args: ["delete 1", "delete", "1"] },
            util: { target: () => Promise.resolve({ id: "2", name: "Bob" }) },
            db: { modify: () => Promise.resolve() },
            mail: {
                send: () => Promise.resolve(),
                read: () => Promise.resolve(mails),
                delete: (id: string) => {
                    const idx = mails.findIndex(m => m.id === id);
                    if (idx !== -1) mails.splice(idx, 1);
                    return Promise.resolve();
                }
            },
            send: () => {},
            force: () => {}
        } as any;
        
        await mailScript(u);
        assertEquals(mails.length, 0);
    });

    },
});
