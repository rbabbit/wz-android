"""Explicit GitHub 0.93–0.95 test-backup publisher. Import/--help perform no API actions.

Only check-local is offline. create/upload/publish/verify are explicit actions.
Credentials stay in process memory and are sent only to the two fixed GitHub hosts.
No Git mutations, device actions, VPS changes or stable/latest promotion.
"""
from pathlib import Path
from urllib.parse import quote, urlsplit
import argparse
import hashlib
import http.client
import json
import os
import re
import subprocess
import time
import uuid

OUT = Path(__file__).resolve().parent / 'release'
CREDENTIAL_CWD = Path('C:/timerApp/candidates/hub-replay-test-0.95-20261118')
REPOSITORY = 'rbabbit/wz-android'
REPO = '/repos/' + REPOSITORY
TAG = 'v0.95-test'
TITLE = 'Warzone Towers 0.95 — Repair, Survival and Replays TEST backup'
USER_AGENT = 'Warzone-v095-test-backup'
MANIFEST_SHA256 = 'ba4f2f789c4bdd444f1364f4a72aa1a2ba7c8f0a7c2a2175881e8ded189010b3'
APK_SHA256 = '4e9492ce31cab58baeae6927e43a5363b15304076fac1e342abe3faf3fffb253'
SOURCE_SHA256 = 'bc0be80125d5d3a1da9c54abef96098fe12acb65f4f8f2e971671e647d104abf'
TOKEN = None
MAX_RESPONSE_BYTES = 16*1024*1024


def require(value, message):
    if not value:
        raise RuntimeError(message)


def emit(**fields):
    print(json.dumps(fields, ensure_ascii=True), flush=True)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def commit_sha(value):
    require(isinstance(value, str) and re.fullmatch(r'[0-9a-f]{40}', value),
            'An explicit lowercase40-hex --commit is required for this action')
    return value


def token():
    global TOKEN
    if TOKEN is None:
        environment = os.environ.copy()
        environment['GIT_TERMINAL_PROMPT'] = '0'
        environment['GCM_INTERACTIVE'] = 'Never'
        result = subprocess.run(
            ['git', 'credential', 'fill'], cwd=CREDENTIAL_CWD,
            input='protocol=https\nhost=github.com\npath=rbabbit/wz-android.git\n\n',
            capture_output=True, text=True, timeout=30, env=environment)
        require(result.returncode == 0, 'Configured Git credential helper did not return a credential')
        fields = dict(line.split('=',1) for line in result.stdout.splitlines() if '=' in line)
        TOKEN = fields.get('password')
        require(isinstance(TOKEN,str) and TOKEN and '\r' not in TOKEN and '\n' not in TOKEN,
                'Configured Git credential helper returned no usable GitHub credential')
        # Never print result/stdout/stderr/fields or put this value in arguments/env/files.
    return TOKEN


def read_json_response(response):
    raw = response.read(MAX_RESPONSE_BYTES+1)
    require(len(raw) <= MAX_RESPONSE_BYTES, 'GitHub metadata response exceeded the bounded size')
    return json.loads(raw) if raw else None


def api(method, path, payload=None, missing=False):
    require(path == REPO or path.startswith(REPO+'/'), 'Refusing an API path outside the exact repository')
    require(method in ('GET','POST','PATCH'), 'Unsupported API action')
    conn = http.client.HTTPSConnection('api.github.com', timeout=180)
    body = json.dumps(payload, ensure_ascii=False).encode('utf-8') if payload is not None else None
    try:
        conn.request(method,path,body=body,headers={
            'Authorization':'Bearer '+token(), 'Accept':'application/vnd.github+json',
            'X-GitHub-Api-Version':'2022-11-28','User-Agent':USER_AGENT,
            'Content-Type':'application/json'})
        response = conn.getresponse()
        if response.status == 404 and missing:
            response.read(MAX_RESPONSE_BYTES+1)
            return None
        require(200 <= response.status < 300,
                'GitHub API '+method+' failed with HTTP '+str(response.status)+'; no response body was logged')
        return read_json_response(response)
    finally:
        conn.close()


def private_repo():
    value = api('GET',REPO)
    require(value.get('full_name') == REPOSITORY and value.get('private') is True,
            'Refusing publication outside the expected PRIVATE repository')
    require((value.get('permissions') or {}).get('push') is True,
            'GitHub credential does not have repository push permission')
    return value


