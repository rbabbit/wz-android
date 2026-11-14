"""Read-only parser for Warzone 2100 4.7.0 replay movement evidence.

Source: official tag 4.7.0, lib/netplay/netreplay.cpp (replay format),
lib/netplay/netqueue.cpp (uint32 encoding tables), lib/netplay/nettypes.cpp
(signed coordinates), src/multibot.cpp (NETQueuedDroidInfo), and
src/orderdef.h (DORDER_MOVE = 2). This does not launch or modify the game.
"""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import struct


A = [78, 95, 32, 70, 0]
M = [1, 78, 7410, 237120, 16598400]


def read_u32(data, index):
    value = 0
    for n in range(5):
        byte = data[index]
        index += 1
        last = byte < 256 - A[n]
        value += (byte if last else 256 - A[n] + 255 - byte) * M[n]
        if last:
            return value, index
    raise ValueError("Invalid encoded uint32")


def read_i32(data, index):
    value, index = read_u32(data, index)
    return (value >> 1) ^ -(value & 1), index


def parse_replay(path, human_player=0):
    data = path.read_bytes()
    if data[:4] != b"WZrp":
        raise ValueError("Missing WZrp replay magic")
    size = struct.unpack_from(">I", data, 4)[0]
    settings = json.loads(data[8:8 + size])
    if settings.get("replayFormatVer") != 3:
        raise ValueError("This evidence parser expects replay format 3")
    at = 8 + size
    map_version, map_size = struct.unpack_from(">II", data, at)
    at += 8 + map_size
    records = 0
    counts = collections.Counter()
    orders = []
    human_orders = []
    while at + 4 <= len(data):
        offset = at
        sender, kind, length = struct.unpack_from(">BBH", data, at)
        at += 4
        payload = data[at:at + length]
        if len(payload) != length:
            raise ValueError("Truncated replay message")
        at += length
        records += 1
        counts[(sender, kind)] += 1
        if kind == 255:  # REPLAY_ENDED
            break
        if kind != 112:  # GAME_DROIDINFO
            continue
        index = 1
        player = payload[0]
        subtype, index = read_u32(payload, index)
        item = {"record": records, "byteOffset": offset, "sender": sender,
                "player": player, "messageType": "GAME_DROIDINFO", "subtype": subtype}
        if subtype in (0, 1):  # ObjOrder / LocOrder
            order, index = read_u32(payload, index)
            item["order"] = order
            if order == 2:
                item["orderName"] = "DORDER_MOVE"
            if subtype == 0:
                item["targetId"], index = read_u32(payload, index)
                _, index = read_u32(payload, index)
            else:
                x, index = read_i32(payload, index)
                y, index = read_i32(payload, index)
                item["targetPosition"] = [x, y]
            if order in (4, 6):  # BUILD / LINEBUILD
                _, index = read_u32(payload, index)
                index += 2  # uint16 direction
            if order == 6:
                _, index = read_i32(payload, index)
                _, index = read_i32(payload, index)
            if order == 20:  # BUILDMODULE
                _, index = read_u32(payload, index)
            item["queued"] = bool(payload[index])
            index += 1
        elif subtype == 2:  # SecondaryOrder
            _, index = read_u32(payload, index)
            _, index = read_u32(payload, index)
        else:
            raise ValueError("Unknown droid order subtype")
        count, index = read_u32(payload, index)
        if count > 65535:
            raise ValueError("Unexpected droid count")
        ids, last_id = [], 0
        for _ in range(count):
            delta, index = read_u32(payload, index)
            last_id = (last_id + delta) & 0xffffffff
            ids.append(last_id)
        item["droidIds"] = ids
        item["exactPayloadConsumed"] = index == len(payload)
        if index != len(payload):
            raise ValueError("Droid order payload was not consumed exactly")
        orders.append(item)
        if sender == human_player:
            human_orders.append(item)
    else:
        raise ValueError("Finalized REPLAY_ENDED record missing")
    end_size = struct.unpack_from(">I", data, at)[0]
    end = json.loads(data[at + 4:at + 4 + end_size])
    if struct.unpack_from(">I", data, at + 4 + end_size)[0] != end_size:
        raise ValueError("End metadata length mismatch")
    return {"sourceReplay": path.name, "sourceReplaySha256": hashlib.sha256(data).hexdigest(),
            "fileBytes": len(data), "format": settings["replayFormatVer"],
            "netcode": [settings.get("major"), settings.get("minor")],
            "embeddedMapVersion": map_version, "recordCount": records,
            "droidOrderCount": len(orders), "humanPlayer": human_player,
            "humanDroidOrders": human_orders, "gameTimeElapsed": end.get("gameTimeElapsed"),
            "scope": "Native PC replay records received synchronized input commands; destination arrival is not established by this parser."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("replay", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--apk-sha256")
    parser.add_argument("--note")
    args = parser.parse_args()
    observation = parse_replay(args.replay)
    if args.apk_sha256:
        observation["testedApkSha256"] = args.apk_sha256
    if args.note:
        observation["note"] = args.note
    text = json.dumps(observation, indent=2) + "\n"
    if args.output:
        args.output.write_text(text, encoding="utf-8")
    print(text, end="")
