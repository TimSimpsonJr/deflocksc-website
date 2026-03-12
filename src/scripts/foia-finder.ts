// --- Types ---

interface FoiaCustodian {
  title: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}

interface FoiaContact {
  id: string;
  name: string;
  shortName: string;
  type: 'police' | 'sheriff' | 'clerk' | 'sled' | 'scdot';
  county: string | null;
  city: string | null;
  hasAlprCameras: boolean;
  cameraCount: number | null;
  custodian: FoiaCustodian;
  notes: string | null;
}

// --- State ---

let selectedAgency: FoiaContact | null = null;
const originalTemplates = new Map<number, string>();

// --- Rendering ---

function typeBadge(type: FoiaContact['type']): string {
  const labels: Record<string, string> = {
    police: 'Police',
    sheriff: 'Sheriff',
    clerk: 'Clerk',
    sled: 'State Agency',
    scdot: 'State Agency',
  };
  const colors: Record<string, string> = {
    police: 'bg-[#dc2626]/20 text-[#fca5a5]',
    sheriff: 'bg-[#dc2626]/20 text-[#fca5a5]',
    clerk: 'bg-[#fbbf24]/20 text-[#fbbf24]',
    sled: 'bg-[#525252]/30 text-[#a3a3a3]',
    scdot: 'bg-[#525252]/30 text-[#a3a3a3]',
  };
  return `<span class="inline-block px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] ${colors[type] || ''}">${labels[type] || type}</span>`;
}

function renderAgencyCard(contact: FoiaContact): string {
  const cameraLine = contact.hasAlprCameras
    ? `<p class="text-[#fca5a5] text-xs font-semibold uppercase tracking-[0.05em]">${contact.cameraCount ? contact.cameraCount + ' ALPR cameras confirmed' : 'ALPR cameras confirmed'}</p>`
    : '';

  const emailLine = contact.custodian.email
    ? `<p class="text-[#d4d4d4] text-sm">${contact.custodian.email}</p>`
    : '';

  const phoneLine = contact.custodian.phone
    ? `<p class="text-[#a3a3a3] text-sm">${contact.custodian.phone}</p>`
    : '';

  const addressLine = contact.custodian.address
    ? `<p class="text-[#737373] text-xs mt-1">${contact.custodian.address}</p>`
    : '';

  const notesLine = contact.notes
    ? `<p class="text-[#737373] text-xs italic mt-2"><span class="not-italic font-semibold text-[#525252]">Note:</span> ${contact.notes}</p>`
    : '';

  const clerkHint = contact.type === 'clerk'
    ? '<p class="text-[#fbbf24] text-xs mt-1">Request budget and approval records</p>'
    : '';

  return `
    <div class="bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] p-4 hover:border-[rgba(255,255,255,0.15)] transition-colors">
      <div class="flex items-start justify-between gap-3 mb-2">
        <div>
          <h4 class="text-[#e8e8e8] font-semibold text-sm">${contact.name}</h4>
          <div class="flex items-center gap-2 mt-1">
            ${typeBadge(contact.type)}
            ${cameraLine}
          </div>
        </div>
        <button
          type="button"
          class="foia-use-btn shrink-0 bg-[#262626] hover:bg-[#dc2626] text-[#a3a3a3] hover:text-white text-xs font-bold uppercase tracking-[0.05em] px-3 py-2 min-h-[44px] transition-colors cursor-pointer"
          data-agency-id="${contact.id}"
        >
          Use This Agency
        </button>
      </div>
      <div class="mt-2">
        <p class="text-[#a3a3a3] text-xs mb-1">${contact.custodian.title}${contact.custodian.name ? ': ' + contact.custodian.name : ''}</p>
        ${emailLine}
        ${phoneLine}
        ${addressLine}
        ${clerkHint}
        ${notesLine}
      </div>
    </div>
  `;
}

function renderAgencyList(agencies: FoiaContact[], container: HTMLElement): void {
  if (agencies.length === 0) {
    container.innerHTML = '<p class="text-[#525252] text-sm py-4">No agencies found.</p>';
    return;
  }

  const sortOrder: Record<string, number> = { police: 0, sheriff: 1, clerk: 2, sled: 3, scdot: 4 };
  const sorted = [...agencies].sort((a, b) => {
    const aOrder = sortOrder[a.type] ?? 5;
    const bOrder = sortOrder[b.type] ?? 5;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.name.localeCompare(b.name);
  });

  container.innerHTML = sorted.map(renderAgencyCard).join('');
}

