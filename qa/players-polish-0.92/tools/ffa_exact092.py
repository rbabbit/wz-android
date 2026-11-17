"""Operator-invoked focused FFA092 journey. Importing is inert; no retries/seeding."""
from pathlib import Path
from datetime import datetime,timezone
import argparse,json,re,struct,time,xml.etree.ElementTree as ET
import control as c
import device as d
import qa092 as q
import playersqa as players

SAVE='wt_89d04ba79d124c5787e53d2798c3589f.zip'
STAMP='12 Nov, 15:15'
LOCK="(()=>{const w=document.querySelector('#warzone-game-frame')?.contentWindow;return w?.__kalaWarzoneTouch?.report?.().combatLockState||null})()"
UI="(()=>{const w=document.querySelector('#warzone-game-frame')?.contentWindow,r=w?.__warzoneCommands?.report?.();return r?{page:r.page,factory:r.factory,pending:r.productionPending,feedback:r.productionFeedback,acks:r.acks,writes:r.writes,snapshot:r.snapshot}:null})()"

def bounds(node):
    values=tuple(map(int,re.findall(r'-?\d+',node.get('bounds',''))))
    assert len(values)==4 and values[2]>values[0]and values[3]>values[1],node.attrib
    return values

def record(prefix,step,value):return q.write(prefix+'-'+step,value)

