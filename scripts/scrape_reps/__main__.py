"""
Scrape representative data for SC jurisdictions.

Reads registry.json, dispatches adapters, updates local-councils.json
and state-legislators.json.

Usage:
    python -m scripts.scrape_reps                   # scrape all
    python -m scripts.scrape_reps --state-only       # state legislators only
    python -m scripts.scrape_reps --local-only       # local councils only
    python -m scripts.scrape_reps --jurisdiction county:greenville  # one only
    python -m scripts.scrape_reps --dry-run          # show what would run
"""

import argparse
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.join(SCRIPT_DIR, "..", "..")
REGISTRY_PATH = os.path.join(PROJECT_ROOT, "src", "data", "registry.json")
STATE_JSON = os.path.join(PROJECT_ROOT, "src", "data", "state-legislators.json")
LOCAL_JSON = os.path.join(PROJECT_ROOT, "src", "data", "local-councils.json")

# Adapter registry -- import adapters here as they are built
ADAPTERS = {}


def load_registry() -> dict:
    with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def get_adapter(entry: dict):
    """Return an adapter instance for a registry entry, or None for manual."""
    adapter_name = entry.get("adapter", "manual")
    if adapter_name == "manual":
        return None
    cls = ADAPTERS.get(adapter_name)
    if cls is None:
        print(f"  WARNING: No adapter registered for '{adapter_name}', skipping {entry['id']}")
        return None
    return cls(entry)


def scrape_state(registry: dict, dry_run: bool = False):
    """Download OpenStates CSV and update state-legislators.json."""
    state_config = registry.get("state", {})
    source_url = state_config.get("openStatesUrl", "")
    print(f"\n=== State Legislators ===")
    print(f"  Source: {source_url}")

    if dry_run:
        print("  [DRY RUN] Would download and update state-legislators.json")
        return

    from .state import update_state_legislators
    update_state_legislators(source_url, STATE_JSON)


def scrape_local(registry: dict, jurisdiction_filter: str = None, dry_run: bool = False):
    """Run adapters for local jurisdictions and update local-councils.json."""
    with open(LOCAL_JSON, "r", encoding="utf-8") as f:
        local_data = json.load(f)

    changes = []

    for entry in registry.get("jurisdictions", []):
        jid = entry["id"]

        if jurisdiction_filter and jid != jurisdiction_filter:
            continue

        print(f"\n--- {entry['name']} ({jid}) ---")

        adapter = get_adapter(entry)
        if adapter is None:
            print(f"  Skipping (manual adapter)")
            continue

        if dry_run:
            print(f"  [DRY RUN] Would scrape {entry['url']}")
            continue

        try:
            members = adapter.scrape()
            print(f"  Scraped {len(members)} members")

            existing = local_data.get(jid, {})
            local_data[jid] = {
                "label": entry["name"],
                **({k: existing[k] for k in ("note",) if k in existing}),
                "members": members,
            }
            changes.append(jid)
        except Exception as e:
            print(f"  ERROR: {e}")

    if changes and not dry_run:
        with open(LOCAL_JSON, "w", encoding="utf-8") as f:
            json.dump(local_data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        print(f"\nUpdated {len(changes)} jurisdiction(s) in local-councils.json")
    elif not dry_run:
        print("\nNo changes to local-councils.json")


def main():
    parser = argparse.ArgumentParser(description="Scrape SC representative data.")
    parser.add_argument("--state-only", action="store_true", help="Only update state legislators")
    parser.add_argument("--local-only", action="store_true", help="Only update local councils")
    parser.add_argument("--jurisdiction", type=str, help="Scrape a single jurisdiction by ID")
    parser.add_argument("--dry-run", action="store_true", help="Show what would run without scraping")
    args = parser.parse_args()

    registry = load_registry()

    if not args.local_only:
        scrape_state(registry, dry_run=args.dry_run)

    if not args.state_only:
        scrape_local(registry, jurisdiction_filter=args.jurisdiction, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
