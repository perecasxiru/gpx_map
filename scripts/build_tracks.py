"""Build tracks_data.json: one compact file with every track, for fast map loading.

For each GPX listed in tracks_info.js it stores:
  file, name, date, tags, km, gain, loss, max_ele, min_ele,
  lines: simplified [lon, lat, ele] coordinates (one list per GPX <trk>/<rte>).

Stats (km, gain...) are computed on the full-resolution track. The geometry is
simplified with Douglas-Peucker, which looks the same on the map and is plenty
for the elevation chart. The original GPX stays in tracks/ for download.

Incremental: a track is only re-parsed when its GPX content (sha1) changes or
BUILD_VERSION changes. Pure standard library, so it runs in Termux too.
"""
import hashlib
import json
import math
import os
import sys
import xml.etree.ElementTree as ET

BUILD_VERSION = 1
TOLERANCE_M = float(os.environ.get("GPX_TOLERANCE_M", 5))  # simplification tolerance
GAIN_THRESHOLD_M = 5  # hysteresis to ignore GPS altitude noise when summing gain/loss

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_FILE = os.path.join(ROOT, "tracks_data.json")
EARTH_R = 6371008.8


def _local(tag):
    return tag.rsplit("}", 1)[-1]


def _child_text(el, name):
    for c in el:
        if _local(c.tag) == name:
            return (c.text or "").strip()
    return None


def parse_gpx(path):
    """Return (name, first_time, [segments]) where a segment is [(lat, lon, ele|None)]."""
    root = ET.parse(path).getroot()
    lines, name, first_time = [], None, None

    def take_points(parent, point_tag):
        pts = []
        nonlocal first_time
        for p in parent:
            if _local(p.tag) != point_tag:
                continue
            ele = _child_text(p, "ele")
            if first_time is None:
                first_time = _child_text(p, "time")
            pts.append((float(p.get("lat")), float(p.get("lon")), float(ele) if ele else None))
        return pts

    for el in root:
        tag = _local(el.tag)
        if tag == "trk":
            name = name or _child_text(el, "name")
            line = []
            for seg in el:
                if _local(seg.tag) == "trkseg":
                    line.extend(take_points(seg, "trkpt"))
            if len(line) > 1:
                lines.append(line)
        elif tag == "rte":
            name = name or _child_text(el, "name")
            line = take_points(el, "rtept")
            if len(line) > 1:
                lines.append(line)

    meta = next((e for e in root if _local(e.tag) == "metadata"), None)
    if meta is not None:
        name = name or _child_text(meta, "name")
        first_time = first_time or _child_text(meta, "time")
    return name, first_time, lines


def haversine(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_R * math.asin(math.sqrt(h))


def stats(lines):
    dist = gain = loss = 0.0
    eles = []
    for line in lines:
        ref = None
        for i, p in enumerate(line):
            if i:
                dist += haversine(line[i - 1], p)
            if p[2] is None:
                continue
            eles.append(p[2])
            if ref is None:
                ref = p[2]
            elif p[2] - ref >= GAIN_THRESHOLD_M:
                gain += p[2] - ref
                ref = p[2]
            elif ref - p[2] >= GAIN_THRESHOLD_M:
                loss += ref - p[2]
                ref = p[2]
    return {
        "km": round(dist / 1000, 2),
        "gain": round(gain),
        "loss": round(loss),
        "max_ele": round(max(eles)) if eles else None,
        "min_ele": round(min(eles)) if eles else None,
    }


def simplify(line, tol):
    """Douglas-Peucker on a local equirectangular projection (metres)."""
    if len(line) < 3:
        return line
    lat0 = math.radians(line[0][0])
    xy = [(math.radians(p[1]) * math.cos(lat0) * EARTH_R, math.radians(p[0]) * EARTH_R) for p in line]
    keep = [False] * len(line)
    keep[0] = keep[-1] = True
    stack = [(0, len(line) - 1)]
    tol2 = tol * tol
    while stack:
        i, j = stack.pop()
        (x1, y1), (x2, y2) = xy[i], xy[j]
        dx, dy = x2 - x1, y2 - y1
        seg2 = dx * dx + dy * dy
        best, idx = -1.0, -1
        for k in range(i + 1, j):
            px, py = xy[k]
            if seg2 == 0:
                d2 = (px - x1) ** 2 + (py - y1) ** 2
            else:
                t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / seg2))
                d2 = (px - x1 - t * dx) ** 2 + (py - y1 - t * dy) ** 2
            if d2 > best:
                best, idx = d2, k
        if best > tol2:
            keep[idx] = True
            stack.append((i, idx))
            stack.append((idx, j))
    return [p for p, k in zip(line, keep) if k]


def build_entry(track, path, digest):
    name, first_time, lines = parse_gpx(path)
    entry = {
        "file": track["file"],
        "name": name or os.path.splitext(os.path.basename(track["file"]))[0].replace("_", " "),
        "date": first_time[:10] if first_time else None,
        **stats(lines),
        "lines": [
            [[round(p[1], 5), round(p[0], 5)] + ([round(p[2])] if p[2] is not None else [])
             for p in simplify(line, TOLERANCE_M)]
            for line in lines
        ],
        "sha1": digest,
    }
    return entry


def load_existing():
    try:
        with open(OUT_FILE, encoding="utf-8") as f:
            data = json.load(f)
        if data.get("version") == BUILD_VERSION and data.get("tolerance_m") == TOLERANCE_M:
            return {t["file"]: t for t in data["tracks"]}
    except (OSError, ValueError, KeyError):
        pass
    return {}


def build(tracks):
    """tracks: list of {"file", "tags"} from tracks_info.js. Returns True if the file changed."""
    cache = load_existing()
    out, parsed = [], 0
    for track in tracks:
        path = os.path.join(ROOT, track["file"])
        with open(path, "rb") as f:
            digest = hashlib.sha1(f.read()).hexdigest()
        entry = cache.get(track["file"])
        if not entry or entry.get("sha1") != digest:
            try:
                entry = build_entry(track, path, digest)
            except ET.ParseError as e:
                print(f"! skipping {track['file']}: {e}", file=sys.stderr)
                continue
            parsed += 1
        entry = {**entry, "tags": track["tags"]}
        out.append(entry)

    payload = {"version": BUILD_VERSION, "tolerance_m": TOLERANCE_M, "tracks": out}
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    try:
        with open(OUT_FILE, encoding="utf-8") as f:
            if f.read() == text:
                print(f"tracks_data.json already up to date ({len(out)} tracks).")
                return False
    except OSError:
        pass
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"tracks_data.json written: {len(out)} tracks ({parsed} parsed), {len(text) / 1e6:.2f} MB.")
    return True


if __name__ == "__main__":
    sys.path.insert(0, ROOT)
    from newtrack import load_tracks

    build(load_tracks())
