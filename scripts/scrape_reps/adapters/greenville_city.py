"""Adapter for scraping Greenville City Council members.

Uses the CivicPlus Headless CMS API to fetch council member data.

The greenvillesc.gov site is built on CivicPlus CMS, which renders content
client-side via JavaScript. The raw HTML contains a guest JWT token that
grants read access to the content API at content.civicplus.com.

Strategy:
  1. Fetch the City Council page to extract the guest JWT token and
     the sidebar nav (which has authoritative display names)
  2. Call GET /api/content/sc-greenville/employee to list all employees
  3. Filter to those in the "City Council" category
  4. Parse name, title, email, and phone from the employee data
  5. Cross-reference with sidebar nav names to correct display names
     (the CMS sometimes has abbreviated or differently-cased names)

The Mayor's employee record has no phone number in the CMS -- the phone
shown on the Mayor's page belongs to the Executive Assistant (Kendra
Williams). We use the assistant's phone as the Mayor's office number,
matching the existing manual data.
"""

import re

import requests
from bs4 import BeautifulSoup

from .base import BaseAdapter

USER_AGENT = "DeflockSC-RepScraper/1.0 (+https://deflocksc.org)"

# CivicPlus HCMS API endpoint for employee content items.
EMPLOYEE_API = "https://content.civicplus.com/api/content/sc-greenville/employee"

# The "City Council" category ID in the Greenville CivicPlus CMS.
CITY_COUNCIL_CATEGORY = "f4b692b4-586b-44b0-be1d-03437409ee08"

# Page to fetch for extracting the guest JWT token.
# Using the council page; any greenvillesc.gov page would work.
TOKEN_PAGE = "https://www.greenvillesc.gov/283/City-Council"


