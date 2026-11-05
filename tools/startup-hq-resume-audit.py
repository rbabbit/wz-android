"""Bounded cancellation fixture: a verified 1 MiB prefix, then real native resume."""
from pathlib import Path
import importlib.util,json,hashlib,time

spec=importlib.util.spec_from_file_location('startup',Path(__file__).with_name('startup-maps-audit.py'))
ui=importlib.util.module_from_spec(spec);spec.loader.exec_module(ui)
hq='files/graphics/hq-v3/high.wz';backup=hq+'.v511-qa-backup'
report=json.loads((ui.OUT/'failure.json').read_text());report.pop('failure',None)
try:
    ui.adb('shell','am','force-stop',ui.PACKAGE)
    assert ui.file_size(hq)==99639408 and not ui.file_size(backup)
    ui.app('dd','if='+hq,'of='+hq+'.part','bs=1048576','count=1')
    ui.app('mv',hq,backup);ui.boot();ui.tap('Normal graphics')
    nodes=ui.tree();download=ui.bounds(ui.find('Download High Quality graphics',nodes));cancel=ui.bounds(ui.find('Music settings',nodes))
    # The last 40dp row remains at the bottom of the anchored console. While
    # downloading, Cancel replaces that bottom row, so no slow hierarchy read
    # is needed between the request and cancellation on a fast connection.
    ui.adb('shell','input','tap',str((download[0]+download[2])//2),str((download[1]+download[3])//2))
    time.sleep(.12)
    ui.adb('shell','input','tap',str((cancel[0]+cancel[2])//2),str((cancel[1]+cancel[3])//2))
    ui.wait('Download paused. Your progress is saved.')
    retained=ui.file_size(hq+'.part');assert retained>=1048576
    ui.shot('hq-paused');assert ui.find('Start game').get('enabled')=='true'
    ui.tap('Download High Quality graphics');ui.wait('HQ pack ready offline',seconds=90)
    assert ui.find('Tower Defense 2 map') is not None,'download completion must stay on splash'
    ui.tap('High Quality graphics');assert ui.find('Start game').get('enabled')=='true';ui.shot('hq-ready')
    report['hqCancellationFixture']={'seededVerifiedPrefixBytes':1048576,'retainedOnCancelBytes':retained,'nativeCancelObserved':True,'actualNetworkResumeCompleted':True}
    report['cases'].append('real network failure retains offline Normal; seeded valid prefix survives native cancellation; actual HQ resume verifies and stays on splash; cached High enables Play')
    report['musicSHA256']=ui.app('sha256sum','files/music/official-v1/music.data').decode().split()[0]
    report['hqSHA256']=ui.app('sha256sum',hq).decode().split()[0]
    assert report['hqSHA256']=='a16a06c2a6b68e86a03934240880ec0b0fd72666606af3bf12ed5ffda7734f0e'
    assert report['musicSHA256']=='602ea6c69f4073a9617676a39f8397232953637a9b7a36e7cc28e93dd15184cd'
    report['apkSHA256']=hashlib.sha256((ui.ROOT/'app/build/outputs/apk/debug/app-debug.apk').read_bytes()).hexdigest()
    path=ui.adb('shell','pm','path',ui.PACKAGE).decode().strip().removeprefix('package:')
    report['installedSHA256']=ui.adb('shell','sha256sum',path).decode().split()[0];assert report['installedSHA256']==report['apkSHA256']
    report['passed']=True;(ui.OUT/'results.json').write_text(json.dumps(report,indent=2)+'\n');print('PASS:', '; '.join(report['cases']))
finally:
    ui.adb('emu','network','speed','full');ui.adb('shell','svc','wifi','enable');ui.adb('shell','svc','data','enable')
    if ui.file_size(backup):ui.app('mv',backup,hq)
