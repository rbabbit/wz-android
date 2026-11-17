"""Inert root-only run5 diagnostic. One receipted real-FINGER flow, never retries/requeues.
No device or host action at import/direct execution. Root starts host/normal JOIN first.
"""
from datetime import datetime,timezone
import json,re,time
import control as c
import qa092 as q
import playersqa_current as p
import mp092_operator as m

APK='134246af423c0ea04b375409f41d179813a739968d260855e73784a9109b6b66'
BRIEF=r"""(()=>{const w=document.querySelector('#warzone-game-frame')?.contentWindow,c=w?.__warzoneCommands,r=c?.report?.(),t=w?.PcMultiplayerControls?.report?.(),n=w?.PcMultiplayerNative?.state;return{session:{phase:globalThis.PcMultiplayerSession?.phase,active:globalThis.PcMultiplayerSession?.active,errors:globalThis.PcMultiplayerSession?.errors?.slice(-3)},commands:r?{page:r.page,opens:r.opens,closes:r.closes,nativeMenu:r.nativeMenu,nativeClosing:r.nativeClosing,exitingBuild:r.exitingBuild,buildOpen:r.buildOpen,placement:r.placement,selectingTrucks:r.selectingTrucks,pending:r.pending,pendingItem:r.pendingItem,factory:r.factory,productionPending:r.productionPending,productionFeedback:r.productionFeedback,navigationRevision:c.navigationRevision?.()}:null,players:c?.playersReport?.(),room:w?.PcMultiplayerNative?.room?{generation:w.PcMultiplayerNative.room.generation,local:w.PcMultiplayerNative.room.local,localPlayer:w.PcMultiplayerNative.room.localPlayer}:null,touch:t?{pendingClicks:t.pendingClicks,queued:t.queued,pointers:t.pointers,heldKeys:t.heldKeys,heldMouse:t.heldMouse,activeJob:t.activeJob,combatOverride:t.combatOverride}:null,native:n?{phase:n.phase,frame:n.view?.frame,gameTime:n.gameTime,worldSafe:n.worldSafe,rendered:n.rendered,player:n.player,realPlayer:n.realPlayer,spectator:n.spectator,canIssueOrders:n.canIssueOrders,combatLock:n.combatLock}:null}})()"""
INSTALL=r"""(()=>{if(globalThis.__qaPlayersReceipt092)throw Error('Preserve previous ledger; do not install twice');const brief=()=>__BRIEF__;let step='',selector='',rows=[];const observe=(event,phase)=>{if(!step)return;const button=event.target?.closest?.('button');let matches=false;try{matches=!!event.target?.closest?.(selector)}catch{}rows.push({type:event.type,eventPhase:phase,trusted:event.isTrusted,pointerType:event.pointerType||'',pointerId:event.pointerId,x:event.clientX,y:event.clientY,button:event.button,defaultPrevented:event.defaultPrevented,targetId:event.target?.id||'',targetTag:event.target?.tagName||'',buttonId:button?.id||'',buttonLabel:button?.getAttribute('aria-label')||'',buttonText:button?.innerText||'',dataCommand:button?.dataset?.command||'',matchesMeasuredSelector:matches,onclickPresent:typeof button?.onclick==='function',at:performance.now(),state:brief()});if(rows.length>80)rows.shift()};const capture=e=>observe(e,'capture'),bubble=e=>observe(e,'bubble');for(const type of ['pointerdown','pointerup','pointercancel','click']){window.addEventListener(type,capture,{capture:true,passive:true});window.addEventListener(type,bubble,{passive:true})}globalThis.__qaPlayersReceipt092={begin:(name,target)=>{step=name;selector=target;rows=[];return brief()},snapshot:()=>({step,selector,rows:rows.slice(),state:brief()}),dispose:()=>{for(const type of ['pointerdown','pointerup','pointercancel','click']){window.removeEventListener(type,capture,true);window.removeEventListener(type,bubble,false)}step='';return true}};return{passiveObserversOnly:true,noMethodWrapper:true,noDOMClick:true}})()""".replace('__BRIEF__',BRIEF)

class StopStep(RuntimeError):pass

