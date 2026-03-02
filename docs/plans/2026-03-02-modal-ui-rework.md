# Modal UI Rework + District Matching Integration

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Google Civic API lookup with client-side district matching, reorganize the modal input UI into three paths (geolocation primary, address secondary, manual tertiary), and update the results UI with district badges and wrong-district correction.

**Architecture:** The modal HTML template gets a new three-path input layout. The `<script>` block replaces Google Civic API calls with imports from `src/lib/district-matcher.js` (already built). The `buildGroups()` function changes from OCD-ID-based matching to district-number-based matching. Results rendering adds "Your Local Representatives" section, district badges, and "Wrong district?" dropdowns.

**Tech Stack:** Astro component (HTML + inline `<script>`), vanilla JS, existing `district-matcher.js` library

**Design spec:** `docs/plans/2026-03-02-district-matching-design.md`

---

## Task 1: Rework Input HTML — Three Input Paths

**Files:**
- Modify: `src/components/ActionModal.astro:31-62` (Input State HTML)

**Step 1: Replace the Input State HTML**

Replace the `<!-- Input State -->` block (lines 31-62) with the three-path layout from the design spec. The current layout has address input as primary and geolocation as a text link. The new layout flips this:

1. **Geolocation (primary):** Large red "Find My Reps" button
2. **Address (secondary):** Divider + input + submit
3. **Manual (tertiary):** "I already know my district" expandable link

```html
<!-- Input State -->
<div id="action-input">
  <div class="flex flex-col items-center gap-6 max-w-md mx-auto">

    <!-- 1. Geolocation (primary) -->
    <div class="w-full text-center">
      <button
        id="action-geo"
        type="button"
        class="bg-[#ef4444] hover:bg-[#dc2626] text-white font-bold rounded-lg px-8 py-4 text-lg min-h-[56px] transition-colors cursor-pointer w-full max-w-xs"
      >
        Find My Reps
      </button>
      <p class="text-[#64748b] text-xs italic mt-3 max-w-sm mx-auto">
        Your location is matched entirely in your browser. No data is sent to any server.
      </p>
    </div>

    <!-- Divider -->
    <div class="flex items-center gap-4 w-full">
      <div class="flex-1 h-px bg-[#334155]"></div>
      <span class="text-[#64748b] text-sm">or enter your address</span>
      <div class="flex-1 h-px bg-[#334155]"></div>
    </div>

    <!-- 2. Address input (secondary) -->
    <form id="action-form" class="w-full">
      <label for="action-address" class="sr-only">Street address</label>
      <div class="flex flex-col sm:flex-row gap-3 w-full">
        <input
          id="action-address"
          type="text"
          autocomplete="street-address"
          placeholder="123 Main St, Greenville, SC"
          required
          class="flex-1 bg-[#1e293b] border border-[#334155] text-white rounded px-4 py-3 text-base placeholder-[#64748b] focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6] transition-colors"
        />
        <button
          type="submit"
          class="bg-[#334155] hover:bg-[#475569] text-white font-medium rounded px-5 py-3 text-sm min-h-[44px] transition-colors cursor-pointer whitespace-nowrap"
        >
          Look Up
        </button>
      </div>
      <p class="text-[#64748b] text-xs italic mt-2">
        Your address is sent to the US Census Bureau's geocoding service. No other data is shared.
      </p>
    </form>

    <!-- 3. Manual selection (tertiary) -->
    <details id="action-manual-details" class="w-full">
      <summary class="text-[#3b82f6] hover:text-[#60a5fa] text-sm font-medium cursor-pointer transition-colors text-center">
        I already know my district
      </summary>
      <div class="mt-4 space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="manual-senate" class="text-[#94a3b8] text-xs block mb-1">Senate District</label>
            <select id="manual-senate" class="w-full bg-[#1e293b] border border-[#334155] text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-[#3b82f6]">
              <option value="">Select...</option>
            </select>
          </div>
          <div>
            <label for="manual-house" class="text-[#94a3b8] text-xs block mb-1">House District</label>
            <select id="manual-house" class="w-full bg-[#1e293b] border border-[#334155] text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-[#3b82f6]">
              <option value="">Select...</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="manual-county" class="text-[#94a3b8] text-xs block mb-1">County</label>
            <select id="manual-county" class="w-full bg-[#1e293b] border border-[#334155] text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-[#3b82f6]">
              <option value="">Select...</option>
              <option value="greenville">Greenville</option>
              <option value="spartanburg">Spartanburg</option>
              <option value="anderson">Anderson</option>
              <option value="pickens">Pickens</option>
              <option value="laurens">Laurens</option>
            </select>
          </div>
          <div>
            <label for="manual-county-district" class="text-[#94a3b8] text-xs block mb-1">County District</label>
            <select id="manual-county-district" class="w-full bg-[#1e293b] border border-[#334155] text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-[#3b82f6]">
              <option value="">Select county first</option>
            </select>
          </div>
        </div>
        <div id="manual-city-row" class="grid grid-cols-2 gap-3 hidden">
          <div>
            <label for="manual-city" class="text-[#94a3b8] text-xs block mb-1">City</label>
            <select id="manual-city" class="w-full bg-[#1e293b] border border-[#334155] text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-[#3b82f6]">
              <option value="">None</option>
            </select>
          </div>
          <div>
            <label for="manual-city-district" class="text-[#94a3b8] text-xs block mb-1">City District</label>
            <select id="manual-city-district" class="w-full bg-[#1e293b] border border-[#334155] text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-[#3b82f6]">
              <option value="">Select city first</option>
            </select>
          </div>
        </div>
        <p class="text-[#64748b] text-xs">
          Don't know your district? <a href="https://www.scstatehouse.gov/legislatorssearch.php" target="_blank" rel="noopener" class="text-[#3b82f6] hover:text-[#60a5fa] underline">Look it up on scstatehouse.gov</a>
        </p>
        <button
          id="action-manual-submit"
          type="button"
          class="bg-[#ef4444] hover:bg-[#dc2626] text-white font-medium rounded px-5 py-3 text-sm min-h-[44px] transition-colors cursor-pointer w-full"
        >
          Find My Reps
        </button>
      </div>
    </details>

  </div>
</div>
```

