"""Inert final1342 focused offline steps. Root invokes ONE run_* function at a time."""
import json,re,time,xml.etree.ElementTree as ET
from datetime import datetime,timezone
import control as c
import device as d
import qa092 as g
import playersqa_current as p
import journey_steps as j
import ffa_exact092 as f

APK='134246af423c0ea04b375409f41d179813a739968d260855e73784a9109b6b66'
W="document.querySelector('#warzone-game-frame').contentWindow"
TRUCKS=[160001,160003,160005,160007]
SEEDED=[1900001,1900003]
CAMPAIGN=[160025,160087,160089,160091,160287]

def lock():return c.evaluate(f.LOCK)
def write(prefix,step,value):return g.write(prefix+'-'+step,value)

def native_node_tap(node):
    l,t,r,b=f.bounds(node);d.adb('shell','input','tap',str((l+r)//2),str((t+b)//2));return [l,t,r,b]

def home_actual():
    raw=d.xml();nodes=d.nodes(raw);labels={n.get('text','').upper()for n in nodes}
    assert {'CAMPAIGN','TOWERS','FFA','MULTIPLAYER','GUIDE','HUB'}.issubset(labels),'Actual native Home is not ready'
    assert 'BACK'not in labels,'Native destination BACK overlay is still open; root should close it normally before invoking another mode'
    return {'nativeHomeReady':True,'noBackOverlay':True}

def choose_timestamp(prefix,mode,stamp):
    home_actual();d.tap({'towers':'TOWERS','campaign':'CAMPAIGN','ffa':'FFA'}[mode])
    d.tap({'towers':'SAVED GAMES','campaign':'CONTINUE','ffa':'FFA SAVES'}[mode]);raw=d.xml()
    for attempt in range(2):
        tree=ET.fromstring(raw);parents={child:parent for parent in tree.iter()for child in parent}
        hits=[n for n in tree.iter('node')if n.get('text')==stamp and n.get('bounds')not in ('[0,0][0,0]',None)]
        if hits:
            assert len(hits)==1,'Timestamp is not unique';row=hits[0];loads=[]
            while row in parents:
                loads=[n for n in row.iter('node')if n.get('text','').upper()=='LOAD'and n.get('enabled')=='true']
                if len(loads)==1:break
                row=parents[row]
            assert len(loads)==1,'One enabled LOAD button must belong to this exact timestamp row'
            proof={'timestamp':stamp,'mode':mode,'nativeRowTexts':[n.get('text')for n in row.iter('node')if n.get('text')],'loadBounds':f.bounds(loads[0]),'verticalScrollsUsed':attempt}
            if mode=='towers':assert any('QA089 Selection'in x for x in proof['nativeRowTexts']),proof
            physical=g.screen(prefix+'-save-chooser');l,t,r,b=proof['loadBounds'];assert 0<=l<r<=physical[0]and 0<=t<b<=physical[1]
            write(prefix,'save-choice',proof);native_node_tap(loads[0]);return proof
        if attempt:break
        # Never touch the map carousel's HorizontalScrollView beneath the saves overlay.
        scroll=[n for n in tree.iter('node')if n.get('class')=='android.widget.ScrollView'and n.get('scrollable')=='true']
        assert len(scroll)==1,{'oneActualVerticalSaveScrollViewRequired':len(scroll)}
        l,t,r,b=f.bounds(scroll[0]);x=(l+r)//2
        d.adb('shell','input','swipe',str(x),str(round(t+(b-t)*.8)),str(x),str(round(t+(b-t)*.2)),'350');raw=d.xml()
    raise RuntimeError('Known save timestamp absent after one vertical scroll; no alternate save or rerun selected')

def set_combat(enabled,selector,expected=None):
    current=lock();assert current is not None
    if current['enabled']!=enabled:g.tap(selector)
    def ready(value):
        return value and value['enabled']==enabled and not value['suspended']and (sorted(value['selectedIds'])==expected if enabled and expected is not None else enabled or not value['pendingDeselect']and not value['selectedIds'])
    return c.wait(f.LOCK,ready,timeout=9)

def normal_return(prefix):
    """Normal Back opens native Return handler; fresh measured UIA positive button only."""
    p.closepage();d.back();physical=g.screen(prefix+'-return-prompt')
    try:raw=d.xml()
    except Exception as error:
        write(prefix,'return-stopped',{'nativeBackInvokedReturnHandler':True,'promptPNG':prefix+'-return-prompt.png','uiaError':type(error).__name__,'actionRequired':'Root inspect native Return prompt; stop here, no guessed coordinates, no UIA retry'})
        raise RuntimeError('Native Return prompt captured; UIA unavailable. STOP for root native-dialog handling')from error
    nodes=d.nodes(raw);buttons=[n for n in nodes if n.get('text')=='Return'and n.get('enabled')=='true']
    assert len(buttons)==1,'Fresh native Return button not uniquely present; stop, do not guess'
    l,t,r,b=f.bounds(buttons[0]);assert 0<=l<r<=physical[0]and 0<=t<b<=physical[1]
    native_node_tap(buttons[0]);raw=d.xml();nodes=d.nodes(raw)
    back=[n for n in nodes if n.get('text','').upper()=='BACK'and n.get('enabled')=='true']
    if back:
        assert len(back)==1,'Ambiguous native BACK after normal Return';native_node_tap(back[0])
    return home_actual()

def guarded(mode,prefix,body):
    assert prefix.startswith('final-')and re.fullmatch(r'[A-Za-z0-9_-]+',prefix)
    assert not list(c.ROOT.glob(prefix+'-*')),'Preserve prior final proof prefix; resume a specific step instead'
    result={'mode':mode,'prefix':prefix,'status':'incomplete','startedUTC':datetime.now(timezone.utc).isoformat(),'steps':{}}
    began=time.monotonic();previous_geometry_preference=g.PREFER_NATIVE;g.PREFER_NATIVE=True
    try:
        identity=json.loads((c.ROOT/'71-final-build-installed.json').read_text());assert identity['installedAPK_SHA256']==APK
        result['identityBinding']={'rootVerifiedInstallRecord':identity,'scriptDoesNotIndependentlyHashAPK':True}
        result['archivesBefore']=g.fingerprint_prepared();home_actual();body(prefix,result['steps'])
        result['steps']['stage']='normal-native-Return-and-Home'
        result['steps']['normalReturn']=normal_return(prefix);result['archivesAfter']=g.fingerprint_prepared()
        result['status']='observed';result['physicalPNGsRequireRootReview']=True
    except Exception as error:
        result.update(errorType=type(error).__name__,error=str(error),failedStage=result['steps'].get('stage','identity-archives-Home-preflight'))
        try:result['partial']=p.read()
        except Exception as observation_error:result['partialReadError']=type(observation_error).__name__
        try:g.screen(prefix+'-partial')
        except Exception as capture_error:result['partialCaptureError']=type(capture_error).__name__
    finally:
        g.PREFER_NATIVE=previous_geometry_preference
        result.update(elapsedSeconds=round(time.monotonic()-began,2),finishedUTC=datetime.now(timezone.utc).isoformat())
        write(prefix,'result',result)
    return result

def run_towers(prefix='final-towers'):
    def body(name,steps):
        steps['stage']='native-save-load'
        steps['save']=choose_timestamp(name,'towers','16 Nov, 14:06');steps['loaded']=f.ready_loaded(90)
        steps['stage']='standard-and-compact-Players'
        g.measure(force=True,prefer_native=True);steps['standard']=j.players_cycle(name+'-standard','offline-scenario')
        p.openpage();steps['compact']=f.compact_players(name);p.closepage()
        steps['on']=set_combat(True,'#wt-all-combat',SEEDED)
        steps['stage']='native-constructors-and-readonly-lane'
        g.tap('#wt-field-toggle');g.tap('#wt-select-trucks')
        c.wait(f.LOCK,lambda x:x and x['suspended']and sorted(x['selectedIds'])==TRUCKS,timeout=10)
        start=g.native_owned();assert sorted(x['id']for x in start['result']['trucks'])==TRUCKS
        c.evaluate("(()=>{const w="+W+";w.__qaFinalSite=null;w.__warzoneCommands.send('preview-build',{itemId:'A0ResearchFacility',x:32,y:65,session:"+json.dumps(name)+",workerIds:[160001,160003,160005,160007]}).then(r=>w.__qaFinalSite=r);return true})()")
        site=c.wait(W+'.__qaFinalSite',timeout=9);s=site.get('result')or{}
        assert site.get('ok')and(s.get('x'),s.get('y'))==(32,65)and s.get('status')=='queued'and not s.get('issued')and sorted(s.get('workers',[]))==TRUCKS,site
        tap=j.tap_validated_world_tile(32,65,site);events=[];seen=False;until=time.monotonic()+8
        steps['stage']='constructor-move-ACK';steps['move']={'start':start,'readonlySite':site,'normalTap':tap,'events':events}
        while time.monotonic()<until:
            n=g.native_owned();events.append(n)
            if any(t['order']==2 for t in n['result']['trucks']):seen=True;break
            time.sleep(.2)
        assert seen,'No actual constructor move ACK observed; do not resend'
        steps['stage']='Build-Players-return-and-completion'
        g.tap('#wt-open-build');c.wait(W+'.__warzoneCommands.report().buildOpen',timeout=6)
        p.openpage();modal=p.save(name+'-build-players',nativeCommands=True);assert not modal['commands']['buildOpen']
        p.closepage();until=time.monotonic()+25;done=False
        while time.monotonic()<until:
            n=g.native_owned();events.append(n);tr=n['result']['trucks']
            done=len(tr)==4 and all(t['order']!=2 for t in tr)and any(any(a['id']==t['id']and abs(a['x']-t['x'])+abs(a['y']-t['y'])>=2 for a in start['result']['trucks'])for t in tr)
            if done:break
            time.sleep(.3)
        steps['move']={'start':start,'readonlySite':site,'normalTap':tap,'moveACK':seen,'completed':done,'events':events};assert done
        c.wait(f.LOCK,lambda x:x and x['enabled']and not x['suspended']and sorted(x['selectedIds'])==SEEDED,timeout=9)
        steps['off']=set_combat(False,'#wt-all-combat');p.save(name+'-restored',nativeCommands=True)
        steps['fixtureDisclosure']='Original4 constructors plus previously seeded2MGs; no current seeding or army production'
    return guarded('towers',prefix,body)

def run_campaign(prefix='final-campaign'):
    def body(name,steps):
        steps['stage']='native-save-load'
        steps['save']=choose_timestamp(name,'campaign','12 Nov, 05:09');steps['loaded']=f.ready_loaded(90)
        steps['stage']='Players-known-rows-and-status'
        g.measure(force=True,prefer_native=True);p.openpage();opened=p.save(name+'-players');p.assert_clean_panel(opened);p.assert_privacy(opened)
        assert c.evaluate("getComputedStyle(document.querySelector('#warzone-campaign-status')).visibility==='hidden'")
        p.closepage();assert c.evaluate("getComputedStyle(document.querySelector('#warzone-campaign-status')).visibility==='visible'")
        steps['campaignStatusHiddenOnlyWhilePlayersOpen']=True;steps['on']=set_combat(True,'#wt-campaign-all-combat',CAMPAIGN)
        steps['standard']=j.players_cycle(name+'-standard','campaign')
        steps['stage']='existing-Design-two-IME-returns'
        g.tap('#wt-open-factory');c.wait("Boolean(document.querySelector('.wt-factory-view-tabs [data-page=design]'))",timeout=6)
        g.tap('.wt-factory-view-tabs [data-page="design"]');c.wait("Boolean(document.querySelector('#wt-design-name-button')&&!document.querySelector('#wt-design-name-button').disabled)",timeout=6)
        steps['ime1']=j.campaign_ime_cycle(name+'-ime1');steps['ime2']=j.campaign_ime_cycle(name+'-ime2')
        g.tap('[aria-label="Back to manufacturing"]');g.tap('#wt-open-factory');c.wait(W+'.__warzoneCommands.report().page',lambda x:x=='',timeout=7)
        steps['stage']='actual-native-position-and-movement'
        start=g.native_owned();units=start['result']['selectedUnits'];assert sorted(x['id']for x in units)==CAMPAIGN
        assert all(11<=u['x']<=17 and 47<=u['y']<=54 for u in units),'Known save lane is not near actual current combat positions; stop before tap'
        projection=j.project_visible_tile(14,53);assert projection['hitFrame']and projection['z']==0,projection
        geometry=g.measure();l,t,r,b=geometry['bounds'];v=geometry['css'];frame=projection['frame']
        x=l+(frame['left']+projection['p']['x'])*(r-l)/v['width'];y=t+(frame['top']+projection['p']['y'])*(b-t)/v['height']
        assert l<=x<r and t<=y<b;d.adb('shell','input','tap',str(round(x)),str(round(y)))
        events=[];seen=False;changed=False;until=time.monotonic()+18
        steps['movement']={'start':start,'target':[14,53],'projection':projection,'geometry':geometry,'physicalTap':[x,y],'events':events}
        while time.monotonic()<until:
            n=g.native_owned();events.append(n);now=n['result']['selectedUnits'];seen=seen or any(u['order']==2 for u in now)
            changed=any(any(a['id']==u['id']and abs(a['x']-u['x'])+abs(a['y']-u['y'])>=1 for a in units)for u in now)
            if seen and changed:break
            time.sleep(.25)
        steps['movement']={'start':start,'target':[14,53],'projection':projection,'geometry':geometry,'physicalTap':[x,y],'nativeMoveACK':seen,'positionsChanged':changed,'events':events,'targetEvidence':'Known same saved-map movement lane; actual nearby native positions/ray/height validated. No constructor building-site predicate used.'};assert seen and changed
        p.save(name+'-post-ime-move',nativeCommands=True);steps['off']=set_combat(False,'#wt-campaign-all-combat')
    return guarded('campaign',prefix,body)

def run_ffa(prefix='final-ffa'):
    def body(name,steps):
        steps['stage']='native-save-load'
        steps['save']=choose_timestamp(name,'ffa','12 Nov, 15:15');steps['loaded']=f.ready_loaded(90)
        steps['stage']='four-row-Players-privacy-and-compact'
        g.measure(force=True,prefer_native=True);p.openpage();out=p.save(name+'-players');p.assert_clean_panel(out);p.assert_privacy(out)
        assert out['native']['mode']=='offline-skirmish'and len(out['native']['players'])==4
        assert 161319 in lock()['combatIds'];columns=out['tables'][0]['columns']
        for row in out['native']['players']:
            if row['relationship']=='opponent':
                rendered=next(r for r in out['rows']if r['playerId']==str(row['id']))
                assert all(rendered['cells'][columns.index(key)-1]=='—'for key in ('UNITS','STRUCTURES','POWER'))
        p.closepage();steps['standard']=j.players_cycle(name+'-standard','offline-skirmish')
        p.openpage();steps['compact']=f.compact_players(name);p.closepage()
        steps['stage']='ordinary-Factory-ACK-birth-during-Players'
        steps['ordinaryONBirth']=f.birth(name+'-on',True,80);steps['offDeselect']=set_combat(False,'#wt-all-combat')
        p.save(name+'-off-restored',nativeCommands=True);steps['fixtureDisclosure']='Original unmodified checkpoint; one ordinary factory production; no script spawn/army setup'
    return guarded('ffa',prefix,body)
