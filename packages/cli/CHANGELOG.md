# Changelog

## 0.1.5

- New games pin `@ursamu/mush@1.0.38` and
  `@ursamu/core@1.0.5` (engine release).
- Dual-package import-map overrides so plugin range
  rewrites share one mush/core instance.
- Scaffold peers: pglite, zod, bcrypt, mushcode ^0.7,
  help/register, dotenv.
- `minimumDependencyAge: "0"` in game `deno.json` so
  brand-new JSR versions resolve immediately.
- `server` / `telnet` / `run.sh` pass
  `--minimum-dependency-age=0`.
- Drop fragile `./node_modules/@types/node` types path.

## 0.1.4

- Prior release.
