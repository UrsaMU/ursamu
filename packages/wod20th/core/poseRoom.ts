// core/poseRoom.ts -- third-person room narration helper.
// Sends `msg` to everyone in u.here EXCEPT the actor, who is expected to
// receive a first-person version via u.send. Safe no-op in test/mock SDKs
// where u.here.broadcast is absent.
// deno-lint-ignore no-explicit-any
export function poseRoom(u: any, msg: string): void {
  u?.here?.broadcast?.(msg, { exclude: [u?.me?.id] });
}
