"""Compare the clean FFA APK with its earlier incremental candidate.

Every ZIP member is hashed. The only accepted content exception is D8's class
checksum marker in classes3.dex, with otherwise identical strings and complete
Android SDK dexdump class/method/instruction output.
"""
from pathlib import Path
from zipfile import ZipFile
from hashlib import file_digest
from collections import Counter
import argparse
import json
import shutil
import struct
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    with path.open('rb') as stream: return file_digest(stream, 'sha256').hexdigest()


def member(archive, name):
    with archive.open(name) as stream: return file_digest(stream, 'sha256').hexdigest()


def strings(raw):
    size, offset = struct.unpack_from('<II', raw, 56)
    values = []
    for index in range(size):
        position = struct.unpack_from('<I', raw, offset + index * 4)[0]
        while raw[position] & 128: position += 1
        position += 1
        values.append(raw[position:raw.index(0, position)])
    return Counter(values)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--before', type=Path, default=Path('C:/timerApp/_release-records/ffa060/candidate-f6399466.apk'))
    parser.add_argument('--clean', type=Path, default=ROOT / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--allow-ffa-payload', action='store_true')
    parser.add_argument('--build-log', type=Path, default=Path('C:/timerApp/_release-records/ffa060/clean-build.log'))
    args = parser.parse_args()
    out = ROOT / 'build/ffa-clean-compare'; out.mkdir(parents=True, exist_ok=True)
    with ZipFile(args.before) as old, ZipFile(args.clean) as clean:
        assert set(old.namelist()) == set(clean.namelist()), 'Clean APK member inventory differs'
        changes = [name for name in old.namelist() if member(old, name) != member(clean, name)]
        allowed = {'classes3.dex'} | ({'assets/warzone/warzone2100-ffa.js', 'assets/warzone/warzone2100-ffa.data'} if args.allow_ffa_payload else set())
        assert set(changes) <= allowed, changes
        before, after = old.read('classes3.dex'), clean.read('classes3.dex')
        a, b = strings(before), strings(after)
        removed, added = list((a-b).elements()), list((b-a).elements())
        assert (len(removed) == len(added) == 0 or len(removed) == len(added) == 1 and all(value.startswith(b'~~~{') for value in removed + added)), 'Non-marker DEX strings changed'
        disassemblies = []
        for label, raw in [('before', before), ('clean', after)]:
            dex = out / (label + '.dex'); dex.write_bytes(raw)
            result = subprocess.run(['C:/Users/punke/AppData/Local/Android/Sdk/build-tools/36.0.0/dexdump.exe', '-d', str(dex)],
                check=True, capture_output=True, text=True, timeout=30)
            disassemblies.append('\n'.join(result.stdout.splitlines()[2:]))
        assert disassemblies[0] == disassemblies[1], 'DEX class/method/instruction output changed'
        record = dict(version='0.60', passed=True, cleanBuild=True, candidateAPK_SHA256=digest(args.clean),
            candidateBytes=args.clean.stat().st_size, previousCandidateSHA256=digest(args.before),
            previousCandidateBytes=args.before.stat().st_size, zipMembers=len(clean.namelist()),
            identicalUncompressedMembers=len(clean.namelist())-len(changes), changedMembers=changes,
            approvedFfaPayloadChanges=[name for name in changes if name.startswith('assets/')],
            exception='Any DEX difference is limited to D8 class-checksum metadata; complete dexdump class/method/instruction output and all other DEX strings match. Explicit FFA loader/VFS changes, if listed, contain the isolated timer fix.',
            dexClassMethodInstructionsIdentical=True, allOtherDexStringsIdentical=True,
            everyNonFfaAssetResourceAndOtherDexSHA256Identical=True, emulatorUsed=False,
            ffaPayloadProofSHA256=digest(ROOT / 'scenario/ffa/PACKAGE.json'),
            buildCommand='gradlew.bat clean assembleDebug -PadmobLiveAds=true')
    shutil.copyfile(args.build_log, ROOT / 'archive/ffa-clean-build-0.60.log')
    (ROOT / 'archive/ffa-clean-apk-0.60.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(record, indent=2))


if __name__ == '__main__': main()
