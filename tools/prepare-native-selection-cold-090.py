"""Extend the retained0.89 cold bootstrap with complete0.90 sources/header."""
from pathlib import Path
from hashlib import file_digest
import argparse,json,shutil,subprocess,sys
ROOT=Path(__file__).resolve().parents[1];NATIVE=ROOT/'vendor/native-090'
def digest(path):
    with path.open('rb') as stream:return file_digest(stream,'sha256').hexdigest()
def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--workspace',type=Path,required=True)
    p.add_argument('--source-archive',type=Path,default=ROOT/'archive/native-blueprint-4.7.0-source.tar.gz')
    p.add_argument('--variant',choices=['shared','towers','multiplayer'],required=True)
    a=p.parse_args()
    subprocess.run([sys.executable,str(ROOT/'tools/prepare-native-selection-cold-089.py'),'--workspace',str(a.workspace),
                    '--source-archive',str(a.source_archive),'--variant',a.variant],check=True)
    family='multiplayer' if a.variant=='multiplayer' else 'offline';rows=[]
    for source in sorted((NATIVE/'source'/family).rglob('*')):
        if source.is_file():
            relative=source.relative_to(NATIVE/'source'/family);target=a.workspace/'source'/relative
            assert target.resolve().is_relative_to((a.workspace/'source').resolve())
            target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
            rows.append(dict(path=relative.as_posix(),sha256=digest(target)))
    header=NATIVE/'source/common/mobile-combat-latch-v90.h';target=a.workspace/'source/src'/header.name
    shutil.copy2(header,target);rows.append(dict(path='src/'+header.name,sha256=digest(target)))
    record=dict(version='0.90',variant=a.variant,complete090SourceOverlay=rows,commonHeaderInstalledForQuotedIncludes=True,
                baselinePreparationRecord='prepared-native-089.json',compiled=False)
    (a.workspace/'prepared-native-090.json').write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps(record,indent=2))
if __name__=='__main__':main()
