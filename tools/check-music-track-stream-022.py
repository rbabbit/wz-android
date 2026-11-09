"""Verify the production track response on the host JDK, not Android/WebView.

The tiny Java stand-ins expose response data/headers and track metadata only.
The production MusicTrackResponse byte reader itself is compiled unchanged.
Every delivered track is compared with its existing original SHA256, and the
old v0.21 reader reproduces the audited double-range bounds failure.
"""
from pathlib import Path
from hashlib import file_digest, sha256
from zipfile import ZipFile
import argparse
import json
import os
import subprocess
import tempfile

ROOT=Path(__file__).resolve().parents[1]
JAVA=Path(__file__).with_suffix('.java')
RESPONSE=ROOT/'app/src/main/java/com/rbabbit/blocknight/warzone/MusicTrackResponse.java'
PACK=ROOT.parent/'Warzone-Towers-Music-v1/music.data'
BASELINE=ROOT.parent/'warzone-towers-0.21-source.zip'

STUB_RESPONSE='''package android.webkit;
import java.io.InputStream; import java.util.Map;
public final class WebResourceResponse {
 private final String mime, reason; private final int status; private final Map<String,String> headers; private final InputStream data;
 public WebResourceResponse(String mime,String encoding,int status,String reason,Map<String,String> headers,InputStream data) {
  this.mime=mime;this.status=status;this.reason=reason;this.headers=headers;this.data=data;
 }
 public int getStatusCode(){return status;} public String getMimeType(){return mime;}
 public Map<String,String> getResponseHeaders(){return headers;} public InputStream getData(){return data;}
}'''
STUB_SLICE='''package com.rbabbit.blocknight.warzone;
final class MapMusicIndex { static final class Slice {
 final String id; final long start,length;
 Slice(String id,long start,long end){this.id=id;this.start=start;this.length=end-start;}
}}'''


def digest(path):
    with path.open('rb') as stream:return file_digest(stream,'sha256').hexdigest()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pack',type=Path,default=PACK)
    parser.add_argument('--baseline-source',type=Path,default=BASELINE)
    parser.add_argument('--report',type=Path)
    args=parser.parse_args()
    script=(ROOT/'app/src/main/assets/warzone/music-catalog.js').read_text(encoding='utf-8')
    catalog=json.loads(script[script.index('{'):script.rindex('}')+1])
    assert args.pack.stat().st_size==catalog['bytes'] and digest(args.pack)==catalog['sha256'],'Canonical optional pack differs'
    ids=set(catalog['trackIds'])
    files=[row for row in catalog['files'] if row['filename'].removeprefix('/data/music/albums/') in ids]
    assert len(files)==len(ids)==39,'Expected39 canonical tracks'
    with ZipFile(args.baseline_source) as old:
        legacy=old.read('app/src/main/java/com/rbabbit/blocknight/warzone/MusicTrackResponse.java').decode('utf-8')
    java_home=Path(os.environ.get('JAVA_HOME','C:/Program Files/Android/Android Studio/jbr'))
    javac=java_home/'bin/javac.exe';java=java_home/'bin/java.exe'
    # The standard temporary-directory cleanup is confined to this fresh named
    # directory. Resolve/verify its parent before writing or deleting its files.
    with tempfile.TemporaryDirectory(prefix='towers-music-stream-022-') as temp:
        work=Path(temp).resolve()
        assert work.parent==Path(tempfile.gettempdir()).resolve() and work.name.startswith('towers-music-stream-022-')
        package=work/'com/rbabbit/blocknight/warzone';package.mkdir(parents=True)
        android=work/'android/webkit';android.mkdir(parents=True)
        (android/'WebResourceResponse.java').write_text(STUB_RESPONSE,encoding='utf-8')
        (package/'MapMusicIndex.java').write_text(STUB_SLICE,encoding='utf-8')
        (package/'MusicTrackResponse.java').write_bytes(RESPONSE.read_bytes())
        (package/'LegacyMusicTrackResponse022.java').write_text(legacy.replace('MusicTrackResponse','LegacyMusicTrackResponse022'),encoding='utf-8')
        (package/'MusicTrackStreamCheck022.java').write_bytes(JAVA.read_bytes())
        manifest=work/'tracks.tsv'
        manifest.write_text('\n'.join('\t'.join([row['filename'].removeprefix('/data/music/albums/'),str(row['start']),str(row['end']),row['sha256']]) for row in files)+'\n',encoding='utf-8')
        sources=[str(p) for p in sorted(work.rglob('*.java'))]
        subprocess.run([str(javac),'-encoding','UTF-8','-d',str(work),*sources],check=True,capture_output=True,text=True)
        result=subprocess.run([str(java),'-cp',str(work),'com.rbabbit.blocknight.warzone.MusicTrackStreamCheck022',str(args.pack.resolve()),str(manifest),str(work)],check=True,capture_output=True,text=True)
        summary=json.loads(result.stdout)
    summary.update(scope='Host JDK source-unit checks with response/metadata stand-ins only; no Android VM, WebView, media decoding, emulator or gameplay run.',
        legacyReproductionMechanism='Executes the actual v0.21 Java response and models Chromium rejecting the original range against its already-shortened available length; Chromium itself is not executed.',
        emulatorUsed=False,androidPlaybackVerified=False,canonicalPackSHA256=catalog['sha256'],
        sources=[dict(path=p.relative_to(ROOT).as_posix(),sha256=digest(p)) for p in (RESPONSE,Path(__file__),JAVA)],
        legacyReaderSHA256=sha256(legacy.encode('utf-8')).hexdigest())
    if args.report:
        args.report.parent.mkdir(parents=True,exist_ok=True)
        args.report.write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(summary,indent=2))


if __name__=='__main__':main()
