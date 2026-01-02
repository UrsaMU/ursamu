
const wsUrl = "ws://localhost:4203";
console.log(`Connecting to ${wsUrl}...`);

const ws = new WebSocket(wsUrl);

ws.onopen = () => {
  console.log("Connected!");
  
  // 0. Login/Create
  // Try to connect, if fail, create then connect.
  // Actually, for a clean test, we can just try to connect as a known test user, 
  // and if it fails (not verified easily here), we try create.
  // Or just always try create (might fail if exists) then connect.
  
  setTimeout(() => {
     ws.send(JSON.stringify({ msg: "create TestUser testpass" }));
     ws.send(JSON.stringify({ msg: "connect TestUser testpass" }));
  }, 100);

  // 1. Test JS
  setTimeout(() => {
    console.log("Sending JS test...");
    // Use 'think' because 'say' usually doesn't parse subs
    ws.send(JSON.stringify({ msg: "think JS Result: [js(10 * 10)]" }));
  }, 500);

  // 2. Test Map (Look)
  setTimeout(() => {
    console.log("Sending Look test...");
    ws.send(JSON.stringify({ msg: "look" }));
  }, 1000);

  // 3. Test @edit
  setTimeout(() => {
    console.log("Sending @edit test...");
    // Use 'me' because TestUser controls themselves
    ws.send(JSON.stringify({ msg: "@edit me/description" }));
  }, 1500);

  // Close after 3s
  setTimeout(() => {
    ws.close();
  }, 3000);
};

ws.onmessage = (e) => {
  const data = JSON.parse(e.data);
  if (data.msg) console.log("RX MSG:", data.msg); // Debug log
  
  if (data.msg) {
      if (data.msg.includes("Welcome back")) {
          console.log("PASS: Login verified.");
      }
      if (data.msg.includes("JS Result: 100")) {
          console.log("PASS: JS Execution verified.");
      }
      if (data.msg.includes("Edit Link:")) {
          console.log("PASS: @edit verified.");
      }
  }
  
  if (data.data?.map) {
      console.log("PASS: Map Data received.");
      console.log(`Node Count: ${data.data.map.nodes.length}`);
  }
};

ws.onerror = (e) => {
    console.error("WS Error:", e);
    Deno.exit(1);
}