def manifest():
    path=OUT/'assets.json'
    require(not path.is_symlink() and digest(path)==MANIFEST_SHA256,'Pinned prepared asset manifest changed')
    rows=json.loads(path.read_text(encoding='utf-8'))
    require(isinstance(rows,list) and len(rows)==10,'Prepared asset count differs')
    names=set()
    for row in rows:
        name=row.get('name');require(isinstance(name,str) and re.fullmatch(r'[A-Za-z0-9._-]+',name),'Invalid asset name')
        require(name not in names,'Duplicate asset name');names.add(name)
        p=Path(row['path']);require(not p.is_symlink() and p.resolve().parent==OUT.resolve() and p.name==name,'Asset outside exact release folder')
        require(isinstance(row.get('bytes'),int) and 0<row['bytes']<2*1024**3 and p.stat().st_size==row['bytes'],'Asset length differs: '+name)
        require(re.fullmatch(r'[a-f0-9]{64}',row.get('sha256','')) and digest(p)==row['sha256'],'Asset checksum differs: '+name)
    pins={'Warzone-Towers-0.93-Test.apk': ('4f48c3e3ba80c6562ce711a4adab17704cd40737bc0362e6732bd58ecf2862b1', 640785707), 'Warzone-Towers-0.94-Test.apk': ('f1449962be8ac490ac62a5f44a8903c349cffb908f59af646b3d00a664c31069', 723456353), 'Warzone-Towers-0.95-Test.apk': ('4e9492ce31cab58baeae6927e43a5363b15304076fac1e342abe3faf3fffb253', 730744002)}
    for name,(sha,size)in pins.items():
        found=next((r for r in rows if r['name']==name),None)
        require(found and found['sha256']==sha and found['bytes']==size,'Exact tested APK differs: '+name)
    parts=[r for r in rows if r['name'].startswith('warzone-towers-0.95-test-source.zip.')]
    require({r['name'] for r in parts}=={'warzone-towers-0.95-test-source.zip.001','warzone-towers-0.95-test-source.zip.002'} and sum(r['bytes'] for r in parts)==3642393030,'Complete source part inventory differs')
    proof=json.loads((OUT/'artifact-preparation-validation.json').read_text(encoding='utf-8'))
    require(proof.get('independentConcatenatedStreamVerified') is True and proof.get('sourceZIP',{}).get('sha256')==SOURCE_SHA256 and proof.get('sourceZIP',{}).get('bytes')==3642393030,'Whole source binding differs')
    return rows


def save_record(name, value):
    require(re.fullmatch(r'[A-Za-z0-9._-]+\.json',name), 'Invalid local record filename')
    path = OUT/name
    require(not path.is_symlink(), 'Refusing local record symlink')
    if path.exists():
        old = json.loads(path.read_text(encoding='utf-8'))
        for key in ('repository','tag','commit','releaseID'):
            if key in old and key in value:
                require(old[key] == value[key], 'Refusing to replace a record for another release identity')
        if old == value:
            return
    temporary = OUT/('.'+name+'.'+uuid.uuid4().hex+'.tmp')
    with temporary.open('x',encoding='utf-8',newline='\n') as stream:
        json.dump(value,stream,indent=2,ensure_ascii=True); stream.write('\n')
    os.replace(temporary,path)


def asset_metadata(asset):
    return {key:asset.get(key) for key in ('id','name','size','digest','state','browser_download_url')}


def release_metadata(release):
    return {key:release.get(key) for key in ('id','tag_name','name','draft','prerelease','target_commitish','html_url','upload_url','created_at','published_at')}


def validate_release(release, commit, draft=None):
    require(isinstance(release,dict) and type(release.get('id')) is int
            and release.get('tag_name') == TAG and release.get('target_commitish') == commit,
            'GitHub release tag/target does not match the exact requested commit')
    require(release.get('name') == TITLE and release.get('prerelease') is True,
            'Refusing a nonmatching title or non-test/stable release')
    if draft is not None:
        require(release.get('draft') is draft, 'Release draft/publication state does not match this action')
    return release


def record_identity(release, commit):
    return dict(repository=REPOSITORY,tag=TAG,commit=commit,releaseID=release['id'])


def known_release(commit):
    path = OUT/'release.json'
    if path.exists():
        saved = json.loads(path.read_text(encoding='utf-8'))
        require(saved.get('repository') == REPOSITORY and saved.get('tag') == TAG
                and saved.get('commit') == commit and type(saved.get('releaseID')) is int,
                'Local release identity differs; nothing was replaced')
        return validate_release(api('GET',REPO+'/releases/'+str(saved['releaseID'])),commit)
    found = api('GET',REPO+'/releases/tags/'+quote(TAG,safe=''),missing=True)
    if found is None:
        # Draft tags may not resolve through the tag route. Authenticated list includes drafts.
        items = api('GET',REPO+'/releases?per_page=100')
        matches = [value for value in items if value.get('tag_name') == TAG]
        require(len(matches) <= 1, 'Ambiguous existing release tag; refusing mutation')
        found = matches[0] if matches else None
    return validate_release(found,commit) if found is not None else None


