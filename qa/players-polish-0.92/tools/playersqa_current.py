"""Current092 Players page contract. Importing is inert; snapshots never imply physical paint passed."""
import json
import control as c
import qa092 as q

READ=r"""(()=>{const f=document.querySelector('#warzone-game-frame'),w=f?.contentWindow;let native=null,error=null;try{native=JSON.parse(w.LaunchedModule.FS.readFile('/tmp/warzone-players-v91.json',{encoding:'utf8'}))}catch(e){error=String(e)}const rect=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {id:e.id,text:e.innerText,rect:r.toJSON(),display:s.display,visibility:s.visibility,hidden:e.hidden,color:s.color,background:s.backgroundColor,selected:e.getAttribute('aria-selected'),scrollLeft:e.scrollLeft,scrollTop:e.scrollTop,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth}};const page=document.querySelector('#wt-command-pages'),content=document.querySelector('#wt-page-content');return {url:location.pathname,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visual:visualViewport?{width:visualViewport.width,height:visualViewport.height,offsetLeft:visualViewport.offsetLeft,offsetTop:visualViewport.offsetTop}:null},report:w?.__warzoneCommands?.playersReport?.(),native,error,page:page?{...rect(page),dataset:{...page.dataset}}:null,content:content?{...rect(content),dataset:{...content.dataset}}:null,headers:[...document.querySelectorAll('#wt-page-header,#wt-command-tabs,#wt-players-close,[data-players-native],#wt-players-native-back')].map(rect),tabs:[...document.querySelectorAll('[data-players-tab],[data-players-detail]')].map(e=>({...rect(e),tab:e.dataset.playersTab,detail:e.dataset.playersDetail})),rows:[...document.querySelectorAll('.wt-players-summary,.wt-players-watcher,.wt-players-content tbody tr')].map(e=>({...rect(e),playerId:e.dataset.playerId||null,name:e.querySelector('.wt-players-name strong')?.textContent||'',badges:[...e.querySelectorAll('.wt-players-badges>*')].map(x=>x.textContent),cells:[...e.querySelectorAll('td')].map(x=>x.textContent.trim()),metrics:[...e.querySelectorAll('dl>div')].map(x=>({label:x.querySelector('dt')?.textContent,value:x.querySelector('dd')?.textContent}))})),tables:[...document.querySelectorAll('.wt-players-table-wrap')].map(e=>({...rect(e),columns:[...e.querySelectorAll('thead th')].map(x=>x.textContent.trim()),focus:document.activeElement===e})),icons:[...document.querySelectorAll('.wt-players-eye,img[src*="stack.svg"]')].map(e=>({src:e.src,complete:e.complete,naturalWidth:e.naturalWidth,naturalHeight:e.naturalHeight})),commands:w?.__warzoneCommands?.report?.(),touch:w?.__kalaWarzoneTouch?.report?.(),mp:w?.PcMultiplayerNative?.state,mpControls:w?.PcMultiplayerControls?.report?.(),frame:f?.getBoundingClientRect().toJSON()}})()"""

def read():return c.evaluate(READ)

def save(name,nativeCommands=False):
    out=read()
    if nativeCommands:out['qaNative']=q.native_owned()
    out['physicalViewport']=q.screen(name);q.write(name,out);return out

def opened(timeout=12):
    return c.wait(READ,lambda o:bool(o and (o.get('report')or{}).get('open')and o['report'].get('ready')and (o.get('native')or{}).get('ready')),timeout=timeout)

def openpage(mp=False,**legacy):
    if 'bounds'in legacy:raise RuntimeError('Fixedbounds are forbidden; measure the current WebView')
    if (read().get('report')or{}).get('open'):return opened()
    q.tap(q.global_players());return opened()

def closepage(**legacy):
    if legacy:raise RuntimeError('No old Close/bounds arguments; use the global PLAYERS toggle')
    if not(read().get('report')or{}).get('open'):return read()
    q.tap(q.global_players());return c.wait(READ,lambda o:not(o.get('report')or{}).get('open'),timeout=6)

def tab(name):
    assert name in ('participants','spectators','details')
    q.tap('[data-players-tab="'+name+'"]')
    return c.wait(READ,lambda o:o['report'].get('tab')==name and o['report'].get('ready'),timeout=6)

