"""Fetch the pinned minimal replay-renderer subtree; never clone the whole hub."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.request import Request, urlopen
from urllib.parse import quote
from hashlib import sha1, sha256
import json, time, os

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'app/src/main/assets/hub/replay'
HERE=Path(__file__).resolve().parent
PIN='dcaf96520aa47f7a71160cae33da32e5ece1d5f0'
RAW=f'https://raw.githubusercontent.com/MaWay2000/boha/{PIN}/'
EXACT={'LICENSE','replay-analyzer.html','replay-analyzer.js','stats/replay-telemetry.js','mapmaker/structure.json','mapmaker/LICENSE','assets/vendor/three-r149/LICENSE','assets/vendor/warzone-effects/COPYING','assets/vendor/warzone-effects/COPYING.README','assets/vendor/warzone-effects/README.md','assets/vendor/warzone-effects/page-21-fx.png'}
JS={'three.module.js','droidGroup.js','structureGroup.js','structure_turrets.js','pie.js','unitModels.js','unitTextures.js','sensors.js'}
def request(url):
    for attempt in range(4):
        try:
            with urlopen(Request(url,headers={'User-Agent':'Warzone-Towers-replay-source-audit'}),timeout=45)as r:return r.read()
        except Exception:
            if attempt==3:raise
            time.sleep(attempt+1)
def needed(p):
    return p in EXACT or p.startswith(('mapmaker/pies/','mapmaker/classic/texpages/')) or p.startswith('mapmaker/js/') and p.rsplit('/',1)[-1]in JS
def fetch(row):
    name=row['path'];target=(HERE/'upstream'/name)if name in {'replay-analyzer.html','replay-analyzer.js'}else OUT/name
    target.parent.mkdir(parents=True,exist_ok=True)
    data=target.read_bytes()if target.is_file()else request(RAW+quote(name,safe='/'))
    actual=sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
    assert actual==row['sha'],(name,actual,row['sha'])
    if not target.is_file():
        temp=target.with_name(target.name+'.fetching');temp.write_bytes(data);os.replace(temp,target)
    return {'path':name,'gitBlobSHA1':actual,'sha256':sha256(data).hexdigest(),'bytes':len(data),'source':RAW+name,'local':str(target.relative_to(ROOT)).replace('\\','/')}
def main():
    tree=json.loads(request(f'https://api.github.com/repos/MaWay2000/boha/git/trees/{PIN}?recursive=1'))
    assert tree['sha']==PIN and not tree['truncated']
    rows=[r for r in tree['tree']if r['type']=='blob'and needed(r['path'])]
    assert 1300<len(rows)<1400,len(rows)
    results=[]
    with ThreadPoolExecutor(max_workers=20)as pool:
        for future in as_completed([pool.submit(fetch,r)for r in rows]):
            results.append(future.result())
            if len(results)%150==0:print(f'Pinned replay assets verified: {len(results)}/{len(rows)}',flush=True)
    results.sort(key=lambda x:x['path'])
    manifest={'repository':'https://github.com/MaWay2000/boha','commit':PIN,'files':results,'totalBytes':sum(x['bytes']for x in results),'fullRepositoryCloned':False}
    (HERE/'upstream-assets.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'passed':True,'files':len(results),'bytes':manifest['totalBytes']}),flush=True)
if __name__=='__main__':main()
