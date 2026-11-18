"""Inert, root-operator-only092 MP steps. Importing/running this file performs no I/O.
No host launches, APK installs/uninstalls, role patches, debug keys or automatic suite.
Invoke ONE function, inspect its result/screen, then choose the next function.
"""
from pathlib import Path
import json,re,time
import control as c
import device as d
import qa092 as q
import playersqa_current as players

STATE=r"""(()=>{const w=document.querySelector('#warzone-game-frame')?.contentWindow,n=w?.PcMultiplayerNative?.state;return {path:location.pathname,session:{active:globalThis.PcMultiplayerSession?.active,phase:globalThis.PcMultiplayerSession?.phase},directory:globalThis.PcLobbyUi?.snapshot?.(),http:globalThis.PcLobbyHttp?.report?.(),room:w?.PcMultiplayerNative?.room,native:n?{phase:n.phase,gameTime:n.gameTime,rendered:n.rendered,worldSafe:n.worldSafe,worldReady:n.worldReady,player:n.player,realPlayer:n.realPlayer,spectator:n.spectator,canIssueOrders:n.canIssueOrders,frame:n.view?.frame}:null,fixture:globalThis.__playersPolishPrivateDirectory092?.inspect?.()}})()"""

def read():return c.evaluate(STATE,activity='mp')

def native_tap(label):
    rows=[n for n in d.nodes(d.xml()) if n.get('enabled')=='true' and label.casefold() in (n.get('text','').casefold(),n.get('content-desc','').casefold())]
    assert len(rows)==1,{'expectedOneNativeTarget':label,'matches':rows}
    d.tap(label)
    return {'normalNativeUIATarget':label}

def launch_from_home():
    """Precondition: root inspected ordinary native Home with MULTIPLAYER visible."""
    native_tap('MULTIPLAYER')
    until=time.monotonic()+15;last=None
    while time.monotonic()<until:
        try:
            alive=c.rpc('state',activity='mp')
            if alive.get('state'):break
        except RuntimeError as error:last=str(error)
        time.sleep(.15)
    else:raise RuntimeError({'multiplayerActivityNotYetAvailable':last,'inputWasSentOnce':True})
    return c.wait("Boolean(globalThis.PcLobbyHttp?.report?.().main&&globalThis.PcLobbyUi?.snapshot)",timeout=15,activity='mp')

def wait_real_http_settled(timeout=25):
    """Do this BEFORE fixture install: never replace a real listing in flight."""
    return c.wait(STATE,lambda s:not (s.get('session')or{}).get('active') and s.get('http',{}).get('main') is True and s['http'].get('pending')==0 and s['http'].get('relayed')==0 and s.get('directory',{}).get('loading') is False,timeout=timeout,activity='mp')

def install_directory(role,run2=False,run3=False,run4=False,run5=False):
    assert role in ('player','spectator')
    before=read()
    assert not before['session']['active'] and before['http']['pending']==before['http']['relayed']==0 and not before['directory']['loading'],before
    old=before.get('fixture')
    assert not old or not old['installed'],'Normal leave/uninstall previous fixture first'
    assert sum(bool(x) for x in (run2,run3,run4,run5))<=1 and (not(run3 or run4 or run5) or role=='player')
    suffix=role+('-run5' if run5 else '-run4' if run4 else '-run3' if run3 else '-run2' if run2 else '')
    plan=json.loads((c.ROOT/('private-host-'+suffix)/'fixture-plan.json').read_text())
    assert plan['role']==role and plan['port']==(22209 if run5 else 22207 if run4 else 22206 if run3 else (22205 if role=='player' else 22208) if run2 else {'player':22203,'spectator':22204}[role]) and plan['nativeDataCheckEnabled'] and plan['publicRegistration'] is False
    # Root separately starts/inspects the owned host; this helper never launches one.
    result=c.evaluate((c.ROOT/('private-directory-'+suffix+'.js')).read_text(),activity='mp')
    assert result['installed'] and result['role']==role and result['port']==plan['port'] and not result['nativeGameplayMocked']
    return result

def refresh_owned_directory():
    s=read();f=s.get('fixture');assert f and f['installed'] and not (s.get('session')or{}).get('active')
    native_tap('REFRESH')
    return c.wait(STATE,lambda o:o['directory']['loading'] is False and len(o['directory']['games'])==1 and o['directory']['games'][0]['id']==f['fixtureId'],timeout=8,activity='mp')

