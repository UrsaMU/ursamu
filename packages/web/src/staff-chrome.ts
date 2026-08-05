/**
 * Live push of staff chrome (top nav + side nav) to admin WS.
 *
 * Registries call notifyStaffChrome() after changes. admin-ws wires
 * the notifier to broadcastAdmin with a full chrome snapshot.
 */

type NotifyFn = () => void;

let _notify: NotifyFn | null = null;
let _timer: number | null = null;

/**
 * Wire once hub is ready. Typically:
 *   setStaffChromeNotifier(() => broadcastAdmin({
 *     type: "staff:chrome",
 *     staffNav: listStaffNav(),
 *     staffSideNav: listStaffSideNav(),
 *   }));
 */
export function setStaffChromeNotifier(fn: NotifyFn | null): void {
  _notify = fn;
}

/** @deprecated use setStaffChromeNotifier */
export function setStaffChromePusher(fn: NotifyFn | null): void {
  setStaffChromeNotifier(fn);
}

/** Debounced notify (coalesces burst registers at boot). */
export function notifyStaffChrome(): void {
  if (!_notify) return;
  if (_timer != null) clearTimeout(_timer);
  _timer = setTimeout(() => {
    _timer = null;
    _notify?.();
  }, 30) as unknown as number;
}

/** Test helper — run pending notify immediately. */
export function flushStaffChrome(): void {
  if (_timer != null) {
    clearTimeout(_timer);
    _timer = null;
  }
  _notify?.();
}

export type StaffChromeMsg = {
  type: "staff:chrome";
  staffNav: unknown;
  staffSideNav: unknown;
};
