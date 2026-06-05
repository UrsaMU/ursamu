export function isWizard(f: Set<string> | string): boolean {
  const s = typeof f === "string" ? f : Array.from(f).join(" ");
  return /wizard|superuser/i.test(s);
}
