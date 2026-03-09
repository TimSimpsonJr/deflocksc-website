declare const umami: { track: (event: string) => void } | undefined;

let modal: HTMLElement | null = null;
let openerElement: HTMLElement | null = null;

export function initModalController(): void {
  modal = document.getElementById('action-modal');
  if (!modal) return;

  // Close button
  document.getElementById('action-modal-close')?.addEventListener('click', closeModal);

  // Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
      closeModal();
    }
  });

  // Backdrop click
  modal.addEventListener('click', function(e) {
    if (e.target === modal || e.target === document.getElementById('action-modal-backdrop')) {
      closeModal();
    }
  });

  // Focus trap
  modal.addEventListener('keydown', function(e) {
    if (e.key !== 'Tab') return;
    const focusable = Array.from(modal!.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), a[href], details > summary'
    )).filter(el => (el as HTMLElement).offsetParent !== null) as HTMLElement[];
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
  });
}

export function openModal(opener?: HTMLElement | null): void {
  if (!modal) return;
  openerElement = opener || null;
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  if (typeof umami !== 'undefined') umami.track('action-modal-open');
  requestAnimationFrame(function() {
    const input = document.getElementById('action-address');
    if (input) input.focus();
  });
}

export function closeModal(): void {
  if (!modal) return;
  modal.classList.add('hidden');
  document.body.style.overflow = '';
  showState('input');
  if (openerElement && typeof openerElement.focus === 'function') {
    openerElement.focus();
  }
  openerElement = null;
}

export function showState(state: string): void {
  ['input', 'loading', 'results', 'error'].forEach(function(s) {
    const el = document.getElementById('action-' + s);
    if (el) el.classList.toggle('hidden', s !== state);
  });
}

export function showError(msg: string): void {
  const el = document.getElementById('action-error-msg');
  if (el) el.textContent = msg;
  showState('error');
}
