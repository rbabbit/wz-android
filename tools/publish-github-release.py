"""Upload frozen release files through Git's existing credential helper.

Credentials stay in memory. Existing release assets are never replaced.
GitHub's SHA-256 digests and byte counts must match before publication.
"""
from pathlib import Path
from hashlib import sha256
import argparse,http.client,json,os,subprocess,time,urllib.parse

ROOT=Path(__file__).resolve().parents[1]

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--repo',required=True);p.add_argument('--tag',required=True)
    p.add_argument('--commit',required=True);p.add_argument('--name',required=True)
    p.add_argument('--notes',type=Path,required=True);p.add_argument('--report',type=Path,required=True)
    p.add_argument('--publish',action='store_true');p.add_argument('files',type=Path,nargs='+');args=p.parse_args()
    assert len(args.repo.split('/'))==2 and all(c.isalnum() or c in '-_./' for c in args.repo)
    credential=subprocess.run(['git','credential','fill'],cwd=ROOT,input='protocol=https\nhost=github.com\n\n',text=True,capture_output=True,env={**os.environ,'GIT_TERMINAL_PROMPT':'0'})
    if credential.returncode:raise RuntimeError('Git credential helper could not authenticate; no credential output was logged.')
    fields=dict(line.split('=',1) for line in credential.stdout.splitlines() if '=' in line)
    if not fields.get('password'):raise RuntimeError('Git credential helper returned no usable credential.')
    headers={'Authorization':'Bearer '+fields['password'],'Accept':'application/vnd.github+json','User-Agent':'Warzone-Towers-release-backup','X-GitHub-Api-Version':'2026-03-10'}
    def request(method,path,data=None):
        conn=http.client.HTTPSConnection('api.github.com',timeout=120)
        payload=None if data is None else json.dumps(data).encode()
        conn.request(method,path,body=payload,headers={**headers,**({'Content-Type':'application/json'} if payload else {})})
        response=conn.getresponse();raw=response.read();conn.close()
        if response.status==404:return None
        if not 200<=response.status<300:raise RuntimeError(f'GitHub {method} failed with HTTP {response.status}: '+raw[:600].decode(errors='replace'))
        return json.loads(raw) if raw else None
    base='/repos/'+args.repo
    expected=[]
    for file in args.files:
        digest=sha256()
        with file.open('rb') as stream:
            for block in iter(lambda:stream.read(8*1024*1024),b''):digest.update(block)
        expected.append({'file':file,'size':file.stat().st_size,'digest':'sha256:'+digest.hexdigest()})
    release=request('GET',base+'/releases/tags/'+urllib.parse.quote(args.tag,safe=''))
    if release is None:
        drafts=request('GET',base+'/releases?per_page=100')
        release=next((r for r in drafts if r['tag_name']==args.tag),None)
    if release is None:
        release=request('POST',base+'/releases',{'tag_name':args.tag,'target_commitish':args.commit,'name':args.name,'body':args.notes.read_text(encoding='utf-8'),'draft':True,'prerelease':False})
        print('Created draft release '+args.tag,flush=True)
    verified=[]
    for item in expected:
        assets=request('GET',base+f'/releases/{release["id"]}/assets?per_page=100')
        asset=next((a for a in assets if a['name']==item['file'].name),None)
        if asset is None:
            url=urllib.parse.urlsplit(release['upload_url'].split('{')[0]);assert url.scheme=='https' and url.hostname=='uploads.github.com'
            path=url.path+'?'+urllib.parse.urlencode({'name':item['file'].name})
            conn=http.client.HTTPSConnection(url.hostname,timeout=180)
            conn.putrequest('POST',path)
            for key,value in {**headers,'Content-Type':'application/octet-stream','Content-Length':str(item['size'])}.items():conn.putheader(key,value)
            conn.endheaders();sent=0;last=0
            print('Uploading '+item['file'].name,flush=True)
            with item['file'].open('rb') as stream:
                for block in iter(lambda:stream.read(8*1024*1024),b''):
                    conn.send(block);sent+=len(block)
                    if time.monotonic()-last>10:print(f'  {sent:,} / {item["size"]:,} bytes',flush=True);last=time.monotonic()
            response=conn.getresponse();raw=response.read();conn.close()
            if response.status!=201:raise RuntimeError(f'Upload failed with HTTP {response.status}: '+raw[:600].decode(errors='replace'))
            asset=json.loads(raw)
        deadline=time.monotonic()+90
        while asset.get('digest') is None and time.monotonic()<deadline:
            time.sleep(2);asset=request('GET',base+f'/releases/assets/{asset["id"]}')
        assert asset['state']=='uploaded' and asset['size']==item['size'] and asset.get('digest')==item['digest'],f'Remote checksum/size mismatch: {item["file"].name}'
        verified.append({key:asset[key] for key in ['id','name','size','digest','browser_download_url']})
        print('Verified remote SHA-256: '+asset['name'],flush=True)
    if args.publish and release['draft']:
        release=request('PATCH',base+f'/releases/{release["id"]}',{'draft':False,'make_latest':'true'})
    result={'schemaVersion':1,'repository':args.repo,'tag':args.tag,'sourceCommit':args.commit,'releaseUrl':release['html_url'],'draft':release['draft'],'assets':verified}
    args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print('Release verified: '+release['html_url'],flush=True)

if __name__=='__main__':main()
