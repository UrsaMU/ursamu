/**
 * @module @ursamu/ursamu
 *
 * Backwards-compatibility shim. All exports now come from @ursamu/mush,
 * which re-exports everything from @ursamu/core.
 *
 * New projects should import from "@ursamu/mush" directly.
 *
 * @example
 * ```ts
 * // Legacy — still works
 * import { mu } from "@ursamu/ursamu";
 *
 * // Preferred
 * import { mu } from "@ursamu/mush";
 * ```
 */

export * from "@ursamu/mush";
