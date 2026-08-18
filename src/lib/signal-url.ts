import { ok, err, type Ok, type Err } from './text-result.js';

export type SignalUrlCode =
  | 'not_a_string'
  | 'too_many_bytes'
  | 'unparseable'
  | 'bad_protocol'
  | 'bad_host'
  | 'has_credentials'
  | 'has_port'
  | 'has_query'
  | 'has_path'
  | 'bad_fragment';

/**
 * Raw byte cap applied before the URL is parsed, so hostile input never
 * reaches the parser or the fragment regex. A legitimate invite is under
 * 160 bytes; 512 leaves generous room.
 */
const MAX_BYTES = 512;

const ALLOWED_PROTOCOL = 'https:';
const ALLOWED_HOSTNAME = 'signal.group';

/**
 * Flat character class, one bounded quantifier, no nesting, no alternation,
 * no backreferences. Anchoring alone does not prevent catastrophic
 * backtracking; the shape of the pattern does.
 */
const FRAGMENT_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const encoder = new TextEncoder();

/**
 * Validates a Signal group invite URL by parsing it with the WHATWG URL
 * constructor and then allowlisting every normalized component.
 *
 * Schemes are allowlisted, never denylisted: the URL parser strips tabs and
 * newlines out of the scheme, so `java<TAB>script:` parses as `javascript:`
 * and slips past any literal-string denylist.
 *
 * On success, `.value` is the normalized `u.href` WITH the fragment intact.
 * Signal carries the invite key in the fragment specifically so it is never
 * transmitted to a server; stripping it destroys the invite.
 */
export function validateSignalUrl(input: unknown): Ok<string> | Err<SignalUrlCode> {
  if (typeof input !== 'string') {
    return err('not_a_string');
  }

  if (encoder.encode(input).length > MAX_BYTES) {
    return err('too_many_bytes');
  }

  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return err('unparseable');
  }

  if (u.protocol !== ALLOWED_PROTOCOL) {
    return err('bad_protocol');
  }

  // Exact equality. `endsWith` accepts evilsignal.group; `startsWith` accepts
  // signal.group.evil.com; either would accept www.signal.group.
  if (u.hostname !== ALLOWED_HOSTNAME) {
    return err('bad_host');
  }

  if (u.username !== '' || u.password !== '') {
    return err('has_credentials');
  }

  // WHATWG URL normalizes an explicit DEFAULT port (:443 for https, :80 for
  // http) to an empty `u.port`, so `u.port` alone would wave through
  // `signal.group:443`. The design forbids ANY explicit port, default or not,
  // so also inspect the raw authority. By this point host is exactly
  // `signal.group` (never IPv6) and there are no credentials, so any ':'
  // remaining in the authority is a port separator. Isolate the authority the
  // way the URL parser does: drop the scheme, strip the leading slashes /
  // backslashes the parser tolerates for special schemes, cut at the first
  // path/query/fragment delimiter, then drop any userinfo before the '@'.
  let authority = input.slice(input.indexOf(':') + 1).replace(/^[/\\]+/, '');
  const authorityEnd = authority.search(/[/\\?#]/);
  if (authorityEnd !== -1) {
    authority = authority.slice(0, authorityEnd);
  }
  const at = authority.lastIndexOf('@');
  if (at !== -1) {
    authority = authority.slice(at + 1);
  }
  if (u.port !== '' || authority.includes(':')) {
    return err('has_port');
  }

  if (u.search !== '') {
    return err('has_query');
  }

  // The parser normalizes a bare origin to a pathname of '/'.
  if (u.pathname !== '/') {
    return err('has_path');
  }

  // `u.hash` is '' both when there is no '#' and when the '#' is followed by
  // nothing. Both are missing invite keys and both fail the pattern below.
  const fragment = u.hash.startsWith('#') ? u.hash.slice(1) : u.hash;
  if (!FRAGMENT_PATTERN.test(fragment)) {
    return err('bad_fragment');
  }

  return ok(u.href);
}
