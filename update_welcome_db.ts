const dbPath = "./data/ursamu.db";
const kv = await Deno.openKv(dbPath);
const text = await Deno.readTextFile("./text/welcome.md");

const key = ["server.texts", "welcome"];
const entry = {
  id: "welcome",
  content: text,
};

await kv.set(key, entry);
console.log("Updated welcome text in DB.");
Deno.exit(0);
