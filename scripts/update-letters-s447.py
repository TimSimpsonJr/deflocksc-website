"""
One-shot update for action-letters.json: refresh "four bills stalled" framing
across local letters now that S.447 has cleared Senate Judiciary on April 9, 2026
and is awaiting a Senate floor vote.

Updates the most common bill-status phrasings to reflect that S.447 is moving
while H.4675 (and the other House bills) remain stuck. Local-specific context
(camera counts, Wright references, Aurora case mentions, council asks) is
preserved verbatim.
"""

import json
import re
from pathlib import Path

LETTERS_PATH = Path(__file__).parent.parent / "src" / "data" / "action-letters.json"


# Each replacement is a (regex_pattern, replacement) pair. Order matters: more
# specific patterns are matched first so they don't get clobbered by generic ones.
REPLACEMENTS = [
    # Variant: "Four state bills (S447, H3155, H4013, H4675) would set rules for police use of camera data, but all three are stalled in committee and none regulate what Flock does with data on its servers."
    (
        r"Four state bills \(S447, H3155, H4013, H4675\) would set rules for police use of camera data, but all (?:three|four|are) (?:are )?stalled in committee and none (?:regulate|cover) what Flock does with data on its servers\.",
        "Four state bills (S447, H3155, H4013, H4675) propose rules for police use of camera data, and none of them regulate what Flock itself does with the data on its own servers. S.447 has cleared Senate Judiciary and is awaiting a Senate floor vote; the other three remain stuck in committee.",
    ),

    # Variant: "Four state bills (S447, H3155, H4013, H4675) would set rules for police use of camera data, but all are stalled in committee and none cover what Flock does with data on its servers."
    (
        r"Four state bills \(S447, H3155, H4013, H4675\) would set rules for police use of camera data, but all are stalled in committee and none (?:regulate|cover) what Flock does with data on its servers\.",
        "Four state bills (S447, H3155, H4013, H4675) propose rules for police use of camera data, and none of them regulate what Flock itself does with the data on its own servers. S.447 has cleared Senate Judiciary and is awaiting a Senate floor vote; the other three remain stuck in committee.",
    ),

    # Variant: "Four state bills (S447, H3155, H4013, H4675) would set rules for police use of camera data, but all are stalled and none regulate Flock's own data practices."
    # Also catches "but are stalled" (no "all" quantifier) and "but all three are stalled".
    (
        r"Four state bills \(S447, H3155, H4013, H4675\) would set (?:rules for police use of camera data|some rules),? but (?:are stalled|all are stalled|all three are stalled)(?: and (?:none regulate Flock's own data practices|do not regulate vendor data practices))?\.",
        "Four state bills (S447, H3155, H4013, H4675) propose rules for police use of camera data. S.447 has cleared Senate Judiciary and is awaiting a Senate floor vote; the other three remain stuck in committee. None of them regulate Flock's own data practices.",
    ),

    # Variant: standalone "All four are stalled in committee." (e.g., Greenville City letter)
    (
        r"All four are stalled in committee\.",
        "S.447 has since cleared Senate Judiciary and is awaiting a Senate floor vote; the other three remain stuck in committee.",
    ),

    # Variant: "Four state bills (S447, H3155, H4013, H4675) are stalled in committee[ and don't cover what Flock does with data on its servers]."
    (
        r"Four state bills \(S447, H3155, H4013, H4675\) are stalled in committee(?: and don't cover what Flock does with data on its servers)?\.",
        "Four state bills (S447, H3155, H4013, H4675) propose rules for police use of camera data, and none cover what Flock itself does with the data on its own servers. S.447 has cleared Senate Judiciary and is awaiting a Senate floor vote; the other three remain stuck in committee.",
    ),

    # Variant: "Four state bills (S447, H3155, H4013, H4675) that would set basic rules are stalled in committee."
    (
        r"Four state bills \(S447, H3155, H4013, H4675\) that would set basic rules are stalled in committee\.",
        "Four state bills (S447, H3155, H4013, H4675) propose basic rules for police use of camera data. S.447 has cleared Senate Judiciary and is awaiting a Senate floor vote; the other three remain stuck in committee.",
    ),

    # Variant: "Four state bills (S447, H3155, H4013, H4675) are stalled and (don't cover|none regulate)..."
    (
        r"Four state bills \(S447, H3155, H4013, H4675\) are stalled and (?:don't cover what Flock does with data on its servers|none regulate Flock's own data practices)\.",
        "Four state bills (S447, H3155, H4013, H4675) propose rules for police use of camera data, and none regulate what Flock itself does with the data on its own servers. S.447 has cleared Senate Judiciary and is awaiting a Senate floor vote; the other three remain stuck in committee.",
    ),

    # Most common variant: "Four state bills (S447, H3155, H4013, H4675) are stalled."
    (
        r"Four state bills \(S447, H3155, H4013, H4675\) are stalled\.",
        "Four state bills (S447, H3155, H4013, H4675) propose rules for police use of camera data. S.447 has cleared Senate Judiciary and is awaiting a Senate floor vote; the other three remain stuck in committee.",
    ),

    # Generic short: "Four state bills are stalled."
    (
        r"Four state bills are stalled\.",
        "Four state bills (S.447, H.3155, H.4013, H.4675) would set rules for police use of camera data. S.447 has cleared Senate Judiciary and is awaiting a Senate floor vote; the other three remain stuck in committee.",
    ),

    # H4675 status sentence variants. Kept short to avoid duplicating the S.447
    # status from the earlier replacement when both appear in the same letter.
    (
        r"H4675 would ban Flock's cloud storage and force all data onto state-owned servers, but all four bills are stalled\.",
        "H4675 would ban Flock's cloud storage and force all data onto state-owned servers, but it remains stuck in House Judiciary.",
    ),
    (
        r"H4675 would ban Flock's cloud storage and force all data onto state-owned servers, but all four are stalled\.",
        "H4675 would ban Flock's cloud storage and force all data onto state-owned servers, but it remains stuck in House Judiciary.",
    ),
    (
        r"H4675 would ban Flock's cloud storage and force all data onto state-owned servers, but none of the four have had a hearing\.",
        "H4675 would ban Flock's cloud storage and force all data onto state-owned servers, but it remains stuck in House Judiciary.",
    ),

    # Variant: "Four ALPR bills (S447, H3155, H4013, H4675) have stalled in the legislature he leads"
    (
        r"Four ALPR bills \(S447, H3155, H4013, H4675\) have stalled in the legislature he leads",
        "Four ALPR bills (S447, H3155, H4013, H4675) have struggled to advance in the legislature he leads. Only S.447 has cleared committee, and it remains awaiting a Senate floor vote",
    ),
]


def update_letter_body(body: str) -> tuple[str, int]:
    """Apply all known replacements. Returns (new_body, replacements_made)."""
    new_body = body
    count = 0
    for pattern, replacement in REPLACEMENTS:
        new_body, n = re.subn(pattern, replacement, new_body)
        count += n
    return new_body, count


def main():
    letters = json.loads(LETTERS_PATH.read_text(encoding="utf-8"))

    updated_letters = 0
    total_replacements = 0
    for letter in letters:
        if letter.get("category") != "local":
            continue
        original = letter["body"]
        new_body, n = update_letter_body(original)
        if new_body != original:
            letter["body"] = new_body
            updated_letters += 1
            total_replacements += n
            print(f"  {letter.get('label', '<no label>')}: {n} replacement(s)")

    LETTERS_PATH.write_text(
        json.dumps(letters, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print()
    print(f"Updated {updated_letters} local letters with {total_replacements} total replacements.")

    # Sanity: any remaining "stalled" mentions?
    text = LETTERS_PATH.read_text(encoding="utf-8")
    remaining = len(re.findall(r"are stalled|all four bills are stalled|all four are stalled", text))
    print(f"Remaining 'stalled' mentions matching the old patterns: {remaining}")


if __name__ == "__main__":
    main()