def normal_join():
    s=read();f=s.get('fixture');games=s.get('directory',{}).get('games',[])
    assert f and f['installed'] and not (s.get('session')or{}).get('active') and len(games)==1 and games[0]['id']==f['fixtureId'] and games[0]['joinable'],s
    # Java-native landing is the visible list; do not invoke hidden DOM JOIN.
    native_tap('JOIN')
    return c.wait(STATE,lambda o:(o.get('native')or{}).get('phase')=='room' and (o.get('room')or{}).get('ready') is True,timeout=45,activity='mp')

def room_ready_or_spectate(role):
    s=read();assert s['native']['phase']=='room' and s['room']['ready'] is True
    local=s['room']['local'];assert local['spectator'] is False,'Do not re-toggle an already-observing slot'
    assert role in ('player','spectator') and s['fixture']['role']==role
    q.measure(activity='mp',force=True)
    return q.tap('#mp-room-ready' if role=='player' else '#mp-room-spectate',activity='mp')

def wait_live(role,timeout=60):
    assert role in ('player','spectator')
    def eligible(o):
        if not isinstance(o,dict):return False
        n=o.get('native')or{}
        okay=(o.get('session')or{}).get('phase')=='game' and n.get('phase')=='game' and n.get('worldSafe') is True and n.get('rendered') is True and (n.get('frame')or 0)>3 and (n.get('gameTime')or 0)>1000
        return okay and ((n.get('spectator') is True and n.get('canIssueOrders') is False and n.get('realPlayer',-1)>=11) if role=='spectator' else (n.get('spectator') is False and n.get('canIssueOrders') is True and n.get('player')==n.get('realPlayer')))
    first=c.wait(STATE,eligible,timeout=timeout,activity='mp')
    second=c.wait(STATE,lambda o:eligible(o) and o['native']['gameTime']>first['native']['gameTime'] and o['native']['frame']>first['native']['frame'],timeout=8,activity='mp')
    return {'first':first,'second':second,'actualNativeClockAndFrameAdvanced':True,'physicalPaintVerifiedByThisStep':False,'dataCheckMustBeVerifiedSeparately':True}

def host_data_check(role,player_id,run2=False,run3=False,run4=False,run5=False):
    """Only sanitized receipts/failures; never copies raw private host logs."""
    assert role in ('player','spectator') and isinstance(player_id,int)
    assert sum(bool(x) for x in (run2,run3,run4,run5))<=1 and (not(run3 or run4 or run5) or role=='player')
    p=c.ROOT/('private-host-'+role+('-run5' if run5 else '-run4' if run4 else '-run3' if run3 else '-run2' if run2 else ''))/'private/stderr.log';text=p.read_text(errors='replace')
    receipts=re.findall(r'\*\* Received NET_DATA_CHECK(?:2)? from player '+str(player_id)+r'\b',text)
    failures=[x for x in ('tried to bypass data integrity','Invalid data','given incorrect params','DATA_CHECK failed') if x.lower() in text.lower()]
    return {'nativePlayerID':player_id,'dataCheckReceived':any('NET_DATA_CHECK from' in x for x in receipts),'dataCheck2Received':any('NET_DATA_CHECK2 from' in x for x in receipts),'receipts':receipts[-6:],'failureMarkers':failures,'noBypassOrSuccessInferredFromRoom':True}

def open_and_capture(name):
    """Physical capture + actual native role/privacy; no owned commands for spectator."""
    players.openpage();out=players.save(name,nativeCommands=False);players.assert_clean_panel(out)
    return out

def capture_tab(name,tab,detail=None):
    players.tab(tab)
    if detail is not None:assert tab=='details';players.detail(detail)
    out=players.save(name,nativeCommands=False);players.assert_privacy(out);return out

def toggle_back_cycle(name):
    players.closepage();players.openpage();d.back()
    c.wait(players.READ,lambda o:not(o.get('report')or{}).get('open'),timeout=6,activity='mp')
    return players.save(name,nativeCommands=False)

def normal_leave():
    if (players.read().get('report')or{}).get('open'):players.closepage()
    q.tap('#leave',activity='mp');native_tap('Return')
    return c.wait(STATE,lambda o:(o.get('session')or{}).get('active') is False and (o.get('session')or{}).get('phase')=='lobby',timeout=15,activity='mp')

def uninstall_directory():
    """Removes only injected JS fixture, NEVER the APK/data. Call after normal leave."""
    s=read();assert not (s.get('session')or{}).get('active') and s['session']['phase']=='lobby',s
    return c.evaluate("globalThis.__playersPolishPrivateDirectory092?.uninstall?.()||{installed:false,alreadyAbsentAfterNormalReturn:true}",activity='mp')
