/**
 * Carousel logic and overlay management for the HowItWorks section.
 *
 * Handles auto-advance, arrow/dot navigation, keyboard a11y,
 * and the read-more overlay panels with focus trapping.
 */

// --- Carousel ---

const carousel = document.getElementById('factoidCarousel');
const track = document.getElementById('carouselTrack');
const cards = carousel?.querySelectorAll('.carousel-card') ?? [];
const dotsContainer = document.getElementById('carouselDots');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const totalCards = cards.length;
let currentSlide = 0;
let autoInterval: ReturnType<typeof setInterval> | null = null;
let userInteracted = false;

// Create dots
for (let i = 0; i < totalCards; i++) {
  const dot = document.createElement('button');
  dot.className = `carousel-dot${i === 0 ? ' active' : ''}`;
  dot.setAttribute('aria-label', `Go to factoid ${i + 1}`);
  dot.setAttribute('role', 'tab');
  dot.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
  dot.addEventListener('click', () => {
    stopAuto();
    goToSlide(i);
  });
  dotsContainer?.appendChild(dot);
}

function goToSlide(n: number) {
  dotsContainer?.querySelectorAll('.carousel-dot').forEach((d) => {
    d.classList.remove('active');
    d.setAttribute('aria-selected', 'false');
  });
  currentSlide = ((n % totalCards) + totalCards) % totalCards;
  if (track) {
    track.style.transform = `translateX(-${currentSlide * 100}%)`;
  }
  const activeDot = dotsContainer?.querySelectorAll('.carousel-dot')[currentSlide];
  activeDot?.classList.add('active');
  activeDot?.setAttribute('aria-selected', 'true');

  // Update tabindex - only current slide is focusable
  cards.forEach((card, i) => {
    card.setAttribute('tabindex', i === currentSlide ? '0' : '-1');
  });
}

function stopAuto() {
  userInteracted = true;
  if (autoInterval) {
    clearInterval(autoInterval);
    autoInterval = null;
  }
}

// Arrow handlers (stopPropagation so card click doesn't fire)
prevBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  stopAuto();
  goToSlide(currentSlide - 1);
});
nextBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  stopAuto();
  goToSlide(currentSlide + 1);
});

// Auto-advance (4 seconds)
function startAuto() {
  if (autoInterval) clearInterval(autoInterval);
  autoInterval = setInterval(() => {
    if (!userInteracted) {
      goToSlide(currentSlide + 1);
    }
  }, 4000);
}
startAuto();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (autoInterval) {
      clearInterval(autoInterval);
      autoInterval = null;
    }
  } else if (!userInteracted) {
    startAuto();
  }
});

// Arrow key navigation on carousel
carousel?.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    stopAuto();
    goToSlide(currentSlide - 1);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    stopAuto();
    goToSlide(currentSlide + 1);
  }
});

// --- Overlays ---

const backdrop = document.getElementById('overlayBackdrop');
const overlayPanels = document.querySelectorAll('.overlay-panel');
const closeBtns = document.querySelectorAll('.overlay-close');
let previouslyFocused: Element | null = null;

function trapFocus(e: KeyboardEvent) {
  if (e.key !== 'Tab') return;
  const panel = (e.currentTarget as HTMLElement);
  const focusable = panel.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])') as NodeListOf<HTMLElement>;
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
    stopAuto();
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
    // Focus close button and add trap
    const closeBtn = panel?.querySelector('.overlay-close') as HTMLElement;
    closeBtn?.focus();
    panel?.addEventListener('keydown', trapFocus);
  });
});

// Enter/Space on carousel cards opens overlay (reuses click handler via dispatch)
cards.forEach(card => {
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

closeBtns.forEach(btn => {
  btn.addEventListener('click', closeOverlay);
});

backdrop?.addEventListener('click', (e) => {
  if (e.target === backdrop) closeOverlay();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeOverlay();
});
