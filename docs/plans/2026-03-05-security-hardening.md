# Security Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 6 security vulnerabilities identified in the red team audit.

**Architecture:** Static site on Netlify. No server runtime, no auth, no database. Fixes are: security headers via `public/_headers`, replacing JSONP with `fetch()`, sanitizing camera popup HTML, revoking dead credentials, gitignoring TinaCMS admin, and running npm audit fix.

**Tech Stack:** Astro 5, Netlify, MapLibre GL JS, Census Bureau geocoder API

---

### Task 1: Create branch from master

**Files:**
- None (git operation only)

**Step 1: Create and switch to new branch**

```bash
git checkout master
git checkout -b security/hardening
```

**Step 2: Verify clean state**

```bash
git status
```

Expected: clean working tree on `security/hardening`

---

### Task 2: Add security headers via `public/_headers`

**Files:**
- Create: `public/_headers`

**Step 1: Create the headers file**

Create `public/_headers` with these contents. The CSP allows `'unsafe-inline'` for scripts because Astro generates 7 inline `<script>` blocks. The `connect-src` includes all external APIs the site calls. `frame-ancestors 'none'` prevents clickjacking.

```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(self), camera=(), microphone=(), payment=()
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://scstatehouse.gov https://*.scstatehouse.gov https://scdailygazette.com https://cms.deflock.me https://upload.wikimedia.org; connect-src 'self' https://geocoding.geo.census.gov https://cms.deflock.me https://tiles.openfreemap.org https://*.openfreemap.org https://cloud.umami.is; worker-src blob:; frame-ancestors 'none'
```

Key decisions:
- `worker-src blob:` — MapLibre uses web workers loaded from blobs
- `img-src` includes wikimedia (camera photos), scstatehouse (rep photos), deflock CMS (vendor images)
- `connect-src` includes Census geocoder, Deflock CMS, OpenFreeMap tiles, Umami Cloud
- No `frame-src` needed — site doesn't embed iframes anymore

**Step 2: Commit**

```bash
git add public/_headers
git commit -m "security: add CSP and security headers via Netlify _headers"
```

---

### Task 3: Replace JSONP with fetch() in ActionModal

**Files:**
- Modify: `src/components/ActionModal.astro:362-403`

**Step 1: Replace the `geocodeAddress` function**

Replace the JSONP-based `geocodeAddress` function (lines 362-404) with a `fetch()`-based version modeled on `src/lib/district-matcher.js:207-256`. The logic is identical — only the transport changes from JSONP script injection to a standard `fetch()` call with `format: 'json'`.

Replace:
```javascript
  async function geocodeAddress(address) {
    var result = { lat: null, lng: null, senate: null, house: null };
    try {
      var params = new URLSearchParams({ address: address, benchmark: 'Public_AR_Current', vintage: 'Current_Current', format: 'jsonp' });
      var data = await new Promise(function(resolve, reject) {
        var callbackName = '_censusCallback_' + Date.now();
        var timeout = setTimeout(function() {
          delete window[callbackName];
          if (script.parentNode) script.parentNode.removeChild(script);
          reject(new Error('Census geocoder timed out'));
        }, 10000);
        window[callbackName] = function(response) {
          clearTimeout(timeout);
          delete window[callbackName];
          if (script.parentNode) script.parentNode.removeChild(script);
          resolve(response);
        };
        var script = document.createElement('script');
        script.src = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?' + params.toString() + '&callback=' + callbackName;
        script.onerror = function() {
          clearTimeout(timeout);
          delete window[callbackName];
          if (script.parentNode) script.parentNode.removeChild(script);
          reject(new Error('Census geocoder network error'));
        };
        document.head.appendChild(script);
      });
      var matches = data.result && data.result.addressMatches;
      if (!matches || matches.length === 0) return result;
      var match = matches[0];
      if (match.coordinates) { result.lng = match.coordinates.x; result.lat = match.coordinates.y; }
      var geo = match.geographies;
      if (geo) {
        var upper = geo['2024 State Legislative Districts - Upper'] || geo['State Legislative Districts - Upper'];
        if (upper && upper.length > 0 && upper[0].BASENAME) result.senate = upper[0].BASENAME;
        var lower = geo['2024 State Legislative Districts - Lower'] || geo['State Legislative Districts - Lower'];
        if (lower && lower.length > 0 && lower[0].BASENAME) result.house = lower[0].BASENAME;
      }
    } catch (e) {
      console.warn('Census geocoder failed:', e);
    }
    return result;
  }
```

With:
```javascript
  async function geocodeAddress(address) {
    var result = { lat: null, lng: null, senate: null, house: null };
    try {
      var params = new URLSearchParams({ address: address, benchmark: 'Public_AR_Current', vintage: 'Current_Current', format: 'json' });
      var controller = new AbortController();
      var timeout = setTimeout(function() { controller.abort(); }, 10000);
      var res = await fetch('https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?' + params.toString(), { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error('Census geocoder HTTP ' + res.status);
      var data = await res.json();
      var matches = data.result && data.result.addressMatches;
      if (!matches || matches.length === 0) return result;
      var match = matches[0];
      if (match.coordinates) { result.lng = match.coordinates.x; result.lat = match.coordinates.y; }
      var geo = match.geographies;
      if (geo) {
        var upper = geo['2024 State Legislative Districts - Upper'] || geo['State Legislative Districts - Upper'];
        if (upper && upper.length > 0 && upper[0].BASENAME) result.senate = upper[0].BASENAME;
        var lower = geo['2024 State Legislative Districts - Lower'] || geo['State Legislative Districts - Lower'];
        if (lower && lower.length > 0 && lower[0].BASENAME) result.house = lower[0].BASENAME;
      }
    } catch (e) {
      console.warn('Census geocoder failed:', e);
    }
    return result;
  }
```

