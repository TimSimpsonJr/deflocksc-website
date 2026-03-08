import type { Bill } from './types.js';

export function initLegalTab(): void {
  // Sidebar selection for 4th Amendment
  const legalBtns = document.querySelectorAll<HTMLButtonElement>('.legal-btn');
  const legalPanels = document.querySelectorAll<HTMLElement>('.legal-panel');

  legalBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = btn.getAttribute('data-legal');
      legalBtns.forEach(b => {
        b.classList.remove('sidebar-active');
        b.setAttribute('aria-selected', 'false');
      });
      legalPanels.forEach(p => p.classList.add('hidden'));
      btn.classList.add('sidebar-active');
      btn.setAttribute('aria-selected', 'true');
      document.querySelector(`.legal-panel[data-legal-panel="${idx}"]`)?.classList.remove('hidden');
    });
  });

  // Sidebar selection for bill gaps
  const gapBtns = document.querySelectorAll<HTMLButtonElement>('.gap-btn');
  const gapPanels = document.querySelectorAll<HTMLElement>('.gap-panel');

  gapBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = btn.getAttribute('data-gap');
      gapBtns.forEach(b => {
        b.classList.remove('sidebar-active');
        b.setAttribute('aria-selected', 'false');
      });
      gapPanels.forEach(p => p.classList.add('hidden'));
      btn.classList.add('sidebar-active');
      btn.setAttribute('aria-selected', 'true');
      document.querySelector(`.gap-panel[data-gap-panel="${idx}"]`)?.classList.remove('hidden');
    });
  });

  // State map — load SVG paths and inject as dotted fills
  const smHighlighted: Record<string, string> = {
    'Virginia': 'm 835,265 -1,3 .5,1 .4,-1 .8,-3 z m -35,-7 -.7,-1 1,-.1 1,-.9 .4,-2 -.2,-.5 .1,-.5 -.3,-.7 -.6,-.5 -.4,-.1 -.5,-.4 -.6,-.6 h -1 l -.6,-.1 -.4,-.4 .1,-.5 -2,-.6 -.8,.3 -1,-.1 -.7,-.7 -.5,-.2 -.2,-.7 .6,-.8 v -.9 l -1,-.2 -1,-.9 -.9,.1 -2,-.3 -.4,.7 -.4,2 -.5,2 -10,-5 -.2,.9 .9,2 -.8,2 .1,3 -1,.8 -.5,2 -.9,.8 -1,2 -.9,.8 -1,2 -2,-1 -2,8 -1,2 -3,-.5 -1,-2 -2,-.7 -.1,5 -1,2 .4,2 -2,2 .4,2 -4,6 -1,3 2,1 -2,2 .1,1 -2,2 -.7,-1 -4,3 -2,-1 -.6,1 .8,.5 -.5,.9 -6,2 -3,-2 -.8,2 -2,2 -2,.1 -4,-2 -.1,-2 -2,-.7 .8,-1 -.7,-.6 -5,7 -3,1 -3,3 -.4,2 -2,1 -.1,2 -1,1 -2,.5 -.5,2 -1,.4 -7,4 29,-3 .2,-1 5,-.5 -.3,.7 29,-4 39,-7 29,-6 -.6,-1 .4,-.1 .9,.9 -.1,-1 -.3,-2 2,1 .9,2 v -1 l -3,-6 v -1 l -.7,-.8 -1,.7 .5,1 h -.8 l -.4,-1 -.6,.9 -.9,-1 -2,-.1 -.2,.7 2,2 -1,-.7 -.5,-1 -.4,.8 -.8,.1 -2,2 .3,-2 v -1 l -2,-.7 -2,-.5 -.2,-2 -.6,-1 -.6,1 -2,-1 -2,.3 .2,-.9 2,-.2 .9,.5 2,-.8 .9,.4 .5,1 v .7 l 2,.4 .3,.9 .9,.4 .9,1 1,-2 h .6 l -.1,-2 -1,1 -.6,-.9 2,-.2 -1,-.9 -1,.6 -.1,-2 -2,.2 -2,-1 -2,-2 4,2 .9,.3 2,-.8 -2,-.9 .6,-.6 -1,-.5 .8,-.2 -.3,-.9 1,.9 .4,-.8 .4,1 1,.8 .6,-.5 -.5,-.6 -.1,-2 -1,-.1 -2,-.8 .9,-1 -2,-.1 -.4,-.5 -1,.6 -1,-.8 -.5,-1 -2,-1 -2,-2 -2,-2 3,1 .9,1 2,.7 2,2 .2,-2 .6,1 2,.5 v -4 l -.8,-1 1,.4 .1,-2 -3,-1 -2,-.2 -1,-.2 .3,-1 -2,-.3 -.1,-.6 h -2 l -.2,.8 -.7,-1 h -3 l -1,-.4 -.2,-1 -1,-.6 -.4,-2 -.6,-.4 -.7,1 -.9,.2 -.9,.7 h -2 l -.9,-1 .4,-3 .5,-2 .6,.5 z m 22,12 .9,-.1 0,-.6 -.8,.1 z m 8,14 -1,3 1,-1 z m -2,-15 .7,.3 -.2,2 -.5,-.5 -1,1 1,.4 -2,4 .1,8 2,3 .5,-2 .4,-3 -.3,-2 .7,-.9 -.2,-1 1,-.6 -.6,-.5 .5,-.7 .8,1 -.2,1 -.4,4 1,-2 .4,-3 .1,-3 -.3,-2 .6,-2 1,-2 .1,-2 .3,-.9 -5,2 -.7,.8 z',
    'Montana': 'm 247,130 57,8 51,5 2,-21 5,-67 -54,-6 -54,-8 -66,-12 -5,22 4,7 -2,5 4,5 2,.7 4,8 v 2 l 2,3 h .9 l 1,2 h 3 v 2 l -7,17 -.5,4 1,.5 2,3 3,-1 4,-2 2,2 .5,2 -.5,3 2,10 3,4 2,1 .4,3 v 4 l 2,2 2,-2 7,2 2,-1 9,2 3,-3 2,-.6 1,2 2,4 .9,.1 z',
    'Utah': 'm 233,218 3,-22 -48,-8 -21,109 46,8 40,6 12,-88 z',
    'Maine': 'm 875,129 .6,4 3,2 .8,2 2,1 1,-.3 1,-3 -.8,-3 2,-.9 .5,-3 -.6,-1 3,-2 -2,-2 .9,-2 1,-2 .5,3 2,-2 1,.9 1,-.8 v -2 l 3,-1 .3,-3 2,-.2 3,-4 v -.7 l -.9,-.5 -.1,-3 .6,-1 .2,2 1,-.5 -.2,-3 -.9,.3 -.1,1 -1,-1 .9,-1 .6,.1 1,-.4 .5,3 2,-.3 3,.7 v -1 l -1,-1 1,.1 .1,-2 .6,.8 .3,2 2,2 .2,-1 .9,-.2 -.3,-.8 .8,-.6 -.1,-2 -2,-.2 -2,.7 1,-2 .7,-.8 1,-.2 .4,1 2,2 .4,-2 2,-1 -.9,-1 .1,-2 1,.5 h .7 l 2,-1 .4,-2 2,.3 .1,-.7 .2,-2 .5,1 2,-1 2,-4 -.1,-2 -1,-2 -3,-3 h -2 l -.8,2 -3,-3 .3,-.8 v -2 l -2,-4 -.8,-.2 -.7,.4 h -5 l -.3,-4 -8,-26 -7,-4 -3,-.1 -7,7 -3,-1 -1,-4 h -3 l -7,20 .7,6 -2,2 -.4,5 1,4 .8,.2 v 2 l -2,4 -2,1 -1,2 -.4,8 -2,-1 -2,.4 z m 35,-25 -1,.8 v 1 l .7,-.8 .9,.8 .4,-.5 1,.2 -1,-.8 .4,-.8 z m -2,3 -1,1 .5,.4 -.1,1 h 1 v -2 z m -3,-2 .9,1 1,.5 .3,-1 v -2 l -1,-.7 -.4,1 z m -1,5 -2,-2 2,-2 .8,.3 .2,1 1,.8 v 1 l -1,1 z',
    'Illinois': 'm 624,266 -1,5 v 2 l 2,4 v .7 l -.3,.9 .9,2 -.3,2 -2,2 -1,4 -4,5 -.1,7 h -1 l .9,2 v .9 l -2,3 .1,1 2,2 -.1,.9 -4,.6 -.6,1 -1,-.6 -1,.5 -.4,3 2,2 -.4,2 -2,.3 -7,-3 -4,4 .3,2 h -3 l -1,-2 -2,-4 v -2 l .8,-.6 .1,-1 -2,-2 -.9,-2 -3,-4 -5,-1 -7,-7 -.4,-2 3,-8 -.4,-2 1,-1 v -1 l -3,-2 -3,-.7 -3,1 -1,-2 .6,-2 -.7,-2 -9,-8 -2,-2 -2,-6 -1,-5 1,-4 .7,-.7 .1,-2 -.7,-.9 1,-2 2,-.6 .9,-.3 1,-1 v -2 l 2,-2 .5,-.5 .1,-4 -.9,-1 -1,-.3 -1,-2 1,-4 3,-.8 h 2 l 4,-2 2,-2 .1,-2 1,-1 1,-3 -.1,-3 -3,-4 h -1 l -.9,-1 .2,-2 -2,-2 -2,-1 .5,-.6 46,-3 .1,5 3,5 1,4 2,3 z',
    'New Hampshire': 'm 863,94 -1,.1 -1,-1 -2,1 -.5,6 1,2 -1,4 2,3 -.4,2 .1,1 -1,2 -1,.4 -.6,1 -2,1 -.7,2 1,3 -.5,2 .5,2 -1,2 .4,2 -1,2 .2,2 -.7,1 .7,4 .7,2 -.5,3 .9,2 -.2,2 -.5,1 -.1,1 2,3 18,-4 1,-2 .3,-2 2,-.6 .5,-1 2,-1 1,.3 .8,-5 -2,-1 -.8,-2 -3,-2 -.6,-4 -12,-37 z',
    'South Carolina': 'm 772,350 -20,3 -.1,-3 -3,-3 -1,2 -.7,-.3 .2,-1 -.4,-.5 -23,2 -7,4 -1,.1 -4,2 -.1,2 -2,1 -1,3 .2,1 6,4 3,-.3 3,4 .4,2 4,5 3,2 1,.2 2,2 1,2 2,2 2,.5 3,3 .1,1 3,3 5,2 4,7 .3,3 4,2 2,5 .8,3 4,.4 .8,-2 h .6 l 2,-2 .5,-2 3,-2 .3,-2 -1,-.9 .8,-.7 .8,.4 1,-.4 2,-2 4,-2 2,-2 .1,-.7 5,-4 -.1,-.5 -.9,-.8 1,-2 h .8 l .4,.5 .7,-.8 h 1 l .6,-2 2,-2 -.3,-5 .8,-2 4,-6 2,-2 2,-1 z',
  };

  const baseContainer = document.getElementById('sm-base-states');
  const hlContainer = document.getElementById('sm-highlighted-states');
  if (!baseContainer || !hlContainer || baseContainer.children.length > 0) return;

  fetch('/us-map.svg')
    .then(r => r.text())
    .then(svgText => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, 'image/svg+xml');
      const paths = doc.querySelectorAll('path');

      paths.forEach(p => {
        const d = p.getAttribute('d');
        if (!d) return;
        const newPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        newPath.setAttribute('d', d);
        newPath.setAttribute('stroke', 'none');

        let isHL = false;
        let stateName = '';
        for (const [name, hd] of Object.entries(smHighlighted)) {
          if (d.trim() === hd.trim()) { isHL = true; stateName = name; break; }
        }
        if (isHL) {
          newPath.setAttribute('fill', stateName === 'South Carolina' ? 'url(#sm-dots-red)' : 'url(#sm-dots-amber)');
          hlContainer.appendChild(newPath);
        } else {
          newPath.setAttribute('fill', 'url(#sm-dots-base)');
          baseContainer.appendChild(newPath);
        }
      });
    });

  // State map popout logic
  const wrap = document.getElementById('state-map-svg')?.closest('.relative');
  const popout = document.getElementById('sm-popout');
  const popState = document.getElementById('sm-pop-state');
  const popLaw = document.getElementById('sm-pop-law');
  if (!wrap || !popout || !popState || !popLaw) return;

  document.querySelectorAll<SVGGElement>('.sm-marker').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('mouseenter', () => {
      const state = el.dataset.state || '';
      const law = el.dataset.law || '';
      const isSC = el.dataset.sc === 'true';
      popState.textContent = state;
      popState.style.color = isSC ? '#dc2626' : '#fbbf24';
      popLaw.textContent = law;

      const wrapRect = wrap.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      let left = elRect.left - wrapRect.left + (elRect.width / 2);
      let top = elRect.top - wrapRect.top - 10;
      if (left + 300 > wrapRect.width) left = wrapRect.width - 310;
      if (left < 10) left = 10;
      if (top < 10) top = elRect.bottom - wrapRect.top + 10;

      popout.style.left = left + 'px';
      popout.style.top = top + 'px';
      popout.style.opacity = '1';
    });

    el.addEventListener('mouseleave', () => {
      popout.style.opacity = '0';
    });
  });
}