**Step 2: Verify the modal opens and shows the new layout**

Start dev server, open modal, take screenshot. All three paths should be visible. Geolocation button should be prominent red, address input secondary with gray button, manual selection collapsed.

**Step 3: Commit**

```bash
git add src/components/ActionModal.astro
git commit -m "feat: rework modal input to three-path layout (geo primary, address secondary, manual tertiary)"
```

---

## Task 2: Populate Manual Selection Dropdowns

**Files:**
- Modify: `src/components/ActionModal.astro` (script block)

**Step 1: Add dropdown population code at end of script**

After the existing event handlers, add code to populate the manual selection dropdowns from the static data:

```js
// --- Manual Selection Dropdowns ---

// Populate senate district dropdown (1-46)
(function() {
  var senateSel = document.getElementById('manual-senate');
  if (!senateSel) return;
  var senateNums = Object.keys(stateLegislators.senate).sort(function(a,b) { return +a - +b; });
  for (var i = 0; i < senateNums.length; i++) {
    var opt = document.createElement('option');
    opt.value = senateNums[i];
    opt.textContent = senateNums[i];
    senateSel.appendChild(opt);
  }
})();

// Populate house district dropdown (1-124)
(function() {
  var houseSel = document.getElementById('manual-house');
  if (!houseSel) return;
  var houseNums = Object.keys(stateLegislators.house).sort(function(a,b) { return +a - +b; });
  for (var i = 0; i < houseNums.length; i++) {
    var opt = document.createElement('option');
    opt.value = houseNums[i];
    opt.textContent = houseNums[i];
    houseSel.appendChild(opt);
  }
})();

// County district ranges (keyed by county value from local-councils.json)
var COUNTY_DISTRICT_RANGES = {
  greenville: { prefix: 'county:greenville', start: 17, end: 28 },
  spartanburg: { prefix: 'county:spartanburg', start: 1, end: 6 },
  anderson: { prefix: 'county:anderson', start: 1, end: 7 },
  pickens: { prefix: 'county:pickens', start: 1, end: 6 },
  laurens: { prefix: 'county:laurens', start: 1, end: 7 }
};

// County-to-city mapping
var COUNTY_CITIES = {
  greenville: [{ value: 'greenville', label: 'Greenville', prefix: 'place:greenville', start: 1, end: 4 }]
};

// When county changes, populate county district dropdown and show/hide city row
document.getElementById('manual-county')?.addEventListener('change', function() {
  var county = this.value;
  var distSel = document.getElementById('manual-county-district');
  var cityRow = document.getElementById('manual-city-row');
  var citySel = document.getElementById('manual-city');
  var cityDistSel = document.getElementById('manual-city-district');

  // Reset county district
  distSel.innerHTML = '<option value="">Select...</option>';
  if (county && COUNTY_DISTRICT_RANGES[county]) {
    var range = COUNTY_DISTRICT_RANGES[county];
    for (var d = range.start; d <= range.end; d++) {
      var opt = document.createElement('option');
      opt.value = String(d);
      opt.textContent = 'District ' + d;
      distSel.appendChild(opt);
    }
  }

  // Show/hide city row
  if (county && COUNTY_CITIES[county]) {
    cityRow.classList.remove('hidden');
    citySel.innerHTML = '<option value="">None</option>';
    var cities = COUNTY_CITIES[county];
    for (var c = 0; c < cities.length; c++) {
      var copt = document.createElement('option');
      copt.value = cities[c].value;
      copt.textContent = cities[c].label;
      citySel.appendChild(copt);
    }
  } else {
    cityRow.classList.add('hidden');
    citySel.innerHTML = '<option value="">None</option>';
  }
  cityDistSel.innerHTML = '<option value="">Select city first</option>';
});

// When city changes, populate city district dropdown
document.getElementById('manual-city')?.addEventListener('change', function() {
  var city = this.value;
  var county = document.getElementById('manual-county')?.value;
  var cityDistSel = document.getElementById('manual-city-district');

  cityDistSel.innerHTML = '<option value="">Select...</option>';
  if (city && county && COUNTY_CITIES[county]) {
    var cityData = COUNTY_CITIES[county].find(function(c) { return c.value === city; });
    if (cityData) {
      for (var d = cityData.start; d <= cityData.end; d++) {
        var opt = document.createElement('option');
        opt.value = String(d);
        opt.textContent = 'District ' + d;
        cityDistSel.appendChild(opt);
      }
    }
  }
});
```