**Step 2: Test manually**

Run the dev server, open the action modal, enter an SC address, click "Find My Reps". Verify the address resolves and reps are shown. Check browser console for no CORS errors.

**Step 3: Commit**

```bash
git add src/components/ActionModal.astro
git commit -m "security: replace JSONP Census geocoder with fetch()"
```

---

### Task 4: Sanitize camera map popup HTML

**Files:**
- Modify: `src/scripts/camera-map.ts:121-177`

**Step 1: Add an `escapeHtml` helper near the top of the popup section**

Add after line 120 (after the `// --- Camera popup ---` comment):

```typescript
function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
```

**Step 2: Replace the `showCameraPopup` function body**

Replace the string-concatenated HTML (lines 141-168) with escaped interpolation. Every value from external data (`manufacturer`, `operator`, `id`, `imageUrl`, `direction`) must pass through `escapeHtml()` or be a computed number.

Replace lines 141-175 with:

```typescript
  let html = '<div class="camera-popup">';

  if (imageUrl) {
    const label = manufacturer ? escapeHtml(manufacturer) + ' LPR' : 'ALPR Camera';
    html += `<div class="camera-popup-img"><img src="${escapeHtml(imageUrl)}" alt="${label}" loading="lazy" /><span class="camera-popup-img-label">${label}</span></div>`;
  } else {
    html += '<div class="camera-popup-img camera-popup-img-empty"><span>ALPR Camera</span></div>';
  }

  if (manufacturer) {
    html += `<div class="camera-popup-mfr">Made by<br><strong>${escapeHtml(manufacturer)}</strong></div>`;
  }

  if (operator && operator !== manufacturer) {
    html += `<div class="camera-popup-op">Operated by ${escapeHtml(operator)}</div>`;
  }

  if (direction !== null) {
    html += `<div class="camera-popup-dir">Facing ${Math.round(direction)}&deg;</div>`;
  }

  html += `<a class="camera-popup-link" href="https://www.openstreetmap.org/node/${encodeURIComponent(String(id))}" target="_blank" rel="noopener">&#x2197; VIEW ON OSM</a>`;

  html += '</div>';

  if (typeof umami !== 'undefined') umami.track('camera-popup-viewed');

  new maplibregl.Popup({ closeButton: true, maxWidth: '260px', offset: 12 })
    .setLngLat(coords)
    .setHTML(html)
    .addTo(map);
```

Key changes:
- `manufacturer`, `operator` → `escapeHtml()`
- `imageUrl` → `escapeHtml()` (prevents attribute breakout)
- `id` → `encodeURIComponent()` (URL component, not HTML)
- `direction` → already `Math.round()` (number, safe)

**Step 3: Test manually**

Run dev server, click a camera marker on the map. Verify popup still shows manufacturer, operator, direction, and OSM link correctly.

**Step 4: Commit**

```bash
git add src/scripts/camera-map.ts
git commit -m "security: sanitize camera popup HTML to prevent XSS from external data"
```

---

### Task 5: Gitignore `public/admin/` and delete `.env`

**Files:**
- Modify: `.gitignore`
- Delete: `.env`

**Step 1: Add `public/admin/` to `.gitignore`**

Append this line to `.gitignore`:

```
public/admin/
```

**Step 2: Delete the `.env` file**

```bash
rm .env
```

(The Mapbox token should also be revoked manually in the Mapbox dashboard — note this in the commit message.)

**Step 3: Commit**

```bash
git add .gitignore
git commit -m "security: gitignore TinaCMS admin dir, delete unused .env

The .env contained only an unused Mapbox token (site uses OpenFreeMap).
Revoke the token manually at https://account.mapbox.com/access-tokens/"
```

---

### Task 6: Run npm audit fix

**Files:**
- Modify: `package.json` (possibly)
- Modify: `package-lock.json`

**Step 1: Run audit fix**

```bash
npm audit fix
```

If it reports issues that require `--force`, do NOT use `--force`. Only apply safe fixes. Report remaining vulnerabilities.

**Step 2: Verify build still works**

```bash
npm run build
```

Expected: clean build with no errors.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "security: npm audit fix for dependency vulnerabilities"
```

---

### Task 7: Verify all fixes

**Step 1: Run full build**

```bash
npm run build
```

**Step 2: Deploy preview (optional)**

Push branch and verify Netlify deploy preview has the security headers:

```bash
git push -u origin security/hardening
```

Then `curl -sI` the deploy preview URL to confirm headers are present.

**Step 3: Test address lookup and camera map in dev**

- Open action modal → enter address → verify reps load (fetch, not JSONP)
- Click camera marker → verify popup renders correctly
- Check browser console for errors
