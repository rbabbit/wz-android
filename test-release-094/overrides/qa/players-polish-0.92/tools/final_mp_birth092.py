"""Root-invoked MP092 ordinary birth step. Import/run is inert; no host or leave actions."""
from datetime import datetime,timezone
import json,re,time
import control as c
import qa092 as q
import playersqa_current as players
import ffa_exact092 as shared

APK='134246af423c0ea04b375409f41d179813a739968d260855e73784a9109b6b66'
LOCK="(()=>{const w=document.querySelector('#warzone-game-frame')?.contentWindow,n=w?.PcMultiplayerNative?.state;return n?.phase==='game'&&n.canIssueOrders&&n.player===n.realPlayer&&!n.spectator?n.combatLock:null})()"

def set_combat(enabled):
    lock=c.evaluate(LOCK);assert lock is not None,'No fresh owned multiplayer combat lock'
    if bool(lock.get('enabled'))!=enabled:q.tap('#blocknight-combat')
    return c.wait(LOCK,lambda x:bool(x)and x.get('enabled')==enabled and not x.get('suspended')and (enabled or not x.get('pendingDeselect')and not x.get('selectedIds')),timeout=9)

def run(prefix='final-mp092-birth',timeout=80):
    """One ordinary ON birth then OFF deselect; timeout caps the no-requeue birth observation.
    Preconditions: exact1342, real owned player1, active run4 port22207,
    normal header ALL COMBAT alreadyON; an unlocked saved Design1 is required.
    Reuses the already-reviewed helper's actual factory selection/feedback ACK/
    queue-progress/finishedUnits attribution; only its Python QA LOCK/selector
    bindings are temporary. No production/game JS is patched.
    """
    assert re.fullmatch(r'[A-Za-z0-9_-]+',prefix) and 20<=timeout<=80
    assert not list(c.ROOT.glob(prefix+'-*')),'Preserve prior proof; no rerun/requeue'
    identity=json.loads((c.ROOT/'71-final-build-installed.json').read_text());assert identity['installedAPK_SHA256']==APK
    before=players.read();n=before.get('mp')or{};assert n.get('phase')=='game'and n.get('canIssueOrders')and n.get('player')==n.get('realPlayer')==1 and not n.get('spectator')and n.get('worldSafe')and n.get('gameTime',0)>1000
    fixture=c.evaluate('globalThis.__playersPolishPrivateDirectory092?.inspect?.()',activity='mp');assert fixture and fixture['port']==22207 and fixture['role']=='player'
    assert (n.get('combatLock')or{}).get('enabled') is True,'Root must turn normal ALL COMBAT ON first'
    players.closepage();q.measure(force=True)
    started=time.monotonic();proof={'status':'incomplete','exactAPK':APK,'versionCode':92,'normalSelector':'#blocknight-combat','identityBinding':identity,'requestedONBefore':True,'startedUTC':datetime.now(timezone.utc).isoformat(),'nativeBefore':n,'maximumBirthObservationSeconds':timeout,'ordinaryFactoryOnly':True,'noScriptSpawn':True,'noRequeue':True,'noHostOrLeaveActions':True}
    old_lock,old_set=shared.LOCK,shared.set_combat
    try:
        shared.LOCK=LOCK;shared.set_combat=set_combat
        # shared.birth chooses highest-modules ready idle normal Factory, verifies
        # unique enabled Manufacture Design1, ACK + actual native job, then opens
        # Players. It requires the new finishedUnit ID/name/factory match and
        # excludes units completed before the panel opened. Native clock stalls
        # stop observation after12s; never requeues a failed or slow job.
        proof['ordinaryBirth']=shared.birth(prefix+'-on',True,timeout)
        birth=proof['ordinaryBirth']['birth'];proof['birthId']=birth['id']
        after=c.evaluate(LOCK);assert after['enabled']and not after['suspended']and birth['id']in after['selectedIds']
        proof['automaticallySelectedAfterPlayersCloseWithoutNewON']=True
        proof['offApplied']=set_combat(False)
        assert not proof['offApplied']['selectedIds']and not proof['offApplied']['pendingDeselect']
        proof['afterOFF']=players.save(prefix+'-off-restored',nativeCommands=True)
        proof['status']='observed';proof['physicalPNGsRequireRootInspection']=True
    except Exception as error:
        proof.update(errorType=type(error).__name__,error=str(error),noRetryOrRequeuePerformed=True)
        try:proof['partial']=players.read()
        except Exception as observation_error:proof['partialReadError']=type(observation_error).__name__
        try:q.screen(prefix+'-partial')
        except Exception as capture_error:proof['partialCaptureError']=type(capture_error).__name__
    finally:
        shared.LOCK,shared.set_combat=old_lock,old_set
        proof.update(elapsedSeconds=round(time.monotonic()-started,2),finishedUTC=datetime.now(timezone.utc).isoformat())
        q.write(prefix+'-result',proof)
    return proof
