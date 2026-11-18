"""Small operator-invoked092 journey steps. Importing/launching this module does nothing."""
import json, time
import control as c
import device as d
import probe as p
import playersqa as players
import qa092 as q

def players_cycle(name,expected_mode=None):
    q.measure(force=True);players.openpage();first=players.save(name+'-open')
    players.assert_clean_panel(first)
    if expected_mode:assert first['native']['mode']==expected_mode
    players.closepage();players.openpage();d.back()
    c.wait(players.READ,lambda o:not(o.get('report')or{}).get('open'),timeout=6)
    after=players.save(name+'-after-back')
    return q.write(name+'-cycle',{'firstMode':first['native']['mode'],'role':first['native']['viewer'],'toggleCloseThenReopenThenActualAndroidBack':True,'after':after})

def ime_state(shown,timeout=7):
    until=time.monotonic()+timeout;last=None
    while time.monotonic()<until:
        raw=d.adb('shell','dumpsys','input_method');last='mInputShown=true'in raw
        if last==shown:return {'mInputShown':last,'lines':[x.strip()for x in raw.splitlines()if'mInputShown='in x]}
        time.sleep(.2)
    raise RuntimeError({'IMEstateNotObserved':shown,'actual':last})

def campaign_ime_cycle(name):
    """Call twice with unique names from already open Design; never edits/saves a name."""
    before=c.evaluate(q.VIEW);q.tap('#wt-design-name-button')
    c.wait("(()=>{const e=document.querySelector('#wt-design-rename-input');return!!e&&e.getBoundingClientRect().width>0})()",timeout=4)
    original=c.evaluate("document.querySelector('#wt-design-rename-input').value")
    on=ime_state(True);q.screen(name+'-ime-open');d.back();off=ime_state(False)
    c.wait(q.VIEW,lambda x:x==before,timeout=8);q.measure(force=True);q.screen(name+'-ime-back')
    q.tap('[data-action="cancel-design-rename"]')
    c.wait("(()=>{let e=document.querySelector('#wt-design-rename-input');return!e||e.getBoundingClientRect().width===0})()",timeout=5)
    after=c.evaluate("document.querySelector('#wt-design-rename-input')?.value")
    assert after in (None,original),'Cancel unexpectedly changed name input value'
    return q.write(name,{'realIMEOpened':on,'actualAndroidBackHidIME':off,'originalInputValue':original,'inputAfterCancel':after,'restoredActualViewport':before,'cancelWithoutSave':True})

def ordinary_birth_with_players(name,manufacture_selector,timeout=75):
    """Root first selects an actually idle normal factory/design in its native UI."""
    before=q.native_owned();pre=players.read()
    lock=(pre.get('mp')or{}).get('combatLock')or(pre.get('touch')or{}).get('combatLockState')or{}
    old=set(lock.get('combatIds',[]));intent=bool((pre.get('mpControls')or pre.get('touch')or{}).get('combatLockRequested'))
    q.tap(manufacture_selector);players.openpage();events=[];until=time.monotonic()+timeout;last_clock=None;last_advance=time.monotonic();born=set()
    while time.monotonic()<until:
        out=players.read();n=out['native'];current=(out.get('mp')or{}).get('combatLock')or(out.get('touch')or{}).get('combatLockState')or{}
        events.append({'gameTime':n['gameTime'],'realTime':n['realTime'],'lock':current})
        if n['gameTime']!=last_clock:last_clock=n['gameTime'];last_advance=time.monotonic()
        if time.monotonic()-last_advance>12:raise RuntimeError({'nativeClockStalledInspectOnce':events[-1]})
        born=set(current.get('combatIds',[]))-old
        if born:break
        time.sleep(.35)
    if not born:
        q.write(name+'-wait-incomplete',{'before':before,'events':events,'afterNative':q.native_owned(),'noRequeuePerformed':True})
        raise RuntimeError('No ordinary birth yet; inspect actual native clock/finishedUnits, do not requeue')
    modal=players.save(name+'-born-while-players-open',nativeCommands=True);players.closepage()
    def resumed(o):
        l=(o.get('mp')or{}).get('combatLock')or(o.get('touch')or{}).get('combatLockState')or{}
        return not l.get('suspended')and (born.issubset(set(l.get('selectedIds',[])))if intent else not born.intersection(l.get('selectedIds',[])))
    after=c.wait(players.READ,resumed,timeout=8);players.save(name+'-after-close',nativeCommands=True)
    return q.write(name,{'originalCombatIDs':sorted(old),'ordinaryNewCombatIDs':sorted(born),'requestedONBefore':intent,'modal':modal,'afterClose':after,'nativeEvents':events,'ordinaryFactoryOnly':True,'noScriptSpawn':True})