def native_load_timestamp(prefix):
    """Native Java menus use UIA; never evaluate the blank WebView as readiness."""
    d.tap('FFA');d.tap('FFA SAVES');raw=d.xml()
    for attempt in range(2):  # One initial inspection and at most ONE ordinary scroll.
        tree=ET.fromstring(raw);parents={child:parent for parent in tree.iter()for child in parent}
        hits=[n for n in tree.iter('node')if re.sub(r'\s+',' ',n.get('text','')).strip()==STAMP and n.get('bounds')not in ('[0,0][0,0]',None)]
        if hits:
            assert len(hits)==1,{'ambiguousSaveTimestamp':len(hits)}
            row=hits[0]
            while row in parents:
                loads=[n for n in row.iter('node')if n.get('text','').upper()=='LOAD'and n.get('enabled')=='true']
                if len(loads)==1:break
                row=parents[row]
            assert len(loads)==1,'Timestamp did not resolve one actual native LOAD row'
            load=loads[0];l,t,r,b=bounds(load)
            proof={'timestamp':STAMP,'expectedOriginalArchive':SAVE,'loadBounds':[l,t,r,b],
                   'rowTexts':[n.get('text')for n in row.iter('node')if n.get('text')],
                   'contentDescription':load.get('content-desc'),'scrollsUsed':attempt}
            (c.ROOT/(prefix+'-native-save-chooser.xml')).write_text(raw)
            physical=q.screen(prefix+'-native-save-chooser');assert 0<=l<r<=physical[0]and 0<=t<b<=physical[1],proof
            proof['actualPhysicalViewport']=physical;record(prefix,'save-choice',proof)
            d.adb('shell','input','tap',str((l+r)//2),str((t+b)//2));return proof
        if attempt:break
        scrolling=[n for n in tree.iter('node')if n.get('scrollable')=='true']
        assert len(scrolling)==1,{'nativeSaveScrollContainerAmbiguous':len(scrolling)}
        l,t,r,b=bounds(scrolling[0]);x=(l+r)//2
        d.adb('shell','input','swipe',str(x),str(round(t+(b-t)*.8)),str(x),str(round(t+(b-t)*.2)),'350')
        raw=d.xml()
    raise RuntimeError('Known12Nov15:15 checkpoint absent after one bounded native scroll; inspect, do not choose another save')

def ready_loaded(timeout):
    until=time.monotonic()+timeout;last=None
    while time.monotonic()<until:
        try:
            last=c.evaluate("(()=>{let w=document.querySelector('#warzone-game-frame')?.contentWindow,r=w?.__warzoneCommands?.report?.();return {gameTime:r?.snapshot?.gameTime||0,parts:!!r?.snapshot?.parts,lock:w?.__kalaWarzoneTouch?.report?.().combatLockState}})()")
            if last and last['gameTime']>0 and last['parts']and last.get('lock'):return last
        except Exception as error:last={'observationError':type(error).__name__}
        time.sleep(.3)
    raise RuntimeError({'nativeFFALoadNotReady':last})

def set_combat(enabled):
    lock=c.evaluate(LOCK);assert lock is not None,'No current native combat lock'
    if bool(lock.get('enabled'))!=enabled:q.tap('#wt-all-combat')
    return c.wait(LOCK,lambda x:bool(x)and x.get('enabled')==enabled and not x.get('suspended')and (enabled or not x.get('pendingDeselect')and not x.get('selectedIds')),timeout=9)

def compact_players(prefix):
    prior=d.adb('shell','wm','size');override=re.search(r'Override size:\s*(\d+x\d+)',prior)
    restore=['shell','wm','size',override.group(1)]if override else['shell','wm','size','reset']
    before=c.evaluate(q.VIEW);out={'originalWmSize':prior,'restoreCommand':restore}
    try:
        d.adb('shell','wm','size','720x1280')
        c.wait(q.VIEW,lambda x:x and x['width']!=before['width'],timeout=9)
        out['geometry']=q.measure(force=True)
        assert out['geometry']['physical']==[1280,720],out
        # This emulator's compact CSS width is1063. Do not require CSS<1000.
        out['panel']=players.save(prefix+'-compact');players.assert_clean_panel(out['panel'])
        players.closepage();players.openpage();d.back()
        c.wait(players.READ,lambda x:not(x.get('report')or{}).get('open'),timeout=6)
        players.openpage();out['actualCompactToggleBack']=True
        return out
    finally:
        d.adb(*restore)
        c.wait(q.VIEW,lambda x:x and x['width']==before['width']and x['height']==before['height'],timeout=9)
        q.measure(force=True)

def choose_idle_factory():
    native=q.native_owned();fs=native['result']['factories']
    eligible=[f for f in fs if f['kind']=='Factory'and f['ready']and f['idle']and not f.get('queue')and not(f.get('repeat')or{}).get('enabled')]
    assert eligible,{'noActualIdleFactory':fs}
    # Exact finishedUnits below attributes the birth to this chosen factory.
    factory=max(eligible,key=lambda f:(f['modules'],-f['number']))
    q.tap('#wt-open-factory');c.wait(UI,lambda x:x and x['page']=='factory',timeout=7)
    q.tap('[data-factory="'+str(factory['id'])+'"]')
    c.wait(UI,lambda x:x and x['factory']==factory['id'],timeout=6)
    controls=q.targets('[aria-label="Manufacture Design 1"]')['targets']
    assert len([x for x in controls if x['visible']and x['enabled']and x['hit']])==1,controls
    return native,factory

def birth(prefix,enabled,timeout):
    assert timeout>=20,'Insufficient bounded budget; no manufacture action sent'
    set_combat(enabled);native,factory=choose_idle_factory();old_finished={u['id']for u in native['result'].get('finishedUnits',[])}
    before_ui=c.evaluate(UI);before_lock=c.evaluate(LOCK)
    q.tap('[aria-label="Manufacture Design 1"]')
    # Capture actual native-backed feedback/queue ACK BEFORE opening Players.
    ack=c.wait(UI,lambda x:x and not x.get('pending')and (x.get('feedback')or{}).get('tone')=='done'and (x.get('feedback')or{}).get('message','').startswith('Added 1 to'),timeout=10)
    accepted=q.native_owned();current=next(f for f in accepted['result']['factories']if f['id']==factory['id'])
    queue_seen=bool(current.get('active')or current.get('currentProduction')or current.get('queue')or not current.get('idle')or(current.get('progress')or{}).get('state')not in (None,'idle'))
    already=[u for u in accepted['result'].get('finishedUnits',[])if u['id']not in old_finished and u.get('factoryId')==factory['id']and u.get('name')=='Design 1']
    proof={'ordinaryFactory':factory,'before':native,'beforeUI':before_ui,'beforeLock':before_lock,'ackUI':ack,'nativeImmediatelyAfterACK':accepted,'actualFactoryQueueOrProgressSeen':queue_seen,'alreadyFinishedBeforePlayers':already,'requestedEnabled':enabled,'events':[]}
    record(prefix,'production-ack',proof);assert queue_seen,'ACK seen but native factory job absent; inspect, never requeue'
    players.openpage();started=time.monotonic();last_native=accepted;last_clock=accepted['gameTime'];advanced=time.monotonic();found=None
    while time.monotonic()-started<timeout:
        last_native=q.native_owned();lock=c.evaluate(LOCK);clock=last_native['gameTime']
        proof['events'].append({'gameTime':clock,'factory':next((f for f in last_native['result']['factories']if f['id']==factory['id']),None),'lock':lock,'finishedUnits':last_native['result'].get('finishedUnits',[])})
        if clock!=last_clock:last_clock=clock;advanced=time.monotonic()
        if time.monotonic()-advanced>12:break
        new=[u for u in last_native['result'].get('finishedUnits',[])if u['id']not in old_finished and u.get('factoryId')==factory['id']and u.get('name')=='Design 1']
        if new:found=new[0];break
        time.sleep(.4)
    if not found:
        proof.update(status='incomplete',reason='No attributed native finishedUnit within bounded observation; no retry/requeue',lastNative=last_native)
        record(prefix,'production-incomplete',proof);raise RuntimeError(proof['reason'])
    proof['birth']=found;proof['whilePlayersOpen']=players.save(prefix+'-born-panel')
    assert proof['whilePlayersOpen']['report']['open']
    assert found['id']not in {u['id']for u in already},'Birth completed before Players opened; cannot claim during-modal completion'
    players.closepage()
    resumed=c.wait(LOCK,lambda x:x and not x.get('suspended')and x.get('enabled')==enabled and ((found['id']in x.get('selectedIds',[]))if enabled else not x.get('selectedIds')and not x.get('pendingDeselect')),timeout=9)
    proof['afterCloseLock']=resumed;proof['afterClose']=players.save(prefix+'-restored');proof['status']='observed'
    return record(prefix,'production',proof)

def run(prefix='ffa092',off=True,max_seconds=290):
    assert re.fullmatch(r'[A-Za-z0-9_-]+',prefix)
    assert not list(c.ROOT.glob(prefix+'-*')),'Prior prefix proofs exist; preserve them and resume explicitly, never rerun blindly'
    result={'startedUTC':datetime.now(timezone.utc).isoformat(),'status':'incomplete','originalUnmodifiedArchive':SAVE,'seeded':False,'deviceSerial':'emulator-5562','steps':{}}
    began=time.monotonic();stage='preflight'
    try:
        result['steps']['archivesBefore']=q.fingerprint_prepared()
        raw=d.xml();labels={n.get('text','').upper()for n in d.nodes(raw)}
        assert {'CAMPAIGN','TOWERS','FFA','MULTIPLAYER','GUIDE','HUB'}.issubset(labels),'Start from actual Home, not blank WebView/another match'
        stage='native-save-chooser';result['steps']['saveChoice']=native_load_timestamp(prefix)
        stage='native-load';result['steps']['loaded']=ready_loaded(min(90,max_seconds-(time.monotonic()-began)))
        q.measure(force=True);players.openpage();panel=players.save(prefix+'-players');players.assert_clean_panel(panel)
        assert panel['native']['mode']=='offline-skirmish'and panel['native']['viewer']['role']=='local'
        assert any(r['ai']for r in panel['native']['players']);players.assert_privacy(panel)
        columns=panel['tables'][0]['columns']
        for native_row in panel['native']['players']:
            if native_row['relationship']=='opponent':
                rendered=next(r for r in panel['rows']if r['playerId']==str(native_row['id']))
                assert all(rendered['cells'][columns.index(key)-1]=='—'for key in ('UNITS','STRUCTURES','POWER')),rendered
        assert 161319 in (c.evaluate(LOCK)or{}).get('combatIds',[]),'Wrong prepared native checkpoint; no production attempted'
        players.closepage();players.openpage();d.back();c.wait(players.READ,lambda x:not(x.get('report')or{}).get('open'),timeout=6);players.openpage()
        stage='compact';result['steps']['compact']=compact_players(prefix);players.closepage()
        stage='ordinary-production-ON';result['steps']['birthON']=birth(prefix+'-on',True,min(80,max_seconds-(time.monotonic()-began)-15))
        if off and max_seconds-(time.monotonic()-began)>95:
            stage='ordinary-production-OFF';result['steps']['birthOFF']=birth(prefix+'-off',False,min(80,max_seconds-(time.monotonic()-began)-15))
        else:result['steps']['birthOFF']={'status':'not-run','reason':'Explicit skip or less than95seconds remain for one bounded80second observation plus normal leave'}
        stage='normal-leave';players.closepage();d.back();d.tap('Return')
        result['steps']['leftNativeMatchNormally']=True;result['steps']['archivesAfter']=q.fingerprint_prepared()
        result['status']='observed';result['physicalScreensRequireRootReview']=True
    except Exception as error:
        result.update(status='incomplete',failedStage=stage,errorType=type(error).__name__,error=str(error))
        # Preserve a useful partial snapshot once; never retry input or reset the fixture.
        try:result['partialPlayers']=players.read()
        except Exception as observation_error:result['partialObservationError']=type(observation_error).__name__
        try:q.screen(prefix+'-partial')
        except Exception as capture_error:result['partialCaptureError']=type(capture_error).__name__
    finally:
        result.update(elapsedSeconds=round(time.monotonic()-began,2),finishedUTC=datetime.now(timezone.utc).isoformat())
        record(prefix,'result',result)
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--prefix',default='ffa092');parser.add_argument('--skip-off',action='store_true');parser.add_argument('--max-seconds',type=int,default=290)
    args=parser.parse_args();assert 150<=args.max_seconds<=360
    print(json.dumps(run(args.prefix,not args.skip_off,args.max_seconds),indent=2))
