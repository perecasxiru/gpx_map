"""Build tracks_data.json: one compact file with every track, for fast map loading.

For each GPX listed in tracks_info.js it stores:
  file, name, date, tags, km, gain, loss, max_ele, min_ele,
  lines: simplified [lon, lat, ele] coordinates (one list per GPX <trk>/<rte>).

Stats (km, gain...) are computed on the full-resolution track. The geometry is
simplified with Douglas-Peucker, which looks the same on the map and is plenty
for the elevation chart. The original GPX stays in tracks/ for download.

Peaks: every 100 Cims / sostre / 3000 within PEAK_RADIUS_M of the full-resolution
track is stored in the track's "peaks", adds automatic tags (100Cims-*, Sostres-Tots,
3000s-Tots) on top of the manual ones from tracks_info.js, and is listed in the
top-level "reached" so the map marks it as done. The *_info.js files are only read.

Incremental: a track is only re-parsed when its GPX content (sha1), the peak files
or BUILD_VERSION change. Pure standard library, so it runs in Termux too.
"""
import hashlib
import json
import math
import os
import re
import sys
import xml.etree.ElementTree as ET

BUILD_VERSION = 2
TOLERANCE_M = float(os.environ.get("GPX_TOLERANCE_M", 5))  # simplification tolerance
GAIN_THRESHOLD_M = 5  # hysteresis to ignore GPS altitude noise when summing gain/loss
PEAK_RADIUS_M = 100   # a peak counts as reached if the track passes this close (matches all manual 100Cims tags)

# kind, file, JS variable, automatic tags (the 100 Cims "essencial" tag is added separately)
PEAK_SOURCES = [
    ("100cims", "peaks_info.js", "json_peaks", ["100Cims-Tots"]),
    ("sostres", "sostres_info.js", "json_sostres", ["Sostres-Tots"]),
    ("3000s", "tresmils_info.js", "json_tresmils", ["3000s-Tots"]),
]


def load_js_array(path, var):
    """Read `var x = [...]` from a JS data file (tolerates comments and trailing commas)."""
    with open(path, encoding="utf-8") as f:
        s = f.read()
    start = s.index("[", s.index(var))
    depth = 0
    for end, c in enumerate(s[start:], start):
        depth += (c == "[") - (c == "]")
        if depth == 0:
            break
    text = re.sub(r"/\*.*?\*/", "", s[start:end + 1], flags=re.DOTALL)
    text = re.sub(r",\s*([\]}])", r"\1", text)
    return json.loads(text)


def load_peaks():
    """Return (peaks, sha1 of the peak files). peaks: [(kind, name, lat, lon, tags)]."""
    peaks, digest = [], hashlib.sha1()
    for kind, filename, var, tags in PEAK_SOURCES:
        path = os.path.join(ROOT, filename)
        with open(path, "rb") as f:
            digest.update(f.read())
        for p in load_js_array(path, var):
            extra = []
            if kind == "100cims":
                extra = ["100Cims-Essencials" if p.get("essencial") else "100Cims-No Essencials"]
            peaks.append((kind, p["nom"], float(p["lat"]), float(p["lon"]), tags + extra))
    return peaks, digest.hexdigest()


def _segment_distance(lat0, lon0, a, b):
    """Metres from (lat0, lon0) to segment a-b, on a local flat projection."""
    k = math.radians(1) * EARTH_R
    c = math.cos(math.radians(lat0))
    ax, ay = (a[1] - lon0) * c * k, (a[0] - lat0) * k
    bx, by = (b[1] - lon0) * c * k, (b[0] - lat0) * k
    dx, dy = bx - ax, by - ay
    seg2 = dx * dx + dy * dy
    t = 0.0 if seg2 == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / seg2))
    return math.hypot(ax + t * dx, ay + t * dy)