def release_commit():
    saved = json.loads((OUT/'release.json').read_text(encoding='utf-8'))
    require(saved.get('repository') == REPOSITORY and saved.get('tag') == TAG, 'No matching created release record')
    return commit_sha(saved.get('commit'))


def assets_for(release):
    values = api('GET',REPO+'/releases/'+str(release['id'])+'/assets?per_page=100')
    require(isinstance(values,list) and len(values)<100, 'Unexpected release asset inventory')
    require(len(values)==len({value.get('name') for value in values}), 'Duplicate remote asset names')
    return values


def check_assets(values, rows, complete):
    expected = {row['name']:row for row in rows}
    require(set(value.get('name') for value in values) <= set(expected), 'Unexpected existing asset; refusing changes')
    if complete:
        require(len(values)==len(rows), 'All prepared exact assets are required before publication')
    for value in values:
        row = expected[value['name']]
        require(value.get('state')=='uploaded' and value.get('size')==row['bytes']
                and value.get('digest')=='sha256:'+row['sha256'],
                'Existing/uploaded asset differs; no overwrite attempted: '+row['name'])
    return {value['name']:value for value in values}


def latest_identity():
    release = api('GET',REPO+'/releases/latest',missing=True)
    if release is None:
        return None
    return {key:release.get(key) for key in ('id','tag_name','target_commitish','html_url')}


def create(commit):
    commit_sha(commit); private_repo(); rows=manifest()
    remote_commit=api('GET',REPO+'/git/commits/'+commit)
    require(remote_commit.get('sha')==commit, 'Exact target commit is not present in the expected GitHub repository')
    release=known_release(commit)
    latest=latest_identity()
    if release is None:
        notes=(OUT/'release-notes.md').read_text(encoding='utf-8')
        require(notes and len(notes)<64000, 'Prepared release notes missing or unexpectedly large')
        release=api('POST',REPO+'/releases',dict(tag_name=TAG,target_commitish=commit,name=TITLE,
                    body=notes,draft=True,prerelease=True,make_latest='false'))
    validate_release(release,commit,draft=True)
    check_assets(assets_for(release),rows,complete=False)
    value=dict(**record_identity(release,commit),release=release_metadata(release),latestStableBefore=latest,
               manifestSHA256=MANIFEST_SHA256,expectedAssets=len(rows),makeLatest=False)
    save_record('release.json',value)
    emit(createdOrResumedMatchingDraft=True,tag=TAG,commit=commit,releaseID=release['id'],prerelease=True,makeLatest=False)


def upload_one(row, release):
    parsed=urlsplit(release['upload_url'].split('{',1)[0])
    require(parsed.scheme=='https' and parsed.hostname=='uploads.github.com' and parsed.port in (None,443)
            and parsed.path==REPO+'/releases/'+str(release['id'])+'/assets'
            and not parsed.query and not parsed.fragment and not parsed.username and not parsed.password,
            'Refusing an untrusted upload endpoint')
    path=Path(row['path']);require(path.stat().st_size==row['bytes'] and digest(path)==row['sha256'],
                                  'Prepared upload file changed: '+row['name'])
    conn=http.client.HTTPSConnection('uploads.github.com',timeout=180)
    sent=0;last=time.monotonic();live_hash=hashlib.sha256()
    emit(uploading=row['name'],bytes=row['bytes'])
    try:
        conn.putrequest('POST',parsed.path+'?name='+quote(row['name'],safe=''))
        for key,value in {'Authorization':'Bearer '+token(),'Accept':'application/vnd.github+json',
                          'User-Agent':USER_AGENT,'X-GitHub-Api-Version':'2022-11-28',
                          'Content-Type':'application/octet-stream','Content-Length':str(row['bytes'])}.items():
            conn.putheader(key,value)
        conn.endheaders()
        with path.open('rb') as stream:
            while data:=stream.read(1024*1024):
                conn.send(data);sent+=len(data);live_hash.update(data)
                if time.monotonic()-last>=20:
                    emit(asset=row['name'],sentBytes=sent,totalBytes=row['bytes'],percent=round(sent/row['bytes']*100,1))
                    last=time.monotonic()
        response=conn.getresponse()
        require(response.status==201,'GitHub asset upload failed with HTTP '+str(response.status)+'; no response body was logged')
        asset=read_json_response(response)
    finally:
        conn.close()
    require(sent==row['bytes'] and live_hash.hexdigest()==row['sha256'],'Local bytes changed during upload')
    require(asset.get('name')==row['name'],'GitHub returned a different uploaded asset name')
    check_assets([asset],[row],complete=True)
    emit(uploaded=row['name'],bytes=asset['size'],sha256=row['sha256'])
    return asset


