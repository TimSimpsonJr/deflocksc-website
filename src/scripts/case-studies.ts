/**
 * Case studies card interactions: overlay panels + Card 2 asymmetric hover.
 */

// --- Overlays ---

const cards = document.querySelectorAll('.cs-card');
const backdrop = document.getElementById('overlayBackdrop');
const overlayPanels = document.querySelectorAll('.overlay-panel');
const closeBtns = document.querySelectorAll('.overlay-close');
let previouslyFocused: Element | null = null;

function trapFocus(e: KeyboardEvent) {
  if (e.key !== 'Tab') return;
  const panel = e.currentTarget as HTMLElement;
  const focusable = panel.querySelectorAll(
    'button, a[href], [tabindex]:not([tabindex="-1"])'
  ) as NodeListOf<HTMLElement>;
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

cards.forEach(card => {
  card.addEventListener('click', () => {
    previouslyFocused = document.activeElement;
    const idx = card.getAttribute('data-overlay');
    overlayPanels.forEach(p => {
      p.classList.remove('active');
      p.removeEventListener('keydown', trapFocus);
    });
    const panel = document.querySelector(`[data-overlay-panel="${idx}"]`);
    panel?.classList.add('active');
    backdrop?.classList.add('active');
    document.body.style.overflow = 'hidden';
    const closeBtn = panel?.querySelector('.overlay-close') as HTMLElement;
    closeBtn?.focus();
    panel?.addEventListener('keydown', trapFocus);
  });

  // Enter/Space opens overlay
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });
});

function closeOverlay() {
  backdrop?.classList.remove('active');
  overlayPanels.forEach(p => {
    p.classList.remove('active');
    p.removeEventListener('keydown', trapFocus);
  });
  document.body.style.overflow = '';
  if (previouslyFocused instanceof HTMLElement) {
    previouslyFocused.focus();
  }
  previouslyFocused = null;
}

closeBtns.forEach(btn => btn.addEventListener('click', closeOverlay));
backdrop?.addEventListener('click', (e) => {
  if (e.target === backdrop) closeOverlay();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeOverlay();
});

// --- Card 2: count-up on hover ---
const card2 = document.querySelector('.cs-card[data-overlay="1"]');
const countEl = card2?.querySelector('.s2-count') as SVGTSpanElement | null;
let countAnim: number | null = null;

card2?.addEventListener('mouseenter', () => {
  if (countEl) {
    const target = 364000;
    const duration = 1200;
    const start = performance.now();
    if (countAnim) cancelAnimationFrame(countAnim);

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      countEl!.textContent = Math.round(eased * target).toLocaleString();
      if (progress < 1) {
        countAnim = requestAnimationFrame(tick);
      } else {
        countAnim = null;
      }
    }
    countAnim = requestAnimationFrame(tick);
  }
});

card2?.addEventListener('mouseleave', () => {
  if (countAnim) {
    cancelAnimationFrame(countAnim);
    countAnim = null;
  }
  if (countEl) {
    const current = parseInt(countEl.textContent?.replace(/,/g, '') || '0', 10);
    if (current === 0) return;
    const duration = 600;
    const start = performance.now();

    function tickDown(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      countEl!.textContent = Math.round(current * (1 - eased)).toLocaleString();
      if (progress < 1) {
        countAnim = requestAnimationFrame(tickDown);
      } else {
        countAnim = null;
      }
    }
    countAnim = requestAnimationFrame(tickDown);
  }
});
