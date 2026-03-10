import { assertEquals } from "@std/assert";
import { IUrsamuSDK } from "../src/@types/UrsamuSDK.ts";

Deno.test({
  name: "Look Command - Refined Dbref Display Format",
  fn: async () => {
    // 1. Create a target room mock
    const room = {
      id: "9",
      flags: new Set(["room"]),
      state: { name: "Child Room", description: "You see nothing special." },
      location: "0",
      contents: []
    };

    // 2. Mock a player who can edit the room
    const player = {
      id: "player1",
      flags: new Set(["player"]),
      state: { name: "Player1" },
      contents: []
    };

    // 3. Prepare SDK mock
    const sdkData = {
      me: player,
      here: room,
      target: room,
      util: {
        // deno-lint-ignore no-explicit-any
        displayName: (o: any) => o.state?.name || o.name || "Unknown"
      }
    };

    let sentMessage = "";
    const mockU = {
        send: (msg: string) => { sentMessage = msg; },
        // deno-lint-ignore no-explicit-any
        ui: { panel: (opt: any) => opt, layout: () => {} },
        ...sdkData,
        canEdit: () => true
    };

    const { default: lookScript } = await import("../system/scripts/look.ts");
    await lookScript(mockU as unknown as IUrsamuSDK);

    console.log("Sent Message (Refined):", sentMessage);
    assertEquals(sentMessage.includes("Child Room(#9)"), true, "Should include Child Room(#9)");
    assertEquals(sentMessage.includes("Room(#9) Child Room"), false, "Should NOT include the old format Room(#9) Child Room");

    // 4. Test Non-Editable remains unchanged
    sentMessage = "";
    const mockU2 = {
        send: (msg: string) => { sentMessage = msg; },
        // deno-lint-ignore no-explicit-any
        ui: { panel: (opt: any) => opt, layout: () => {} },
        ...sdkData,
        canEdit: () => false
    };
    await lookScript(mockU2 as unknown as IUrsamuSDK);
    console.log("Sent Message (Non-Editable):", sentMessage);
    assertEquals(sentMessage.includes("Child Room(#9)"), false, "Should NOT include (#9) for non-editable");
    assertEquals(sentMessage.includes("Child Room"), true, "Should still include the name Child Room");
  },
  sanitizeResources: false,
  sanitizeOps: false
});
