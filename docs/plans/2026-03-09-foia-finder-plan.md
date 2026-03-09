# FOIA Agency Finder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an agency finder to the FOIA toolkit tab that helps users identify which agencies to FOIA and provides records custodian contact info, with auto-fill into the existing letter templates.

**Architecture:** Enhance the existing `ToolkitFoia.astro` component with a new finder section above the template sidebar. Location matching reuses `district-matcher.ts` (geolocation + Census geocoder) to identify county/city, then filters a curated `foia-contacts.json` dataset. Client-side logic extracted to `src/scripts/foia-finder.ts`.

**Tech Stack:** Astro 5 (static build), TypeScript, Tailwind CSS 4, existing district-matcher.ts + geo-utils.ts

---

## Task 1: Create seed data file

**Files:**
- Create: `src/data/foia-contacts.json`

**Step 1: Create the seed dataset**

Create `src/data/foia-contacts.json` with a representative sample of agencies. Include:
- 2 statewide agencies (SLED, SCDOT)
- Greenville area (PD, County Sheriff, City Clerk, County Clerk) -- most data available from research
- A couple other confirmed-camera agencies (Richland County Sheriff, Columbia PD)
- One example of a major metro without confirmed cameras

```json
[
  {
    "id": "sled",
    "name": "South Carolina Law Enforcement Division",
    "shortName": "SLED",
    "type": "sled",
    "county": null,
    "city": null,
    "hasAlprCameras": true,
    "cameraCount": null,
    "custodian": {
      "title": "FOIA Officer",
      "name": null,
      "email": "foia@sled.sc.gov",
      "phone": null,
      "address": "P.O. Box 21398, Columbia, SC 29221"
    },
    "notes": "Maintains statewide ALPR database with 422 million plate reads and 3-year retention."
  },
  {
    "id": "scdot",
    "name": "South Carolina Department of Transportation",
    "shortName": "SCDOT",
    "type": "scdot",
    "county": null,
    "city": null,
    "hasAlprCameras": false,
    "cameraCount": null,
    "custodian": {
      "title": "FOIA Officer",
      "name": null,
      "email": "foia@scdot.org",
      "phone": "803-737-1270",
      "address": "955 Park Street, Columbia, SC 29201"
    },
    "notes": "Discovered 200+ unpermitted Flock cameras on state roads in 2024. Relevant for permit records."
  },
  {
    "id": "greenville-pd",
    "name": "Greenville Police Department",
    "shortName": "Greenville PD",
    "type": "police",
    "county": "greenville",
    "city": "greenville",
    "hasAlprCameras": true,
    "cameraCount": 57,
    "custodian": {
      "title": "Records Custodian",
      "name": null,
      "email": null,
      "phone": "864-271-5333",
      "address": "4 McGee St, Greenville, SC 29601"
    },
    "notes": "Greenville PD has refused to disclose camera locations publicly."
  },
  {
    "id": "greenville-county-sheriff",
    "name": "Greenville County Sheriff's Office",
    "shortName": "Greenville County Sheriff",
    "type": "sheriff",
    "county": "greenville",
    "city": null,
    "hasAlprCameras": true,
    "cameraCount": 11,
    "custodian": {
      "title": "Records Division",
      "name": null,
      "email": null,
      "phone": "864-467-5200",
      "address": "4 McGee St, Greenville, SC 29601"
    },
    "notes": null
  },
  {
    "id": "greenville-city-clerk",
    "name": "City of Greenville - City Clerk",
    "shortName": "Greenville City Clerk",
    "type": "clerk",
    "county": "greenville",
    "city": "greenville",
    "hasAlprCameras": false,
    "cameraCount": null,
    "custodian": {
      "title": "City Clerk",
      "name": null,
      "email": "cityclerk@greenvillesc.gov",
      "phone": "864-467-4422",
      "address": "206 S Main St, Greenville, SC 29601"
    },
    "notes": "Request budget approvals and council meeting minutes related to surveillance technology."
  },
  {
    "id": "greenville-county-clerk",
    "name": "Greenville County - Clerk to Council",
    "shortName": "Greenville County Clerk",
    "type": "clerk",
    "county": "greenville",
    "city": null,
    "hasAlprCameras": false,
    "cameraCount": null,
    "custodian": {
      "title": "Clerk to Council",
      "name": null,
      "email": null,
      "phone": "864-467-7105",
      "address": "301 University Ridge, Suite 2400, Greenville, SC 29601"
    },
    "notes": "Request county council meeting minutes and budget records for surveillance spending."
  },
  {
    "id": "richland-county-sheriff",
    "name": "Richland County Sheriff's Department",
    "shortName": "Richland County Sheriff",
    "type": "sheriff",
    "county": "richland",
    "city": null,
    "hasAlprCameras": true,
    "cameraCount": null,
    "custodian": {
      "title": "FOIA Officer",
      "name": null,
      "email": "foia@rcsd.net",
      "phone": "803-576-3000",
      "address": "5623 Two Notch Road, Columbia, SC 29223"
    },
    "notes": null
  },
  {
    "id": "columbia-pd",
    "name": "Columbia Police Department",
    "shortName": "Columbia PD",
    "type": "police",
    "county": "richland",
    "city": "columbia",
    "hasAlprCameras": true,
    "cameraCount": null,
    "custodian": {
      "title": "Records Division",
      "name": null,
      "email": null,
      "phone": "803-545-3500",
      "address": "1 Justice Square, Columbia, SC 29201"
    },
    "notes": null
  }
]
```