**Step 2: Verify dropdowns populate**

Open modal, expand "I already know my district", verify:
- Senate dropdown has 1-46
- House dropdown has 1-124
- Selecting "Greenville" county populates county district with 17-28 and shows city row
- Selecting "Greenville" city populates city district with 1-4

**Step 3: Commit**

```bash
git add src/components/ActionModal.astro
git commit -m "feat: populate manual selection dropdowns from static data"
```

---

## Task 3: Rewrite buildGroups() for District-Number Matching

**Files:**
- Modify: `src/components/ActionModal.astro` (script block, `buildGroups` function, lines ~186-343)

**Step 1: Replace the buildGroups function**

The current `buildGroups()` takes an array of OCD-ID strings and matches them against `divisionPattern` strings in `actionLetters`. The new version takes a district match result object (from `matchDistricts()` or manual selection) and builds groups directly from district numbers.

```js
/**
 * Build result groups from matched district data.
 *
 * @param {object} match - { senate, house, county, countyDistrict, city, cityDistrict }
 * @returns {Array} groups for renderResults()
 */
function buildGroups(match) {
  var groups = [];

  // --- State Senator ---
  var senateLetter = actionLetters.find(function(l) { return l.divisionPattern.indexOf('sldu:') !== -1; });
  if (senateLetter) {
    var senator = match.senate ? stateLegislators.senate[match.senate] : null;
    groups.push({
      label: senateLetter.label,
      category: 'state',
      subject: senateLetter.subject,
      body: senateLetter.body,
      reps: senator ? [{
        name: senator.name,
        office: 'State Senator, District ' + match.senate,
        email: senator.email,
        phone: senator.phone || ''
      }] : []
    });
  }

  // --- State Representative ---
  var houseLetter = actionLetters.find(function(l) { return l.divisionPattern.indexOf('sldl:') !== -1; });
  if (houseLetter) {
    var houseRep = match.house ? stateLegislators.house[match.house] : null;
    groups.push({
      label: houseLetter.label,
      category: 'state',
      subject: houseLetter.subject,
      body: houseLetter.body,
      reps: houseRep ? [{
        name: houseRep.name,
        office: 'State Representative, District ' + match.house,
        email: houseRep.email,
        phone: houseRep.phone || ''
      }] : []
    });
  }

  // --- Your Local Representatives (matched district reps pulled into own section) ---
  var localReps = [];

  // Build council key → letter lookup
  function findLocalLetter(councilKey) {
    for (var i = 0; i < actionLetters.length; i++) {
      if (actionLetters[i].category === 'local' && actionLetters[i].divisionPattern.indexOf(councilKey) !== -1) {
        return actionLetters[i];
      }
    }
    return null;
  }

  // --- County council ---
  var countyKey = match.county ? 'county:' + match.county : null;
  var countyLetter = countyKey ? findLocalLetter(countyKey) : null;
  var countyCouncil = countyKey ? localCouncils[countyKey] : null;

  if (countyCouncil && match.countyDistrict) {
    // Find the matched district rep
    var districtTitle = 'District ' + match.countyDistrict;
    for (var i = 0; i < countyCouncil.members.length; i++) {
      var m = countyCouncil.members[i];
      if (m.title && m.title.indexOf(districtTitle) !== -1 && m.name !== 'Vacant') {
        localReps.push({
          name: m.name,
          office: m.title + ' — ' + countyCouncil.label,
          email: m.email || '',
          phone: m.phone || '',
          source: countyCouncil.label
        });
        break;
      }
    }
  }

  // --- City council ---
  var cityKey = match.city ? 'place:' + match.city : null;
  var cityLetter = cityKey ? findLocalLetter(cityKey) : null;
  var cityCouncil = cityKey ? localCouncils[cityKey] : null;

  if (cityCouncil && match.cityDistrict) {
    var cityDistrictTitle = 'District ' + match.cityDistrict;
    for (var i = 0; i < cityCouncil.members.length; i++) {
      var m = cityCouncil.members[i];
      if (m.title && m.title.indexOf(cityDistrictTitle) !== -1 && m.name !== 'Vacant') {
        localReps.push({
          name: m.name,
          office: m.title + ' — ' + cityCouncil.label,
          email: m.email || '',
          phone: m.phone || '',
          source: cityCouncil.label
        });
        break;
      }
    }
  }

  // Add "Your Local Representatives" section if we have matched reps
  if (localReps.length > 0) {
    // Use the first matched council's letter for subject/body
    var localLetterForSection = countyLetter || cityLetter;
    if (!localLetterForSection) {
      localLetterForSection = actionLetters.find(function(l) { return l.divisionPattern === 'state:sc/' && l.category === 'local'; });
    }
    groups.push({
      label: 'Your Local Representatives',
      category: 'local-matched',
      subject: localLetterForSection ? localLetterForSection.subject : '',
      body: localLetterForSection ? localLetterForSection.body : '',
      reps: localReps,
      matchedCountyDistrict: match.countyDistrict,
      matchedCityDistrict: match.cityDistrict
    });
  }

  // --- Full county council list ---
  if (countyCouncil && countyLetter) {
    var countyReps = [];
    for (var i = 0; i < countyCouncil.members.length; i++) {
      var m = countyCouncil.members[i];
      if (m.name === 'Vacant') continue;
      var isMatched = match.countyDistrict && m.title && m.title.indexOf('District ' + match.countyDistrict) !== -1;
      countyReps.push({
        name: m.name,
        office: m.title,
        email: m.email || '',
        phone: m.phone || '',
        isMatchedDistrict: isMatched
      });
    }
    groups.push({
      label: countyLetter.label,
      category: 'local',
      subject: countyLetter.subject,
      body: countyLetter.body,
      reps: countyReps,
      countyKey: match.county,
      matchedDistrict: match.countyDistrict
    });
  }

  // --- Full city council list ---
  if (cityCouncil && cityLetter) {
    var cityReps = [];
    for (var i = 0; i < cityCouncil.members.length; i++) {
      var m = cityCouncil.members[i];
      if (m.name === 'Vacant') continue;
      var isMatched = match.cityDistrict && m.title && m.title.indexOf('District ' + match.cityDistrict) !== -1;
      cityReps.push({
        name: m.name,
        office: m.title,
        email: m.email || '',
        phone: m.phone || '',
        isMatchedDistrict: isMatched
      });
    }
    groups.push({
      label: cityLetter.label,
      category: 'local',
      subject: cityLetter.subject,
      body: cityLetter.body,
      reps: cityReps,
      cityKey: match.city,
      matchedDistrict: match.cityDistrict
    });
  }

  // If no local council matched at all, add the catch-all
  var hasAnyLocal = groups.some(function(g) { return g.category === 'local' || g.category === 'local-matched'; });
  if (!hasAnyLocal) {
    var catchAll = actionLetters.find(function(l) { return l.divisionPattern === 'state:sc/' && l.category === 'local'; });
    if (catchAll) {
      groups.push({
        label: catchAll.label,
        category: 'local',
        subject: catchAll.subject,
        body: catchAll.body,
        reps: []
      });
    }
  }

  return groups;
}
```

