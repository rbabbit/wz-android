"""Inert bounded spectator Economy observer. Root invokes observe(); no input is issued."""
import math,re,time,json
import control as c
import playersqa as players
import qa092 as q

def formatted(value,suffix='',rate=False):
    if isinstance(value,(int,float))and not isinstance(value,bool)and math.isfinite(value):
        number=math.floor(value*100+.5)/100
        text=format(number,'.15g')
        return ('+'if rate and value>0 else'')+text+suffix
    if isinstance(value,str)and re.fullmatch(r'[+-]?\d+(?:\.\d+)?',value):return value+suffix
    return '—'

def expected_rows(packet,columns):
    rows=[]
    keys={'POWER':'power','RATE':'powerRate','LOST':'powerLost','WON':'powerWon','LAB USE':'labUsePercent','KILLS':'kills','UNITS':'units'}
    assert columns==['PLAYER','POWER','RATE','LOST','WON','LAB USE','KILLS','UNITS'],columns
    for row in packet['players']:
        data=row.get('observerDetails');assert isinstance(data,dict),row
        cells=[formatted(data.get(keys[col]),'%'if col=='LAB USE'else'',col=='RATE')for col in columns[1:]]
        rows.append({'playerId':row['id'],'name':row['name'],'cells':cells,'host':row.get('host',False)})
    return rows

def rendered_rows(out):
    return [{'name':row['name'],'cells':row['cells']}for row in out['rows']]

def observe(prefix='64b-spectator-live-history',seconds=4.0,max_age_seconds=2.0):
    """Read-only packets/DOM for~4s. Writes one new proof; never opens/taps/refreshes."""
    assert re.fullmatch(r'[A-Za-z0-9_-]+',prefix)
    assert 2<=seconds<=5 and 0<max_age_seconds<=2
    assert not(c.ROOT/(prefix+'.json')).exists(),'Preserve existing observer history'
    began=time.monotonic();history=[];changes=[];signature=None;error=None;identity=None
    try:
        while time.monotonic()-began<seconds and len(history)<100:
            started=time.monotonic();out=players.read();ended=time.monotonic()
            native=out['native'];report=out['report']
            assert report['open']and report['ready']and report['tab']=='details'and report['detailTab']=='economy',report
            assert native['ready']and native['viewer']['role']=='spectator'and native['capabilities']['fullSpectatorStats']
            assert not native['viewer']['canIssueOrders']and not native['viewer']['ownsViewedPlayer']
            context=(native['context'],report['context'],native['viewer']['realPlayer'],native['viewer']['viewedPlayer'])
            if identity is None:identity=context
            assert context==identity,{'contextChanged':context,'before':identity}
            assert len(out['tables'])==1
            columns=out['tables'][0]['columns'];expected=expected_rows(native,columns);rendered=rendered_rows(out)
            current=json.dumps(rendered,sort_keys=True)
            if current!=signature:
                changes.append({'elapsedSeconds':ended-began,'rendered':rendered});signature=current
            history.append({'elapsedSeconds':ended-began,'readDurationMs':round((ended-started)*1000,3),
                            'context':list(context),'native':native,'columns':columns,'expectedFormattedRows':expected,'renderedRows':rendered})
            time.sleep(.05)
    except Exception as caught:error={'type':type(caught).__name__,'message':str(caught)}
    result={'passed':False,'scope':'Observed spectator Economy DOM/native telemetry only; not physical paint or gameplay input',
            'configuredSourcePollMs':150,'sourcePollNote':'warzone-command-pages.js final setInterval150ms; actual data repaint may be held after input/focus and need not follow every native frame',
            'requestedObservationSeconds':seconds,'maxNativeObservationAgeSeconds':max_age_seconds,'context':list(identity)if identity else None,
            'samples':history,'renderedChanges':changes,'error':error,'ownedCommandsIssued':False,'UIInputIssued':False}
    if history:
        last=history[-1];final=last['renderedRows'];matches=[]
        for sample in history:
            age=last['elapsedSeconds']-sample['elapsedSeconds']
            if age>max_age_seconds:continue
            expected=[{'name':r['name'],'cells':r['cells']}for r in sample['expectedFormattedRows']]
            if expected==final:matches.append({'ageSeconds':age,'observedAtSeconds':sample['elapsedSeconds'],'nativeFrame':sample['native']['frame'],'nativeRealTime':sample['native']['realTime'],'nativeGameTime':sample['native']['gameTime']})
        first=history[0];host=next((r['name']for r in first['expectedFormattedRows']if r['host']),None)
        power_index=first['columns'].index('POWER')-1
        def power(rows):return next((r['cells'][power_index]for r in rows if r['name']==host),None)
        first_power=power(first['renderedRows']);last_power=power(final)
        clock_advanced=last['native']['gameTime']>first['native']['gameTime']and last['native']['realTime']>first['native']['realTime']
        host_power_advanced=host is not None and first_power is not None and last_power is not None and float(last_power)>float(first_power)
        intervals=[round((b['elapsedSeconds']-a['elapsedSeconds'])*1000,3)for a,b in zip(changes,changes[1:])]
        result.update(finalDOMMatchesRecentSameContextNativePackets=matches,nativeGameAndRealClockAdvanced=clock_advanced,
                      actualDisplayedHostPowerAdvanced=host_power_advanced,hostName=host,firstDisplayedHostPower=first_power,lastDisplayedHostPower=last_power,
                      observedRenderedDataChangeIntervalsMs=intervals,
                      observedIntervalNote='Wall intervals between sampled DOM value changes, with RPC/sampling latency; these are not asserted to be the exact configured poll period',
                      elapsedSeconds=round(time.monotonic()-began,3))
        result['passed']=error is None and bool(matches)and clock_advanced and host_power_advanced
    return q.write(prefix,result)