class GreenvilleCityAdapter(BaseAdapter):
    """Scraper for Greenville City Council members."""

    def fetch(self) -> str:
        """Fetch council member data from the CivicPlus content API.

        Returns JSON text (not HTML). The parse() method handles JSON.
        """
        headers = {"User-Agent": USER_AGENT}

        # Step 1: Get a page to extract the guest JWT token.
        page_resp = requests.get(TOKEN_PAGE, headers=headers, timeout=30)
        page_resp.raise_for_status()

        token = self._extract_token(page_resp.text)
        if not token:
            raise RuntimeError(
                "Could not extract CivicPlus guest JWT token from "
                f"{TOKEN_PAGE}"
            )

        # Step 2: Fetch all employees from the content API.
        api_headers = {
            "User-Agent": USER_AGENT,
            "Authorization": token,
            "Accept": "application/json",
            "Origin": "https://www.greenvillesc.gov",
            "Referer": "https://www.greenvillesc.gov/",
        }

        all_items = []
        skip = 0
        take = 200

        while True:
            api_resp = requests.get(
                EMPLOYEE_API,
                headers=api_headers,
                params={"take": take, "skip": skip},
                timeout=30,
            )
            api_resp.raise_for_status()
            data = api_resp.json()
            all_items.extend(data.get("items", []))
            total = data.get("total", 0)

            if len(all_items) >= total or not data.get("items"):
                break
            skip += take

        # Store the raw items for parse()
        self._raw_items = all_items
        # Return the council page HTML (used for sidebar nav name extraction)
        return page_resp.text

    def parse(self, html: str) -> list[dict]:
        """Parse council member data from the CivicPlus API response.

        Filters employees to those in the City Council category,
        then extracts and normalizes contact information. Uses the
        sidebar nav from the council page for authoritative display names.
        """
        # Build a lookup of authoritative names from the sidebar nav.
        # The CMS sometimes abbreviates names (e.g. "Lillian Flemming"
        # instead of "Lillian Brock Flemming") or uses different casing
        # (e.g. "Deworken" instead of "DeWorken").
        nav_names = self._parse_sidebar_names(html)

        council_members = {}
        assistant_phone = ""

        for item in self._raw_items:
            item_id = item.get("id", "")

            # Deduplicate (the API can return items twice across pages)
            if item_id in council_members:
                continue

            categories = item.get("categories", [])
            cat_ids = {c.get("id", "") for c in categories}
            data = item.get("data", {})
            title_raw = data.get("title", {}).get("en", "")

            # Check if this is a council member (in the City Council category)
            is_council = CITY_COUNCIL_CATEGORY in cat_ids

            # The Executive Assistant to the Mayor is NOT in the City Council
            # category but provides the Mayor's office phone number.
            is_assistant = "executive assistant" in title_raw.lower()

            if is_assistant:
                assistant_phone = self._extract_phone(data)
                continue

            if not is_council:
                continue

            firstname = data.get("firstname", {}).get("en", "").strip()
            lastname = data.get("lastname", {}).get("en", "").strip()
            name = f"{firstname} {lastname}".strip()
            email = self._extract_email(data)
            phone = self._extract_phone(data)
            title = self._normalize_title(title_raw)

            # Cross-reference with sidebar nav for authoritative name
            name = self._match_nav_name(name, nav_names) or name

            council_members[item_id] = {
                "name": name,
                "title": title,
                "email": email,
                "phone": phone,
            }

        # Backfill the Mayor's phone from the Executive Assistant record
        # if the Mayor's own phone field is empty.
        if assistant_phone:
            for member in council_members.values():
                if member["title"] == "Mayor" and not member["phone"]:
                    member["phone"] = assistant_phone

        # Sort: Mayor first, then districts in order, then at-large
        return sorted(council_members.values(), key=self._sort_key)

    # --- Helpers ---

    @staticmethod
    def _parse_sidebar_names(html: str) -> list[str]:
        """Extract council member display names from the sidebar nav.

        The sidebar nav links have text like:
            "Mayor Knox White"
            "John DeWorken - District 1"
            "Dorothy Dowe  - At Large"

        Returns a list of just the name portions.
        """
        soup = BeautifulSoup(html, "html.parser")
        names = []
        for link in soup.find_all("a", class_="navMainItem"):
            text = link.get_text(strip=True)

            # "Mayor Knox White" -> "Knox White"
            if text.lower().startswith("mayor "):
                names.append(text[6:].strip())
                continue

            # "John DeWorken - District 1" -> "John DeWorken"
            # "Dorothy Dowe  - At Large"   -> "Dorothy Dowe"
            match = re.match(
                r"(.+?)\s*-\s*(?:District\s+\d+|At\s+Large)", text
            )
            if match:
                names.append(match.group(1).strip())

        return names

    @staticmethod
    def _match_nav_name(api_name: str, nav_names: list[str]) -> str:
        """Find the best matching sidebar nav name for an API name.

        Matches by last name (case-insensitive) since the CMS may
        abbreviate first names or use different casing.

        Returns the nav name if found, or empty string if no match.
        """
        api_last = api_name.split()[-1].lower() if api_name else ""
        for nav_name in nav_names:
            nav_last = nav_name.split()[-1].lower() if nav_name else ""
            if api_last and api_last == nav_last:
                return nav_name
        return ""

    @staticmethod
    def _extract_token(html: str) -> str:
        """Extract the guest JWT token from the page HTML.

        The token is embedded in the CivicPlus bootstrap config:
            userToken:"Bearer eyJ..."
        """
        match = re.search(r'userToken:"(Bearer [^"]+)"', html)
        return match.group(1) if match else ""

    @staticmethod
    def _extract_email(data: dict) -> str:
        """Extract email address from the employee data.

        The email field contains HTML like:
            <p><a href="mailto:name@greenvillesc.gov">Email Name</a></p>
        """
        email_html = data.get("emailaddress", {}).get("en", "")
        match = re.search(r'mailto:([^"\'>\s]+)', email_html)
        return match.group(1) if match else ""

    @staticmethod
    def _extract_phone(data: dict) -> str:
        """Extract and format phone number from the employee data.

        The phone field contains plain text like "864-905-5529".
        We format it to match the existing data style: (864) 905-5529
        """
        phone_raw = data.get("phonenumber", {}).get("en", "").strip()
        if not phone_raw:
            return ""
        match = re.search(r"(\d{3})[-.](\d{3})[-.](\d{4})", phone_raw)
        if match:
            return f"({match.group(1)}) {match.group(2)}-{match.group(3)}"
        return phone_raw

    @staticmethod
    def _normalize_title(title_raw: str) -> str:
        """Normalize the CMS title field to our standard format.

        CMS titles like:
          - "Mayor" -> "Mayor"
          - "Vice Mayor Pro Tem; District 1" -> "Council Member, District 1"
          - "Mayor Pro Tem; At-Large Representative" -> "Council Member, At Large"
          - "District 2" -> "Council Member, District 2"
          - "At-Large Representative" -> "Council Member, At Large"
        """
        title = title_raw.strip()

        if title.lower() == "mayor":
            return "Mayor"

        # Extract district number if present
        district_match = re.search(r"District\s+(\d+)", title, re.IGNORECASE)
        if district_match:
            return f"Council Member, District {district_match.group(1)}"

        # At-large members
        if "at-large" in title.lower() or "at large" in title.lower():
            return "Council Member, At Large"

        # Fallback: use as-is
        return title

    @staticmethod
    def _sort_key(member: dict) -> tuple:
        """Sort key: Mayor first, then districts 1-4, then at-large."""
        title = member["title"]
        if title == "Mayor":
            return (0, 0, "")
        district_match = re.search(r"District\s+(\d+)", title)
        if district_match:
            return (1, int(district_match.group(1)), "")
        # At-large: sort alphabetically by name
        return (2, 0, member["name"])
