// Site-wide copy-feedback toast: a neutral daisyUI `.alert` inside the fixed
// `.toast` container in Base.astro. Replaces the per-button "Copied!" text
// swaps. One toast at a time; auto-dismisses. All DOM is built with safe DOM
// methods; the class strings are complete literals on purpose — Tailwind 4
// scans this file for them (class-parity rule).
//
// A11y: the container in Base.astro is the PERSISTENT live region
// (role="status" aria-live="polite"). We only empty/refill it — a
// newly-inserted element carrying role=status is not reliably announced by
// screen readers, so the injected alert itself carries no role.

const SVG_NS = 'http://www.w3.org/2000/svg';

function checkIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'h-6 w-6 shrink-0 stroke-current');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('d', 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z');
  svg.appendChild(path);
  return svg;
}

function errorIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'h-6 w-6 shrink-0 stroke-current');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-width', '2');
  // Heroicons outline exclamation-circle, matching checkIcon's check-circle style.
  path.setAttribute('d', 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z');
  svg.appendChild(path);
  return svg;
}

let hideTimer: number | undefined;

export function showToast(message: string, opts?: { icon?: 'success' | 'error' }): void {
  const container = document.getElementById('app-toast');
  if (!container) return;
  const alert = document.createElement('div');
  alert.className = 'alert border-white/25';
  const span = document.createElement('span');
  span.textContent = message;
  alert.append(opts?.icon === 'error' ? errorIcon() : checkIcon(), span);
  container.replaceChildren(alert);
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    container.replaceChildren();
  }, 2400);
}
