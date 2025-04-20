import os
import json
import re

# --- CONFIGURATION ---
js_file_path = "tracks_info.js"
tracks_folder = "tracks"
default_tags = ['Tipus-Caminada']

# --- READ EXISTING JS FILE ---
with open(js_file_path, "r", encoding="utf-8") as f:
    js_content = f.read()

# Extract the JSON-like part from the JS file
match = re.search(r"let\s+tracks\s*=\s*(\[\s*{.*?}\s*]);", js_content, re.DOTALL)
if not match:
    raise ValueError("Could not find 'tracks' variable in JS file.")

# Parse existing track list
tracks_list = json.loads(match.group(1))

# Create a set of existing file paths for quick lookup
existing_files = {track['file'] for track in tracks_list}

# List all GPX files in the folder
all_gpx_files = [os.path.join(tracks_folder, f).replace("\\", "/") for f in os.listdir(tracks_folder) if f.endswith('.gpx')]

# Find missing files and add them
for gpx_file in all_gpx_files:
    if gpx_file not in existing_files:
        tracks_list.append({'file': gpx_file, 'tags': default_tags})

# Format the list as a JS variable again
updated_js = "let tracks = " + json.dumps(tracks_list, indent=4) + ";"

# Write back to the JS file (you can also write to a new file if preferred)
with open(js_file_path, "w", encoding="utf-8") as f:
    f.write(updated_js)

print("Updated JS file with any missing GPX tracks.")
