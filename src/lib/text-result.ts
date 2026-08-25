/**
 * Result type shared by every validator in the events calendar.
 *
 * Validators return a Result instead of throwing so callers can run several
 * checks in a row and branch on `.ok` without exception control flow. The
 * failure member carries a machine-readable `code` (never a display string) so
 * the caller decides the wording.
 */

export type Ok<T> = { ok: true; value: T };

export type Err<C extends string> = { ok: false; code: C };

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

export const err = <C extends string>(code: C): Err<C> => ({ ok: false, code });
