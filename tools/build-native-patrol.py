"""Build the Patrol native adapters from the retained 0.93 object sets."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import argparse
import re
import runpy

ROOT = Path(__file__).resolve().parents[1]
PATROL_SOURCE = ROOT / "vendor/native-patrol/source"
OUT = PATROL_SOURCE.parent
STEERING = False
BASE = ROOT / "vendor/native-093"
ASSETS = ROOT / "app/src/main/assets"
CACHES = {
    "offline": Path("/home/punkech/wz-blueprint-20261107"),
    "multiplayer": Path("/home/punkech/wz-mp-070"),
}
BUILD = runpy.run_path(str(ROOT / "tools/build-native-selection-089.py"))
PACKAGE = runpy.run_path(str(ROOT / "tools/integrate-native-runtime.py"))["package_call"]


def replace_once(text, original, replacement):
    if text.count(original) != 1:
        raise RuntimeError("Expected source anchor exactly once: " + original)
    return text.replace(original, replacement, 1)


def add_controller(text, owner, safe, repair, combat, json_anchor):
    include = '#include "mobile-guarded-stop-v93.h"'
    text = replace_once(text, include, include + '''
#include "mobile-patrol.h"
static MobilePatrol mobilePatrol;
void mobilePatrolForget(uint32_t id) { mobilePatrol.forget(id); }
''')
    marker = f"    {repair}.frame({owner},{safe},repairDroids);"
    text = replace_once(text, marker, marker +
        f"\n    mobilePatrol.frame({owner} ? {combat}.context : std::string(), {safe}, repairDroids, {repair});")
    if STEERING:
        text = replace_once(text, "static MobilePatrol mobilePatrol;", '''static MobilePatrol mobilePatrol;
#include "mobile-steering.h"
static MobileSteering mobileSteering;''')
        call = f"    mobilePatrol.frame({owner} ? {combat}.context : std::string(), {safe}, repairDroids, {repair});"
        text = replace_once(text, call, call +
            f"\n    mobileSteering.frame({owner} ? {combat}.context : std::string(), {safe}, repairDroids, {repair}, mobilePatrol);")
    return replace_once(text, json_anchor, json_anchor + '{"patrol",mobilePatrol.ack},')


def patch_source(family, name, text):
    if name == "droid.cpp":
        anchor = '#include "campaigninfo.h"'
        text = replace_once(text, anchor, anchor + '''
#if defined(__EMSCRIPTEN__)
#include "mobile-unit-loss.h"
#endif
''')
        loss = '\t\t\tCONPRINTF(_("%s Lost!"), objInfo(psDroid));'
        return replace_once(text, loss, '''#if defined(__EMSCRIPTEN__)
\t\t\tif (!mobileUnitLossNotice(psDroid))
#endif
\t\t\t{
\t''' + loss + '''
\t\t\t}''')
    if name == "hci.cpp":
        return add_controller(text, "playing", "safe", "normalMobileRepairPolicyV93",
                              "normalMobileCombatPolicyV90", '{"repairPolicy",normalMobileRepairPolicyV93.snapshot()},')
    if name == "quickjs_backend.cpp":
        return add_controller(text, "world", "safe", "mpMobileRepairPolicyV93", "mpMobileCombatPolicy",
                              '{"repairPolicy",mpMobileRepairPolicyV93.snapshot()},')
    declare = "extern bool mobileCombatProtectsV93(const DROID *droid);"
    fallback = "static bool mobileCombatProtectsV93(const DROID *) { return false; }"
    text = text.replace(declare, declare + "\nextern void mobilePatrolForget(uint32_t id);")
    text = text.replace(fallback, fallback + "\nstatic void mobilePatrolForget(uint32_t) {}")
    if name == "order.cpp":
        anchor = "order = chooseOrderLoc(psCurr, x, y, specialOrderKeyDown());"
        text = replace_once(text, anchor, anchor + "\n\t\t\tif (order != DORDER_NONE) mobilePatrolForget(psCurr->id);")
        anchor = "DroidOrder order = chooseOrderObj(psCurr, psObj, specialOrderKeyDown());"
        return replace_once(text, anchor, anchor + "\n\t\t\tif (order.type != DORDER_NONE) mobilePatrolForget(psCurr->id);")
    start = text.index("MappableFunction kf_OrderDroid(const DroidOrderType order)")
    stop = text.index("intRefreshOrder();", start)
    body = replace_once(text[start:stop], "orderDroid(psDroid, order, ModeQueue);",
                        "mobilePatrolForget(psDroid->id);\n\t\t\t\torderDroid(psDroid, order, ModeQueue);")
    return text[:start] + body + text[stop:]


def compile_object(job):
    variant, family, name = job
    cache = CACHES[family]
    source = OUT / "generated" / family / name
    source.parent.mkdir(parents=True, exist_ok=True)
    original = (ROOT / "vendor/native-090/source/shared051/src/droid.cpp" if name == "droid.cpp"
                else BASE / "source" / family / "src" / name)
    patched = patch_source(family, name, original.read_text())
    # Shared and Towers hci sources are identical; compile the shared material
    # once per variant with its existing preprocessor flag.
    source = source.with_name(variant + "-" + name)
    source.write_text(patched)
    obj = OUT / "objects" / variant / (name + ".o")
    obj.parent.mkdir(parents=True, exist_ok=True)
    _, command = BUILD["compile_command"](cache, "src/" + name, source, obj)
    include_dirs = [PATROL_SOURCE, BASE / "source/common", ROOT / "vendor/native-091/source/common",
                    ROOT / "vendor/native-090/source/common"]
    flags = [flag for path in include_dirs for flag in ("-iquote", str(path))]
    if variant == "towers":
        flags.append("-DMOBILE_PLAYERS_SCENARIO91=1")
    command[1:1] = flags
    BUILD["execute"](command, cache, BUILD["environment"](cache), OUT / "logs" / f"{variant}-{name}.log")
    print(f"Compiled {variant}/{name}", flush=True)
    return (variant, name), obj


def link(variant, objects):
    family = "multiplayer" if variant == "multiplayer" else "offline"
    inherited = BASE / "objects/inherited" / family
    replacements = {BUILD["target"](path.name.removesuffix(".o")): path
                    for path in inherited.glob("*.o") if path.name != "droid.cpp.o" or variant == "shared"}
    for name in ("order.cpp", "keybind.cpp"):
        replacements[BUILD["target"](name)] = objects[family, name]
    name = "quickjs_backend.cpp" if variant == "multiplayer" else "hci.cpp"
    replacements[BUILD["target"](name)] = objects[variant, name]
    if (variant, "droid.cpp") in objects:
        replacements[BUILD["target"]("droid.cpp")] = objects[variant, "droid.cpp"]
    target = OUT / "raw" / variant
    target.mkdir(parents=True, exist_ok=True)
    cache = CACHES[family]
    _, command, _ = BUILD["link_command"](cache, replacements, target)
    BUILD["execute"](command, cache, BUILD["environment"](cache), OUT / "logs" / f"link-{variant}.log")
    print(f"Linked {variant}", flush=True)


def integrate(compact_loss):
    # Retain the active APK's asset indexes (including the 50 newer Towers
    # maps) and output hooks, using code only from the newly linked JS/WASM pair.
    aliases = {
        "shared": ["warzone/warzone2100", "warzone/warzone2100-campaign", "warzone/warzone2100-ffa",
                   "warzone/warzone2100-challenge", "warzone/warzone2100-duel"],
        "towers": ["warzone/warzone2100-towers-052", "warzone/warzone2100-survival"],
        "multiplayer": ["multiplayer/warzone2100"],
    }
    directory = r'Module\["FS_createPath"\]\("[^"\\]*","[^"\\]*",true,true\);'
    remote = r'var REMOTE_PACKAGE_BASE="[^"\\]+";'
    stock_output = "var out=console.log.bind(console);var err=console.error.bind(console);var wasmBinary;"
    worker_output = r'var out=console\.log\.bind\(console\);var blockNightOutputChannel=.*?;var wasmBinary;'
    mp_prefix = "globalThis.assert=(v,m)=>{if(!v)throw Error(m||'Emscripten assertion failed');};if(typeof importScripts==='function')importScripts('socket-bridge.js','lobby-http.js');\n"
    outputs = {}
    for variant, names in aliases.items():
        raw = (OUT / "raw" / variant / "warzone2100.js").read_text()
        begin, end, _, _ = PACKAGE(raw)
        for name in names:
            file = ASSETS / (name + ".js")
            baseline = file.read_text(encoding="utf-8")
            _, _, index, _ = PACKAGE(baseline)
            result = raw[:begin] + index + raw[end:]
            existing = set(re.findall(directory, result))
            missing = [line for line in re.findall(directory, baseline) if line not in existing]
            last = list(re.finditer(directory, result))[-1].end()
            result = result[:last] + "".join(missing) + result[last:]
            result = replace_once(result, re.search(remote, result)[0], re.search(remote, baseline)[0])
            if variant == "multiplayer":
                if not baseline.startswith(mp_prefix):
                    raise RuntimeError("Mobile network loader prefix changed")
                if compact_loss:
                    result = replace_once(result, stock_output,
                        'var out=console.log.bind(console);'
                        'var battleNoticeChannel=typeof BroadcastChannel=="function"?new BroadcastChannel("warzone-mp-unit-loss"):null;'
                        'var err=(...args)=>{console.error(...args);const text=args.join(" ");'
                        'if(text.startsWith("BNNOTICE:"))battleNoticeChannel?.postMessage(text);};var wasmBinary;')
                result = replace_once(result, "if(flags&32){return-2}", "flags&=~32;")
                result = replace_once(result, "preMain();readyPromiseResolve?.(Module);var noInitialRun=false;",
                    'preMain();Module["onRuntimeInitialized"]?.();readyPromiseResolve?.(Module);var noInitialRun=false;')
                result = mp_prefix + result
            else:
                result = replace_once(result, stock_output, re.search(worker_output, baseline, re.S)[0])
            if PACKAGE(result)[2] != index:
                raise RuntimeError("Native map file table changed for " + name)
            outputs[file] = result.encode("utf-8")
        outputs[ASSETS / (names[0] + ".wasm")] = (OUT / "raw" / variant / "warzone2100.wasm").read_bytes()
    for path, data in outputs.items():
        temporary = path.with_name(path.name + ".patrol-new")
        temporary.write_bytes(data)
        temporary.replace(path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--steering-output", type=Path, help="Build with army steering into a fresh output folder")
    parser.add_argument("--compact-loss", action="store_true", help="Enable compact unit-loss notices in shared and multiplayer engines")
    arguments = parser.parse_args()
    if arguments.compact_loss and not arguments.steering_output:
        parser.error("--compact-loss needs a fresh --steering-output folder")
    if arguments.steering_output:
        OUT = arguments.steering_output.resolve()
        OUT.mkdir(parents=True, exist_ok=False)
        STEERING = True
    jobs = [(variant, "offline", "hci.cpp") for variant in ("shared", "towers")]
    jobs.append(("multiplayer", "multiplayer", "quickjs_backend.cpp"))
    jobs.extend((family, family, name) for family in CACHES for name in ("order.cpp", "keybind.cpp"))
    if arguments.compact_loss:
        jobs.extend((variant, family, "droid.cpp") for variant, family in
                    (("shared", "offline"), ("multiplayer", "multiplayer")))
    with ThreadPoolExecutor(max_workers=3) as pool:
        objects = dict(pool.map(compile_object, jobs))
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda variant: link(variant, objects), ("shared", "towers", "multiplayer")))
    integrate(arguments.compact_loss)