This is a starter set. More agencies will be researched and added later.

**Step 2: Commit**

```bash
git add src/data/foia-contacts.json
git commit -m "data: add seed foia-contacts.json with 8 agencies"
```

---

## Task 2: Add finder HTML structure to ToolkitFoia.astro

**Files:**
- Modify: `src/components/ToolkitFoia.astro:1-29` (frontmatter + intro section)

**Step 1: Update the Astro frontmatter**

Add the import for foia-contacts.json and serialize it as a data island, following the same pattern as `ActionModal.astro:1-13`.

In `ToolkitFoia.astro`, update the frontmatter:

```astro
---
import foiaTemplates from '../data/toolkit-foia.json';
import foiaContacts from '../data/foia-contacts.json';

function highlightPlaceholders(text: string): string {
  return text.replace(/\[([A-Z\s]+)\]/g, '<span class="text-[#fbbf24] font-semibold">[$1]</span>');
}
---
```

**Step 2: Replace the intro section (lines 12-29) with the finder UI**

Replace the current intro div with the finder section. The finder has three states:
- **Input state**: geolocation button + address field + browse link
- **Loading state**: spinner
- **Results state**: matched agency cards

```html
<!-- Zone 1: Agency Finder -->
<div class="mb-12">
  <p class="font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.18em] text-[#a3a3a3] mb-3">FOIA Templates</p>
  <h2 class="text-[#e8e8e8] font-bold text-xl md:text-2xl tracking-[-0.02em] mb-4">
    Find Your Agency &amp; Request Records
  </h2>
  <p class="text-[#d4d4d4] text-base leading-[1.7] mb-6">
    South Carolina's Freedom of Information Act
    (<a href="https://www.scstatehouse.gov/code/t30c004.php" target="_blank" rel="noopener" class="text-[#fbbf24] underline">S.C. Code &sect; 30-4-10</a>)
    gives every person the right to inspect and copy public records. Find the agency you want to request records from, then grab a template below.
  </p>

  <!-- Finder input -->
  <div id="foia-finder-input" class="bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] p-6 mb-6">
    <div class="flex flex-col sm:flex-row items-stretch sm:items-end gap-4 mb-4">
      <button
        id="foia-geo"
        type="button"
        class="bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold px-6 py-3 text-sm uppercase tracking-[0.08em] transition-colors cursor-pointer whitespace-nowrap min-h-[48px]"
      >
        Use My Location
      </button>
      <div class="flex-1">
        <form id="foia-address-form" class="flex gap-2">
          <input
            id="foia-address"
            type="text"
            placeholder="Or enter your address..."
            class="flex-1 bg-[#0a0a0a] border border-[rgba(255,255,255,0.12)] text-white placeholder-[#525252] px-4 py-3 text-sm focus:border-[#dc2626] focus:outline-none min-h-[48px]"
            autocomplete="street-address"
          />
          <button
            type="submit"
            class="bg-[#262626] hover:bg-[#333] text-white font-semibold px-5 py-3 text-sm transition-colors cursor-pointer whitespace-nowrap min-h-[48px]"
          >
            Find
          </button>
        </form>
      </div>
    </div>
    <p class="text-[#525252] text-xs">
      Your location is matched entirely in your browser. No data is sent to any server.
    </p>
  </div>

  <!-- Loading state (hidden by default) -->
  <div id="foia-finder-loading" class="hidden text-center py-8">
    <div class="inline-block w-6 h-6 border-2 border-[#525252] border-t-[#dc2626] rounded-full animate-spin" role="status">
      <span class="sr-only">Finding agencies...</span>
    </div>
    <p class="text-[#a3a3a3] text-sm mt-3">Finding agencies near you...</p>
  </div>

  <!-- Error state (hidden by default) -->
  <div id="foia-finder-error" class="hidden bg-[rgba(220,38,38,0.1)] border border-[rgba(220,38,38,0.3)] p-4 mb-6" role="alert">
    <p id="foia-finder-error-msg" class="text-[#fca5a5] text-sm"></p>
    <button id="foia-finder-retry" type="button" class="text-[#fbbf24] text-sm underline mt-2 cursor-pointer">Try again</button>
  </div>

  <!-- Results state (hidden by default) -->
  <div id="foia-finder-results" class="hidden mb-6" aria-live="polite">
    <div class="flex items-center justify-between mb-4">
      <h3 id="foia-results-heading" class="text-[#e8e8e8] font-semibold text-base"></h3>
      <button id="foia-finder-reset" type="button" class="text-[#a3a3a3] hover:text-white text-xs underline cursor-pointer">New search</button>
    </div>
    <div id="foia-results-list" class="space-y-3"></div>
  </div>

  <!-- Browse all agencies toggle -->
  <div class="border-t border-[rgba(255,255,255,0.07)] pt-4">
    <button id="foia-browse-toggle" type="button" class="text-[#a3a3a3] hover:text-white text-sm font-medium cursor-pointer flex items-center gap-2">
      <svg id="foia-browse-chevron" class="w-4 h-4 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
      Browse all agencies
    </button>
    <div id="foia-browse-panel" class="hidden mt-4">
      <div class="flex flex-wrap gap-2 mb-4">
        <input
          id="foia-search"
          type="text"
          placeholder="Search agencies..."
          class="flex-1 min-w-[200px] bg-[#0a0a0a] border border-[rgba(255,255,255,0.12)] text-white placeholder-[#525252] px-4 py-2.5 text-sm focus:border-[#dc2626] focus:outline-none"
        />
        <div class="flex gap-1" role="group" aria-label="Filter by agency type">
          <button type="button" class="foia-type-chip bg-[#dc2626] text-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.05em] cursor-pointer" data-type="all">All</button>
          <button type="button" class="foia-type-chip bg-[#262626] text-[#a3a3a3] hover:text-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.05em] cursor-pointer" data-type="police">Police</button>
          <button type="button" class="foia-type-chip bg-[#262626] text-[#a3a3a3] hover:text-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.05em] cursor-pointer" data-type="sheriff">Sheriff</button>
          <button type="button" class="foia-type-chip bg-[#262626] text-[#a3a3a3] hover:text-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.05em] cursor-pointer" data-type="clerk">Clerk</button>
          <button type="button" class="foia-type-chip bg-[#262626] text-[#a3a3a3] hover:text-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.05em] cursor-pointer" data-type="state">State</button>
        </div>
      </div>
      <div id="foia-browse-list" class="space-y-3 max-h-[60vh] overflow-y-auto"></div>
    </div>
  </div>
</div>

<!-- Pre-fill banner (hidden by default, shown when agency selected) -->
<div id="foia-prefill-banner" class="hidden bg-[rgba(251,191,36,0.1)] border border-[rgba(251,191,36,0.3)] px-4 py-3 mb-6 flex items-center justify-between">
  <p class="text-[#fbbf24] text-sm">
    Templates pre-filled for <strong id="foia-prefill-name"></strong>
  </p>
  <button id="foia-prefill-clear" type="button" class="text-[#a3a3a3] hover:text-white text-xs underline cursor-pointer">Clear</button>
</div>
```

