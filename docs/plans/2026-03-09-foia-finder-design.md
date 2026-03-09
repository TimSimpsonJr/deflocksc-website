# FOIA Agency Finder Design

## Problem

The FOIA tab has letter templates but tells users to "search your agency's website" to find the records custodian. Most people don't know which agency operates cameras near them, let alone where to send a FOIA request. The finder closes that gap.

## Solution

Add an agency finder to the top of the existing FOIA tab. Two input paths:

1. **Location-based lookup** (primary) -- geolocation or address, matches to county/city, shows agencies in that area
2. **Browse all agencies** (fallback) -- searchable/filterable list for users who already know the agency

When a user selects an agency, the existing letter templates auto-fill `[AGENCY NAME]` and `[AGENCY RECORDS CUSTODIAN]`.

## Data Model

New file: `src/data/foia-contacts.json`

```json
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
    "name": "Public Records Division",
    "email": "records@greenvillesc.gov",
    "phone": "864-271-5333",
    "address": "4 McGee St, Greenville, SC 29601"
  },
  "notes": "Greenville PD has refused to disclose camera locations publicly."
}
```

### Agency types

- `police` / `sheriff` -- primary FOIA targets, camera operators
- `clerk` -- city/county clerk for budget and approval records (shown as secondary)
- `sled` / `scdot` -- statewide agencies, always shown regardless of location

### Scope

Camera-confirmed agencies plus all county sheriffs and cities over ~25k population. City/county clerk offices included as secondary targets for budget and approval records.

## UI Layout

### Zone 1: Agency Finder (new, top of FOIA tab)

- Heading, brief FOIA explainer (reworked from current intro)
- Input row: "Use My Location" button + address text field + "Find Agencies" submit
- "Browse all agencies" link expands full list with text search + type filter chips

### Zone 1 results (after lookup)

- Agency cards grouped: law enforcement first, clerk offices second, statewide agencies third
- Each card shows: name, type badge, camera count (if known), custodian email/phone, notes
- "Use This Agency" button on each card

### Zone 2: Template Sidebar + Panel (existing, unchanged layout)

- When agency selected: banner above templates says "Templates pre-filled for **X** -- [change]"
- `[AGENCY NAME]` and `[AGENCY RECORDS CUSTODIAN]` replaced in rendered template text
- Copy-to-clipboard picks up filled-in text

### Zone 3: Filing Instructions (existing, unchanged)

## Technical Architecture

### Location matching

Reuses existing `district-matcher.ts`:
- `geocodeAddress()` for address -> lat/lng
- `matchDistricts()` for lat/lng -> county + city
- Filter `foia-contacts.json` by matched county/city

No new boundary files or geo code needed.

### Data loading

`foia-contacts.json` is imported at build time in the Astro frontmatter and injected into a `<script>` data island (same pattern as action-modal). No runtime fetch.

### Auto-fill

- Module-level variable stores selected agency
- On selection: replace placeholder text in rendered template elements
- Reset link restores original placeholder markup
- Templates stay generic -- localization is in the finder context, not the letter text

### New files

- `src/data/foia-contacts.json` -- curated agency dataset
- `src/scripts/foia-finder.ts` -- finder UI logic (search, filter, results, auto-fill)

### Modified files

- `src/components/ToolkitFoia.astro` -- add finder HTML above existing template UI

### Reused infrastructure

- `district-matcher.ts` -- `matchDistricts()`, `geocodeAddress()`
- Browser Geolocation API (same pattern as ActionModal)

### No new dependencies
