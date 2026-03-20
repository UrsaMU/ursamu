
import { dbojs } from "../src/services/Database/index.ts";

console.log("Starting cleanup of nested 'obj' properties...");

const allObjs = await dbojs.all();
let count = 0;

for (const obj of allObjs) {
  // @ts-ignore: checking for valid property that shouldn't exist
  if (obj.obj) {
    console.log(`Fixing object ${obj.id} (${obj.data?.name || "unnamed"})...`);
    // @ts-ignore: deleting invalid property
    delete obj.obj;
    // update() replaces the whole object in KV, ensuring the deleted key is gone
    await dbojs.update({ id: obj.id }, obj);
    count++;
  }
}

console.log(`Cleanup complete. Fixed ${count} objects.`);
Deno.exit(0);
