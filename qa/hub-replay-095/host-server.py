"""Local static/proxy harness for the exact packaged viewer; real public data only."""
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from urllib.request import urlopen,Request
from urllib.parse import urlsplit,parse_qs
import json,sys,hashlib,threading
ROOT=Path(__file__).resolve().parents[2]/'app/src/main/assets'
HERE=Path(__file__).resolve().parent
CACHE=HERE/'host-http-cache';CACHE.mkdir(exist_ok=True)
LOCK=threading.Lock()
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=ROOT,**kwargs)
    def log_message(self,*args):pass
    def do_GET(self):
        if urlsplit(self.path).path!='/hub-replay-data':return super().do_GET()
        url=parse_qs(urlsplit(self.path).query).get('url',[''])[0]
        parsed=urlsplit(url)
        allowed=parsed.scheme=='https'and ((parsed.netloc=='maway2000.github.io'and parsed.path in ['/boha/stats/published/matches.json','/boha/stats/published/wavehoster.json'])or(parsed.netloc=='desktop-0467j9q.tail41fd3a.ts.net'and parsed.path.startswith('/wzstats/api/v1/')))
        if not allowed:self.send_error(403);return
        key=hashlib.sha256(url.encode()).hexdigest();file=CACHE/key
        try:
            with LOCK:
                if file.exists():data=file.read_bytes()
                else:
                    with urlopen(Request(url,headers={'Accept-Encoding':'identity','User-Agent':'Warzone-Towers-viewer-host-smoke'}),timeout=40)as r:
                        data=r.read(64*1024*1024+1)
                    if len(data)>64*1024*1024:raise ValueError('oversize')
                    file.write_bytes(data)
            self.send_response(200);self.send_header('Content-Type','application/json'if parsed.path.endswith('.json')or'/matches/'in parsed.path else'application/octet-stream');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
        except Exception as e:
            self.send_error(502,str(e))
if __name__=='__main__':
    print('viewer-host-ready',flush=True)
    ThreadingHTTPServer(('127.0.0.1',47949),Handler).serve_forever()
