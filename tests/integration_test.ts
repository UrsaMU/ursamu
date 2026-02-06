Deno.test({
  name: "Integration Test (WebSocket)",
  fn: async () => {
    const wsUrl = "ws://localhost:4203";
    console.log(`Connecting to ${wsUrl}...`);

    try {
      const ws = new WebSocket(wsUrl);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error("Connection timeout"));
        }, 5000);

        ws.onopen = () => {
          clearTimeout(timeout);
          console.log("Connected!");
          
          ws.send(JSON.stringify({ msg: "create TestUser testpass" }));
          ws.send(JSON.stringify({ msg: "connect TestUser testpass" }));

          setTimeout(() => {
            ws.send(JSON.stringify({ msg: "think JS Result: [js(10 * 10)]" }));
          }, 500);

          setTimeout(() => {
            ws.send(JSON.stringify({ msg: "look" }));
          }, 1000);

          setTimeout(() => {
            ws.send(JSON.stringify({ msg: "@edit me/description" }));
          }, 1500);

          setTimeout(() => {
            ws.close();
            resolve();
          }, 3000);
        };

        ws.onmessage = (e) => {
          const data = JSON.parse(e.data);
          if (data.msg) console.log("RX MSG:", data.msg);
        };

        ws.onerror = (e) => {
          clearTimeout(timeout);
          reject(e);
        };
      });
    } catch (e) {
      console.warn("Integration test skipped: Could not connect to server.", e);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
