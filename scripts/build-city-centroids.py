"""
Build city centroid coordinates for the events map.

Resolves every allowlisted place slug in src/data/registry.json to a single
[lon, lat] point and writes src/data/city-centroids.json.

Coordinates come from the Census TIGERweb "Incorporated Places" layer, which
publishes a CENTLAT/CENTLON centroid for every South Carolina place in one
request. The Census one-line address geocoder behind /api/geocode is an
address matcher: it returns zero matches for a bare city name (verified for
"Greenville, SC", "Greenville, South Carolina", "Greenville SC 29601"), so it
cannot resolve city centroids.

Idempotent: same registry + same cache produces a byte-identical output file.
Fails loudly (exit 1) on any slug it cannot resolve, and never writes a
partial file.

Stdlib only. No third-party dependencies.

Usage:
    python scripts/build-city-centroids.py            # use cache if present
    python scripts/build-city-centroids.py --refresh  # re-fetch from Census
    python scripts/build-city-centroids.py --check    # verify only, write nothing

Exit code 0 = all place slugs resolved and verified, 1 = failure.
"""

import json
import os
import re
import sys
import urllib.parse
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
REGISTRY_PATH = os.path.join(PROJECT_ROOT, "src", "data", "registry.json")
OUTPUT_PATH = os.path.join(PROJECT_ROOT, "src", "data", "city-centroids.json")
OVERRIDES_PATH = os.path.join(SCRIPT_DIR, "data", "city-centroid-overrides.json")
CACHE_PATH = os.path.join(SCRIPT_DIR, ".cache", "tigerweb-sc-places.json")

TIGERWEB_URL = (
    "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/"
    "Places_CouSub_ConCity_SubMCD/MapServer/4/query"
)
SC_STATE_FIPS = "45"
USER_AGENT = "deflocksc-website build-city-centroids (https://deflocksc.org)"

# Same box build-camera-counts.py uses to pre-filter cameras.
SC_BOUNDS = {"min_lat": 31.5, "max_lat": 35.5, "min_lon": -84.0, "max_lon": -78.0}

COUNCIL_SUFFIX = re.compile(r"\s+(?:City|Town)\s+Council$")


def city_name(entry):
    """'Hilton Head Island Town Council' -> 'Hilton Head Island'."""
    return COUNCIL_SUFFIX.sub("", entry["name"]).strip()


def load_places():
    """Return [(slug, city_name)] for every type=place entry, sorted by slug."""
    with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
        registry = json.load(f)
    places = []
    for entry in registry.get("jurisdictions", []):
        if entry.get("type") != "place":
            continue
        slug = entry["id"].split(":", 1)[1]
        places.append((slug, city_name(entry)))
    return sorted(places)


def load_overrides():
    if not os.path.exists(OVERRIDES_PATH):
        return {}
    with open(OVERRIDES_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def fetch_tigerweb():
    """Fetch every SC incorporated place. Returns {lowercase name: [lon, lat]}."""
    query = urllib.parse.urlencode({
        "where": "STATE='%s'" % SC_STATE_FIPS,
        "outFields": "BASENAME,CENTLAT,CENTLON",
        "returnGeometry": "false",
        "f": "json",
    })
    request = urllib.request.Request(
        TIGERWEB_URL + "?" + query, headers={"User-Agent": USER_AGENT}
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = json.loads(response.read().decode("utf-8"))

    if "error" in payload:
        raise RuntimeError("TIGERweb error: %s" % payload["error"])

    features = payload.get("features", [])
    if not features:
        raise RuntimeError("TIGERweb returned no features for STATE=45")

    table = {}
    for feature in features:
        attrs = feature["attributes"]
        lon = round(float(attrs["CENTLON"]), 6)
        lat = round(float(attrs["CENTLAT"]), 6)
        table[attrs["BASENAME"].strip().lower()] = [lon, lat]
    return table


def load_cache(refresh):
    if not refresh and os.path.exists(CACHE_PATH):
        print("Using cached TIGERweb data: %s" % CACHE_PATH)
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    print("Fetching SC incorporated places from Census TIGERweb...")
    table = fetch_tigerweb()
    os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(table, f, indent=2, sort_keys=True)
    print("Cached %d places to %s" % (len(table), CACHE_PATH))
    return table


def in_sc(point):
    lon, lat = point
    return (
        SC_BOUNDS["min_lon"] <= lon <= SC_BOUNDS["max_lon"]
        and SC_BOUNDS["min_lat"] <= lat <= SC_BOUNDS["max_lat"]
    )


def verify(centroids, places):
    """Return a list of error strings. Empty list means the file is good."""
    errors = []
    expected = set(slug for slug, _ in places)
    actual = set(centroids)

    for slug in sorted(expected - actual):
        errors.append("missing centroid for place slug '%s'" % slug)
    for slug in sorted(actual - expected):
        errors.append("centroid '%s' is not a place slug in registry.json" % slug)

    for slug in sorted(expected & actual):
        point = centroids[slug]
        numeric = (
            isinstance(point, list)
            and len(point) == 2
            and all(isinstance(n, (int, float)) and not isinstance(n, bool) for n in point)
        )
        if not numeric:
            errors.append("'%s' is not a [lon, lat] pair: %r" % (slug, point))
        elif not in_sc(point):
            errors.append("'%s' falls outside South Carolina: %r" % (slug, point))
    return errors


def main():
    refresh = "--refresh" in sys.argv
    check_only = "--check" in sys.argv

    places = load_places()
    print("Registry lists %d place slugs" % len(places))

    if check_only:
        if not os.path.exists(OUTPUT_PATH):
            print("\nERROR: %s does not exist. Run without --check first." % OUTPUT_PATH)
            sys.exit(1)
        with open(OUTPUT_PATH, "r", encoding="utf-8") as f:
            centroids = json.load(f)
    else:
        table = load_cache(refresh)
        overrides = load_overrides()
        if overrides:
            print("Loaded %d manual override(s)" % len(overrides))

        centroids = {}
        unresolved = []
        for slug, name in places:
            if slug in overrides:
                centroids[slug] = [round(float(n), 6) for n in overrides[slug]]
                print("  %-18s %-24s override" % (slug, name))
                continue
            point = table.get(name.lower())
            if point is None:
                unresolved.append((slug, name))
                continue
            centroids[slug] = point
            print("  %-18s %-24s %s" % (slug, name, point))

        if unresolved:
            print("\nERROR: %d place slug(s) could not be resolved:" % len(unresolved))
            for slug, name in unresolved:
                print("  %s  (searched TIGERweb BASENAME '%s')" % (slug, name))
            print("\nFix: add each slug to %s as \"slug\": [lon, lat], then re-run." % OVERRIDES_PATH)
            print("Nothing was written.")
            sys.exit(1)

    errors = verify(centroids, places)
    if errors:
        print("\nVerification FAILED (%d error(s)):" % len(errors))
        for message in errors:
            print("  ERROR: %s" % message)
        print("\nNothing was written.")
        sys.exit(1)

    if check_only:
        print("\nVerified %s: %d/%d place slugs have a centroid."
              % (OUTPUT_PATH, len(centroids), len(places)))
        sys.exit(0)

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(centroids, f, indent=2, sort_keys=True)
        f.write("\n")

    print("\nWrote %s (%d entries)" % (OUTPUT_PATH, len(centroids)))
    print("Verified: every place slug in registry.json has a centroid.")
    sys.exit(0)


if __name__ == "__main__":
    main()
