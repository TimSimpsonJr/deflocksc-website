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

// --- Card 2: asymmetric hover-off ---
const card2 = document.querySelector('.cs-card[data-overlay="1"]');
const arcs = card2?.querySelectorAll('.s2-arc') ?? [];

card2?.addEventListener('mouseenter', () => {
  arcs.forEach(arc => arc.classList.remove('s2-fading'));
});

card2?.addEventListener('mouseleave', () => {
  arcs.forEach(arc => arc.classList.add('s2-fading'));
  setTimeout(() => {
    arcs.forEach(arc => {
      arc.classList.remove('s2-fading');
      (arc as SVGElement).style.transition = 'none';
      arc.setAttribute('stroke-dashoffset', arc.getAttribute('stroke-dasharray') || '200');
      requestAnimationFrame(() => {
        (arc as SVGElement).style.transition = '';
      });
    });
  }, 350);
});