**Step 3: Add the data island before the closing `</div>` of the component, just before the existing `<script>` tag**

```html
<script type="application/json" id="foia-contacts-data">
  {JSON.stringify(foiaContacts)}
</script>
```

Note: In Astro, the `{JSON.stringify(foiaContacts)}` expression runs at build time.

**Step 4: Verify the build compiles**

Run: `node node_modules/astro/astro.js build`
Expected: Clean build, no TypeScript errors.

**Step 5: Commit**

```bash
git add src/components/ToolkitFoia.astro
git commit -m "feat: add FOIA finder HTML structure to ToolkitFoia"
```

---

## Task 3: Create foia-finder.ts with types and agency rendering

**Files:**
- Create: `src/scripts/foia-finder.ts`

**Step 1: Create the script with types, data loading, and card rendering**

Create `src/scripts/foia-finder.ts`. This handles:
- Reading the data island
- Rendering agency cards (reusable for both results and browse modes)
- Type filter chip logic
- Search/filter logic for browse mode

```typescript
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

// --- Data loading ---

const dataEl = document.getElementById('foia-contacts-data');
if (dataEl) {
  const contacts: FoiaContact[] = JSON.parse(dataEl.textContent!);
  initFoiaFinder(contacts);
}

// --- State ---

let selectedAgency: FoiaContact | null = null;
// Store original template HTML for reset
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
    ? `<p class="text-[#737373] text-xs italic mt-2">${contact.notes}</p>`
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
          class="foia-use-btn shrink-0 bg-[#262626] hover:bg-[#dc2626] text-[#a3a3a3] hover:text-white text-xs font-bold uppercase tracking-[0.05em] px-3 py-2 transition-colors cursor-pointer"
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

  // Sort: law enforcement first, then clerks, then statewide
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

  // Save originals on first fill
  document.querySelectorAll<HTMLElement>('.template-text').forEach((el, i) => {
    if (!originalTemplates.has(i)) {
      originalTemplates.set(i, el.innerHTML);
    }
  });

  // Replace placeholders in all template panels
  const agencyName = contact.name;
  const custodianName = contact.custodian.name || contact.custodian.title;

  document.querySelectorAll<HTMLElement>('.template-text').forEach((el, i) => {
    const original = originalTemplates.get(i);
    if (!original) return;

    let html = original;
    // Replace [AGENCY NAME] placeholder (with or without amber highlight span)
    html = html.replace(
      /(<span class="text-\[#fbbf24\] font-semibold">)?\[AGENCY NAME\](<\/span>)?/g,
      `<span class="text-[#fbbf24] font-semibold">${agencyName}</span>`
    );
    // Replace [AGENCY RECORDS CUSTODIAN] placeholder
    html = html.replace(
      /(<span class="text-\[#fbbf24\] font-semibold">)?\[AGENCY RECORDS CUSTODIAN\](<\/span>)?/g,
      `<span class="text-[#fbbf24] font-semibold">${custodianName}</span>`
    );
    el.innerHTML = html;
  });

  // Show pre-fill banner
  const banner = document.getElementById('foia-prefill-banner');
  const nameEl = document.getElementById('foia-prefill-name');
  if (banner && nameEl) {
    nameEl.textContent = contact.shortName;
    banner.classList.remove('hidden');
  }

  // Scroll to templates
  const templateSection = document.querySelector('.foia-layout');
  if (templateSection) {
    templateSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function clearAutoFill(): void {
  selectedAgency = null;

  // Restore originals
  document.querySelectorAll<HTMLElement>('.template-text').forEach((el, i) => {
    const original = originalTemplates.get(i);
    if (original) el.innerHTML = original;
  });

  // Hide banner
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

  // --- Geolocation ---
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
    } catch (err: any) {
      if (err.code === 1) {
        showFinderError('Location access was blocked. Try entering your address instead.');
      } else {
        showFinderError(err.message || 'Could not determine your location. Try entering your address.');
      }
    }
  });

  // --- Address form ---
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
    } catch (err: any) {
      showFinderError(err.message || 'Address lookup failed. Check the address and try again.');
    }
  });

  // --- Location results ---
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

  // --- Reset / Retry ---
  document.getElementById('foia-finder-reset')?.addEventListener('click', () => {
    showFinderState('input');
  });

  document.getElementById('foia-finder-retry')?.addEventListener('click', () => {
    showFinderState('input');
  });

  // --- Browse all agencies ---
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

  // --- Browse search ---
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

  // --- "Use This Agency" delegation ---
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.foia-use-btn');
    if (!btn) return;
    const agencyId = btn.dataset.agencyId;
    const contact = contacts.find(c => c.id === agencyId);
    if (contact) applyAutoFill(contact);
  });

  // --- Pre-fill banner clear ---
  document.getElementById('foia-prefill-clear')?.addEventListener('click', clearAutoFill);
}
```

