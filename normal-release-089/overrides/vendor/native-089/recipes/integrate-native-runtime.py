"""Integrate a source-built JS/WASM pair with the frozen authored app data.

Default output is an isolated candidate directory. This tool never edits inputs.
Only the original package index and exact existing worker-output hook are inserted
into generated JavaScript. All other generated-runtime bytes must remain identical.
"""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile
import argparse
import json
import math
import re


def digest(data):
    return sha256(data).hexdigest()


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def package_call(script):
    starts = list(re.finditer(r'\bloadPackage\(\s*\{\s*(?:files|"files")\s*:', script))
    require(len(starts) == 1, 'Expected exactly one generated literal package index')
    start = starts[0].start()
    brace = script.index('{', starts[0].start())
    depth = 0
    quote = None
    escaped = False
    close = None
    for i in range(brace, len(script)):
        char = script[i]
        if quote:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == quote:
                quote = None
        elif char in ('"', "'"):
            quote = char
        elif char == '{':
            depth += 1
        elif char == '}':
            depth -= 1
            if depth == 0:
                close = i
                break
    require(close is not None, 'Unterminated package object')
    suffix = re.match(r'\s*\)', script[close+1:])
    require(suffix is not None, 'Expected package-call closing parenthesis')
    end = close + 1 + suffix.end()
    obj = script[brace:close+1]
    # Emscripten's minifier unquotes plain object keys; restore JSON keys only.
    metadata = json.loads(re.sub(r'([{,]\s*)([A-Za-z_][A-Za-z_0-9]*)\s*:', r'\1"\2":', obj))
    require(isinstance(metadata.get('files'), list), 'Missing file table')
    return start, end, script[start:end], metadata


def verify_index(metadata, data):
    require(metadata.get('remote_package_size') == len(data), 'Frozen package length mismatch')
    names = []
    for item in metadata['files']:
        name, start, end = item.get('filename'), item.get('start'), item.get('end')
        require(isinstance(name, str) and name.startswith('/'), 'Invalid virtual filename')
        integral = lambda n: type(n) in (int, float) and math.isfinite(n) and n == int(n)
        require(integral(start) and integral(end) and 0 <= start <= end <= len(data), 'Invalid file offset')
        names.append(name)
    require(len(names) == len(set(names)), 'Duplicate frozen virtual filenames')
    require('/data/mp/tests/warzone-towers-commands.js' in names, 'Expected Towers native adapter missing')
    require('/data/mp/tests/warzonetowers-td1.json' in names, 'Expected authored Dustfall scenario missing')
    return names


def module_exports(script):
    return set(re.findall(r'Module\["([A-Za-z0-9_$]+)"\]\s*=', script)) | set(re.findall(r'Module\.([A-Za-z0-9_$]+)\s*=', script))


