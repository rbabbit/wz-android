"""Run actual bundled store/track byte-reader code under bounded host stand-ins.

This does not execute Android's AssetManager, WebView, an audio decoder or the
emulator. Root's exact-APK offline playback observations are separate evidence.
"""
from pathlib import Path
import hashlib
import json
import os
import runpy
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
JAVA = ROOT / 'app/src/main/java/com/rbabbit/blocknight/warzone'
FIXTURE = Path(__file__).with_suffix('.java')
COMMON = runpy.run_path(str(ROOT / 'tools/check-music-track-stream-022.py'), run_name='stream_fixture_standins')
STUBS = {
    'android/webkit/WebResourceResponse.java': COMMON['STUB_RESPONSE'],
    'com/rbabbit/blocknight/warzone/MapMusicIndex.java': COMMON['STUB_SLICE'],
    'android/content/Context.java': '''package android.content;
import android.content.res.AssetManager; public class Context {
private final AssetManager assets; public Context(AssetManager assets){this.assets=assets;}
public AssetManager getAssets(){return assets;}}''',
    'android/content/res/AssetFileDescriptor.java': '''package android.content.res;
public final class AssetFileDescriptor implements AutoCloseable {
private final long length; public AssetFileDescriptor(long length){this.length=length;}
public long getDeclaredLength(){return length;} public void close(){}}''',
    'android/content/res/AssetManager.java': '''package android.content.res;
import java.io.*;import java.nio.file.*;public final class AssetManager {
public static final int ACCESS_RANDOM=1;private final Path file;
public int openFdCalls,openCalls,closedStreams;public long declaredLength=-1;public boolean zeroSkip;
public AssetManager(Path file){this.file=file;}
private void path(String path)throws IOException{if(!path.equals("warzone/music/music.data"))throw new IOException("Unexpected asset path");}
public AssetFileDescriptor openFd(String path)throws IOException{path(path);openFdCalls++;return new AssetFileDescriptor(declaredLength<0?Files.size(file):declaredLength);}
public InputStream open(String path,int access)throws IOException{path(path);if(access!=ACCESS_RANDOM)throw new IOException("Random asset access required");openCalls++;
return new FilterInputStream(new FileInputStream(file.toFile())){private boolean closed;
public long skip(long n)throws IOException{return zeroSkip?0:super.skip(n);}
public void close()throws IOException{if(!closed){closed=true;closedStreams++;}super.close();}};}}'''
}


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    pack = ROOT / 'app/src/main/assets/warzone/music/music.data'
    source = (ROOT / 'app/src/main/assets/warzone/music-catalog.js').read_text(encoding='utf-8')
    catalog = json.loads(source[source.index('{'):source.rindex('}') + 1])
    assert pack.stat().st_size == catalog['bytes'] and digest(pack) == catalog['sha256']
    tracks = [entry for entry in catalog['files'] if entry['filename'].removeprefix('/data/music/albums/') in catalog['trackIds']]
    assert len(tracks) == 39
    jdk = Path(os.environ.get('JAVA_HOME', 'C:/Program Files/Android/Android Studio/jbr'))
    with tempfile.TemporaryDirectory(prefix='towers-bundled-music-032-') as directory:
        work = Path(directory).resolve()
        assert work.parent == Path(tempfile.gettempdir()).resolve() and work.name.startswith('towers-bundled-music-032-')
        for name, contents in STUBS.items():
            path = work / name; path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(contents, encoding='utf-8')
        package = work / 'com/rbabbit/blocknight/warzone'
        for name in ('MusicPackStore.java', 'MusicTrackResponse.java'):
            (package / name).write_bytes((JAVA / name).read_bytes())
        (package / 'BundledMusicStreamCheck032.java').write_bytes(FIXTURE.read_bytes())
        manifest = work / 'tracks.tsv'
        manifest.write_text('\n'.join('\t'.join([entry['filename'].removeprefix('/data/music/albums/'), str(entry['start']), str(entry['end']), entry['sha256']]) for entry in tracks) + '\n', encoding='utf-8')
        sources = [str(path) for path in sorted(work.rglob('*.java'))]
        compile_result = subprocess.run([str(jdk / 'bin/javac.exe'), '-encoding', 'UTF-8', '-d', str(work), *sources], capture_output=True, text=True)
        if compile_result.returncode:
            raise RuntimeError(compile_result.stderr)
        result = subprocess.run([str(jdk / 'bin/java.exe'), '-cp', str(work), 'com.rbabbit.blocknight.warzone.BundledMusicStreamCheck032', str(pack), str(manifest), str(work)], capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(result.stderr)
        report = json.loads(result.stdout)
    report.update(version='0.32', passed=True, emulatorUsed=False, androidPlaybackVerified=False,
        scope='Actual production store/byte-reader executed on the host JDK with minimal metadata/AssetManager stand-ins; media decoding, Android and gameplay are not exercised.',
        archiveSHA256=catalog['sha256'], sources=[{'path': path.relative_to(ROOT).as_posix(), 'sha256': digest(path)} for path in (
            JAVA / 'MusicPackStore.java', JAVA / 'MusicTrackResponse.java', FIXTURE, Path(__file__))])
    (ROOT / 'archive/bundled-music-0.32-stream-checks.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