// --- Auto-fill ---

function applyAutoFill(contact: FoiaContact): void {
  selectedAgency = contact;

  document.querySelectorAll<HTMLElement>('.template-text').forEach((el, i) => {
    if (!originalTemplates.has(i)) {
      originalTemplates.set(i, el.innerHTML);
    }
  });

  const agencyName = contact.name;
  const custodianName = contact.custodian.name || contact.custodian.title;

  document.querySelectorAll<HTMLElement>('.template-text').forEach((el, i) => {
    const original = originalTemplates.get(i);
    if (!original) return;

    let html = original;
    html = html.replace(
      /(<span class="text-\[#fbbf24\] font-semibold">)?\[AGENCY NAME\](<\/span>)?/g,
      `<span class="text-[#fbbf24] font-semibold">${agencyName}</span>`
    );
    html = html.replace(
      /(<span class="text-\[#fbbf24\] font-semibold">)?\[AGENCY RECORDS CUSTODIAN\](<\/span>)?/g,
      `<span class="text-[#fbbf24] font-semibold">${custodianName}</span>`
    );
    el.innerHTML = html;
  });

  const banner = document.getElementById('foia-prefill-banner');
  const nameEl = document.getElementById('foia-prefill-name');
  if (banner && nameEl) {
    nameEl.textContent = contact.shortName;
    banner.classList.remove('hidden');
  }

  const templateSection = document.querySelector('.foia-layout');
  if (templateSection) {
    templateSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function clearAutoFill(): void {
  selectedAgency = null;

  document.querySelectorAll<HTMLElement>('.template-text').forEach((el, i) => {
    const original = originalTemplates.get(i);
    if (original) el.innerHTML = original;
  });

  document.getElementById('foia-prefill-banner')?.classList.add('hidden');
}

// --- Finder states ---

function showFinderState(state: 'input' | 'loading' | 'error' | 'results'): void {
  const input = document.getElementById('foia-finder-input');
  const loading = document.getElementById('foia-finder-loading');
  const error = document.getElementById('foia-finder-error');
  const results = document.getElementById('foia-finder-results');

  input?.classList.toggle('hidden', state !== 'input');
  loading?.classList.toggle('hidden', state !== 'loading');
  error?.classList.toggle('hidden', state !== 'error');
  results?.classList.toggle('hidden', state !== 'results');
}

function showFinderError(msg: string): void {
  const el = document.getElementById('foia-finder-error-msg');
  if (el) el.textContent = msg;
  showFinderState('error');
}

// --- Init ---

function initFoiaFinder(contacts: FoiaContact[]): void {
  const statewide = contacts.filter(c => c.type === 'sled' || c.type === 'scdot');

  // Geolocation
  document.getElementById('foia-geo')?.addEventListener('click', async () => {
    showFinderState('loading');
    try {
      const { matchDistricts } = await import('../lib/district-matcher.js');
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('Your browser does not support location services.'));
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });
      const match = await matchDistricts(pos.coords.latitude, pos.coords.longitude);
      showLocationResults(contacts, statewide, match.county, match.city);
    } catch (err: unknown) {
      if (err instanceof Object && 'code' in err && (err as { code: number }).code === 1) {
        showFinderError('Location access was blocked. Try entering your address instead.');
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        showFinderError(msg || 'Could not determine your location. Try entering your address.');
      }
    }
  });

  // Address form
  document.getElementById('foia-address-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const address = (document.getElementById('foia-address') as HTMLInputElement | null)?.value?.trim();
    if (!address) return;
    if (address.length < 5) {
      showFinderError('Please enter a full street address (e.g. "123 Main St, Greenville, SC 29601").');
      return;
    }

    showFinderState('loading');
    try {
      const { geocodeAddress, matchDistricts } = await import('../lib/district-matcher.js');
      const geo = await geocodeAddress(address);
      if (!geo.lat || !geo.lng) {
        throw new Error("That address didn't return a match. Check the street, city, and state.");
      }
      const match = await matchDistricts(geo.lat, geo.lng);
      showLocationResults(contacts, statewide, match.county, match.city);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showFinderError(msg || 'Address lookup failed. Check the address and try again.');
    }
  });

  // Location results
  function showLocationResults(
    all: FoiaContact[],
    stateAgencies: FoiaContact[],
    county: string | null,
    city: string | null
  ): void {
    const local = all.filter(c => {
      if (c.type === 'sled' || c.type === 'scdot') return false;
      if (county && c.county === county) return true;
      if (city && c.city === city) return true;
      return false;
    });

    const results = [...local, ...stateAgencies];

    if (results.length === 0) {
      showFinderError("No agencies found for your location. Try browsing all agencies below.");
      return;
    }

    const heading = document.getElementById('foia-results-heading');
    if (heading) {
      const label = county ? county.charAt(0).toUpperCase() + county.slice(1) + ' County' : 'your area';
      heading.textContent = `Agencies in ${label}`;
    }

    const list = document.getElementById('foia-results-list');
    if (list) renderAgencyList(results, list);

    showFinderState('results');
    document.getElementById('foia-finder-results')?.focus();
  }

  // Reset / Retry
  document.getElementById('foia-finder-reset')?.addEventListener('click', () => {
    showFinderState('input');
  });

  document.getElementById('foia-finder-retry')?.addEventListener('click', () => {
    showFinderState('input');
  });

  // Browse all agencies
  const browseToggle = document.getElementById('foia-browse-toggle');
  const browsePanel = document.getElementById('foia-browse-panel');
  const browseChevron = document.getElementById('foia-browse-chevron');
  const browseList = document.getElementById('foia-browse-list');
  let browseOpen = false;

  browseToggle?.addEventListener('click', () => {
    browseOpen = !browseOpen;
    browsePanel?.classList.toggle('hidden', !browseOpen);
    browseChevron?.classList.toggle('rotate-180', browseOpen);
    if (browseOpen && browseList) {
      renderAgencyList(contacts, browseList);
    }
  });

  // Browse search + filter
  let activeTypeFilter = 'all';
  const searchInput = document.getElementById('foia-search') as HTMLInputElement | null;

  function filterBrowse(): void {
    if (!browseList) return;
    let filtered = contacts;
    if (activeTypeFilter !== 'all') {
      if (activeTypeFilter === 'state') {
        filtered = filtered.filter(c => c.type === 'sled' || c.type === 'scdot');
      } else {
        filtered = filtered.filter(c => c.type === activeTypeFilter);
      }
    }
    const query = searchInput?.value?.trim().toLowerCase() || '';
    if (query) {
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.shortName.toLowerCase().includes(query) ||
        (c.county && c.county.toLowerCase().includes(query)) ||
        (c.city && c.city.toLowerCase().includes(query))
      );
    }
    renderAgencyList(filtered, browseList);
  }

  searchInput?.addEventListener('input', filterBrowse);

  document.querySelectorAll<HTMLButtonElement>('.foia-type-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      activeTypeFilter = chip.dataset.type || 'all';
      document.querySelectorAll('.foia-type-chip').forEach(c => {
        c.classList.remove('bg-[#dc2626]', 'text-white');
        c.classList.add('bg-[#262626]', 'text-[#a3a3a3]');
      });
      chip.classList.remove('bg-[#262626]', 'text-[#a3a3a3]');
      chip.classList.add('bg-[#dc2626]', 'text-white');
      filterBrowse();
    });
  });

  // "Use This Agency" delegation
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.foia-use-btn');
    if (!btn) return;
    const agencyId = btn.dataset.agencyId;
    const contact = contacts.find(c => c.id === agencyId);
    if (contact) applyAutoFill(contact);
  });

  // Pre-fill banner clear
  document.getElementById('foia-prefill-clear')?.addEventListener('click', clearAutoFill);
}

// --- Bootstrap ---

function boot(): void {
  const dataEl = document.getElementById('foia-contacts-data');
  if (dataEl) {
    const contacts: FoiaContact[] = JSON.parse(dataEl.textContent!);
    initFoiaFinder(contacts);
  }
}

boot();
document.addEventListener('astro:after-swap', boot);