**Step 2: Add the script tag to ToolkitFoia.astro**

At the bottom of `ToolkitFoia.astro`, *before* the existing `<script>` block, add:

```html
<script>
  import '../scripts/foia-finder.js';
</script>
```

Wait -- Astro inline scripts with `import` won't work this way. Instead, replace the existing `<script>` block with one that imports both modules:

The existing `<script>` block (lines 126-185) handles sidebar selection and copy-to-clipboard. We need to keep that and also init the finder. Simplest approach: keep the existing script tag as-is (it self-initializes with `initFoiaTab()`) and add a second script tag that imports the finder module.

Actually, in Astro, a `<script>` tag with no attributes is treated as a module and bundled by Vite. So add this as a separate `<script>` tag:

```html
<script>
  import '../scripts/foia-finder';
</script>
```

This should go right after the data island script tag.

**Step 3: Verify dev server builds and renders**

Start dev server with `preview_start` (config name: `dev`).
Navigate to `http://localhost:4321/toolkit#request-records`.
Expected: Finder UI visible at top of FOIA tab, geolocation button, address input, browse toggle.

**Step 4: Commit**

```bash
git add src/scripts/foia-finder.ts src/components/ToolkitFoia.astro
git commit -m "feat: add FOIA agency finder with location lookup, browse, and auto-fill"
```