def reached_peaks(lines, peaks):
    """Peaks within PEAK_RADIUS_M of the track, as [(kind, name, tags)]."""
    pts = [p for line in lines for p in line]
    if not pts:
        return []
    margin = PEAK_RADIUS_M / 111_000 * 2   # degrees, generous for longitude too
    lat_min, lat_max = min(p[0] for p in pts) - margin, max(p[0] for p in pts) + margin
    lon_min, lon_max = min(p[1] for p in pts) - margin, max(p[1] for p in pts) + margin
    found = []
    for kind, name, lat, lon, tags in peaks:
        if not (lat_min <= lat <= lat_max and lon_min <= lon <= lon_max):
            continue
        if any(_segment_distance(lat, lon, line[i], line[i + 1]) <= PEAK_RADIUS_M
               for line in lines for i in range(len(line) - 1)):
            found.append((kind, name, tags))
    return found

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


def build_entry(track, path, digest, peaks):
    name, first_time, lines = parse_gpx(path)
    found = reached_peaks(lines, peaks)
    auto_tags = []
    for _, _, tags in found:
        auto_tags += [t for t in tags if t not in auto_tags]
    entry = {
        "file": track["file"],
        "name": name or os.path.splitext(os.path.basename(track["file"]))[0].replace("_", " "),
        "date": first_time[:10] if first_time else None,
        **stats(lines),
        "peaks": [[kind, peak_name] for kind, peak_name, _ in found],
        "auto_tags": auto_tags,
        "lines": [
            [[round(p[1], 5), round(p[0], 5)] + ([round(p[2])] if p[2] is not None else [])
             for p in simplify(line, TOLERANCE_M)]
            for line in lines
        ],
        "sha1": digest,
    }
    return entry


def load_existing(peaks_sha):
    try:
        with open(OUT_FILE, encoding="utf-8") as f:
            data = json.load(f)
        if (data.get("version") == BUILD_VERSION and data.get("tolerance_m") == TOLERANCE_M
                and data.get("peaks_sha1") == peaks_sha):
            return {t["file"]: t for t in data["tracks"]}
    except (OSError, ValueError, KeyError):
        pass
    return {}


def build(tracks):
    """tracks: list of {"file", "tags"} from tracks_info.js. Returns True if the file changed."""
    peaks, peaks_sha = load_peaks()
    cache = load_existing(peaks_sha)
    out, parsed = [], 0
    reached = {kind: {} for kind, *_ in PEAK_SOURCES}
    for track in tracks:
        path = os.path.join(ROOT, track["file"])
        with open(path, "rb") as f:
            # Ignore CRLF vs LF, so a checkout with other line endings doesn't force a re-parse.
            digest = hashlib.sha1(f.read().replace(b"\r\n", b"\n")).hexdigest()
        entry = cache.get(track["file"])
        if not entry or entry.get("sha1") != digest:
            try:
                entry = build_entry(track, path, digest, peaks)
            except ET.ParseError as e:
                print(f"! skipping {track['file']}: {e}", file=sys.stderr)
                continue
            parsed += 1
        # Manual tags from tracks_info.js first, then the automatic peak tags.
        tags = list(track["tags"]) + [t for t in entry["auto_tags"] if t not in track["tags"]]
        out.append({**entry, "tags": tags})
        for kind, peak_name in entry["peaks"]:
            reached[kind].setdefault(peak_name, []).append(track["file"])

    payload = {
        "version": BUILD_VERSION,
        "tolerance_m": TOLERANCE_M,
        "peaks_sha1": peaks_sha,
        "reached": reached,
        "tracks": out,
    }
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
    counts = ", ".join(f"{len(v)} {k}" for k, v in reached.items())
    print(f"tracks_data.json written: {len(out)} tracks ({parsed} parsed), {len(text) / 1e6:.2f} MB. "
          f"Peaks reached: {counts}.")
    return True


if __name__ == "__main__":
    sys.path.insert(0, ROOT)
    from newtrack import load_tracks

    build(load_tracks())
