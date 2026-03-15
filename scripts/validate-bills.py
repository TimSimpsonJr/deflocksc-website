"""
Validate bills.json after scraping.

Checks that scraped bill data conforms to expected schema. Run after
scraping and before committing:

    python scripts/validate-bills.py

Exit code 0 = all checks pass, 1 = validation errors found.
"""

import json
import os
import re
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "..", "src", "data")

errors = []
warnings = []


def error(msg):
    errors.append(f"  ERROR: {msg}")


def warn(msg):
    warnings.append(f"  WARN:  {msg}")


def main():
    print("Validating bills.json...\n")

    path = os.path.join(DATA_DIR, "bills.json")
    if not os.path.exists(path):
        error("bills.json not found")
        report_and_exit()

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        error("Root must be an array of bill objects")
        report_and_exit()

    if len(data) == 0:
        warn("No bills found")

    for i, bill in enumerate(data):
        prefix = f"bills[{i}]"

        for field in ("bill", "title", "url"):
            if not bill.get(field):
                error(f"{prefix}: missing required field '{field}'")

        bill_id = bill.get("bill", "")
        if bill_id and not re.match(r"^[SH]\s?\d+$", bill_id):
            warn(f"{prefix}: unexpected bill ID format '{bill_id}'")

        url = bill.get("url", "")
        if url and not url.startswith("https://"):
            warn(f"{prefix}: URL should start with https://")

    print(f"  Checked {len(data)} bill(s)")
    report_and_exit()


def report_and_exit():
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
