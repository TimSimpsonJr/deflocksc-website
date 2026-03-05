"""
Validate all JSON data files before deployment.

Checks that scraped and hand-edited data files conform to expected schemas
and contain sane values. Run after scraping and before building:

    python scripts/validate-data.py

Exit code 0 = all checks pass, 1 = validation errors found.
"""

import json
import os
import re
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "..", "src", "data")
DISTRICTS_DIR = os.path.join(SCRIPT_DIR, "..", "public", "districts")

errors = []
warnings = []


def error(file, msg):
    errors.append(f"  ERROR [{file}]: {msg}")


def warn(file, msg):
    warnings.append(f"  WARN  [{file}]: {msg}")


def load_json(filename):
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        error(filename, "File not found")
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Validators
# ---------------------------------------------------------------------------

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_RE = re.compile(r"^\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$")


def validate_state_legislators(data):
    """Validate state-legislators.json structure and content."""
    filename = "state-legislators.json"

    if not isinstance(data, dict):
        error(filename, "Root must be an object with 'senate' and 'house' keys")
        return

    for chamber in ("senate", "house"):
        if chamber not in data:
            error(filename, f"Missing '{chamber}' key")
            continue

        members = data[chamber]
        if not isinstance(members, dict):
            error(filename, f"'{chamber}' must be an object keyed by district number")
            continue

        # Sanity check: SC has 46 senate and 124 house districts
        expected = 46 if chamber == "senate" else 124
        if len(members) < expected * 0.8:
            error(filename, f"'{chamber}' has {len(members)} members, expected ~{expected}")

        for district, member in members.items():
            prefix = f"{chamber}[{district}]"

            if not district.isdigit():
                error(filename, f"{prefix}: district key must be numeric, got '{district}'")

            if not member.get("name"):
                error(filename, f"{prefix}: missing 'name'")

            if not member.get("district"):
                warn(filename, f"{prefix}: missing 'district' field")

            email = member.get("email", "")
            if email and not EMAIL_RE.match(email):
                warn(filename, f"{prefix}: invalid email format '{email}'")

            phone = member.get("phone", "")
            if phone and not PHONE_RE.match(phone):
                warn(filename, f"{prefix}: unexpected phone format '{phone}'")

            party = member.get("party", "")
            if party and party not in ("R", "D", "I"):
                warn(filename, f"{prefix}: unexpected party '{party}'")


def validate_local_councils(data):
    """Validate local-councils.json structure and content."""
    filename = "local-councils.json"

    if not isinstance(data, dict):
        error(filename, "Root must be an object keyed by council ID")
        return

    for council_id, council in data.items():
        if not re.match(r"^(county|place):.+$", council_id):
            warn(filename, f"Unexpected council ID format: '{council_id}'")

        if not council.get("label"):
            error(filename, f"'{council_id}': missing 'label'")

        members = council.get("members")
        if not isinstance(members, list):
            error(filename, f"'{council_id}': 'members' must be a list")
            continue

        if len(members) == 0:
            warn(filename, f"'{council_id}': has 0 members")

        for i, member in enumerate(members):
            prefix = f"{council_id}.members[{i}]"

            if not member.get("name"):
                error(filename, f"{prefix}: missing 'name'")

            if not member.get("title"):
                warn(filename, f"{prefix}: missing 'title'")

            email = member.get("email", "")
            if email and not EMAIL_RE.match(email):
                warn(filename, f"{prefix}: invalid email format '{email}'")

            phone = member.get("phone", "")
            if phone and not PHONE_RE.match(phone):
                warn(filename, f"{prefix}: unexpected phone format '{phone}'")


def validate_bills(data):
    """Validate bills.json structure and content."""
    filename = "bills.json"

    if not isinstance(data, list):
        error(filename, "Root must be an array of bill objects")
        return

    if len(data) == 0:
        warn(filename, "No bills found")

    for i, bill in enumerate(data):
        prefix = f"bills[{i}]"

        for field in ("bill", "title", "url"):
            if not bill.get(field):
                error(filename, f"{prefix}: missing required field '{field}'")

        bill_id = bill.get("bill", "")
        if bill_id and not re.match(r"^[SH]\s?\d+$", bill_id):
            warn(filename, f"{prefix}: unexpected bill ID format '{bill_id}'")

        url = bill.get("url", "")
        if url and not url.startswith("https://"):
            warn(filename, f"{prefix}: URL should start with https://")


def validate_action_letters(data):
    """Validate action-letters.json structure and content."""
    filename = "action-letters.json"

    if not isinstance(data, list):
        error(filename, "Root must be an array of letter objects")
        return

    if len(data) == 0:
        error(filename, "No letter templates found")

    for i, letter in enumerate(data):
        prefix = f"letters[{i}]"

        for field in ("divisionPattern", "category", "label", "subject", "body"):
            if not letter.get(field):
                error(filename, f"{prefix}: missing required field '{field}'")

        category = letter.get("category", "")
        if category and category not in ("state", "local"):
            warn(filename, f"{prefix}: unexpected category '{category}'")

        body = letter.get("body", "")
        if body and "Dear" not in body:
            warn(filename, f"{prefix}: letter body missing greeting (expected 'Dear ...')")


