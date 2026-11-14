"""Prove the read-only game-mode probe against the pinned original 4.7 WASM.

This does not modify WASM or execute the game. The shared-memory probe is tied to
the exact SHA-256 below; it must not be reused for another engine binary without
repeating this structural/source audit. No C++ code/export/protocol is changed.
"""
from pathlib import Path
import argparse
import hashlib
import json
import zipfile

EXPECTED_SHA256 = '5cfd676db13c96899a876fbd77197b7092b924ed265feed8594a2356f0b2492d'
GAME_STATUS_ADDRESS = 7015680
LOOP_TABLE_INDEX = 14393


def require(value, message):
    if not value:
        raise RuntimeError(message)


class Reader:
    def __init__(self, data):
        self.data = data
        self.pos = 0

    def byte(self):
        value = self.data[self.pos]
        self.pos += 1
        return value

    def uint(self):
        value, shift = 0, 0
        while True:
            byte = self.byte()
            value |= (byte & 127) << shift
            if byte < 128:
                return value
            shift += 7
            require(shift <= 35, 'Invalid unsigned LEB32')

    def take(self, length):
        value = self.data[self.pos:self.pos + length]
        require(len(value) == length, 'Truncated WASM field')
        self.pos += length
        return value

    def string(self):
        return self.take(self.uint()).decode('utf-8')

    def limits(self):
        flags = self.uint()
        self.uint()
        if flags & 1:
            self.uint()


def uleb(value):
    output = bytearray()
    while value > 127:
        output.append((value & 127) | 128)
        value >>= 7
    output.append(value)
    return bytes(output)


def sleb(value):
    output = bytearray()
    while True:
        byte = value & 127
        value >>= 7
        done = (value == 0 and not byte & 64) or (value == -1 and byte & 64)
        output.append(byte if done else byte | 128)
        if done:
            return bytes(output)


def sections(data):
    reader = Reader(data)
    require(reader.take(8) == b'\x00asm\x01\x00\x00\x00', 'Not a WASM 1 module')
    result = {}
    while reader.pos < len(data):
        identity = reader.byte()
        size = reader.uint()
        contents = reader.take(size)
        if identity:
            require(identity not in result, 'Duplicate WASM section')
            result[identity] = contents
    return result