export function initToolkitBillModal(bills: Bill[]): void {
  const backdrop = document.getElementById('tk-bill-backdrop');
  const modal = document.getElementById('tk-bill-modal');
  const closeBtn = document.getElementById('tk-bill-close');
  if (!backdrop || !modal) return;
  let previouslyFocused: Element | null = null;

  function openTkModal(index: number): void {
    const bill = bills[index];
    if (!bill) return;
    previouslyFocused = document.activeElement;

    const idEl = document.getElementById('tk-modal-bill-id');
    const titleEl = document.getElementById('tk-modal-bill-title');
    const statusEl = document.getElementById('tk-modal-bill-status');
    const descEl = document.getElementById('tk-modal-bill-description');
    const linkEl = document.getElementById('tk-modal-bill-link') as HTMLAnchorElement | null;
    if (idEl) idEl.textContent = bill.bill;
    if (titleEl) titleEl.textContent = bill.title;
    if (statusEl) statusEl.textContent = bill.status;
    if (descEl) descEl.textContent = bill.description;
    if (linkEl) linkEl.href = bill.url;

    const lastActionRow = document.getElementById('tk-modal-last-action-row');
    const lastAction = document.getElementById('tk-modal-bill-last-action');
    if (lastActionRow && lastAction) {
      if (bill.lastAction) {
        lastAction.textContent = bill.lastAction;
        lastActionRow.style.display = '';
      } else {
        lastActionRow.style.display = 'none';
      }
    }

    backdrop.classList.remove('hidden');
    backdrop.offsetHeight;
    backdrop.classList.add('opacity-100');
    backdrop.classList.remove('opacity-0');

    modal.classList.add('opacity-100', 'translate-y-0');
    modal.classList.remove('opacity-0', 'translate-y-5');

    document.body.style.overflow = 'hidden';

    setTimeout(function() {
      document.getElementById('tk-bill-close')?.focus();
    }, 250);
  }

  function closeTkModal(): void {
    modal.classList.remove('opacity-100', 'translate-y-0');
    modal.classList.add('opacity-0', 'translate-y-5');

    backdrop.classList.remove('opacity-100');
    backdrop.classList.add('opacity-0');

    setTimeout(function() {
      backdrop.classList.add('hidden');
      document.body.style.overflow = '';
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
  document.querySelectorAll('.tk-bill-card').forEach(function(card) {
    card.addEventListener('click', function() {
      const attr = card.getAttribute('data-tk-bill');
      if (attr) openTkModal(parseInt(attr));
    });
  });

  // Close handlers
  closeBtn?.addEventListener('click', closeTkModal);
  backdrop.addEventListener('click', function(e) {
    if (e.target === backdrop) closeTkModal();
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && !backdrop.classList.contains('hidden')) {
      closeTkModal();
    }
  });
}

// Initialize
initLegalTab();
document.addEventListener('astro:after-swap', initLegalTab);

// Toolkit bill modal — read bills from data island
const tkBillDataEl = document.getElementById('toolkit-bill-data');
if (tkBillDataEl && tkBillDataEl.textContent) {
  const bills: Bill[] = JSON.parse(tkBillDataEl.textContent);
  initToolkitBillModal(bills);
}
