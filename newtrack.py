"""Sync tracks_info.js with the GPX files in tracks/.

- Adds every tracks/*.gpx that is not listed yet (with the default tags).
- Removes entries whose GPX file no longer exists.
- Keeps existing entries (and their tags) untouched and in order.

Then rebuilds tracks_data.json (scripts/build_tracks.py), the compact file the map loads.

Safe to run repeatedly; it only rewrites files when something changed.
Runs locally, in Termux, or in the GitHub Action (.github/workflows/register-tracks.yml).

Options (used by scripts/termux/upload_gpx.sh):
  --tags NAME.gpx=Tipus-Travessa[,Other-Tag]   tags for a newly added file (repeatable)
  --types                                      print the known "Tipus" values, one per line, and exit
Peak tags (100Cims, Sostres, 3000s) are added automatically by the build; no need to pass them.
"""
import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
JS_FILE = os.path.join(ROOT, "tracks_info.js")
TRACKS_DIR = "tracks"
DEFAULT_TAGS = ["Tipus-Caminada"]


def load_tracks():
    with open(JS_FILE, "r", encoding="utf-8") as f:
        content = f.read()
    match = re.search(r"let\s+tracks\s*=\s*(\[.*\])\s*;?\s*$", content, re.DOTALL)
    if not match:
        sys.exit(f"Could not find 'let tracks = [...]' in {JS_FILE}")
    return json.loads(match.group(1))


def save_tracks(tracks):
    with open(JS_FILE, "w", encoding="utf-8") as f:
        f.write("let tracks = " + json.dumps(tracks, indent=4) + ";")


def known_types(tracks):
    """Tipus values already used, most common first (Caminada, Travessa, ...)."""
    counts = {}
    for t in tracks:
        for tag in t["tags"]:
            if tag.startswith("Tipus-"):
                counts[tag[len("Tipus-"):]] = counts.get(tag[len("Tipus-"):], 0) + 1
    return sorted(counts, key=lambda v: -counts[v])


def parse_args():
    parser = argparse.ArgumentParser(description="Register new GPX files and rebuild tracks_data.json.")
    parser.add_argument("--tags", action="append", default=[], metavar="NAME.gpx=TAG[,TAG]",
                        help="tags for a newly added GPX file (repeatable)")
    parser.add_argument("--types", action="store_true", help="print known Tipus values and exit")
    args = parser.parse_args()
    tags_for = {}
    for item in args.tags:
        name, _, tags = item.partition("=")
        tags = [t.strip() for t in tags.split(",") if t.strip()]
        if name and tags:
            tags_for[os.path.basename(name)] = tags
    return args, tags_for


def main():
    args, tags_for = parse_args()
    tracks = load_tracks()
    if args.types:
        print("\n".join(known_types(tracks)))
        return

    on_disk = sorted(
        f"{TRACKS_DIR}/{name}"
        for name in os.listdir(os.path.join(ROOT, TRACKS_DIR))
        if name.lower().endswith(".gpx")
    )
    on_disk_set = set(on_disk)

    kept = [t for t in tracks if t["file"] in on_disk_set]
    removed = [t["file"] for t in tracks if t["file"] not in on_disk_set]
    listed = {t["file"] for t in kept}
    added = [f for f in on_disk if f not in listed]
    kept.extend({"file": f, "tags": tags_for.get(os.path.basename(f), list(DEFAULT_TAGS))} for f in added)

    for f in added:
        print(f"+ {f}  {', '.join(tags_for.get(os.path.basename(f), DEFAULT_TAGS))}")
    for f in removed:
        print(f"- {f}")

    if added or removed:
        save_tracks(kept)
        print(f"tracks_info.js updated: {len(added)} added, {len(removed)} removed, {len(kept)} total.")
    else:
        print(f"tracks_info.js already up to date ({len(kept)} tracks).")

    sys.path.insert(0, os.path.join(ROOT, "scripts"))
    from build_tracks import build
    build(kept)


if __name__ == "__main__":
    main()
