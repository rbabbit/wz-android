"""Reproduce tested engine assets using only this project's vendored inputs.

--check verifies packaged files without modifying them. --output-dir PATH builds
in a scratch directory. Android resources and Gradle files are already included.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
STOCK = ROOT / "vendor" / "stock"
ASSETS = ROOT / "app" / "src" / "main" / "assets" / "warzone"
NAMES = ("warzone2100.js", "warzone2100.data", "warzone2100.wasm")
STOCK_HASHES = {
    "warzone2100.js": "a0c89f14b8ff8bb3a512c598eb125235d2a13680c96d305bbfb8ea8a5aaaef5a",
    "warzone2100.data": "9e89d11c8b67b5f68ddc0be43290233c28cd43b3d2a96fea1a7b4beaf83b8424",
    "warzone2100.wasm": "5cfd676db13c96899a876fbd77197b7092b924ed265feed8594a2356f0b2492d",
}
DELIVERY_HASHES = {
    "warzone2100.js": "58b5c95822710b2b5cb3d666285b33e5c8a87ad17b9323baa8f083bdb828c04a",
    "warzone2100.data": STOCK_HASHES["warzone2100.data"],
    "warzone2100.wasm": STOCK_HASHES["warzone2100.wasm"],
}
WORKER_ADAPTER = (
    "globalThis.assert=(v,m)=>{if(!v)throw Error(m||'Emscripten assertion failed');};"
    "if(typeof importScripts==='function')importScripts('socket-bridge.js','lobby-http.js');\n"
)


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonicalize_package(script, data):
    """Keep the stock index; reproduce its tested compact JSON representation.

    Original JS omits object-key quotes and uses exponent notation for a few
    integral offsets. Files, offsets, UUID and package length remain stock.
    """
    matches = list(re.finditer(r'\bloadPackage\(\s*\{\s*(?:files|"files")\s*:', script))
    require(len(matches) == 1, "Expected one stock package index")
    start = matches[0].start()
    brace = script.index("{", start)
    depth, quote, escaped, close = 0, None, False, None
    for position in range(brace, len(script)):
        char = script[position]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
        elif char in ("\"", "'"):
            quote = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                close = position
                break
    require(close is not None, "Unterminated stock package index")
    suffix = re.match(r"\s*\)", script[close + 1:])
    require(suffix is not None, "Expected package-call closing parenthesis")
    end = close + 1 + suffix.end()
    metadata = json.loads(re.sub(
        r"([{,]\s*)([A-Za-z_][A-Za-z_0-9]*)\s*:",
        r'\1"\2":', script[brace:close + 1]
    ))
    require(metadata.get("remote_package_size") == len(data), "Stock data length differs")
    require(isinstance(metadata.get("files"), list), "Stock package has no file table")
    filenames = set()
    for item in metadata["files"]:
        filename = item.get("filename")
        require(isinstance(filename, str) and filename.startswith("/"), "Invalid stock filename")
        require(filename not in filenames, "Duplicate stock filename: " + filename)
        filenames.add(filename)
        for key in ("start", "end"):
            number = item.get(key)
            require(type(number) in (int, float) and math.isfinite(number)
                    and number == int(number), "Non-integral stock offset")
            item[key] = int(number)
        require(0 <= item["start"] <= item["end"] <= len(data), "Stock offset is outside data")
    return (script[:start] + "loadPackage("
            + json.dumps(metadata, separators=(",", ":")) + ")" + script[end:])


def prepare():
    files = {name: (STOCK / name).read_bytes() for name in NAMES}
    for name, content in files.items():
        require(digest(content) == STOCK_HASHES[name], "Vendored input differs: " + name)
    # Emit the exact tested CRLF bytes on every OS, without write_text translation.
    script = files["warzone2100.js"].decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
    script = canonicalize_package(script, files["warzone2100.data"])
    dns_gate = "if(flags&32){return-2}"
    require(script.count(dns_gate) == 1, "Expected stock AI_ADDRCONFIG gate")
    script = script.replace(dns_gate, "flags&=~32;")
    script = WORKER_ADAPTER + script
    export_marker = 'Module["FS_createPath"]=FS_createPath;'
    require(script.count(export_marker) == 1, "Expected one FS export marker")
    script = script.replace(export_marker, 'Module["FS"]=FS;' + export_marker)
    runtime_marker = 'preMain();readyPromiseResolve?.(Module);var noInitialRun=false;'
    require(script.count(runtime_marker) == 1, "Expected one main-thread runtime-ready marker")
    script = script.replace(runtime_marker,
                            'preMain();Module["onRuntimeInitialized"]?.();readyPromiseResolve?.(Module);var noInitialRun=false;')
    files["warzone2100.js"] = script.replace("\n", "\r\n").encode("utf-8")
    for name, content in files.items():
        require(digest(content) == DELIVERY_HASHES[name], "Generated delivery differs: " + name)
    return files


def verify(files, directory):
    for name, content in files.items():
        require((directory / name).read_bytes() == content,
                "Existing asset differs: " + str(directory / name))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=ASSETS,
                        help="Engine destination (default: packaged app assets)")
    parser.add_argument("--check", action="store_true",
                        help="Compare destination without writing any files")
    parser.add_argument("--verify-against", type=Path,
                        help="Additionally require byte identity with this directory")
    args = parser.parse_args()
    files = prepare()
    if args.verify_against:
        verify(files, args.verify_against)
    if args.check:
        verify(files, args.output_dir)
    else:
        args.output_dir.mkdir(parents=True, exist_ok=True)
        for name, content in files.items():
            (args.output_dir / name).write_bytes(content)
        verify(files, args.output_dir)
    print(json.dumps({
        "mode": "verified" if args.check else "prepared",
        "output": str(args.output_dir.resolve()),
        "upstream": "4.7.0 7d3d8e51a61ceee89e6bf672a41337e1a9cd7392",
        "netcode": [16384, 104],
        "assets": {name: {"bytes": len(content), "sha256": digest(content)}
                   for name, content in files.items()},
    }, indent=2))


if __name__ == "__main__":
    main()
