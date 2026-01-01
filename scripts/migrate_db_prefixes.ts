import { existsSync } from "@std/fs";

const DB_PATH = "data/ursamu.db";

if (!existsSync(DB_PATH)) {
  console.log("No database found at data/ursamu.db. Skipping migration.");
  Deno.exit(0);
}

const kv = await Deno.openKv(DB_PATH);

const MIGRATIONS = [
  { old: "data/counters.db", new: "counters" },
  { old: "data/chans.db", new: "chans" },
  { old: "data/mail.db", new: "mail" },
  { old: "data/bboard.db", new: "bboard" },
];

console.log("Starting database migration...");

for (const migration of MIGRATIONS) {
  const oldPrefix = migration.old.replace(".", "_");
  const newPrefix = migration.new;

  console.log(`Migrating ${oldPrefix} -> ${newPrefix}...`);

  let count = 0;
  const entries = kv.list({ prefix: [oldPrefix] });
  
  for await (const entry of entries) {
    // The key structure is [prefix, id]
    // We want to verify it matches our expectation
    if (entry.key[0] !== oldPrefix) continue;

    const id = entry.key[1];
    const newKey = [newPrefix, id];
    
    // Set the new key with the same value
    await kv.set(newKey, entry.value);
    
    // Delete the old key
    await kv.delete(entry.key);
    
    count++;
  }
  
  console.log(`Migrated ${count} entries for ${migration.new}.`);
}

console.log("Migration complete.");
