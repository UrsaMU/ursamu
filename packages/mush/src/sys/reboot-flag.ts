/**
 * Process-local flag: true while main is exiting for soft-reboot (75).
 * Presence/channel hooks skip connect+disconnect noise for that teardown.
 */

let _reboot = false;

export function markSoftReboot(): void {
  _reboot = true;
}

export function isSoftReboot(): boolean {
  return _reboot;
}
