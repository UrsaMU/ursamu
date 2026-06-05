export function isStaff(f: Set<string> | string): boolean {
  const s = typeof f === "string" ? f : Array.from(f).join(" ");
  return /wizard|admin|superuser/i.test(s);
}