**Step 2: Commit**

```bash
git add src/components/ActionModal.astro
git commit -m "feat: rewrite buildGroups() for district-number matching"
```

---

## Task 4: Update renderResults() — District Badges and Wrong-District Correction

**Files:**
- Modify: `src/components/ActionModal.astro` (script block, `renderResults` function)

**Step 1: Update renderResults to handle new group categories**

The new `renderResults` must:
- Show "YOUR DISTRICT" badge on matched local reps (where `rep.isMatchedDistrict === true`)
- Add "Wrong district?" link below local council headers that reveals a district dropdown
- Handle the `local-matched` category for "Your Local Representatives" section

Key additions to the rep rendering loop — after the office span, add district badge:

```js
if (rep.isMatchedDistrict) {
  var badge = document.createElement('span');
  badge.className = 'text-[#3b82f6] text-xs font-medium';
  badge.textContent = 'Your district';
  infoDiv.appendChild(badge);
}
```

For local council group headers, add wrong-district link:

```js
if (group.category === 'local' && (group.countyKey || group.cityKey)) {
  var wrongLink = document.createElement('button');
  wrongLink.type = 'button';
  wrongLink.className = 'text-[#3b82f6] hover:text-[#60a5fa] text-xs font-medium transition-colors cursor-pointer bg-transparent border-none ml-2';
  wrongLink.textContent = group.matchedDistrict ? 'Wrong district?' : 'Select your district';
  wrongLink.setAttribute('data-action', 'wrong-district');
  wrongLink.setAttribute('data-group', gi);
  header.appendChild(document.createTextNode(' '));
  header.appendChild(wrongLink);
}
```

