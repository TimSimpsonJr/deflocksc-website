"""Download OpenStates SC CSV and update state-legislators.json."""

import csv
import io
import json
from datetime import date

import requests

HEADERS = {"User-Agent": "DeflockSC-RepScraper/1.0 (+https://deflocksc.org)"}


def download_csv(url: str) -> list[dict]:
    """Download the OpenStates CSV and return rows as dicts."""
    print(f"  Downloading {url}...")
    resp = requests.get(url, timeout=60, headers=HEADERS)
    resp.raise_for_status()
    reader = csv.DictReader(io.StringIO(resp.text))
    return list(reader)


def normalize_row(row: dict) -> dict:
    """Convert an OpenStates CSV row to our unified schema."""
    record = {
        "name": row.get("name", "").strip(),
        "district": row.get("current_district", "").strip(),
        "party": _abbreviate_party(row.get("current_party", "")),
        "email": row.get("email", "").strip(),
        "phone": row.get("capitol_voice", "").strip(),
        "photoUrl": row.get("image", "").strip(),
        "website": _first_link(row.get("links", "")),
        "source": "openstates",
        "lastUpdated": date.today().isoformat(),
    }

    # Optional social media fields -- only include if present
    if row.get("twitter", "").strip():
        record["twitter"] = row["twitter"].strip()
    if row.get("facebook", "").strip():
        record["facebook"] = row["facebook"].strip()

    return record


def _abbreviate_party(party: str) -> str:
    party = party.strip().lower()
    if party.startswith("democrat"):
        return "D"
    if party.startswith("republican"):
        return "R"
    if party.startswith("independent"):
        return "I"
    return party[:1].upper() if party else ""


def _first_link(links_str: str) -> str:
    """Extract first URL from OpenStates links field (semicolon-separated)."""
    if not links_str or not links_str.strip():
        return ""
    return links_str.strip().split(";")[0].strip()


def update_state_legislators(source_url: str, output_path: str):
    """Download OpenStates CSV and write state-legislators.json."""
    rows = download_csv(source_url)
    print(f"  Downloaded {len(rows)} rows")

    senate = {}
    house = {}

    for row in rows:
        chamber = row.get("current_chamber", "").strip().lower()
        district = row.get("current_district", "").strip()
        if not district:
            continue

        record = normalize_row(row)

        if chamber == "upper":
            senate[district] = record
        elif chamber == "lower":
            house[district] = record
        else:
            print(f"  WARNING: Unknown chamber '{chamber}' for {record['name']}")

    print(f"  Senate: {len(senate)} members, House: {len(house)} members")

    data = {"senate": senate, "house": house}

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"  Wrote {output_path}")
