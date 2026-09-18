#!/usr/bin/env python3
"""Rebuild desks.json from the judging-input sheet.

Run this whenever the desk allocations change:

    1. Open rpf.io/judging-input
    2. File > Download > Comma-separated values (.csv)
    3. python3 tools/make_desks.py ~/Downloads/judging-input.csv
    4. Commit and push the updated desks.json

Standard library only - nothing to install.
"""

import csv
import json
import os
import sys

REQUIRED = {
    "desk no": "desk_no",
    "project name": "project_name",
    "category": "category",
    "team": "team",
    "judge name": "judge_name",
}

OUTPUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                      "desks.json")


def natural_key(desk):
    """Sort AI-2 before AI-10, and group by category prefix."""
    prefix, _, number = desk.rpartition("-")
    return (prefix or desk, int(number) if number.isdigit() else 0, desk)


def main(csv_path):
    with open(csv_path, newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.reader(handle))

    header_index = None
    for index, row in enumerate(rows):
        normalised = [cell.strip().lower() for cell in row]
        if "desk no" in normalised and "project name" in normalised:
            header_index = index
            break

    if header_index is None:
        sys.exit("Could not find a header row containing 'Desk No' and 'Project Name'. "
                 "Has the sheet layout changed?")

    header = [cell.strip().lower() for cell in rows[header_index]]
    missing = [name for name in REQUIRED if name not in header]
    if missing:
        sys.exit("Missing expected column(s): " + ", ".join(missing))

    columns = {key: header.index(name) for name, key in REQUIRED.items()}

    desks = {}
    skipped = 0
    for row in rows[header_index + 1:]:
        if not any(cell.strip() for cell in row):
            continue
        desk = row[columns["desk_no"]].strip() if len(row) > columns["desk_no"] else ""
        if not desk:
            skipped += 1
            continue
        if desk in desks:
            sys.exit("Duplicate desk number in the sheet: %s" % desk)
        desks[desk] = {
            key: (row[index].strip() if len(row) > index else "")
            for key, index in columns.items()
            if key != "desk_no"
        }

    ordered = {desk: desks[desk] for desk in sorted(desks, key=natural_key)}

    with open(OUTPUT, "w", encoding="utf-8") as handle:
        json.dump(ordered, handle, ensure_ascii=False, indent=1)
        handle.write("\n")

    print("Wrote %s with %d desks." % (OUTPUT, len(ordered)))
    if skipped:
        print("Skipped %d row(s) with no desk number." % skipped)

    blank = [d for d, v in ordered.items() if not v["project_name"]]
    if blank:
        print("Warning: no project name for: " + ", ".join(blank))

    odd = [(d, v["project_name"]) for d, v in ordered.items() if "?" in v["project_name"]]
    if odd:
        print("\nWarning: '?' found in %d project name(s) - these are usually a dash or"
              " apostrophe that did not survive being pasted into the sheet:" % len(odd))
        for desk, name in odd:
            print("  %-8s %s" % (desk, name))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python3 tools/make_desks.py <judging-input.csv>")
    main(sys.argv[1])
