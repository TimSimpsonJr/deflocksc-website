import type { Bill } from './types.js';

const dataEl = document.getElementById('bill-tracker-data');
if (dataEl && dataEl.textContent) {
  const bills: Bill[] = JSON.parse(dataEl.textContent);
  initBillTracker(bills);
}

function initBillTracker(bills: Bill[]): void {
  const backdrop = document.getElementById('bill-modal-backdrop');
  const modal = document.getElementById('bill-modal');
  const closeBtn = document.getElementById('bill-modal-close');
  if (!backdrop || !modal) return;
  let previouslyFocused: Element | null = null;

  function openModal(index: number): void {
    const bill = bills[index];
    if (!bill) return;
    previouslyFocused = document.activeElement;

    const idEl = document.getElementById('modal-bill-id');
    const titleEl = document.getElementById('modal-bill-title');
    const statusEl = document.getElementById('modal-bill-status');
    const descEl = document.getElementById('modal-bill-description');
    const linkEl = document.getElementById('modal-bill-link') as HTMLAnchorElement | null;
    if (idEl) idEl.textContent = bill.bill;
    if (titleEl) titleEl.textContent = bill.title;
    if (statusEl) statusEl.textContent = bill.status;
    if (descEl) descEl.textContent = bill.description;
    if (linkEl) linkEl.href = bill.url;

    const lastActionRow = document.getElementById('modal-last-action-row');
    const lastAction = document.getElementById('modal-bill-last-action');
    if (lastActionRow && lastAction) {
      if (bill.lastAction) {
        lastAction.textContent = bill.lastAction;
        lastActionRow.style.display = '';
      } else {
        lastActionRow.style.display = 'none';
      }
    }

    backdrop.classList.remove('hidden');
    backdrop.offsetHeight; // trigger reflow for animation
    backdrop.classList.add('opacity-100');
    backdrop.classList.remove('opacity-0');

    modal.classList.add('opacity-100', 'translate-y-0');
    modal.classList.remove('opacity-0', 'translate-y-5');

    document.body.style.overflow = 'hidden';

    setTimeout(function() {
      document.getElementById('bill-modal-close')?.focus();
    }, 250);
  }

  function closeModal(): void {
    modal.classList.remove('opacity-100', 'translate-y-0');
    modal.classList.add('opacity-0', 'translate-y-5');

    backdrop.classList.remove('opacity-100');
    backdrop.classList.add('opacity-0');

    setTimeout(function() {
      backdrop.classList.add('hidden');
      const actionOpen = !document.getElementById('action-modal')?.classList.contains('hidden');
      if (!actionOpen) {
        document.body.style.overflow = '';
      }
      if (previouslyFocused && 'focus' in previouslyFocused) {
        (previouslyFocused as HTMLElement).focus();
      }
      previouslyFocused = null;
    }, 200);
  }

  // Focus trap
  modal.addEventListener('keydown', function(e) {
    if (e.key !== 'Tab') return;
    const focusable = modal.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])');
    if (focusable.length === 0) return;
    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // Card click handlers
  document.querySelectorAll('.bill-col').forEach(card => {
    card.addEventListener('click', () => {
      const attr = card.getAttribute('data-bill');
      if (attr) openModal(parseInt(attr));
    });
  });

  // Close handlers
  closeBtn?.addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !backdrop.classList.contains('hidden')) {
      closeModal();
    }
  });

  // Close bill modal when CTA is clicked
  document.getElementById('modal-cta')?.addEventListener('click', closeModal);
}
