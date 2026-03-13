"""Download OpenStates SC CSV and update state-legislators.json."""

import csv
import io
import json
import re
import time
from datetime import date

import requests
from bs4 import BeautifulSoup

HEADERS = {"User-Agent": "DeflockSC-RepScraper/1.0 (+https://deflocksc.org)"}


REQUIRED_CSV_COLUMNS = {"name", "current_district", "current_chamber", "current_party"}


def download_csv(url: str) -> list[dict]:
    """Download the OpenStates CSV and return rows as dicts."""
    print(f"  Downloading {url}...")
    resp = requests.get(url, timeout=60, headers=HEADERS)
    resp.raise_for_status()
    reader = csv.DictReader(io.StringIO(resp.text))
    rows = list(reader)

    # Validate CSV has expected columns
    if rows:
        actual_columns = set(rows[0].keys())
        missing = REQUIRED_CSV_COLUMNS - actual_columns
        if missing:
            raise ValueError(
                f"OpenStates CSV is missing expected columns: {missing}. "
                f"Available: {sorted(actual_columns)}"
            )

    return rows


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


def _scrape_member_page(member_url: str) -> dict:
    """Scrape email and phone from a scstatehouse.gov member page.

    Returns a dict with optional "email" and "phone" keys.
    """
    result = {}
    try:
        resp = requests.get(member_url, timeout=15, headers=HEADERS)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # Look for email in mailto links
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if href.startswith("mailto:"):
                email = href[7:].strip()
                if "@" in email:
                    result["email"] = email
                    break

        # Look for email in page text if no mailto link found
        if "email" not in result:
            text = soup.get_text()
            match = re.search(
                r"[a-zA-Z0-9._%+-]+@(?:schouse|scsenate)\.gov", text
            )
            if match:
                result["email"] = match.group(0)

        # Look for phone
        for span in soup.find_all("span"):
            if span.get_text(strip=True) == "Business Phone":
                p_text = span.parent.get_text(strip=True)
                match = re.search(r"\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}", p_text)
                if match:
                    result["phone"] = match.group(0)
                    break

    except Exception as e:
        print(f"    WARNING: Failed to scrape {member_url}: {e}")

    return result


def _generate_email(name: str, chamber: str) -> str:
    """Generate an email from the legislator's name using the SC convention.

    SC House uses firstnamelastname@schouse.gov and Senate uses
    firstnamelastname@scsenate.gov.  Hyphens, periods, suffixes (Jr, Sr,
    III, etc.) and middle names/initials are stripped.
    """
    domain = "scsenate.gov" if chamber == "senate" else "schouse.gov"

    # Remove common suffixes
    cleaned = re.sub(r",?\s+(Jr\.?|Sr\.?|II|III|IV)\s*$", "", name, flags=re.IGNORECASE)
    parts = cleaned.split()
    if len(parts) < 2:
        return ""

    first = parts[0]
    last = parts[-1]

    # Strip non-alpha characters (hyphens, periods, apostrophes)
    local = re.sub(r"[^a-zA-Z]", "", first + last).lower()
    return f"{local}@{domain}"


def _backfill_emails(data: dict):
    """Backfill emails by scraping scstatehouse.gov, then fall back to name convention."""
    members = []
    for chamber in ("senate", "house"):
        for dist, rec in data.get(chamber, {}).items():
            if not rec.get("email") and rec.get("name"):
                members.append((chamber, rec))

    if not members:
        print("  All members already have email addresses")
        return

    print(f"  Backfilling emails for {len(members)} member(s)...")
    scraped = 0
    generated = 0

    for i, (chamber, rec) in enumerate(members):
        # Try scraping from scstatehouse.gov first
        if rec.get("website"):
            info = _scrape_member_page(rec["website"])
            if info.get("email"):
                rec["email"] = info["email"]
                scraped += 1
                print(f"    Scraped email for {rec['name']}: {info['email']}")
                # Also grab phone if we got it for free
                if info.get("phone") and not rec.get("phone"):
                    rec["phone"] = info["phone"]
                if (i + 1) < len(members):
                    time.sleep(0.3)  # polite rate limiting
                continue
            if (i + 1) < len(members):
                time.sleep(0.3)

        # Fall back to name-based generation
        email = _generate_email(rec["name"], chamber)
        if email:
            rec["email"] = email
            generated += 1
            print(f"    Generated email for {rec['name']}: {email}")

    print(f"  Backfilled {scraped + generated} email(s) "
          f"({scraped} scraped, {generated} generated from name convention)")


def _backfill_phones(data: dict):
    """Fetch phone numbers from scstatehouse.gov for members missing them."""
    members = []
    for chamber in ("senate", "house"):
        for dist, rec in data.get(chamber, {}).items():
            if not rec.get("phone") and rec.get("website"):
                members.append(rec)

    if not members:
        print("  All members already have phone numbers")
        return

    print(f"  Backfilling phone numbers for {len(members)} members from scstatehouse.gov...")
    filled = 0
    for i, rec in enumerate(members):
        info = _scrape_member_page(rec["website"])
        if info.get("phone"):
            rec["phone"] = info["phone"]
            filled += 1
        # Also grab email if we got it for free
        if info.get("email") and not rec.get("email"):
            rec["email"] = info["email"]
        if (i + 1) % 20 == 0:
            print(f"    ... {i + 1}/{len(members)} done")
        time.sleep(0.3)  # polite rate limiting

    print(f"  Backfilled {filled}/{len(members)} phone numbers")


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

    # Sanity checks: SC has 46 senate and 124 house districts
    if len(senate) < 37:  # 80% threshold
        raise ValueError(
            f"Only {len(senate)} senate members found (expected ~46). "
            f"Data source may have changed."
        )
    if len(house) < 99:  # 80% threshold
        raise ValueError(
            f"Only {len(house)} house members found (expected ~124). "
            f"Data source may have changed."
        )

    # Validate individual records
    for chamber_name, chamber_data in [("senate", senate), ("house", house)]:
        for district, record in chamber_data.items():
            if not record.get("name"):
                print(f"  WARNING: {chamber_name}[{district}] has no name")
            if not record.get("email") and not record.get("phone"):
                print(f"  WARNING: {chamber_name}[{district}] ({record.get('name', '?')}) has no email or phone")

    data = {"senate": senate, "house": house}

    # Backfill missing emails using SC naming convention
    _backfill_emails(data)

    # Backfill phone numbers from scstatehouse.gov member pages
    _backfill_phones(data)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"  Wrote {output_path}")
