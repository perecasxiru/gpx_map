#!/data/data/com.termux/files/usr/bin/bash
# Termux:Widget shortcut: publish the GPX files downloaded from Wikiloc.
#
# Install / update on the phone (after a `git pull` in ~/gpx_map):
#   cp ~/gpx_map/scripts/termux/upload_gpx.sh ~/.shortcuts/upload_gpx.sh
#   chmod +x ~/.shortcuts/upload_gpx.sh
#
# Only the GPX files need to reach GitHub: the "Register new tracks" Action
# updates tracks_info.js if this script couldn't. Running newtrack.py here just
# puts everything in a single commit, so Pages redeploys once.

set -euo pipefail
shopt -s nullglob nocaseglob

REPO_PATH=~/gpx_map
SRC_DIR=~/storage/shared/gpx_tracks

notify() {
    echo "$1"
    command -v termux-toast >/dev/null && termux-toast "$1" || true
}

cd "$REPO_PATH"

# 1. Sync first, so the new commit sits on top of the latest version.
git pull --rebase --autostash

# 2. Move the new tracks into the repo.
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

for f in "${files[@]}"; do
    echo "+ $(basename "$f")"
    mv "$f" tracks/
done

# 3. Register them (optional; the GitHub Action does it otherwise).
python newtrack.py || echo "newtrack.py failed; the GitHub Action will register the tracks."

# 4. Commit only the tracks and the index, then push.
git add tracks/ tracks_info.js
git commit -m "Auto: new GPX upload via Termux (${#files[@]} track(s))"
if git push; then
    notify "Uploaded ${#files[@]} track(s)"
else
    notify "Push failed, run the shortcut again when you have signal"
    exit 1
fi