This is a significant rewrite of `renderResults`. Replace the entire function with the updated version that handles `local-matched` groups, district badges, and wrong-district dropdowns.

**Step 2: Verify results rendering**

This cannot be fully verified until event handlers are wired up (Task 5), but verify the function doesn't throw errors by checking console.

**Step 3: Commit**

```bash
git add src/components/ActionModal.astro
git commit -m "feat: add district badges and wrong-district correction to results UI"
```

---

## Task 5: Wire Up Event Handlers for All Three Input Paths

**Files:**
- Modify: `src/components/ActionModal.astro` (script block, event handlers)

**Step 1: Replace the geolocation handler**

The old handler reverse-geocodes a lat/lng to an address, then calls the Google Civic API. The new handler:
1. Gets lat/lng from browser geolocation
2. Calls `matchDistricts(lat, lng)` from district-matcher.js
3. Passes result to `buildGroups()` → `renderResults()`

Since `district-matcher.js` uses ES module exports but the Astro `<script define:vars>` block is not a module, we need to inline the functions or use a different approach. The cleanest approach: move the district matcher functions into the inline script directly (copy the needed functions), or fetch it as a separate script tag.

**Recommended approach:** Since Astro's `define:vars` scripts can't use `import`, copy the core matching functions (`pointInRing`, `pointInPolygon`, `computeBBox`, `pointInBBox`, `findDistrict`, `loadBoundary`, `matchDistricts`, `geocodeAddress`) directly into the script block. The `src/lib/district-matcher.js` file remains the source of truth — the inline copy is for the modal. Mark the inline copy with a comment pointing to the source file.

