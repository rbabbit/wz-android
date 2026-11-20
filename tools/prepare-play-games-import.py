#!/usr/bin/env python3
"""Package the approved local achievement catalogue for manual Play Console import.

This tool writes local files only. It never contacts Google or invents service IDs.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
from pathlib import Path
import re
import struct
import zipfile


ROOT = Path(__file__).resolve().parents[1]
APPROVED_KEYS = (
    "campaign_first_mission", "campaign_missions_5", "campaign_complete",
    "towers_first_wave", "towers_victory", "towers_hard_victory",
    "survival_first_wave", "survival_run_5", "survival_total_25",
    "ffa_victory", "ffa_hard_victory", "challenge_victory",
    "challenge_hard_victory", "maps_completed", "maps_bots_3",
    "maps_team_victory", "mp_completed", "mp_victory",
)
GUIDE = "https://developer.android.com/games/pgs/integrate-achievements#zip-file-guidelines"


def csv_bytes(rows: list[list[object]]) -> bytes:
    stream = io.StringIO(newline="")
    csv.writer(stream, lineterminator="\r\n").writerows(rows)
    return stream.getvalue().encode("utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--definitions", type=Path,
                        default=ROOT / "app/src/main/assets/warzone/play-games-definitions.json")
    parser.add_argument("--output", type=Path,
                        default=ROOT / "docs/play-games-import/prepared")
    parser.add_argument("--zip-name", default="Warzone-Play-Games-Achievements.zip")
    parser.add_argument("--icon", type=Path,
                        help="Optional existing 512 x 512 PNG below 1 MB; copied unchanged for all entries")
    args = parser.parse_args()

    definitions = json.loads(args.definitions.read_text(encoding="utf-8-sig"))
    achievements = definitions["achievements"]
    by_key = {entry["key"]: entry for entry in achievements}
    if len(achievements) != 18 or set(by_key) != set(APPROVED_KEYS):
        raise ValueError("The catalogue must contain exactly the 18 approved achievement keys.")

    metadata: list[list[object]] = []
    mapping: list[list[object]] = [["local_key", "console_name", "type", "target", "points"]]
    resources = []
    names: set[str] = set()
    for order, key in enumerate(APPROVED_KEYS, 1):
        entry = by_key[key]
        name = entry["title"]
        description = entry["description"]
        kind = entry["type"].upper()
        target, points = entry["target"], entry["points"]
        if not isinstance(name, str) or not name or len(name) > 100 or name in names:
            raise ValueError(f"Invalid or duplicate achievement title for {key}.")
        if not isinstance(description, str) or len(description) > 500:
            raise ValueError(f"Invalid achievement description for {key}.")
        if any(char in name + description for char in ",\r\n"):
            raise ValueError(f"Google import names and descriptions cannot contain commas or newlines: {key}.")
        if kind not in ("STANDARD", "INCREMENTAL"):
            raise ValueError(f"Unknown achievement type for {key}.")
        if type(target) is not int or not 1 <= target <= 10000:
            raise ValueError(f"Invalid achievement target for {key}.")
        if type(points) is not int or not 5 <= points <= 200 or points % 5:
            raise ValueError(f"Achievement points must be a multiple of five from 5 to 200: {key}.")
        names.add(name)
        metadata.append([name, description, "True" if kind == "INCREMENTAL" else "False",
                         target if kind == "INCREMENTAL" else "", "Revealed", points, order])
        mapping.append([key, name, kind, target, points])
        title_resource = "achievement_" + re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
        resources.append({"key": key, "consoleName": name, "resourceName": "achievement_" + key,
                          "exportNameAliases": list(dict.fromkeys(["achievement_" + key, title_resource])),
                          "type": kind, "target": target, "points": points})

    files = {"AchievementsMetadata.csv": csv_bytes(metadata)}
    if args.icon is not None:
        icon = args.icon.read_bytes()
        if len(icon) < 24 or icon[:8] != b"\x89PNG\r\n\x1a\n" or struct.unpack(">II", icon[16:24]) != (512, 512):
            raise ValueError("The existing achievement icon must be a 512 x 512 PNG. No image conversion is performed.")
        if len(icon) >= 1_000_000:
            raise ValueError("Each Google import file must be below 1 MB.")
        icon_name = "warzone-achievement.png"
        files[icon_name] = icon
        files["AchievementsIconsMappings.csv"] = csv_bytes([[row[0], icon_name] for row in metadata])

    args.output.mkdir(parents=True, exist_ok=True)
    if Path(args.zip_name).name != args.zip_name or not args.zip_name.lower().endswith(".zip"):
        raise ValueError("--zip-name must be a plain ZIP filename.")
    archive = args.output / args.zip_name
    if archive.exists():
        raise FileExistsError(f"Preserving existing package; choose a new --output directory: {archive}")
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as package:
        for name, content in files.items():
            if len(content) >= 1_000_000:
                raise ValueError(f"Import file exceeds Google's 1 MB limit: {name}")
            package.writestr(name, content)
    (args.output / "achievement-key-mapping.csv").write_bytes(csv_bytes(mapping))
    (args.output / "achievement-resource-mapping.json").write_text(json.dumps({
        "schemaVersion": 1,
        "note": "Resource names are matching aliases only. Google-assigned IDs must come from exported public XML.",
        "achievements": resources,
    }, indent=2) + "\n", encoding="utf-8")
    board_rows = [["key", "title", "description", "order", "format", "classificationRequired"]]
    for board in definitions.get("leaderboards", []):
        board_rows.append([board["key"], board["title"], board["description"],
                           board["order"], board["format"], board.get("classificationRequired", True)])
    (args.output / "leaderboards-manual-reference.csv").write_bytes(csv_bytes(board_rows))
    instructions = (
        "LOCAL PREPARATION ONLY - NOT YET IMPORTED INTO GOOGLE PLAY\n\n"
        "In this game's Play Games Services > Achievements choose Import achievements.\n"
        f"Upload {args.zip_name} and Save as draft. Do not publish.\n"
        "Import only if these entries do not already exist to avoid duplicates.\n"
        "Then export the real Android resources XML from Play Console and map its\n"
        "Google-assigned achievement IDs using achievement-key-mapping.csv.\n"
        "The mapping CSV is reference material outside the import ZIP.\n"
        "The resource-mapping JSON records candidate resource names rather than Google IDs.\n"
        "No IDs in this package are Google-assigned service IDs.\n"
        "Leaderboards are separate Console configuration and are not in this ZIP.\n"
        + ("Existing icon copied unchanged.\n" if args.icon else
           "Icons omitted because no compliant existing source icon was supplied.\n"
           "Google documents icons as optional for import; add suitable icons in Console before publishing.\n")
        + "No tests or application launches were performed by this packaging command.\n\n"
        + GUIDE + "\n"
    )
    (args.output / "README.txt").write_text(instructions, encoding="utf-8")
    print(f"Prepared {len(metadata)} achievement definitions: {archive}")
    print("Google service IDs remain unconfigured until manual Console import and resource export.")


if __name__ == "__main__":
    main()
