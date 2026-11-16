"""Preview dist/ locally using the production content security policy.

Release metadata comes from release.json. APK requests redirect to the live
public download; this server never fetches or copies the APK.
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import argparse, json
from build import validate_release

ROOT=Path(__file__).resolve().parents[1]
CSP="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
FEED_PATH='/downloads/warzone/latest.json'
APK_PATH='/downloads/warzone/warzone2100-andriod.apk'

class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT/'dist'),**kwargs)
 def end_headers(self):
  self.send_header('Content-Security-Policy',CSP)
  self.send_header('X-Content-Type-Options','nosniff')
  super().end_headers()
 def release_route(self,head_only=False):
  path=self.path.split('?')[0]
  if path not in {FEED_PATH,APK_PATH}:return False
  release=validate_release(json.loads((ROOT/'release.json').read_text(encoding='utf-8')))
  if path==APK_PATH:
   self.send_response(302)
   self.send_header('Location',release['apkUrl'])
   self.send_header('Content-Length','0')
   self.end_headers()
  else:
   data=(json.dumps(release,indent=2)+'\n').encode('utf-8')
   self.send_response(200)
   self.send_header('Content-Type','application/json; charset=utf-8')
   self.send_header('Content-Length',str(len(data)))
   self.send_header('Cache-Control','no-store')
   self.end_headers()
   if not head_only:self.wfile.write(data)
  return True
 def do_GET(self):
  if not self.release_route():super().do_GET()
 def do_HEAD(self):
  if not self.release_route(head_only=True):super().do_HEAD()

if __name__=='__main__':
 parser=argparse.ArgumentParser(description='Preview the static website locally.')
 parser.add_argument('--port',type=int,default=8796)
 args=parser.parse_args()
 validate_release(json.loads((ROOT/'release.json').read_text(encoding='utf-8')))
 server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
 print('Local preview http://127.0.0.1:'+str(server.server_port),flush=True)
 try:server.serve_forever()
 except KeyboardInterrupt:pass
 finally:server.server_close()