---

## Task 4: Verify location lookup end-to-end

**Files:** No new files -- verification only

**Step 1: Start dev server and navigate to toolkit**

Use `preview_start` (name: `dev`), navigate to `/toolkit#request-records`.

**Step 2: Test geolocation flow**

Click "Use My Location". Approve browser geolocation prompt. Expected: loading spinner, then agency cards for your location's county.

**Step 3: Test address flow**

Type "123 Main St, Greenville, SC 29601" in the address field, click Find. Expected: loading spinner, then Greenville-area agencies (Greenville PD, Greenville County Sheriff, clerk offices, plus statewide SLED/SCDOT).

**Step 4: Test "Use This Agency"**

Click "Use This Agency" on Greenville PD. Expected:
- Scrolls down to template section
- Amber pre-fill banner appears: "Templates pre-filled for Greenville PD"
- Template text replaces `[AGENCY NAME]` with "Greenville Police Department" and `[AGENCY RECORDS CUSTODIAN]` with "Records Custodian"

**Step 5: Test "Copy Template" with pre-filled text**

Click "Copy Template" on any template. Paste into a text editor. Expected: the copied text includes "Greenville Police Department" and "Records Custodian" instead of the placeholders.

**Step 6: Test clear pre-fill**

Click "Clear" on the pre-fill banner. Expected: banner disappears, templates revert to `[AGENCY NAME]` and `[AGENCY RECORDS CUSTODIAN]` placeholders.

