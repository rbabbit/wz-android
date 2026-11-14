"""Check additive campaign packaging, native policy gates and script contracts."""
from pathlib import Path
from hashlib import sha256
import importlib.util,json,re,subprocess
ROOT=Path(__file__).resolve().parents[1];A=ROOT/'app/src/main/assets/warzone';O=ROOT/'archive/native-campaign-0.51'
spec=importlib.util.spec_from_file_location('runtime',ROOT/'tools/integrate-native-runtime.py');runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)
def h(b):return sha256(b).hexdigest()
def load(name):
    js=(A/(name+'.js')).read_text(encoding='utf-8');data=(A/(name+'.data')).read_bytes();meta=runtime.package_call(js)[3]
    runtime.verify_index(meta,data)
    return js,data,{r['filename']:r for r in meta['files']}
def read(data,table,name):r=table[name];return data[int(r['start']):int(r['end'])]
def main():
    base,bd,bt=load('warzone2100');campaign,cd,ct=load('warzone2100-campaign')
    missions=[n for n in bt if re.fullmatch(r'/data/base/script/campaign/cam[^/]+\.js',n)]
    assert len(missions)==52 and cd.startswith(bd)
    same=0
    for name in bt:
        original=read(bd,bt,name);new=read(cd,ct,name)
        if name in missions:
            assert new.startswith(original)
            assert new[len(original):].startswith(b'\n// Mobile campaign bridge (append-only v0.51).\n')
            assert new[len(original):].count(b'include("script/campaign/mobile/campaign-bridge.js")')==1
        else:assert new==original,name;same+=1
    additions=set(ct)-set(bt)
    assert len(additions)==8 and all(n.startswith('/data/base/script/campaign/mobile/') for n in additions)
    bridge=read(cd,ct,'/data/base/script/campaign/mobile/campaign-bridge.js').decode()
    assert 'includeJSON("warzone-towers-' not in bridge
    assert "includeJSON('warzone-towers-" not in bridge
    assert not re.search(r'(?m)^event\w+\s*=',bridge)
    assert 'Spawner.' not in bridge and 'function warzoneTowersDiagnosticSnapshot' not in bridge
    assert 'campaignSelectCombat()' in bridge and 'BNCAMPAIGN:' in bridge
    assert 'campmobile_eventStartLevel' in bridge and 'campmobile_eventGameLoaded' in bridge
    assert 'warzone2100-campaign.data' in campaign and 'text.includes("BNCAMPAIGN")' in campaign
    entry=(A/'index-campaign.html').read_text();host=(A/'mobile-campaign.html').read_text()
    assert '__warzoneCampaignMode=true' in entry and '__warzoneCampaignMode=true' in host
    assert "'/warzone2100-campaign'" in entry and '--game=CAM_1A' in entry and '--skirmish=' not in entry
    assert "autosaveEnabled=true" in entry and 'music-loader.js' not in entry
    assert "writeFile('/tmp/warzone-towers-ui-v34'" not in entry
    assert "writeFile('/tmp/warzone-campaign-mobile-v51'" in entry
    assert 'blockNightPrepareDemolitionIntent' not in entry
    # Every payload file is created by Emscripten's preloader. Early host
    # writes must be outside that table, even if analyzePath initially fails.
    literal_writes=re.findall(r"FS\.writeFile\(['\"]([^'\"]+)['\"]",entry)
    assert not set(literal_writes)&set(ct), 'Host preRun creates a preloaded file'
    assert 'src="warzone2100-campaign.js"' in entry
    native=json.loads((O/'native-build.json').read_text());assert native['passed'] and native['otherObjectsUnchanged']==340 and native['executableLinks']==1
    s=(O/'main.cpp').read_text();assert 'campaignMobileStartup() && game.type == LEVEL_TYPE::CAMPAIGN' in s
    assert 'queuedTilecodeChange = TITLECODE_STARTGAME' in s and 'cam1/c001.ogg' in s
    q=(O/'quickjs_backend.cpp').read_text();assert 'control.value("suspended",true)' in q and 'DS_BY_TYPE,DST_ALL_COMBAT,false' in q
    assert 'if (!state.value("worldSafe",false)) return JS_FALSE' in q
    native_hci=(O/'hci.cpp').read_text();assert 'playing && !video && !paused && !menu' in native_hci
    radar_proof=O/'radar-native-build.json'
    if radar_proof.exists():
        radar=json.loads(radar_proof.read_text());assert radar['passed'] and len(radar['compiledObjects'])==2 and radar['otherObjectsUnchanged']==342
        radar_source=(O/'radar-radar.cpp').read_text();radar_hci=(O/'radar-hci.cpp').read_text()
        for field in ['visible','centerX','centerY','width','height','rotation','inverseCos','inverseSin','viewportWidth','viewportHeight']:
            assert '{"'+field+'",' in radar_source,field
        assert '!loop_GetVideoStatus() && !gameUpdatePaused()' in radar_source
        assert '{"radar",nlohmann::json::parse(campaignMobileRadarStateJSON())}' in radar_hci
        assert digest_file(O/'radar-source-overlay.json')==radar['sourceOverlaySHA256']
    intel_proof=O/'intel-native-build.json'
    if intel_proof.exists():
        intel=json.loads(intel_proof.read_text());assert intel['passed'] and intel['widgetSourceUnmodified'] and intel['otherObjectsUnchanged']==343
        caller=(O/'intel-hci.cpp').read_text();a=caller.index('void addIntelScreen()\n{');b=caller.index('//sets up the Transporter Screen',a);body=caller[a:b]
        assert 'if (!campaignMobileEnabled() || widgGetFromID(psWScreen, IDRET_INTEL_MAP) != nullptr)' in body
        assert body.index('intMode = INT_INTELMAP')<body.index('widgGetFromID')<body.index('(void)intAddIntelMap()')
        assert digest_file(O/'intel-source-overlay.json')==intel['sourceOverlaySHA256']
    selection_proof=O/'selection-native-build.json'
    if selection_proof.exists():
        selection=json.loads(selection_proof.read_text());assert selection['passed'] and selection['otherObjectsUnchanged']==343
        native_selection=(O/'selection-quickjs_backend.cpp').read_text();a=native_selection.index('static unsigned campaignReconcileCombatSelection()');b=native_selection.index('static JSValue campaignSelectCombatJS',a);body=native_selection[a:b]
        assert 'if (droid->selected != eligible)' in body and 'if (changed)' in body
        assert 'triggerEventSelected();' in body and 'selDroidSelection(' not in body and 'orderDroid' not in body
        assert digest_file(O/'selection-source-overlay.json')==selection['sourceOverlaySHA256']
    integration=json.loads((O/'native-payload.json').read_text());assert integration['frozenTowersDataUnchanged']
    assert h(bd)==integration['previous']['warzone2100.data']
    result={'version':'0.51','passed':True,'originalMissionBodiesPreserved':52,'unchangedOtherVirtualFiles':same,'addedMobileFiles':8,'nativeObjects':4,'otherNativeObjectsUnchanged':340,'campaignRadarObservationChecked':radar_proof.exists(),'towersVFSAndDataPreserved':True,'campaignNativePolicyIsolated':True,'scriptNamespaceContractsChecked':True,'emulatorUsedByThisCheck':False,'gameplayVerifiedByThisCheck':False}
    (O/'campaign-checks.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps(result))
def digest_file(path):return sha256(path.read_bytes()).hexdigest()
if __name__=='__main__':main()
