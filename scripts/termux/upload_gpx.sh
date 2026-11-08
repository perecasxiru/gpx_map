#!/data/data/com.termux/files/usr/bin/bash
# Termux:Widget shortcut: publish the GPX files downloaded from Wikiloc.
#
# Install / update on the phone (after a `git pull` in ~/gpx_map):
#   cp ~/gpx_map/scripts/termux/upload_gpx.sh ~/.shortcuts/upload_gpx.sh
#   chmod +x ~/.shortcuts/upload_gpx.sh
#
# For each new track a dialog asks its type (Caminada, Travessa...). This needs the
# Termux:API app + `pkg install termux-api`; without it every track gets the default.
# Peak tags (100Cims, Sostres, 3000s) are detected automatically by newtrack.py.
#
# Only the GPX files need to reach GitHub: the "Register new tracks" Action
# updates tracks_info.js and tracks_data.json if this script couldn't. Running
# newtrack.py here puts everything in a single commit, so Pages redeploys once.

set -euo pipefail
shopt -s nullglob nocaseglob

REPO_PATH="${GPX_REPO:-$HOME/gpx_map}"
SRC_DIR="${GPX_SRC:-$HOME/storage/shared/gpx_tracks}"
DEFAULT_TYPE="Caminada"
FALLBACK_TYPES="Caminada,Travessa,Bicicleta,Via Ferrada"

notify() {
    echo "$1"
    command -v termux-toast >/dev/null && termux-toast "$1" || true
}

# Ask the track type with a radio dialog; print the default if there is no dialog or it is cancelled.
ask_type() {
    local name="$1" result
    if ! command -v termux-dialog >/dev/null; then
        echo "$DEFAULT_TYPE"
        return
    fi
    result=$(termux-dialog radio -t "Tipus: ${name%.*}" -v "$TYPES" 2>/dev/null || true)
    python -c '
import json, sys
try:
    d = json.loads(sys.stdin.read() or "{}")
except ValueError:
    d = {}
print(d["text"] if d.get("code") == -1 and d.get("text") else sys.argv[1])
' "$DEFAULT_TYPE" <<<"$result"
}

cd "$REPO_PATH"

# 1. Sync first, so the new commit sits on top of the latest version.
git pull --rebase --autostash

# 2. Collect the new tracks.
files=("$SRC_DIR"/*.gpx)
if (( ${#files[@]} == 0 )); then
    # Nothing new, but push anything left over from a failed earlier run (no signal, etc.).
    if [[ -n "$(git log '@{u}..' --oneline)" ]]; then
        git push && notify "Pushed pending tracks"
    else
        notify "No GPX files in $SRC_DIR"
    fi
    exit 0
fi

# 3. Ask each track's type, then move it into the repo.
TYPES=$(python newtrack.py --types 2>/dev/null | paste -sd, - || true)
TYPES="${TYPES:-$FALLBACK_TYPES}"
tag_args=()
for f in "${files[@]}"; do
    name=$(basename "$f")
    type=$(ask_type "$name")
    echo "+ $name ($type)"
    tag_args+=(--tags "$name=Tipus-$type")
    mv "$f" tracks/
done

# 4. Register them and detect peaks (optional; the GitHub Action does it otherwise, with default tags).
python newtrack.py "${tag_args[@]}" || echo "newtrack.py failed; the GitHub Action will register the tracks."

# 5. Commit only the tracks and the generated files, then push.
git add tracks/ tracks_info.js tracks_data.json
git commit -m "Auto: new GPX upload via Termux (${#files[@]} track(s))"
if git push; then
    notify "Uploaded ${#files[@]} track(s)"
else
    notify "Push failed, run the shortcut again when you have signal"
    exit 1
fi
