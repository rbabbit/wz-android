"""Focused host tests for the exact CampaignVideoStore source. No emulator or remote transfer.

Android Context/Handler/HTTP-response/directory-fsync bindings are host stubs. The actual
181-file pinned ZIP, hashes, file commits and HTTP body/range code run unchanged. Native
playback and Android filesystem durability still require the delivery device check.
"""
from pathlib import Path
import argparse
import hashlib
import http.server
import json
import subprocess
import tempfile
import threading
import time
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
JAVAC = Path(r"C:/Program Files/Android/Android Studio/jbr/bin/javac.exe")
JAVA = JAVAC.with_name("java.exe")
STUBS = {
    "android/content/Context.java": '''package android.content; import java.io.File;
public class Context { private final File root; public Context(File root) { this.root=root; root.mkdirs(); }
public File getFilesDir(){return root;} }''',
    "android/os/Looper.java": '''package android.os; public class Looper {
public static Looper getMainLooper(){return new Looper();} }''',
    "android/os/Handler.java": '''package android.os; import java.util.concurrent.*;
public class Handler { private static final ExecutorService main=Executors.newSingleThreadExecutor(r -> {
Thread thread=new Thread(r,"host-main"); thread.setDaemon(true); return thread; });
public Handler(Looper looper){} public boolean post(Runnable action){main.execute(action);return true;} }''',
    "android/system/ErrnoException.java": '''package android.system;
public class ErrnoException extends Exception { public ErrnoException(){super();} }''',
    "android/system/OsConstants.java": '''package android.system;
public class OsConstants { public static final int O_RDONLY=0,O_DIRECTORY=1; }''',
    "android/system/Os.java": '''package android.system; import java.io.FileDescriptor;
public class Os { public static FileDescriptor open(String name,int flags,int mode)throws ErrnoException{return new FileDescriptor();}
public static void fsync(FileDescriptor fd)throws ErrnoException{} public static void close(FileDescriptor fd)throws ErrnoException{} }''',
    "android/webkit/WebResourceResponse.java": '''package android.webkit; import java.util.Map; import java.io.InputStream;
public class WebResourceResponse { private final int status; private final Map<String,String> headers; private final InputStream data;
public WebResourceResponse(String mime,String encoding,int status,String reason,Map<String,String> headers,InputStream data){
this.status=status;this.headers=headers;this.data=data;} public int getStatusCode(){return status;}
public Map<String,String> getResponseHeaders(){return headers;} public InputStream getData(){return data;} }''',
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, default=Path(r"C:/timerApp/Warzone-Hetzner-Upload-v1/warzone-mobile-v1.zip"))
    args = parser.parse_args()
    with args.archive.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    assert digest == "23f74895fa7f03cb86a79b857bad6977ce18d20b8a944d51449e68517e80bc47", digest
    # Temporary actual movie bytes are deliberately kept outside repository/source packages.
    with tempfile.TemporaryDirectory(prefix="campaign-video-051-") as temporary:
        fixture = Path(temporary)
        for name, content in STUBS.items():
            target = fixture / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
        source_dir = ROOT / "app/src/main/java/com/rbabbit/blocknight/warzone"
        sources = [*(fixture / name for name in STUBS), source_dir / "OptionalPackStore.java",
                   source_dir / "CampaignVideoStore.java", ROOT / "tools/check-campaign-videos-051.java",
                   ROOT / "tools/check-campaign-transfer-051.java"]
        classes = fixture / "classes"
        classes.mkdir()
        subprocess.run([str(JAVAC), "-encoding", "UTF-8", "-d", str(classes), *map(str, sources)], check=True)
        subprocess.run([str(JAVA), "-cp", str(classes), "com.rbabbit.blocknight.warzone.CampaignVideoCheck051",
                        str(fixture / "private-app"), str(args.archive)], check=True, timeout=240)
        payload = bytes(range(256)) * 1024
        payload_path = fixture / "loopback-pack.bin"
        payload_path.write_bytes(payload)
        requests = []

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_GET(self):
                requested = self.headers.get("Range")
                requests.append((self.path, requested))
                start = int(requested.split("=")[1].split("-")[0]) if requested else 0
                body = payload[start:]
                self.send_response(206 if requested else 200)
                if requested:
                    self.send_header("Content-Range", f"bytes {start}-{len(payload)-1}/{len(payload)}")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                try:
                    for offset in range(0, len(body), 4096):
                        self.wfile.write(body[offset:offset + 4096])
                        self.wfile.flush()
                        if self.path == "/slow":
                            time.sleep(0.005)
                except (ConnectionError, OSError):
                    pass

        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            subprocess.run([str(JAVA), "-cp", str(classes), "com.rbabbit.blocknight.warzone.CampaignTransferCheck051",
                            str(fixture / "transfer-app"), str(payload_path), f"http://127.0.0.1:{server.server_port}",
                            hashlib.sha256(payload).hexdigest()], check=True, timeout=60)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
        assert ("/pack", "bytes=16384-") in requests, requests
        assert any(path == "/slow" and range_header for path, range_header in requests), requests
    print("PASS: host-only campaign movie checks; Android playback/fsync not simulated")
    report = {
        "checkedUtc": datetime.now(timezone.utc).isoformat(),
        "scope": "Exact Java source host harness; actual pinned ZIP, loopback HTTP transfer; no emulator or remote media download",
        "archiveSha256": digest,
        "javaSha256": hashlib.sha256((source_dir / "CampaignVideoStore.java").read_bytes()).hexdigest(),
        "filesInstalled": 181,
        "sequenceBytes": 170920623,
        "checks": ["cancel during extraction, retry and stale callback suppression", "duplicate-tap serialization",
                   "original movies + COPYING + VERSION only; older engine excluded", "offline SHA readiness and same-size corruption rejection",
                   "completion-marker and interrupted-promotion recovery", "real Ogg GET HEAD single/suffix/open ranges and rejection cases",
                   "shared downloader SHA failure, HTTP range resume, active-transfer cancellation and resume"],
        "loopbackRequests": requests,
        "limitations": ["Android directory fsync binding is stubbed on Windows", "Native cinematic decoding/playback requires exact-APK emulator verification"],
        "passed": True,
    }
    (ROOT / "archive/campaign-videos-0.51-checks.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