Alternatively, use a separate `<script>` tag (without `define:vars`) that can use `import`. The `define:vars` data (actionLetters, stateLegislators, localCouncils) would need to be passed via a `<script type="application/json">` data island instead.

**Pick approach:** Use a data island + module script. This is cleaner and avoids duplicating the matcher code.

Replace the `<script define:vars>` pattern:
1. Add a `<script type="application/json" id="action-modal-data">` element containing the serialized data
2. Add a `<script type="module">` that imports from district-matcher.js and reads the data island

```html
<script type="application/json" id="action-modal-data">
  {JSON.stringify({ actionLetters, stateLegislators, localCouncils })}
</script>
<script type="module">
  import { matchDistricts, geocodeAddress } from '../lib/district-matcher.js';

  const modalData = JSON.parse(document.getElementById('action-modal-data').textContent);
  const { actionLetters, stateLegislators, localCouncils } = modalData;

  // ... rest of script (modal management, buildGroups, renderResults, event handlers)
</script>
```

**Step 2: Update geolocation handler**

```js
document.getElementById('action-geo')?.addEventListener('click', async function() {
  showState('loading');
  try {
    var pos = await new Promise(function(resolve, reject) {
      if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
      navigator.geolocation.getCurrentPosition(resolve, reject);
    });
    var lat = pos.coords.latitude;
    var lng = pos.coords.longitude;
    var match = await matchDistricts(lat, lng);
    if (!match.senate && !match.house) {
      throw new Error("We couldn't match your location to any SC districts. Please try entering your address instead.");
    }
    var groups = buildGroups(match);
    renderResults(groups);
    showState('results');
  } catch (err) {
    if (err.code === 1) {
      showError('Location access denied. Please enter your address instead.');
    } else {
      showError(err.message || 'Something went wrong. Please try again.');
    }
  }
});
```

**Step 3: Update address form handler**

```js
document.getElementById('action-form')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  var addressInput = document.getElementById('action-address');
  var address = addressInput?.value?.trim();
  if (!address) return;
  showState('loading');
  try {
    var geo = await geocodeAddress(address);
    if (!geo.lat || !geo.lng) {
      throw new Error("We couldn't find that address. Please check and try again.");
    }
    // Use Census-provided legislative districts, fall back to point-in-polygon
    var match = await matchDistricts(geo.lat, geo.lng);
    // Prefer Census-provided districts if available
    if (geo.senate) match.senate = geo.senate;
    if (geo.house) match.house = geo.house;

    var groups = buildGroups(match);
    renderResults(groups);
    showState('results');
  } catch (err) {
    showError(err.message || 'Something went wrong. Please try again.');
  }
});
```