def project_visible_tile(x,y):
    """Read-only ray geometry; root must separately validate actual clear/reachable native site."""
    value=c.evaluate("(()=>{const f=document.querySelector('#warzone-game-frame'),w=f.contentWindow,t=w.WarzoneTerrain,x="+str((x+.5)*128)+",y="+str((y+.5)*128)+",z=t.heightAt(x,y),p=t.project(x,y,z),r=f.getBoundingClientRect();return {x,y,z,p,pick:t.pick(p.x,p.y),hitFrame:document.elementFromPoint(r.left+p.x,r.top+p.y)===f,frame:r.toJSON()}})()")
    assert value['pick']['x']==x and value['pick']['y']==y,value
    return value

def tap_validated_world_tile(x,y,native_preflight):
    """Ordinary Android input only; refuses guessed tiles or absent native preflight."""
    assert native_preflight.get('ok')is True,native_preflight
    v=project_visible_tile(x,y);g=q.measure();r=v['frame'];l,t,right,bottom=g['bounds'];css=g['css']
    assert v['hitFrame'],'World is covered by an HTML modal/control; no input sent'
    px=l+(r['left']+v['p']['x'])*(right-l)/css['width'];py=t+(r['top']+v['p']['y'])*(bottom-t)/css['height']
    assert l<=px<right and t<=py<bottom
    d.adb('shell','input','tap',str(round(px)),str(round(py)))
    return {'tile':[x,y],'projection':v,'actualGeometry':g,'physicalTap':[px,py],'nativePreflight':native_preflight}

def observer_tabs(name):
    players.openpage();out=players.read();assert out['native']['capabilities']['fullSpectatorStats'];players.assert_privacy(out)
    assert out['native']['viewer']['role']=='spectator'
    for tab in ('participants','spectators','details'):
        players.tab(tab);players.save(name+'-'+tab,nativeCommands=False)
    players.detail('economy');economy=players.fresh_samples();economy['cellComparison']=players.observer_cells_match(economy['second'],economy['first']['native']);q.write(name+'-economy-live',economy)
    players.save(name+'-economy',nativeCommands=False);players.detail('upgrades')
    upgrades=players.fresh_samples();upgrades['cellComparison']=players.observer_cells_match(upgrades['second'],upgrades['first']['native']);q.write(name+'-upgrades-live',upgrades);players.save(name+'-upgrades',nativeCommands=False)
    # Horizontal swipe only if content actually overflows; no fake scrolling assertion.
    out=players.read();scroll=None
    if out['tables']and out['tables'][0]['scrollWidth']>out['tables'][0]['clientWidth']+1:scroll=players.inspect_horizontal_scroll()
    return q.write(name+'-tabs',{'viewer':out['native']['viewer'],'nativeObserverDetails':[r['observerDetails']for r in out['native']['players']],'horizontalTouch':scroll,'ownedStateCommandsIssuedByThisStep':False})

def observe_native_progress(name):
    """Root uses this before/after its normal move, Build or queue action; no orders issued."""
    return q.write(name,{'native':q.native_owned(),'players':players.read()})