def verify_runtime_contract(baseline, raw):
    expected, actual = module_exports(baseline), module_exports(raw)
    missing = sorted(expected - actual)
    require(not missing, 'Generated runtime is missing baseline Module exports: '+str(missing)+'; correct source build/link flags before packaging')
    # FS must be available in the ordinary early export block, before preRun
    # callbacks run. Exporting only after the module promise resolves is too late.
    fs = raw.find('Module["FS"]=FS;')
    remove = raw.find('Module["removeRunDependency"]=removeRunDependency;')
    create = raw.find('Module["FS_createPreloadedFile"]=FS_createPreloadedFile;')
    run = raw.rfind('run();')
    require(min(fs,remove,create,run) >= 0, 'Expected standard early FS export and final run call')
    require(max(fs,remove,create)-min(fs,remove,create)<1200 and fs<run, 'Module.FS must be in the early runtime export block, before preRun executes')
    return {'baselineExports':sorted(expected),'generatedExports':sorted(actual),'missing':missing,'earlyFSExport':True,'fsExportOffset':fs,'finalRunOffset':run}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--raw-js', type=Path, required=True)
    p.add_argument('--raw-wasm', type=Path, required=True)
    baseline_input = p.add_mutually_exclusive_group(required=True)
    baseline_input.add_argument('--baseline-apk', type=Path)
    baseline_input.add_argument('--baseline-assets', type=Path, help='Existing complete project warzone asset folder; supports rebuilding without an older APK')
    p.add_argument('--out', type=Path, required=True)
    a = p.parse_args()
    inputs = {a.raw_js.resolve(), a.raw_wasm.resolve()}
    if a.baseline_apk:
        inputs.add(a.baseline_apk.resolve())
    else:
        inputs.update((a.baseline_assets/n).resolve() for n in ('warzone2100.js','warzone2100.data'))
    require(not any((a.out/name).resolve() in inputs for name in ('warzone2100.js','warzone2100.wasm','warzone2100.data')), 'Output must not overwrite input')
    raw_bytes = a.raw_js.read_bytes()
    raw = raw_bytes.decode('utf-8')
    wasm = a.raw_wasm.read_bytes()
    require(wasm.startswith(b'\0asm'), 'Native candidate is not a WASM module')
    if a.baseline_apk:
        with ZipFile(a.baseline_apk) as frozen:
            baseline = frozen.read('assets/warzone/warzone2100.js').decode('utf-8')
            data = frozen.read('assets/warzone/warzone2100.data')
        baseline_identity = {'baselineAPK':{'path':str(a.baseline_apk),'sha256':digest(a.baseline_apk.read_bytes())}}
    else:
        baseline_bytes=(a.baseline_assets/'warzone2100.js').read_bytes()
        baseline=baseline_bytes.decode('utf-8')
        data=(a.baseline_assets/'warzone2100.data').read_bytes()
        baseline_identity={'baselineAssets':{'path':str(a.baseline_assets),'jsSHA256':digest(baseline_bytes),'dataSHA256':digest(data)}}
    old_start, old_end, index, metadata = package_call(baseline)
    names = verify_index(metadata, data)
    new_start, new_end, raw_index, raw_metadata = package_call(raw)
    runtime_contract = verify_runtime_contract(baseline, raw)
    directory_pattern = r'Module\["FS_createPath"\]\("[^"\\]*","[^"\\]*",true,true\);'
    baseline_directories = set(re.findall(directory_pattern, baseline))
    raw_directories = set(re.findall(directory_pattern, raw))
    require(baseline_directories, 'Expected frozen generated directory declarations')
    missing_directories = sorted(baseline_directories - raw_directories)
    require(not missing_directories, 'Raw generated loader is missing frozen data directories; review packaging declaration integration: '+str(missing_directories[:8]))
    hook_pattern = r'var out=console\.log\.bind\(console\);var blockNightOutputChannel=.*?;var wasmBinary;'
    hooks = re.findall(hook_pattern, baseline, re.S)
    require(len(hooks) == 1, 'Expected exactly one frozen private worker-output hook')
    hook = hooks[0]
    require('BNTECH' in hook and 'BNQUEUE' in hook and 'BroadcastChannel' in hook, 'Incomplete frozen output hook')
    original = 'var out=console.log.bind(console);var err=console.error.bind(console);var wasmBinary;'
    require(raw.count(original) == 1, 'Unexpected generated stdout/stderr declarations; inspect source integration before proceeding')
    require('blockNightOutputChannel' not in raw, 'Raw generated runtime is already modified')
    result = raw[:new_start] + index + raw[new_end:]
    result = result.replace(original, hook, 1)
    result_bytes = result.encode('utf-8')
    result_start, result_end, actual_index, result_metadata = package_call(result)
    verify_index(result_metadata, data)
    require(actual_index == index, 'Frozen package index was not preserved exactly')
    normalized_raw = raw[:new_start] + 'FROZEN_PACKAGE_INDEX' + raw[new_end:]
    normalized_result = result[:result_start] + 'FROZEN_PACKAGE_INDEX' + result[result_end:]
    normalized_result = normalized_result.replace(hook, original, 1)
    require(normalized_result == normalized_raw, 'Generated runtime changed outside the exact package-index/worker-output integrations')
    a.out.mkdir(parents=True, exist_ok=True)
    (a.out/'warzone2100.js').write_bytes(result_bytes)
    (a.out/'warzone2100.wasm').write_bytes(wasm)
    (a.out/'warzone2100.data').write_bytes(data)
    report = {
        'passed': True,
        'method': 'Source-built matched runtime with frozen authored data and exact existing worker-output hook. No binary WASM edits.',
        **baseline_identity,
        'raw': {'jsPath':str(a.raw_js),'jsSHA256':digest(raw_bytes),'wasmPath':str(a.raw_wasm),'wasmSHA256':digest(wasm)},
        'integrated': [{'file':n,'sha256':digest((a.out/n).read_bytes()),'bytes':(a.out/n).stat().st_size} for n in ('warzone2100.js','warzone2100.wasm','warzone2100.data')],
        'frozenVirtualFiles':len(names),
        'frozenDataSHA256':digest(data),
        'frozenPackageIndexSHA256':digest(index.encode()),
        'frozenWorkerOutputHookSHA256':digest(hook.encode()),
        'generatedCodeUnchangedOutsideIndexAndExistingWorkerHook':True,
        'rawRuntimePrefix':raw[:120],
        'integratedRuntimePrefix':result[:120],
        'rawGeneratedIndexFileCount':len(raw_metadata['files']),
        'frozenGeneratedDirectoryCount':len(baseline_directories),
        'rawGeneratedDirectoryCount':len(raw_directories),
        'frozenGeneratedDirectoriesAvailable':True,
        'runtimeContract':runtime_contract,
    }
    (a.out/'native-runtime-integration.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
