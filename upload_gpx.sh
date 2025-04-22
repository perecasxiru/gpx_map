#!/data/data/com.termux/files/usr/bin/bash

# Variables
REPO_PATH=~/gpx_map
GPX_SRC=~/storage/shared/gpx_tracks/*.gpx

# Copy file
cp $GPX_SRC $REPO_PATH/tracks/

# Go to repo
cd $REPO_PATH

# Run modification script
python newtrack.py

# Commit and push
git add .
git commit -m "Auto: new GPX upload via Termux"
git push
