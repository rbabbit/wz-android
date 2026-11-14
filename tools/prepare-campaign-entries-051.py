"""Build separate Campaign HTML entries from current layout; keep Towers exact."""
from pathlib import Path
from hashlib import sha256
import json,re
ROOT=Path(__file__).resolve().parents[1];ASSETS=ROOT/'app/src/main/assets/warzone'
def rep(s,a,b):
    assert s.count(a)==1,a[:90]
    return s.replace(a,b,1)
def main():
    original=(ASSETS/'index.html').read_bytes();s=original.decode()
    s=rep(s,'<head>','<head>\n    <script>window.__warzoneCampaignMode=true;</script>')
    s=s.replace('    <script src="levels/runtime.js"></script>\n','').replace('    <script src="music-catalog.js"></script>\n','').replace('    <script src="music-loader.js"></script>\n','')
    s=rep(s,"return '/warzone2100' + WZ_CONFIG_DIR_SUFFIX;","return '/warzone2100-campaign' + WZ_CONFIG_DIR_SUFFIX;")
    s=rep(s,"+ 'autosaveEnabled=false\\n'","+ 'autosaveEnabled=true\\n'")
    s=rep(s,"const musicConfig = 'music_enabled=' + (window.WarzoneMusic?.enabled ? '1' : '0') + '\\n' + audioLevels;","const musicConfig = 'music_enabled=1\\n' + audioLevels;")
    s=s.replace("            if (window.WarzoneMusic?.applySelection(Module, configDir) === false) return;\n",'')
    s=s.replace("      Module['preRun'].push(module => window.WarzoneMusic.prepare(module));\n",'')
    s=rep(s,"Module['preRun'].push(module => module.FS.writeFile('/tmp/warzone-towers-ui-v34', '1'));",
      "Module['preRun'].push(module => { module.FS.writeFile('/tmp/warzone-campaign-mobile-v51','1'); try { module.FS.unlink('/tmp/warzone-towers-ui-v34'); } catch (_) {} });")
    s=rep(s,"function blockNightPrepareCustomMapDirectory(Module) {","function blockNightPrepareCustomMapDirectory(Module) {\n        Module.FS_createPath('/', 'data/base/script/campaign/mobile', true, true);")
    start=s.index("      const towerMap = new URLSearchParams(location.search).get('map');")
    end=s.index('      // END TOWERS 0.19 LEVEL ARGUMENT',start)+len('      // END TOWERS 0.19 LEVEL ARGUMENT')
    s=s[:start]+"      Module.arguments.push('--game=CAM_1A');"+s[end:]
    # Campaign demolition shares its own VFS directory and never the mp rules.
    s=rep(s,"const path = '/data/mp/multiplay/script/rules/warzone-towers-demolition-intent.json';","const path = '/data/base/script/campaign/mobile/warzone-towers-demolition-intent.json';")
    s=rep(s,"module.FS.mkdirTree('/data/mp/multiplay/script/rules');","module.FS.mkdirTree('/data/base/script/campaign/mobile');")
    # The campaign package owns all eight mobile seed files. Creating one in
    # preRun before its package slice arrives makes Emscripten mknod fail with
    # EEXIST. Only directories and non-preloaded /tmp markers belong here.
    s,count=re.subn(r"      function blockNightPrepareDemolitionIntent\(module\) \{.*?      Module\['preRun'\]\.push\(blockNightPrepareDemolitionIntent\);\n",'',s,flags=re.S)
    assert count==1
    s=rep(s,'src="warzone2100.js"','src="warzone2100-campaign.js"')
    s=rep(s,"try { window.__warzoneTowersWaves?.engineExited?.(); } catch (_) {}","try { window.__warzoneCampaign?.engineExited?.(); } catch (_) {}")
    (ASSETS/'index-campaign.html').write_text(s,encoding='utf-8',newline='\n')
    mobile=(ASSETS/'mobile.html').read_text(encoding='utf-8')
    mobile=rep(mobile,'<title>Warzone Towers</title>','<title>Warzone Campaign</title>\n  <script>window.__warzoneCampaignMode=true;</script>')
    mobile=rep(mobile,'"index.html" + location.search','"index-campaign.html" + location.search')
    (ASSETS/'mobile-campaign.html').write_text(mobile,encoding='utf-8',newline='\n')
    assert (ASSETS/'index.html').read_bytes()==original
    assert 'WarzoneMusic' not in s and '--skirmish=' not in s
    assert "writeFile('/tmp/warzone-towers-ui-v34'" not in s
    print('isolated campaign entries prepared; Towers index unchanged')
if __name__=='__main__':main()
