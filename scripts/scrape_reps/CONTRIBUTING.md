# Adding and Updating Representative Data

## Manual Jurisdictions

Jurisdictions with `"adapter": "manual"` in `src/data/registry.json` need hand-populated data. This guide tells you exactly how to do it.

## Steps

1. **Read the registry entry** in `src/data/registry.json` for the target jurisdiction. Note the `id`, `url`, and `notes` fields.

2. **Visit the URL** listed in the registry entry. This is the official council page.

3. **Collect member data.** For each council member, gather as many of these fields as the site publishes:

   | Field | Required | Example |
   |-------|----------|---------|
   | `name` | Yes | `"Jane Smith"` |
   | `title` | Yes | `"Council Member, District 3"` |
   | `email` | No | `"jsmith@county.gov"` |
   | `phone` | No | `"(864) 555-1234"` |
   | `party` | No | `"R"`, `"D"`, `"I"` |
   | `photoUrl` | No | `"https://..."` |
   | `website` | No | `"https://..."` |
   | `source` | Yes | `"manual"` |
   | `lastUpdated` | Yes | `"2026-03-03"` (today's date) |

4. **Write to `src/data/local-councils.json`** under the jurisdiction's key (matching the registry `id`). Follow the existing structure:

   ```json
   "county:example": {
     "label": "Example County Council",
     "members": [
       {
         "name": "Jane Smith",
         "title": "Council Member, District 1",
         "email": "jsmith@examplecounty.gov",
         "phone": "(803) 555-1234",
         "source": "manual",
         "lastUpdated": "2026-03-03"
       }
     ]
   }
   ```

5. **Set `source` to `"manual"`** and **`lastUpdated` to today's date** on every record.

## Title Format

Use these patterns for the `title` field:
- `"Council Member, District 3"` -- standard district member
- `"Chairman, District 5"` -- chair with district
- `"Vice Chairman, District 4"` -- vice chair with district
- `"Mayor"` -- mayor (no district)
- `"Council Member, At Large"` -- at-large member
- `"Council Member, Seat 7"` -- numbered seat (Anderson City pattern)

## Common Gotchas

- Some counties don't publish individual emails. Use the Clerk to Council email for all members and note this in the registry `notes` field.
- "Vacant" seats: use `"name": "Vacant"` with empty email and phone.
- Phone numbers: use the format `"(XXX) XXX-XXXX"`.
- Check the registry `notes` field for jurisdiction-specific issues before starting.

## Adding a New Jurisdiction

1. Add a new entry to `src/data/registry.json` in the `jurisdictions` array.
2. Set `"adapter": "manual"` (or the appropriate adapter name if a scraper exists).
3. Include `url` (the official council page) and `notes` (any quirks).
4. Set `hasBoundary` to `false` unless you have boundary data.
5. Add the member data to `src/data/local-councils.json` as above.
