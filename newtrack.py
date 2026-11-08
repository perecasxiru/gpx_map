"""Sync tracks_info.js with the GPX files in tracks/.

- Adds every tracks/*.gpx that is not listed yet (with the default tags).
- Removes entries whose GPX file no longer exists.
- Keeps existing entries (and their tags) untouched and in order.

Safe to run repeatedly; it only rewrites the file when something changed.
Runs locally, in Termux, or in the GitHub Action (.github/workflows/register-tracks.yml).
"""
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


def main():
    tracks = load_tracks()
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
    kept.extend({"file": f, "tags": list(DEFAULT_TAGS)} for f in added)

    for f in added:
        print(f"+ {f}")
    for f in removed:
        print(f"- {f}")

    if added or removed:
        save_tracks(kept)
        print(f"tracks_info.js updated: {len(added)} added, {len(removed)} removed, {len(kept)} total.")
    else:
        print(f"tracks_info.js already up to date ({len(kept)} tracks).")


if __name__ == "__main__":
    main()
