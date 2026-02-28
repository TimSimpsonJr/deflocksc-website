"""
Scrape bill status from scstatehouse.gov and update bills.json.

Fetches each bill's page, parses the action history table and status info,
and updates src/data/bills.json with the latest status, last action, and date.
"""

import json
import os
import re
import sys

import requests
from bs4 import BeautifulSoup

BILLS_JSON = os.path.join(os.path.dirname(__file__), "..", "src", "data", "bills.json")
HEADERS = {"User-Agent": "DeflockSC-BillScraper/1.0 (+https://deflocksc.org)"}


def scrape_bill(url: str) -> dict:
    """Scrape a single bill page and return status fields."""
    resp = requests.get(url, timeout=30, headers=HEADERS)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    result = {"status": "", "lastAction": "", "lastActionDate": ""}

    cover = soup.find("div", class_="statusCoverSheet")
    if not cover:
        print(f"  WARNING: No statusCoverSheet found at {url}")
        return result

    # Find the action history table first (needed for both status and action extraction)
    table = cover.find("table")

    # Extract last action from the history table (last row)
    if table:
        tbody = table.find("tbody")
        if tbody:
            rows = tbody.find_all("tr")
            if rows:
                last_row = rows[-1]
                cells = last_row.find_all("td")
                if len(cells) >= 3:
                    result["lastActionDate"] = cells[0].get_text(strip=True)
                    action_text = cells[2].get_text(separator=" ", strip=True)
                    # Clean up journal page references for display
                    action_text = re.sub(
                        r"\s*\(\s*(?:House|Senate)\s+Journal-page\s+\d+\s*\)",
                        "",
                        action_text,
                    )
                    result["lastAction"] = action_text.strip()

    # Extract current status/committee from the <p> after "STATUS INFORMATION"
    paragraphs = cover.find_all("p")
    status_p = None
    for i, p in enumerate(paragraphs):
        if p.get_text(strip=True).upper() == "STATUS INFORMATION":
            if i + 2 < len(paragraphs):
                status_p = paragraphs[i + 2]
            break

    if status_p:
        intro_text = status_p.get_text(separator=" ", strip=True)
        chamber = "Senate" if "Senate" in intro_text else "House"

        span = status_p.find("span")
        if span:
            committee = span.get_text(strip=True)
            result["status"] = f"In Committee, {chamber} {committee}"
        else:
            # No span — check action history for the most recent committee referral
            committee_from_actions = None
            if table:
                tbody_check = table.find("tbody")
                if tbody_check:
                    for row in tbody_check.find_all("tr"):
                        cells = row.find_all("td")
                        if len(cells) >= 3:
                            action = cells[2].get_text(separator=" ", strip=True)
                            m = re.search(
                                r"Referred to Committee on\s+(.+?)(?:\s*\(|$)", action
                            )
                            if m:
                                committee_from_actions = m.group(1).strip()

            if committee_from_actions:
                result["status"] = f"In Committee, {chamber} {committee_from_actions}"
            else:
                for text in status_p.stripped_strings:
                    text = text.strip()
                    if "residing" in text.lower() or "currently" in text.lower():
                        result["status"] = text
                        break

    return result


def main():
    with open(BILLS_JSON, "r", encoding="utf-8") as f:
        bills = json.load(f)

    changes = []

    for bill in bills:
        bill_id = bill["bill"]
        url = bill["url"]
        print(f"Scraping {bill_id} from {url}...")

        try:
            scraped = scrape_bill(url)
        except Exception as e:
            print(f"  ERROR scraping {bill_id}: {e}")
            continue

        updated = False
        for field in ("status", "lastAction", "lastActionDate"):
            new_val = scraped[field]
            old_val = bill.get(field, "")
            if new_val and new_val != old_val:
                bill[field] = new_val
                changes.append(f"  {bill_id}.{field}: '{old_val}' -> '{new_val}'")
                updated = True

        if not updated:
            print(f"  {bill_id}: no changes")

    with open(BILLS_JSON, "w", encoding="utf-8") as f:
        json.dump(bills, f, indent=2, ensure_ascii=False)
        f.write("\n")

    if changes:
        print(f"\n{len(changes)} field(s) updated:")
        for c in changes:
            print(c)
    else:
        print("\nNo changes detected.")


if __name__ == "__main__":
    main()
