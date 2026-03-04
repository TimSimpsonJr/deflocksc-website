"""Adapter for scraping Greenville County Council members.

Scrapes two pages:
  1. /Council/ -- main listing with names, titles (Chairman/Vice Chair), districts
  2. /Council/ContactInfo.aspx -- email addresses and phone numbers by district

Data is merged by district number to produce complete records.
"""

import re

import requests
from bs4 import BeautifulSoup

from .base import BaseAdapter

USER_AGENT = "DeflockSC-RepScraper/1.0 (+https://deflocksc.org)"

# The registry URL may redirect; these are the canonical HTTPS URLs.
LISTING_URL = "https://www.greenvillecounty.org/Council/"
CONTACT_URL = "https://www.greenvillecounty.org/Council/ContactInfo.aspx"


class GreenvilleCountyAdapter(BaseAdapter):
    """Scraper for Greenville County Council members."""

    def fetch(self) -> str:
        """Fetch both the listing page and contact info page.

        Returns the listing page HTML. The contact page is fetched
        separately during parse() since we need both pages.
        """
        headers = {"User-Agent": USER_AGENT}
        resp = requests.get(LISTING_URL, headers=headers, timeout=30)
        resp.raise_for_status()
        # Store contact page HTML for use in parse()
        contact_resp = requests.get(CONTACT_URL, headers=headers, timeout=30)
        contact_resp.raise_for_status()
        self._contact_html = contact_resp.text
        return resp.text

    def parse(self, html: str) -> list[dict]:
        """Parse council member data from the listing + contact pages."""
        members_by_district = {}

        # --- Parse main listing page for names and titles ---
        self._parse_listing(html, members_by_district)

        # --- Parse contact info page for email and phone ---
        self._parse_contacts(self._contact_html, members_by_district)

        # Build final list sorted by district number
        results = []
        for district in sorted(members_by_district.keys()):
            member = members_by_district[district]
            results.append(member)

        return results

    def _parse_listing(self, html: str, members: dict) -> None:
        """Extract name, title, and district from the main listing page.

        Each member appears in a div.portraitImgSmall with structure:
            <label>
                <a href="CouncilMember.aspx?m=...">Name</a>
                <span>Title<br/>District N<br/></span>
            </label>
        """
        soup = BeautifulSoup(html, "html.parser")

        for portrait in soup.find_all("div", class_="portraitImgSmall"):
            link = portrait.find("a", href=re.compile(r"CouncilMember\.aspx"))
            if not link:
                continue

            name = link.get_text(strip=True)

            # The span inside label has title + district
            span = portrait.find("span")
            if not span:
                continue

            span_text = span.get_text(separator="\n", strip=True)
            lines = [line.strip() for line in span_text.split("\n") if line.strip()]

            # Extract district number
            district_num = None
            title_part = None
            for line in lines:
                district_match = re.match(r"District\s+(\d+)", line, re.IGNORECASE)
                if district_match:
                    district_num = int(district_match.group(1))
                elif line.lower() not in ("", "district"):
                    # This is the title line (Chairman, V. Chair, etc.)
                    title_part = line

            if district_num is None:
                continue

            # Build the title string
            if title_part:
                # Normalize "V. Chair" to "Vice Chair"
                if title_part.lower() in ("v. chair", "v.chair", "vice chair"):
                    title = f"Vice Chair, District {district_num}"
                else:
                    title = f"{title_part}, District {district_num}"
            else:
                title = f"Council Member, District {district_num}"

            members[district_num] = {
                "name": name,
                "title": title,
                "email": "",
                "phone": "",
            }

    def _parse_contacts(self, html: str, members: dict) -> None:
        """Extract email and phone from the contact info page.

        The contact page uses <h2>District N</h2> headers followed by:
          - div.memberaddress with inline JS: var contact, var email, var emailHost
          - div.memberphone with phone number text

        Email is constructed from the JS variables since the page uses
        document.write() to avoid spam bots scraping mailto: links.
        """
        soup = BeautifulSoup(html, "html.parser")

        # Find all district headings
        for h2 in soup.find_all("h2"):
            h2_text = h2.get_text(strip=True)
            district_match = re.match(r"District\s+(\d+)", h2_text, re.IGNORECASE)
            if not district_match:
                continue

            district_num = int(district_match.group(1))

            # Find the next memberaddress div (contains JS with email)
            address_div = h2.find_next("div", class_="memberaddress")
            email = ""
            contact_name = ""
            if address_div:
                script = address_div.find("script")
                if script and script.string:
                    js_text = script.string
                    # Extract: var email = "JRusso"
                    email_match = re.search(
                        r'var\s+email\s*=\s*["\']([^"\']+)["\']', js_text
                    )
                    # Extract: var emailHost = "greenvillecounty.org"
                    host_match = re.search(
                        r'var\s+emailHost\s*=\s*["\']([^"\']+)["\']', js_text
                    )
                    if email_match and host_match:
                        email = f"{email_match.group(1)}@{host_match.group(1)}"

                    # Extract name from contact var as fallback
                    contact_match = re.search(
                        r'var\s+contact\s*=\s*["\']([^"\']+)["\']', js_text
                    )
                    if contact_match:
                        contact_name = contact_match.group(1).strip()

            # Find the next memberphone div
            phone_div = h2.find_next("div", class_="memberphone")
            phone = ""
            if phone_div:
                phone_text = phone_div.get_text()
                # Match phone number pattern: 864.483.2474
                phone_match = re.search(r"(\d{3})\.(\d{3})\.(\d{4})", phone_text)
                if phone_match:
                    # Format as (864) 483-2474 to match existing data format
                    phone = f"({phone_match.group(1)}) {phone_match.group(2)}-{phone_match.group(3)}"

            # Update existing member record or create a new one
            if district_num in members:
                members[district_num]["email"] = email
                members[district_num]["phone"] = phone
                # Prefer the contact page name when it's more complete
                # (e.g. "Ennis Fant, Sr." vs "Ennis Fant")
                listing_name = members[district_num]["name"]
                if contact_name and len(contact_name) > len(listing_name):
                    members[district_num]["name"] = contact_name
            else:
                # Member not found on listing page; use contact page data
                members[district_num] = {
                    "name": contact_name,
                    "title": f"Council Member, District {district_num}",
                    "email": email,
                    "phone": phone,
                }