def run(prefix='run5-receipted',max_seconds=210):
    assert re.fullmatch(r'[A-Za-z0-9_-]+',prefix)and 90<=max_seconds<=230
    assert not list(c.ROOT.glob(prefix+'-*')),'Preserve existing ledger/proofs; no rerun'
    identity=json.loads((c.ROOT/'71-final-build-installed.json').read_text());assert identity['installedAPK_SHA256']==APK
    state=m.read();assert state.get('fixture',{}).get('port')==22209 and state['fixture']['role']=='player'
    assert state.get('session',{}).get('phase') in ('room','game'),'Root must normally JOIN the owned run5 first'
    result={'status':'incomplete','exactAPK':APK,'identityReference':'71-final-build-installed.json','startedUTC':datetime.now(timezone.utc).isoformat(),'maxSeconds':max_seconds,'steps':{},'noRequeue':True,'noPublicRoomOrHostAction':True,'physicalPaintRequiresRootReview':True}
    began=time.monotonic();deadline=began+max_seconds;installed=False
    def remaining(cap):
        left=deadline-time.monotonic()
        if left<1:raise StopStep('Bounded diagnostic deadline reached; no further input')
        return min(cap,left)
    def wait(js,check,cap=8):return c.wait(js,check,timeout=remaining(cap),activity='mp')
    def save(name,value):return q.write(prefix+'-'+name,value)
    def tap(step,selector,expected=None,cap=8):
        remaining(1);q.measure(activity='mp',force=True,prefer_native=True);target=q.point(selector,activity='mp')
        before=c.evaluate('globalThis.__qaPlayersReceipt092.begin('+json.dumps(step)+','+json.dumps(selector)+')',activity='mp')
        x,y=target['physical'];receipt={'selector':selector,'measuredTarget':target,'before':before}
        error=None
        try:
            receipt['input']=c.rpc('touch',frames=[{'action':0,'points':[[x,y]],'delayMs':16},{'action':1,'points':[[x,y]],'delayMs':60}])
            ledger=wait('globalThis.__qaPlayersReceipt092.snapshot()',lambda o:any(e['type']=='click'and e['trusted']and e['matchesMeasuredSelector']for e in o['rows']),2)
            receipt['trustedClickReceived']=True
            if expected:receipt['expectedState']=wait(BRIEF,expected,cap)
        except Exception as e:error=e;receipt.update(errorType=type(e).__name__,error=str(e))
        finally:
            receipt['ledger']=c.evaluate('globalThis.__qaPlayersReceipt092.snapshot()',activity='mp');save(step+'-tap',receipt)
        if error:raise StopStep(step+': '+str(error))
        return receipt
    def lock(o):return(o.get('native')or{}).get('combatLock')or{}
    def owner(o):
        n=o.get('native')or{}
        return n.get('phase')=='game'and n.get('player')==n.get('realPlayer')==1 and n.get('canIssueOrders')is True and n.get('spectator')is False and n.get('worldSafe')is True
    try:
        q.measure(activity='mp',force=True,prefer_native=True);result['observer']=c.evaluate(INSTALL,activity='mp');installed=True
        if state['session']['phase']=='room':
            assert state.get('room',{}).get('local',{}).get('spectator')is False
            result['steps']['ready']=tap('01-ready','#mp-room-ready',lambda o:(o.get('session')or{}).get('phase')=='game' or ((o.get('room')or{}).get('local')or{}).get('ready')is True,8)
        live=wait(BRIEF,lambda o:owner(o)and(o['native'].get('frame')or 0)>3 and(o['native'].get('gameTime')or 0)>1000,60)
        result['steps']['live']=wait(BRIEF,lambda o:owner(o)and o['native']['frame']>live['native']['frame']and o['native']['gameTime']>live['native']['gameTime'],8)
        result['steps']['dataCheck']=m.host_data_check('player',1,run5=True);assert result['steps']['dataCheck']['dataCheckReceived']and not result['steps']['dataCheck']['failureMarkers'],'Initial native DATA_CHECK not observed; stop without another input';save('02-live',result['steps']['live'])
        # One initial header attempt with actual receipt, no fallback tap.
        result['steps']['firstPlayers']=tap('03-initial-players','#wt-open-players',lambda o:bool((o.get('players')or{}).get('open')),8)
        wait(BRIEF,lambda o:(o.get('players')or{}).get('ready')is True,6);p.save(prefix+'-04-initial-panel',nativeCommands=False)
        result['steps']['closeInitial']=tap('05-close-initial','#wt-open-players',lambda o:not(o.get('players')or{}).get('open'),6)
        before=c.evaluate(BRIEF,activity='mp');assert owner(before)
        if lock(before).get('enabled')is not True:result['steps']['on']=tap('06-combat-on','#blocknight-combat',lambda o:lock(o).get('enabled')is True and not lock(o).get('suspended'),8)
        else:result['steps']['onAlreadyRequested']=True
        native=q.native_owned();eligible=[f for f in native['result']['factories']if f['kind']=='Factory'and f['ready']and f['idle']and not f.get('queue')and not(f.get('repeat')or{}).get('enabled')]
        assert eligible,{'noIdleOwnedFactory':native['result']['factories']}
        factory=max(eligible,key=lambda f:(f['modules'],-f['number']));result['steps']['chosenFactory']=factory
        result['steps']['manufacturing']=tap('07-factory-page','#wt-open-factory',lambda o:(o.get('commands')or{}).get('page')=='factory',6)
        result['steps']['chooseFactory']=tap('08-choose-factory','[data-factory="'+str(factory['id'])+'"]',lambda o:(o.get('commands')or{}).get('factory')==factory['id'],6)
        old_finished={u['id']for u in native['result'].get('finishedUnits',[])}
        result['steps']['manufacture']=tap('09-manufacture','[aria-label="Manufacture Design 1"]')
        ack=wait(BRIEF,lambda o:not(o.get('commands')or{}).get('productionPending') and((o.get('commands')or{}).get('productionFeedback')or{}).get('tone')=='done'and((o['commands'].get('productionFeedback')or{}).get('message')or'').startswith('Added 1 to'),10)
        accepted=q.native_owned();job=next(f for f in accepted['result']['factories']if f['id']==factory['id'])
        assert job.get('active')or job.get('queue')or job.get('currentProduction')or not job.get('idle'),'Native ACK has no actual job; stop without requeue'
        already={u['id']for u in accepted['result'].get('finishedUnits',[])if u['id']not in old_finished};result['steps']['productionACK']={'ui':ack,'native':accepted,'factory':factory};save('10-production-ack',result['steps']['productionACK'])
        # Critical single attempt: ledger records true target + state BEFORE/AFTER handler.
        result['steps']['productionPlayers']=tap('11-players-during-production','#wt-open-players',lambda o:(o.get('players')or{}).get('open')is True,12)
        wait(BRIEF,lambda o:(o.get('players')or{}).get('ready')is True,6);p.save(prefix+'-12-production-panel',nativeCommands=False)
        until=min(deadline-15,time.monotonic()+80);last_clock=accepted['gameTime'];last_advance=time.monotonic();birth=None;events=[]
        while time.monotonic()<until:
            n=q.native_owned();brief=c.evaluate(BRIEF,activity='mp');assert owner(brief),'Owned world/context lost; stop'
            clock=n['gameTime'];events.append({'gameTime':clock,'finishedUnits':n['result'].get('finishedUnits',[]),'lock':lock(brief)})
            if clock!=last_clock:last_clock=clock;last_advance=time.monotonic()
            if time.monotonic()-last_advance>12:raise StopStep('Native clock stalled; no retry/requeue')
            units=[u for u in n['result'].get('finishedUnits',[])if u['id']not in old_finished and u.get('factoryId')==factory['id']and u.get('name')=='Design 1']
            if units:birth=units[0];break
            time.sleep(.35)
        save('13-birth-observation',{'events':events,'birth':birth,'noRequeue':True});assert birth,'No attributed birth within bounded observation'
        assert birth['id']not in already,'Completed before Players opened; do not claim during-modal birth'
        result['steps']['birth']=birth;result['steps']['dataCheckAfterBirth']=m.host_data_check('player',1,run5=True);p.save(prefix+'-14-born-panel',nativeCommands=False)
        result['steps']['closeBirth']=tap('15-close-birth','#wt-open-players',lambda o:not(o.get('players')or{}).get('open'),6)
        result['steps']['autoSelected']=wait(BRIEF,lambda o:owner(o)and lock(o).get('enabled')is True and not lock(o).get('suspended')and birth['id']in lock(o).get('selectedIds',[]),8)
        result['steps']['off']=tap('16-combat-off','#blocknight-combat',lambda o:not lock(o).get('enabled')and not lock(o).get('pendingDeselect')and not lock(o).get('selectedIds'),8)
        p.save(prefix+'-17-off-restored',nativeCommands=False)
        result['steps']['leavePromptClick']=tap('18-normal-leave-prompt','#leave')
        result['leavePromptPNG']=prefix+'-19-native-leave-prompt.png';q.screen(prefix+'-19-native-leave-prompt');result['awaitingRootVisualReturn']=True;result['status']='observed-native-flow-physical-review-required'
    except Exception as error:
        result.update(errorType=type(error).__name__,error=str(error),stoppedWithoutRetryOrRequeue=True)
        try:result['partial']=c.evaluate(BRIEF,activity='mp');result['lastLedger']=c.evaluate('globalThis.__qaPlayersReceipt092?.snapshot?.()',activity='mp')
        except Exception as e:result['partialError']=type(e).__name__
        try:q.screen(prefix+'-stopped')
        except Exception as e:result['screenshotError']=type(e).__name__
    finally:
        if installed:
            try:result['passiveObserversRemoved']=c.evaluate('globalThis.__qaPlayersReceipt092?.dispose?.()',activity='mp')
            except Exception as e:result['observerRemovalError']=type(e).__name__
        result.update(elapsedSeconds=round(time.monotonic()-began,2),finishedUTC=datetime.now(timezone.utc).isoformat());save('result',result)
    return result