def upload():
    private_repo();rows=manifest();commit=release_commit();release=known_release(commit)
    validate_release(release,commit,draft=True)
    current=check_assets(assets_for(release),rows,complete=False)
    for row in rows:
        if row['name'] in current:
            emit(alreadyUploaded=row['name'],bytes=row['bytes'],sha256=row['sha256'])
            continue
        # Re-read inventory to refuse a concurrent unexpected upload or asset replacement.
        current=check_assets(assets_for(release),rows,complete=False)
        if row['name'] in current:
            emit(alreadyUploaded=row['name'],bytes=row['bytes'],sha256=row['sha256']);continue
        upload_one(row,release)
        current=check_assets(assets_for(release),rows,complete=False)
        save_record('upload-verification.json',dict(**record_identity(release,commit),manifestSHA256=MANIFEST_SHA256,
                     uploadedAssets=[asset_metadata(value) for value in current.values()],expectedAssets=len(rows),complete=len(current)==len(rows)))
    final=check_assets(assets_for(release),rows,complete=True)
    save_record('upload-verification.json',dict(**record_identity(release,commit),manifestSHA256=MANIFEST_SHA256,
                 uploadedAssets=[asset_metadata(value) for value in final.values()],expectedAssets=len(rows),complete=True))
    emit(allExactAssetsUploaded=True,assets=len(final),tag=TAG,commit=commit)


def publish(commit):
    commit_sha(commit);private_repo();rows=manifest();require(release_commit()==commit,'Created target commit differs')
    release=known_release(commit);validate_release(release,commit)
    exact=check_assets(assets_for(release),rows,complete=True)
    latest_before=latest_identity()
    if release['draft']:
        release=api('PATCH',REPO+'/releases/'+str(release['id']),dict(draft=False,prerelease=True,make_latest='false'))
    validate_release(release,commit,draft=False)
    latest_after=latest_identity()
    require(latest_before==latest_after,'Stable/latest release changed; test backup was not supposed to promote it')
    value=dict(**record_identity(release,commit),release=release_metadata(release),assets=[asset_metadata(v) for v in exact.values()],
               manifestSHA256=MANIFEST_SHA256,allExactAssetsVerified=True,makeLatest=False,
               latestStableBefore=latest_before,latestStableAfter=latest_after,stableLatestUnchanged=True)
    save_record('published.json',value)
    emit(publishedTestBackup=True,prerelease=True,makeLatest=False,stableLatestUnchanged=True,
         url=release['html_url'],tag=TAG,commit=commit,assets=len(exact))


def verify(commit=None):
    private_repo();rows=manifest();commit=commit_sha(commit) if commit else release_commit()
    release=known_release(commit);validate_release(release,commit)
    exact=check_assets(assets_for(release),rows,complete=True)
    latest=latest_identity();require(not latest or latest.get('id')!=release['id'],'Test prerelease unexpectedly became stable/latest')
    value=dict(**record_identity(release,commit),release=release_metadata(release),manifestSHA256=MANIFEST_SHA256,
               assets=[asset_metadata(v) for v in exact.values()],allExactAssetsVerified=True,
               expectedAssets=len(rows),privateRepository=True,prerelease=True,latestStable=latest,makeLatest=False)
    save_record('verification-'+('draft' if release['draft'] else 'published')+'.json',value)
    emit(verified=True,draft=release['draft'],prerelease=True,makeLatest=False,tag=TAG,commit=commit,
         assets=len(exact),url=release['html_url'])


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['check-local','create','upload','publish','verify'])
    parser.add_argument('--commit')
    args=parser.parse_args()
    if args.action in ('create','publish') and not args.commit:
        parser.error('--commit is required for create/publish')
    try:
        if args.action=='check-local':
            rows=manifest();emit(localFilesVerified=True,assets=len(rows),manifestSHA256=MANIFEST_SHA256,networkCalls=False)
        elif args.action=='create':create(args.commit)
        elif args.action=='upload':upload()
        elif args.action=='publish':publish(args.commit)
        else:verify(args.commit)
    except Exception as error:
        # Only controlled messages and exception class are logged; never print raw API/auth payloads.
        if isinstance(error,RuntimeError):emit(error=str(error),errorType=type(error).__name__)
        else:emit(error='Publisher action stopped; no raw response or credential was logged',errorType=type(error).__name__)
        raise SystemExit(1)
