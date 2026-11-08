import json

js_file_path = "gc_olds_info.js"

# Read JS file
with open(js_file_path, "r", encoding="utf-8") as f:
    js_content = f.read()

# Find the start of the JSON array
var_name = "json_gc_olds"
start_index = js_content.find(f"var {var_name}")
if start_index == -1:
    raise ValueError(f"Could not find variable {var_name} in the JS file.")

# Find the first '[' after the variable name
array_start = js_content.find("[", start_index)
if array_start == -1:
    raise ValueError("Could not find the start of the JSON array.")

# Find the matching closing ']'
bracket_count = 0
for i, char in enumerate(js_content[array_start:], array_start):
    if char == "[":
        bracket_count += 1
    elif char == "]":
        bracket_count -= 1
        if bracket_count == 0:
            array_end = i + 1
            break
else:
    raise ValueError("Could not find the end of the JSON array.")

json_text = js_content[array_start:array_end]

# Remove trailing commas inside objects or arrays (invalid JSON)
json_text = json_text.replace(",]", "]").replace(",}", "}")

# Parse JSON
data = json.loads(json_text)

# ANSI color codes
RED = "\033[91m"
RESET = "\033[0m"

# Print output
for i, entry in enumerate(data, 1):
    if entry.get("Found_by_me"):
        status = "FOUND"
        print(f"{i}. {entry.get('Waypoint_Name')} {status}")
    else:
        print(f"{i}. {entry.get('Waypoint_Name')} {RED}- NOT FOUND{RESET}")
