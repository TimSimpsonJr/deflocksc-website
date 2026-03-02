# Action Widget Design

Custom action widget for the Take Action section. Looks up state and local representatives by zip code, presents tailored form letters with mailto: send buttons and copy-to-clipboard fallback.

## Architecture

Pure client-side. No backend. Replaces the WeAct placeholder in `TakeAction.astro`.

- **Google Civic Information API** — rep lookup by zip code. Free tier (25k req/day), API key restricted to Civic API + domain HTTP referrer. Key stored in `.env` as `PUBLIC_GOOGLE_CIVIC_API_KEY`, inlined at build time by Astro.
- **BigDataCloud reverse geocoding** — converts browser geolocation (lat/lng) to zip code. Free `-client` endpoint, no API key. Only called when user clicks "Use my location."
- **Letter data** — single `src/data/action-letters.json` file with division ID pattern matching and inline letter content.

## Data Structure

Single file `src/data/action-letters.json`. Each entry has a `divisionPattern` matched against OCD division IDs from the Civic API using `includes()`. First match wins. Last entry is a catch-all default.

```json
[
  {
    "divisionPattern": "state:sc/sldu:",
    "category": "state",
    "label": "State Senator",
    "subject": "Please schedule a hearing on S447, H3155, and H4013",
    "body": "Dear [NAME],\n\n..."
  },
  {
    "divisionPattern": "state:sc/sldl:",
    "category": "state",
    "label": "State Representative",
    "subject": "Please schedule a hearing on S447, H3155, and H4013",
    "body": "Dear [NAME],\n\n..."
  },
  {
    "divisionPattern": "state:sc/place:greenville",
    "category": "local",
    "label": "Greenville City Council",
    "subject": "Greenville needs a public vote on Flock Safety",
    "body": "Dear [NAME],\n\n..."
  },
  {
    "divisionPattern": "state:sc/county:greenville",
    "category": "local",
    "label": "Greenville County Council",
    "subject": "...",
    "body": "Dear [NAME],\n\n..."
  },
  {
    "divisionPattern": "state:sc/place:spartanburg",
    "category": "local",
    "label": "Spartanburg City Council",
    "subject": "...",
    "body": "Dear [NAME],\n\n..."
  },
  {
    "divisionPattern": "state:sc/county:spartanburg",
    "category": "local",
    "label": "Spartanburg County Council",
    "subject": "...",
    "body": "Dear [NAME],\n\n..."
  },
  {
    "divisionPattern": "state:sc/place:anderson",
    "category": "local",
    "label": "Anderson City Council",
    "subject": "...",
    "body": "Dear [NAME],\n\n..."
  },
  {
    "divisionPattern": "state:sc/county:anderson",
    "category": "local",
    "label": "Anderson County Council",
    "subject": "...",
    "body": "Dear [NAME],\n\n..."
  },
  {
    "divisionPattern": "state:sc/county:pickens",
    "category": "local",
    "label": "Pickens County Council",
    "subject": "...",
    "body": "Dear [NAME],\n\n..."
  },
  {
    "divisionPattern": "state:sc/county:laurens",
    "category": "local",
    "label": "Laurens County Council",
    "subject": "...",
    "body": "Dear [NAME],\n\n..."
  },
  {
    "divisionPattern": "state:sc/",
    "category": "local",
    "label": "Local Representative",
    "subject": "...",
    "body": "Dear [NAME],\n\n..."
  }
]
```

Only variable: `[NAME]` — replaced with rep name from API. For council groups using "Send Email All," greeting is "Dear Council Member."

## Widget UI

Replaces the placeholder `<div>` in `TakeAction.astro`. Three states:

### Input State

- Zip code text field + "Look Up My Reps" red button
- "Use my location instead" link below
- Privacy note under location link: "Your location is used only to find your representatives. We don't store or share any location data."
- Dark glass aesthetic: `#0f172a` bg, `#334155` border, red accent on submit

### Loading State

- Spinner + "Finding your representatives..."
- Replaces input area

### Results State

Reps grouped by body. Each group has:

- Group header (e.g., "YOUR STATE LEGISLATORS", "GREENVILLE CITY COUNCIL")
- List of reps: name + office/district
- Action buttons per rep (state) or per group (local councils)
- Collapsible "Preview & edit letter" section with:
  - Subject line (read-only display)
  - Editable textarea pre-filled with the matched letter, `[NAME]` replaced
  - Edits persist for all Send buttons in that group

**State legislators:** Individual "Send Email" + "Copy Letter" buttons per rep. Each mailto: has that rep's name in the greeting.

**Local councils:** "Send Email All" button (all council emails in `to:` field, generic greeting) + "Copy Letter" button. Individual send buttons would be too much friction for 6+ council members.

**"Look up a different zip" link** at the bottom to reset to input state.

### Error State

- Bad zip: "We couldn't find representatives for that zip code. Please check and try again."
- API failure: "Something went wrong. Please try again in a moment."
- Input field remains/reappears for retry.

## Geolocation Flow

1. User clicks "Use my location"
2. Browser prompts for location permission
3. On success: lat/lng → BigDataCloud (`/data/reverse-geocode-client?latitude={lat}&longitude={lng}&localityLanguage=en`) → extract `postcode` → pass to Google Civic API
4. On denial/error: "Location access denied. Please enter your zip code instead." — input field stays visible

## mailto: Construction

```
mailto:{email}?subject={encoded_subject}&body={encoded_body}
```

- Subject and body are URI-encoded
- `[NAME]` replaced with rep's actual name
- For "Send Email All": all council emails joined with commas in the `to:` field, greeting uses "Dear Council Member"
- Fallback "Copy Letter" button: copies subject + body to clipboard, shows brief "Copied!" confirmation

## Letter Coverage

| Entry | Source |
|-------|--------|
| State legislator (Senate + House) | Letter A from vault (~195 words) |
| Greenville City Council | Letter B from vault (~215 words) |
| Greenville County Council | New — based on vault research |
| Spartanburg City Council | New — based on vault research |
| Spartanburg County Council | New — based on vault research |
| Anderson City Council | New — based on vault research |
| Anderson County Council | New — based on vault research |
| Pickens County Council | New — based on vault research |
| Laurens County Council | New — based on vault research |
| Default fallback | New — generic SC local body letter |

All local letters follow Letter B's structure: open with a concrete local incident or fact, explain the Flock data-sharing problem, make specific asks relevant to that body's authority.

## Visual Design

Matches existing site aesthetic:
- Dark card: `#0f172a` bg, `#334155` border, rounded corners
- Red accent (`#ef4444`) on primary action buttons (Send Email)
- Secondary buttons (Copy Letter) use `#334155` bg with light text
- Rep names in white, office/district in `#94a3b8`
- Group headers in uppercase `#64748b`, small font weight
- Textarea: `#0f172a` bg, `#334155` border, `#cbd5e1` text, Inter 400
- Inherits the blue glow background from the TakeAction section
