import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["lock", "unlock"];

export default async (u: IUrsamuSDK) => {
  const _cmd = u.cmd.original?.toLowerCase() || u.cmd.name.toLowerCase();
  const _rawInput = (u.cmd.args[0] || ""); // "obj=key" or "swtch obj=key" handling
  
  // Regex to parse: lock[/switch] target=key
  // But cmdParser separates args.
  // If user typed `@lock/use target=key`, 
  // Intent: lock, Args: ["target=key"]? No, parser splits by space? 
  // Let's re-verify cmdParser logic.
  // "lock/use target=key" -> intent: lock, args: ["target=key"] if valid?
  // Actually cmdParser splits by space.
  // If @lock/use is typed:
  // intentName = "@lock/use" -> parts[0].
  // scriptName = "lock" (from systemAliases or map?)
  // Wait, legacy parser handled /switches. 
  // My new parser logic: `const intentName = parts[0].toLowerCase();`.
  // If I type `@lock/use`, intentName is `@lock/use`.
  // Does `system/scripts/lock.ts` get called?
  // `aliasMap` has `"l": "look"`.
  // `scriptName = aliasMap[intentName] || intentName`. 
  // If `intentName` is `lock/use`, `scriptName` is `lock/use`.
  // Filesystem check: `./system/scripts/lock/use.ts`? No.
  // I need to handle switches in `cmdParser` or in the script logic?
  // MUX usually treats `/switch` as part of the command name or a switch.
  // `cmdParser` in `src/services/commands/cmdParser.ts` does NOT strip switches by default for system scripts.
  // It only strips `@` prefix.
  // So `@lock/use` becomes `lock/use`.
  // The script `lock.ts` won't be found unless I alias `lock/use` to `lock`.
  
  // Implementation decision:
  // I should update `cmdParser` to split intent by `/` and pass the switch, OR
  // I should register aliases for common switches.
  // Given the current parser, it looks for exact match or alias.
  // I will add aliases for `lock/use` etc in the `aliases` export of this file.
  // And I'll parse the switch from `u.cmd.original`.
  
  const original = u.cmd.original?.toLowerCase() || "";
  const parts = original.split("/");
  const switchName = parts.length > 1 ? parts[1] : "";
  const isUnlock = original.startsWith("unlock") || original.startsWith("@unlock");

  // Parse args: target=key
  // `lock target=key` -> args: ["target=key"] or ["target", "=", "key"] depending on spaces?
  // shell style splitting?
  // `cmdParser` splits by `/\s+/`.
  // So `lock target=key` -> args: ["target=key"]
  // `lock target = key` -> args: ["target", "=", "key"]
  // We should join back and split by first `=`
  
  const fullArgs = (u.cmd.args[0] || "");
  const [targetName, key] = fullArgs.split("=");
  
  const target = await u.util.target(u.me, targetName?.trim());
  if (!target) return u.send("I can't find that.");

  if (!(await u.canEdit(u.me, target))) return u.send("Permission denied.");

  const type = switchName || "basic"; // default lock

  if (isUnlock) {
     // Unlock
     if (type === "basic") {
         target.state.lock = "";
         await u.db.modify(target.id, "$set", { "data.lock": "" });
         u.send(`Unlocked ${target.name}.`);
     } else {
         const locks = (target.state.locks || {}) as Record<string, string>;
         delete locks[type];
         target.state.locks = locks;
         await u.db.modify(target.id, "$set", { "data.locks": locks });
         u.send(`Unlocked ${target.name} (${type}).`);
     }
  } else {
     // Lock
     if (!key) return u.send("You must specify a key.");
     
     // Validate lock string?
     // We need to validate if possible. 
     // `u.checkLock` evaluates, but doesn't strictly validate syntax unless we expose a validator.
     // For now, accept it.
     
     if (type === "basic") {
         target.state.lock = key.trim();
         await u.db.modify(target.id, "$set", { "data.lock": key.trim() });
         u.send(`Locked ${target.name}.`);
     } else {
         const locks = (target.state.locks || {}) as Record<string, string>;
         locks[type] = key.trim();
         target.state.locks = locks;
         await u.db.modify(target.id, "$set", { "data.locks": locks });
         u.send(`Locked ${target.name} (${type}).`);
     }
  }
};
