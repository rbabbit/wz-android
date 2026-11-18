"""Read-only0.93 loader/WASM/index proof, allowing approved navigation HTML."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
template=ROOT/'tools/check-native-loader-pairs-091.py';source=template.read_text()
def replacement(old,new):
 global source
 assert source.count(old)==1,(old[:100],source.count(old));source=source.replace(old,new,1)
replacement("OUT=ROOT/'vendor/native-091'","OUT=ROOT/'vendor/native-093'")
replacement("Path('C:/timerApp/candidates/normal-test-0.90-20261116')","Path('C:/timerApp/github-staging/wz-android-0.92')")
replacement("            html=(assets/entry).read_text();assert (assets/entry).read_bytes()==(base/entry).read_bytes()",
 "            html=(assets/entry).read_text();old_html=(base/entry).read_text()\n"
 "            scripts=lambda value:re.findall(r'<script[^>]+src=[\\\"\\\']([^\\\"\\\']+)',value)\n"
 "            assert scripts(html)==scripts(old_html),'Existing script routes changed'")
replacement("entrypointUnchanged=True)","entrypointUnchanged=html==old_html,externalScriptRoutesUnchanged=True)")
(ROOT/'vendor/native-093/checks').mkdir(parents=True,exist_ok=True)
exec(compile(source,str(template),"exec"),globals())
