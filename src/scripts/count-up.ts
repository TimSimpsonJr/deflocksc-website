/**
 * Shared count-up animation.
 *
 * Generalized from the action modal's original `animateCount` (design §6) so
 * every stat on the homepage — the impact band, the legislation ask-frame, and
 * the map statline — animates through one code path. The exact formatting of
 * the final value is preserved through every frame: comma grouping ("1,624")
 * and any trailing suffix ("110+", "422M+") are carried the whole way.
 *
 * Accessibility + no-JS contract:
 *  - The FINAL value is what ships in the DOM markup, so assistive tech and
 *    no-JS visitors always see the real number.
 *  - Each animated element gets a stable `aria-label` of its final value, so AT
 *    never reads a partial or zeroed count while the animation runs.
 *  - Values are reset to 0 ONLY when the animation will actually run (an
 *    IntersectionObserver was constructed and reduced motion is not set). Under
 *    reduced motion, or where IntersectionObserver is unavailable, the final
 *    value stays exactly as authored — it is never zeroed.
 */

export interface CountUpFormat {
  /** Numeric target, commas stripped. */
  value: number;
  /** Trailing non-digit text to re-append every frame, e.g. "+", "M+". */
  suffix: string;
  /** Whether the source used comma grouping, so it can be restored. */
  comma: boolean;
}

export interface CountUpOptions {
  /** Animation length in ms (default 1200). */
  duration?: number;
  /** IntersectionObserver visibility threshold (default 0.4). */
  threshold?: number;
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Parse "1,624" / "110+" / "422M+" / "0" into a value plus its formatting. */
export function parseStat(text: string): CountUpFormat | null {
  const match = String(text).trim().match(/^([\d,]+)(.*)$/);
  if (!match) return null;
  const value = parseInt(match[1].replace(/,/g, ''), 10);
  if (Number.isNaN(value)) return null;
  return { value, suffix: match[2] ?? '', comma: match[1].includes(',') };
}

/** Render a (possibly fractional, mid-animation) number in the target's format. */
export function formatStat(n: number, fmt: CountUpFormat): string {
  const rounded = Math.round(n);
  return (fmt.comma ? rounded.toLocaleString('en-US') : String(rounded)) + fmt.suffix;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

function ensureLabel(el: HTMLElement, fmt: CountUpFormat): void {
  if (!el.hasAttribute('aria-label')) {
    el.setAttribute('aria-label', formatStat(fmt.value, fmt));
  }
}

function runCountUp(el: HTMLElement, fmt: CountUpFormat, duration: number): void {
  const start = performance.now();
  function tick(now: number): void {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // cubic ease-out
    el.textContent = formatStat(fmt.value * eased, fmt);
    if (progress < 1) requestAnimationFrame(tick);
    else el.textContent = formatStat(fmt.value, fmt); // land exactly on target
  }
  requestAnimationFrame(tick);
}

/**
 * Animate a single element from 0 to its parsed value immediately, without an
 * observer — for elements already on screen, such as the action modal's
 * freshly-rendered stat line. The element's current textContent is read as the
 * final value, so the markup must already hold the real number (the a11y /
 * no-JS contract). Honors reduced motion (jumps straight to final).
 */
export function countUpNow(el: HTMLElement, options: CountUpOptions = {}): void {
  const fmt = parseStat(el.textContent ?? '');
  if (!fmt) return;
  ensureLabel(el, fmt);
  if (prefersReducedMotion()) {
    el.textContent = formatStat(fmt.value, fmt);
    return;
  }
  el.textContent = formatStat(0, fmt);
  runCountUp(el, fmt, options.duration ?? 1200);
}

/**
 * Wire a set of stat elements to count up the first time each scrolls into
 * view. Each element's current textContent is read as the final value, so the
 * markup must already contain the real number (the a11y / no-JS contract).
 */
export function observeCountUps(
  elements: Iterable<Element> | ArrayLike<Element>,
  options: CountUpOptions = {},
): void {
  const tracked = new Map<HTMLElement, CountUpFormat>();
  for (const el of Array.from(elements)) {
    if (!(el instanceof HTMLElement)) continue;
    const fmt = parseStat(el.textContent ?? '');
    if (!fmt) continue;
    ensureLabel(el, fmt);
    tracked.set(el, fmt);
  }
  if (tracked.size === 0) return;

  const canAnimate = !prefersReducedMotion() && typeof IntersectionObserver !== 'undefined';
  if (!canAnimate) {
    // Leave the final value exactly as authored — never zero it.
    for (const [el, fmt] of tracked) el.textContent = formatStat(fmt.value, fmt);
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        const fmt = tracked.get(el);
        obs.unobserve(el);
        if (fmt) runCountUp(el, fmt, options.duration ?? 1200);
      }
    },
    { threshold: options.threshold ?? 0.4, rootMargin: '0px 0px -40px 0px' },
  );

  // Reset each element to 0 only once it is successfully being observed, so a
  // failure to observe leaves the final value visible instead of stranded at 0.
  for (const [el, fmt] of tracked) {
    observer.observe(el);
    el.textContent = formatStat(0, fmt);
  }
}