**Step 7: Test browse mode**

Click "Browse all agencies". Expected: panel expands, all 8 seed agencies listed. Type "richland" in search. Expected: filters to Richland County Sheriff and Columbia PD. Click "Sheriff" chip. Expected: further filters to just Richland County Sheriff.

**Step 8: Test error states**

Enter "asdf" in address field. Expected: error message. Click "Try again". Expected: returns to input state.

**Step 9: Fix any issues found during testing**

If any step fails, diagnose and fix the issue in the relevant file, re-verify, then commit the fix.

**Step 10: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during FOIA finder testing"
```

---

## Task 5: Research and expand the agency dataset

**Files:**
- Modify: `src/data/foia-contacts.json`

**Step 1: Research FOIA contacts for remaining camera-confirmed agencies**

Check the Obsidian research vault at `C:\Users\tim\OneDrive\Documents\Tim's Vault\Areas\Activism\DeflockSC Website\Research\` for county research notes. Each county note has a "Known Deployments" section listing agencies with cameras.

Focus on agencies confirmed to have ALPR cameras from the research notes. For each agency, look up:
- FOIA contact email/phone (check agency website)
- Mailing address for the records division
- Any relevant notes about their camera program

**Step 2: Add entries for all Tier 1 counties (14 counties with local incidents)**

From the memory notes, Tier 1 counties have the most controversy. Add law enforcement + clerk entries for each. Priority order: Greenville (done), Richland (done), Charleston, Spartanburg, Lexington, Anderson, Florence, Horry, Berkeley, Dorchester, York, Beaufort, Aiken, Sumter.

**Step 3: Add entries for major metro PDs and county sheriffs**

Add remaining agencies for cities over ~25k population that weren't covered in Tier 1. Include both sheriff's office and municipal PD where applicable.

**Step 4: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/data/foia-contacts.json','utf8')); console.log('Valid JSON')"`
Expected: "Valid JSON"

**Step 5: Commit**

```bash
git add src/data/foia-contacts.json
git commit -m "data: expand foia-contacts.json with researched agency contacts"
```

---

## Task 6: Final verification and cleanup

**Files:**
- Possibly modify: `src/components/ToolkitFoia.astro`, `src/scripts/foia-finder.ts`

**Step 1: Full build check**

Run: `node node_modules/astro/astro.js build`
Expected: Clean build, no errors.

**Step 2: Mobile responsive check**

Use `preview_resize` with mobile preset (375x812). Navigate to `/toolkit#request-records`. Verify:
- Finder inputs stack vertically on mobile
- Agency cards are readable
- Type filter chips wrap gracefully
- Touch targets are at least 44px

**Step 3: Keyboard navigation check**

Tab through the finder: geolocation button, address field, find button, browse toggle. Verify all elements are focusable and the focus ring is visible.

**Step 4: Fix any issues**

Address any responsive or a11y issues found.

**Step 5: Commit**

```bash
git add -A
git commit -m "fix: polish FOIA finder responsive layout and accessibility"
```

---

## Task 7: Update MANIFEST.md

**Files:**
- Modify: `MANIFEST.md`

**Step 1: Add new files to the Structure section**

Add these entries under the appropriate sections:
- `src/data/foia-contacts.json` -- "Curated FOIA custodian contacts by agency"
- `src/scripts/foia-finder.ts` -- "Agency finder: location lookup, browse, search, auto-fill"

**Step 2: Update Key Relationships**

Add: `foia-finder.ts imports district-matcher.ts -- reuses geolocation, geocoding, and county matching for FOIA agency lookup`

**Step 3: Commit**

```bash
git add MANIFEST.md
git commit -m "docs: update MANIFEST.md with FOIA finder files"
```