def detail(name):
    assert name in ('economy','upgrades')
    q.tap('[data-players-detail="'+name+'"]')
    return c.wait(READ,lambda o:o['report'].get('tab')=='details'and o['report'].get('detailTab')==name and o['report'].get('ready'),timeout=6)

def assert_privacy(out):
    n=out['native'];v=n['viewer'];full=n['capabilities']['fullSpectatorStats']
    if v['role']=='spectator':
        assert not v['canIssueOrders']and not v['ownsViewedPlayer']
        assert any(x['id']==v['realPlayer']and x['local']for x in n['spectators'])
    if not full:
        for row in n['players']:
            if row['relationship']=='opponent':
                assert all(row['stats'][key]is None for key in ('units','structures','power'))
                assert row.get('observerDetails')is None
        assert 'details'not in out['report']['availableTabs']
    return {'viewer':v,'fullSpectatorStats':full,'nativeRolePrivacyObserved':True}

def assert_clean_panel(out):
    assert out['report']['open']and out['report']['ready']and out['native']['ready']
    for e in out['headers']:
        assert e['hidden']or e['display']=='none'or e['rect']['width']==0 or e['rect']['height']==0,e
    assert out['page']['rect']['right']<=out['viewport']['width']+1
    assert all(x['naturalWidth']>0 for x in out['icons']),out['icons']
    return assert_privacy(out)

def fresh_samples(timeout=6):
    first=read();stamp=first['native']['realTime'];context=first['report']['context']
    second=c.wait(READ,lambda o:(o.get('native')or{}).get('realTime',0)>stamp and (o.get('report')or{}).get('context')==context and o['report'].get('ready'),timeout=timeout)
    return {'first':first,'second':second,'sameContext':True,'nativeTimeAdvanced':True}

def inspect_horizontal_scroll():
    before=read();assert len(before['tables'])==1,before['tables']
    motion=q.swipe('.wt-players-table-wrap');after=read()
    return {'before':before['tables'],'after':after['tables'],'input':motion,'nativeRole':after['native']['viewer']}

def observer_cells_match(out,previous_native=None):
    """Compare actual rendered cells with current/prior fresh native values, not source guesses."""
    assert out['report']['tab']=='details'and out['native']['capabilities']['fullSpectatorStats']
    native_samples=[out['native']]+([previous_native]if previous_native else[])
    columns=out['tables'][0]['columns'][1:];matches=[]
    for rendered in out['rows']:
        row_matches=[]
        for sample in native_samples:
            rows=[r for r in sample['players']if r['name']==rendered['name']]
            if len(rows)!=1:continue
            data=rows[0].get('observerDetails')or{}
            values={'POWER':data.get('power'),'RATE':data.get('powerRate'),'LOST':data.get('powerLost'),'WON':data.get('powerWon'),'LAB USE':data.get('labUsePercent'),'KILLS':data.get('kills'),'UNITS':data.get('units'),'TANK ARMOR':(data.get('kineticArmor')or{}).get('tank'),'CYBORG ARMOR':(data.get('kineticArmor')or{}).get('cyborg'),'TANK THERMAL':(data.get('thermalArmor')or{}).get('tank'),'CYBORG THERMAL':(data.get('thermalArmor')or{}).get('cyborg')}
            values.update({w['name']:w.get('grade')for w in data.get('weaponGrades',[])})
            okay=len(columns)==len(rendered['cells'])
            for header,actual in zip(columns,rendered['cells']):
                expected=values.get(header)
                if expected is None:okay=okay and actual=='—'
                else:
                    try:okay=okay and abs(float(actual.rstrip('%'))-float(expected))<=.011
                    except (ValueError,TypeError):okay=False
            if okay:row_matches.append({'playerId':rows[0]['id'],'matchedNativeRealTime':sample['realTime']})
        assert row_matches,{'renderedRowDoesNotMatchFreshNative':rendered,'columns':columns}
        matches.append({'renderedName':rendered['name'],'matches':row_matches})
    assert len(matches)==len(out['native']['players']),matches
    return {'renderedNativeCellMatches':matches,'columns':columns,'comparisonScope':'Same native sample or explicitly recorded prior advancing1Hz sample; no fabricated values'}