**Step 4: Add manual selection handler**

```js
document.getElementById('action-manual-submit')?.addEventListener('click', function() {
  var match = {
    senate: document.getElementById('manual-senate')?.value || null,
    house: document.getElementById('manual-house')?.value || null,
    county: document.getElementById('manual-county')?.value || null,
    countyDistrict: document.getElementById('manual-county-district')?.value || null,
    city: document.getElementById('manual-city')?.value || null,
    cityDistrict: document.getElementById('manual-city-district')?.value || null
  };

  // Require at least senate or house
  if (!match.senate && !match.house) {
    showError('Please select at least a Senate or House district.');
    return;
  }

  var groups = buildGroups(match);
  renderResults(groups);
  showState('results');
});
```

**Step 5: Remove old code**

- Remove `lookupDivisions()` function (Google Civic API call)
- Remove `parseDivisions()` function (OCD-ID parsing)
- Remove `getAddressFromLocation()` function (BigDataCloud reverse geocode)
- Remove `civicApiKey` from frontmatter
- Remove `PUBLIC_GOOGLE_CIVIC_API_KEY` from env (note in commit message)

**Step 6: Verify all three paths work**

Test each path by opening modal and:
1. Click "Find My Reps" → browser location prompt → results
2. Type address → submit → results
3. Expand manual, pick senate 6 + house 17 + Greenville county district 22 → submit → results

**Step 7: Commit**

```bash
git add src/components/ActionModal.astro
git commit -m "feat: wire up three input paths with client-side district matching

Remove Google Civic API dependency. Geolocation path uses
browser lat/lng with client-side point-in-polygon matching.
Address path uses Census geocoder + point-in-polygon.
Manual path uses dropdown selections directly.

PUBLIC_GOOGLE_CIVIC_API_KEY env var is no longer needed."
```

---

## Task 6: Wrong-District Correction Handler

**Files:**
- Modify: `src/components/ActionModal.astro` (script block, event delegation)

**Step 1: Add wrong-district click handler to event delegation**

In the existing event delegation on `#action-results-list`, add handling for the `wrong-district` action:

```js
if (action === 'wrong-district') {
  // Toggle a district dropdown below the header
  var existingDropdown = target.parentElement.querySelector('.wrong-district-dropdown');
  if (existingDropdown) {
    existingDropdown.remove();
    return;
  }

  var group = currentGroups[groupIdx];
  var dropdownDiv = document.createElement('div');
  dropdownDiv.className = 'wrong-district-dropdown mt-2 mb-3 flex items-center gap-2';

  var sel = document.createElement('select');
  sel.className = 'bg-[#1e293b] border border-[#334155] text-white rounded px-3 py-1 text-sm focus:outline-none focus:border-[#3b82f6]';
  sel.innerHTML = '<option value="">Select district...</option>';

  // Determine available districts from the council data
  var councilKey = group.countyKey ? ('county:' + group.countyKey) : (group.cityKey ? ('place:' + group.cityKey) : null);
  if (councilKey && localCouncils[councilKey]) {
    var council = localCouncils[councilKey];
    var seen = new Set();
    for (var i = 0; i < council.members.length; i++) {
      var titleMatch = council.members[i].title.match(/District (\d+)/);
      if (titleMatch && !seen.has(titleMatch[1])) {
        seen.add(titleMatch[1]);
        var opt = document.createElement('option');
        opt.value = titleMatch[1];
        opt.textContent = 'District ' + titleMatch[1];
        if (titleMatch[1] === group.matchedDistrict) opt.selected = true;
        sel.appendChild(opt);
      }
    }
  }

  sel.addEventListener('change', function() {
    var newDistrict = sel.value;
    if (!newDistrict) return;
    group.matchedDistrict = newDistrict;
    // Update badges in this group's reps
    for (var r = 0; r < group.reps.length; r++) {
      group.reps[r].isMatchedDistrict = group.reps[r].office && group.reps[r].office.indexOf('District ' + newDistrict) !== -1;
    }
    // Re-render results with updated groups
    renderResults(currentGroups);
  });

  dropdownDiv.appendChild(sel);
  target.parentElement.appendChild(dropdownDiv);
}
```