def verify(wasm, source_zip=None):
    data = wasm.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    require(digest == EXPECTED_SHA256, 'Unrecognized WASM; refusing fixed-address probe')
    parts = sections(data)

    imports = Reader(parts[2])
    function_imports = 0
    loop_import = None
    for _ in range(imports.uint()):
        module, name, kind = imports.string(), imports.string(), imports.byte()
        if kind == 0:
            type_id = imports.uint()
            if name == 'emscripten_set_main_loop_arg':
                loop_import = {'index': function_imports, 'type': type_id, 'module': module}
            function_imports += 1
        elif kind == 1:
            imports.byte()
            imports.limits()
        elif kind == 2:
            imports.limits()
        elif kind == 3:
            imports.take(2)
        elif kind == 4:
            imports.byte()
            imports.uint()
        else:
            raise RuntimeError('Unsupported import type')
    require(function_imports == 534 and loop_import['index'] == 101, 'Import layout changed')

    code = Reader(parts[10])
    bodies = {}
    for identity in range(function_imports, function_imports + code.uint()):
        bodies[identity] = code.take(code.uint())
    # C++ wzMain invokes emscripten_set_main_loop_arg(wzEventLoopOneFrame, 0, -1, 1).
    # Validate its exact instruction sequence rather than guessing a table entry.
    schedule = (b'\x41' + sleb(LOOP_TABLE_INDEX) + b'\x41\x00\x41\x7f\x41\x01\x10'
                + uleb(loop_import['index']))
    callers = [identity for identity, body in bodies.items() if schedule in body]
    require(callers == [3822], 'Expected one native SDL main-loop scheduler')

    elements = Reader(parts[9])
    loop_function = None
    for _ in range(elements.uint()):
        require(elements.uint() == 0, 'Unexpected element format')
        require(elements.byte() == 0x41, 'Expected constant table offset')
        offset = elements.uint()
        require(elements.byte() == 0x0b, 'Expected table offset expression end')
        ids = [elements.uint() for _ in range(elements.uint())]
        if offset <= LOOP_TABLE_INDEX < offset + len(ids):
            loop_function = ids[LOOP_TABLE_INDEX - offset]
    require(loop_function == 14459, 'Main-loop function mapping changed')

    # Early wzEventLoopOneFrame inlines wz_emscripten_did_finish_render. Its
    # GetGameMode()==GS_NORMAL guard precedes the known render-budget arithmetic.
    native_mode_guard = (b'\x41' + uleb(GAME_STATUS_ADDRESS)
                         + b'\x28\x02\x00\x41\x01\x46')
    guard_offset = bodies[loop_function].find(native_mode_guard)
    require(0 < guard_offset < 160, 'Early native game-mode==1 guard changed')
    stores = {}
    for value in (0, 1):
        pattern = (b'\x41' + uleb(GAME_STATUS_ADDRESS) + b'\x41' + bytes([value])
                   + b'\x36\x02\x00')
        matches = [{'function': identity, 'bodyOffset': body.find(pattern)}
                   for identity, body in bodies.items() if pattern in body]
        require(matches, 'Expected corroborating native game-mode store')
        stores[str(value)] = matches

    source = {
        'tag': '4.7.0', 'commit': '7d3d8e51a61ceee89e6bf672a41337e1a9cd7392',
        'enumFile': 'src/main.h', 'enum': {'GS_TITLE_SCREEN': 0, 'GS_NORMAL': 1, 'GS_SAVEGAMELOAD': 2},
        'getterFile': 'src/main.cpp', 'getter': 'GS_GAMEMODE GetGameMode() { return gameStatus; }',
        'mainLoopFile': 'lib/sdl/main_sdl.cpp',
        'earlyGuardFile': 'src/loop.cpp',
        'earlyGuard': 'wz_emscripten_did_finish_render: if (GetGameMode() != GS_NORMAL) return;',
    }
    if source_zip:
        with zipfile.ZipFile(source_zip) as archive:
            def read(suffix):
                name = next(name for name in archive.namelist() if name.endswith('/' + suffix))
                return archive.read(name).decode('utf-8').replace('\r', '')
            header, main, loop, sdl = map(read, ['src/main.h', 'src/main.cpp', 'src/loop.cpp', 'lib/sdl/main_sdl.cpp'])
            require(header.index('GS_TITLE_SCREEN') < header.index('GS_NORMAL') < header.index('GS_SAVEGAMELOAD'), 'Source mode enum changed')
            require('GS_GAMEMODE GetGameMode()\n{\n\treturn gameStatus;\n}' in main, 'Pure source getter changed')
            require('if (GetGameMode() != GS_NORMAL)' in loop, 'Source render guard changed')
            require('wz_emscripten_did_finish_render(lastLoopReturn - wzGetTicks())' in sdl, 'Source main-loop callback changed')
        source['archiveSha256'] = hashlib.sha256(source_zip.read_bytes()).hexdigest()

    return {
        'wasmSha256': digest, 'bytes': len(data), 'nativeCodeModified': False,
        'probe': {'byteAddress': GAME_STATUS_ADDRESS, 'type': 'little-endian u32',
                  'operation': 'read only', 'values': source['enum']},
        'proof': {'functionImports': function_imports, 'mainLoopImport': loop_import,
                  'schedulerFunction': callers[0], 'callbackTableIndex': LOOP_TABLE_INDEX,
                  'callbackFunction': loop_function, 'gameModeGuardBodyOffset': guard_offset,
                  'corroboratingConstantStores': stores},
        'source': source,
        'navigation': 'GS_TITLE_SCREEN includes lobby room and frontend. Disambiguate with established TCP lifetime; NETclose is called before native return-to-title on Leave.',
        'limits': 'Only this exact engine hash is supported. No player/order state is read. Runtime observations must still confirm the 0/1 transition on the delivery APK.'
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--wasm', type=Path, required=True)
    parser.add_argument('--source-zip', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = verify(args.wasm, args.source_zip)
    text = json.dumps(result, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding='utf-8')
    print(text, end='')


if __name__ == '__main__':
    main()
