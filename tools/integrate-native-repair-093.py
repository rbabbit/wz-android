"""Install source-built0.93 native pairs with the retained0.92 asset adapters.

The retained integrator verifies whole generated programs, preload indexes,
worker output hooks, pthread loader names and exact raw ASM_CONSTS. The only
new allowance here is the approved navigation HTML: its full bytes may change,
but every existing external script route must remain identical.
"""
from pathlib import Path
import hashlib
ROOT=Path(__file__).resolve().parents[1]
template=ROOT/'tools/integrate-native-players-091.py'
source=template.read_text()
def replacement(old,new):
 global source
 assert source.count(old)==1,(old[:100],source.count(old));source=source.replace(old,new,1)
replacement("OUT=ROOT/'vendor/native-091'","OUT=ROOT/'vendor/native-093'")
replacement("Path('/mnt/c/timerApp/candidates/normal-test-0.90-20261116')","Path('/mnt/c/timerApp/github-staging/wz-android-0.92')")
replacement("Path('/mnt/c/timerApp/wz-towers-lab')","ROOT")
replacement("  assert (assets/wrapper).read_bytes()==(base/wrapper).read_bytes(),'Alias entrypoint changed'",
 "  old_html=(base/wrapper).read_text();new_html=(assets/wrapper).read_text()\n"
 "  scripts=lambda html:re.findall(r'<script[^>]+src=[\\\"\\\']([^\\\"\\\']+)',html)\n"
 "  assert scripts(old_html)==scripts(new_html),'Existing alias script routes changed'")
replacement("'entrypoint':{'path':wrapper,'sha256':filehash(assets/wrapper),'unchanged':True}",
 "'entrypoint':{'path':wrapper,'sha256':filehash(assets/wrapper),'unchanged':(assets/wrapper).read_bytes()==(base/wrapper).read_bytes(),'externalScriptRoutesUnchanged':True}")
exec(compile(source,str(template),"exec"),globals())