**Step 2: Verify wrong-district correction**

Open modal, look up an address, find a local council group, click "Wrong district?", change district, verify badge moves.

**Step 3: Commit**

```bash
git add src/components/ActionModal.astro
git commit -m "feat: add wrong-district correction dropdown for local council groups"
```

---

## Task 7: Clean Up and Final Verification

**Files:**
- Modify: `src/components/ActionModal.astro` (remove dead code)
- Delete or note: `.env` reference to `PUBLIC_GOOGLE_CIVIC_API_KEY`

**Step 1: Remove dead code**

- Remove any remaining references to `civicApiKey` or Google Civic API
- Remove `getAddressFromLocation()` (BigDataCloud reverse geocoder)
- Clean up any unused variables

**Step 2: Test all three input paths end-to-end**

1. Geolocation: Allow location → verify state + local reps appear
2. Address: Enter "123 Main St, Greenville, SC 29601" → verify correct reps
3. Manual: Select senate 6, house 17, Greenville county district 22, Greenville city district 3 → verify correct reps
4. Wrong district: Click "Wrong district?" on a local council group → change district → verify badge updates
5. Mobile: Check modal at mobile viewport — all three paths should be usable

**Step 3: Commit**

```bash
git add src/components/ActionModal.astro
git commit -m "chore: remove Google Civic API dependency, clean up dead code"
```

---

## Notes

- The boundary GeoJSON files in `public/districts/` don't exist yet. Run `scripts/build-districts.py` to generate them before testing the geolocation and address paths. The manual selection path works without them.
- The `src/lib/district-matcher.js` module is already built and ready to import.
- The `define:vars` → data island migration (Task 5) was abandoned — inline `<script type="module">` tags don't get Vite resolution in Astro. District matcher functions are inlined with `dm` prefix instead.

---

## Future: Statewide Local Council Expansion

The state legislative matching (senate + house) already covers all of SC. Local council matching currently covers Upstate only: Greenville, Spartanburg, Anderson, Pickens, Laurens counties + Greenville city.

### What's needed to add a new county/city

1. **Boundary source**: Find the county's GIS portal or ArcGIS REST API endpoint for council district boundaries. Add it as a new source in `scripts/build-districts.py`.
2. **Council member data**: Add the council's members to `src/data/local-councils.json` under the key `county:<name>` or `place:<name>` with `name`, `title`, `email`, `phone` for each member.
3. **Action letter template**: Add a letter entry in `src/data/action-letters.json` with `divisionPattern` matching the council key (e.g., `county:richland/`).
4. **Modal lookup tables**: Add the county/city to the `DM_COUNTY_FILES`, `DM_CITY_FILES`, and `DM_COUNTY_CITIES` objects in `ActionModal.astro` (inlined district matcher section).
5. **Manual dropdown data**: Add the county to the `COUNTY_DISTRICTS` object in the manual dropdown population code in `ActionModal.astro`.
6. **Re-run build script**: `python scripts/build-districts.py` to generate the new boundary file.

### Data source strategy

- **Counties with public ArcGIS REST APIs**: Query directly (like Greenville, Spartanburg, Anderson)
- **Counties in SC RFA statewide shapefile**: Filter from the statewide file (like Pickens, Laurens)
- **Counties without public GIS**: May need to digitize from PDF maps or request data from the county

### Priority order for expansion

Consider expanding by population density / camera prevalence:
1. Richland County (Columbia) — 130 Flock cameras, most active surveillance
2. Charleston County — large metro area
3. Lexington County — Columbia suburb
4. York County — Charlotte suburb, growing
5. Remaining counties as needed