def validate_registry(data):
    """Validate registry.json structure and content."""
    filename = "registry.json"

    if not isinstance(data, dict):
        error(filename, "Root must be an object")
        return

    # Validate state boundaries
    state = data.get("state", {})
    boundaries = state.get("boundaries", [])
    if not isinstance(boundaries, list) or len(boundaries) == 0:
        error(filename, "Missing or empty 'state.boundaries'")

    for i, entry in enumerate(boundaries):
        prefix = f"state.boundaries[{i}]"
        for field in ("id", "name", "boundarySource", "boundaryFile"):
            if not entry.get(field):
                error(filename, f"{prefix}: missing '{field}'")

        source = entry.get("boundarySource", "")
        if source and source not in ("tiger", "arcgis", "scrfa"):
            error(filename, f"{prefix}: invalid boundarySource '{source}'")

    # Validate jurisdictions
    jurisdictions = data.get("jurisdictions", [])
    if not isinstance(jurisdictions, list):
        error(filename, "'jurisdictions' must be a list")
    else:
        for i, j in enumerate(jurisdictions):
            prefix = f"jurisdictions[{i}]"

            for field in ("id", "name", "type", "county"):
                if not j.get(field):
                    error(filename, f"{prefix}: missing '{field}'")

            jtype = j.get("type", "")
            if jtype and jtype not in ("county", "place"):
                warn(filename, f"{prefix}: unexpected type '{jtype}'")

            if j.get("hasBoundary"):
                if not j.get("boundaryFile"):
                    error(filename, f"{prefix}: hasBoundary=true but missing 'boundaryFile'")
                if not j.get("boundarySource"):
                    error(filename, f"{prefix}: hasBoundary=true but missing 'boundarySource'")


def validate_boundary_files(registry):
    """Validate that referenced boundary GeoJSON files exist and are valid."""
    if not registry or not os.path.isdir(DISTRICTS_DIR):
        warn("districts/", "Districts directory not found, skipping boundary file checks")
        return

    # Collect all referenced boundary files
    files = set()
    for entry in registry.get("state", {}).get("boundaries", []):
        if entry.get("boundaryFile"):
            files.add(entry["boundaryFile"])
    for j in registry.get("jurisdictions", []):
        if j.get("hasBoundary") and j.get("boundaryFile"):
            files.add(j["boundaryFile"])

    for filename in sorted(files):
        filepath = os.path.join(DISTRICTS_DIR, filename)
        if not os.path.exists(filepath):
            warn(f"districts/{filename}", "Referenced boundary file does not exist")
            continue

        try:
            with open(filepath, "r", encoding="utf-8") as f:
                geojson = json.load(f)
        except json.JSONDecodeError as e:
            error(f"districts/{filename}", f"Invalid JSON: {e}")
            continue

        if geojson.get("type") != "FeatureCollection":
            error(f"districts/{filename}", "Must be a GeoJSON FeatureCollection")
            continue

        features = geojson.get("features", [])
        if len(features) == 0:
            error(f"districts/{filename}", "FeatureCollection has 0 features")
            continue

        for fi, feature in enumerate(features):
            if feature.get("type") != "Feature":
                error(f"districts/{filename}", f"features[{fi}]: type must be 'Feature'")
                continue

            props = feature.get("properties", {})
            if "district" not in props:
                error(f"districts/{filename}", f"features[{fi}]: missing properties.district")

            geom = feature.get("geometry", {})
            geom_type = geom.get("type", "")
            if geom_type not in ("Polygon", "MultiPolygon"):
                error(f"districts/{filename}", f"features[{fi}]: unexpected geometry type '{geom_type}'")

            # Check coordinates are within SC bounding box (rough check on first coord)
            coords = geom.get("coordinates", [])
            if coords:
                first_coord = coords
                # Navigate to the first [lng, lat] pair
                while isinstance(first_coord, list) and len(first_coord) > 0 and isinstance(first_coord[0], list):
                    first_coord = first_coord[0]
                if isinstance(first_coord, list) and len(first_coord) >= 2:
                    lng, lat = first_coord[0], first_coord[1]
                    if not (-84.0 <= lng <= -78.0 and 31.5 <= lat <= 35.5):
                        warn(f"districts/{filename}", f"features[{fi}]: coordinates ({lng}, {lat}) outside SC bounds")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("Validating data files...\n")

    # Load and validate each file
    legislators = load_json("state-legislators.json")
    if legislators is not None:
        validate_state_legislators(legislators)
        print("  Checked state-legislators.json")

    councils = load_json("local-councils.json")
    if councils is not None:
        validate_local_councils(councils)
        print("  Checked local-councils.json")

    bills = load_json("bills.json")
    if bills is not None:
        validate_bills(bills)
        print("  Checked bills.json")

    letters = load_json("action-letters.json")
    if letters is not None:
        validate_action_letters(letters)
        print("  Checked action-letters.json")

    registry = load_json("registry.json")
    if registry is not None:
        validate_registry(registry)
        print("  Checked registry.json")

    # Validate boundary files if available
    if registry is not None:
        validate_boundary_files(registry)
        print("  Checked boundary files")

    # Report results
    print()
    if warnings:
        print(f"{len(warnings)} warning(s):")
        for w in warnings:
            print(w)
        print()

    if errors:
        print(f"{len(errors)} error(s):")
        for e in errors:
            print(e)
        print("\nValidation FAILED.")
        sys.exit(1)
    else:
        print("All checks passed.")
        sys.exit(0)


if __name__ == "__main__":
    main()
