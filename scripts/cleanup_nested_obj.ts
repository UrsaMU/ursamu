
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
    await dbojs.modify({ id: obj.id }, "$set", obj);
    // @ts-ignore: ensure field is removed (modify $set merges, but if we delete it from data passed... wait. 
    // $set merges. To delete a key, we usually need $unset or to replace the whole object.
    // Our DBO implementation: $set uses Object.assign. 
    // It does NOT support $unset or field deletion via $set easily if the key is missing in the update.
    // But wait, our DBO update:
    // const updated = { ...item }; Object.assign(updated, data);
    // If 'data' is 'obj' (the cleaned one), and 'obj' does NOT have 'obj' property...
    // 'updated' (copy of item) STILL HAS 'obj' property!
    // Object.assign(target, source) overwrites. It doesn't delete if missing in source.
    
    // We need to use a different approach for deletion or replace the object.
    
    // Let's use kv.set directly or check if DBO supports replace.
    // DBO.update replaces the whole object?
    // src/services/Database/database.ts:
    // async update(_query: Query<T>, data: T) { ... await cv.set(..., plainData); }
    // Yes, update replaces.
    
    await dbojs.update({ id: obj.id }, obj);
    count++;
  }
}

console.log(`Cleanup complete. Fixed ${count} objects.`);
Deno.exit(0);
