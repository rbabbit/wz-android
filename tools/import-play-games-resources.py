#!/usr/bin/env python3
"""Map real Google-exported achievement resource IDs into an explicit output config.

Run manually after Console import. No network requests or leaderboard creation.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--xml", type=Path, required=True, help="Actual Android resources XML exported by Play Console")
    parser.add_argument("--definitions", type=Path,
                        default=ROOT / "app/src/main/assets/warzone/play-games-definitions.json")
    parser.add_argument("--config", type=Path, default=ROOT / "app/src/main/assets/warzone/play-games.json")
    parser.add_argument("--mapping", type=Path, help="Optional generated achievement-resource-mapping.json")
    parser.add_argument("--names", type=Path, help="Optional JSON object mapping local achievement keys to exported resource names")
    parser.add_argument("--output", type=Path, required=True, help="Explicit destination; app config changes only when this points to it")
    args = parser.parse_args()

    config = json.loads(args.config.read_text(encoding="utf-8-sig"))
    definitions = json.loads(args.definitions.read_text(encoding="utf-8-sig"))["achievements"]
    document = ET.parse(args.xml).getroot()
    values = {entry.attrib["name"]: "".join(entry.itertext()).strip()
              for entry in document.findall("string") if "name" in entry.attrib}
    exported_app = values.get("app_id")
    if exported_app and exported_app != config["gamesApplicationId"]:
        raise ValueError("The exported resources belong to a different Google Play Games application.")

    aliases = {}
    if args.mapping:
        for entry in json.loads(args.mapping.read_text(encoding="utf-8-sig"))["achievements"]:
            aliases[entry["key"]] = entry.get("exportNameAliases", [entry["resourceName"]])
    explicit = json.loads(args.names.read_text(encoding="utf-8-sig")) if args.names else {}
    if not isinstance(explicit, dict) or any(not isinstance(k, str) or not isinstance(v, str) for k, v in explicit.items()):
        raise ValueError("--names must contain a JSON object of local keys to exported resource names.")

    mapped = []
    used_ids = set()
    missing = []
    for definition in definitions:
        key = definition["key"]
        title_name = "achievement_" + re.sub(r"[^a-z0-9]+", "_", definition["title"].lower()).strip("_")
        candidates = [explicit[key]] if key in explicit else aliases.get(key, ["achievement_" + key, title_name])
        matches = {values[name] for name in candidates if name in values}
        if len(matches) != 1:
            missing.append(key)
            continue
        google_id = matches.pop()
        if not google_id.startswith("Cg") or not re.fullmatch(r"[A-Za-z0-9_-]+", google_id):
            raise ValueError(f"Unexpected Google achievement ID for {key}; use the actual Console export.")
        if google_id in used_ids:
            raise ValueError(f"The same Google achievement ID was mapped to more than one local key: {key}.")
        used_ids.add(google_id)
        mapped.append({"key": key, "id": google_id, "kind": "achievement", "mode": "*", "map": "*",
                       "difficulty": "*", "threshold": definition["target"],
                       "incremental": definition["type"].upper() == "INCREMENTAL"})
    if missing:
        raise ValueError("No unique exported resource match for: " + ", ".join(missing)
                         + ". Supply --names with exact local-key to resource-name mappings.")
    config["achievements"] = mapped
    # Preserve existing leaderboard mappings. Their exact mode/map/difficulty
    # classifications cannot be recovered from public XML resource names alone.
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    print(f"Mapped {len(mapped)} Google-exported achievement IDs into {args.output}")
    print("Existing leaderboard configuration preserved. No Console changes or tests performed.")


if __name__ == "__main__":
    main()
