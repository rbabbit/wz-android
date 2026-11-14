"""Resolve stable native research IDs to existing stock artwork; no game data edits."""
from hashlib import sha256
from pathlib import Path
import json
import runpy
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'app/src/main/assets/warzone'
HELPER = ROOT / 'app/src/main/assets/warzone/ui/research-art.js'
CATALOG = ROOT / 'archive/research-art-catalog-0.47.json'

# Explicit aliases are tied to native research identities. Never guess live
# display-name filenames, transliterations or similar-looking weapon images.
ALIASES = {
    'R-Comp-CommandTurret02': 'Command Turret II.gif',
    'R-Cyborg-Hvywpn-HPV': 'Super HPV Cyborg.gif',
    'R-Defense-AASite-QuadBof': 'AA Flak Cannon Emplacement.gif',
    'R-Defense-EMPCannon': 'EMP Cannon Tower.gif',
    'R-Defense-Pillbox01': 'Machinegun Bunker.gif',
    'R-Defense-Tower01': 'Machinegun Guard Tower.gif',
    'R-Defense-WallTower-DoubleAAgun': 'AA Flak Cannon Hardpoint.gif',
    'R-Struc-RprFac-Upgrade06': 'Advanced Repair Facility .gif',
    'R-Sys-Sensor-UpLink': 'Satellite Uplink Centre.gif',
    'R-Sys-Spade1Mk1': 'Engineering.gif',
    'R-Wpn-AAGun01': 'AA Flak Cannon.gif',
    'R-Wpn-Energy-ROF01': 'Thermopole Energiser.gif',
    'R-Wpn-Energy-ROF02': 'Thermopole Energiser Mk2.gif',
    'R-Wpn-Energy-ROF03': 'Thermopole Energiser Mk3.gif',
    'R-Wpn-MG-Damage09': 'Depleted Uranium MG Bullets.gif',
    'R-Wpn-MG-Damage10': 'Depleted Uranium MG Bullets.gif',
}

TEMPLATE = r'''/* Stable research artwork generated from the packaged native statistics.
 * Original images retain their colour. A missing image gets an honest neutral
 * research symbol, never a laboratory/weapon presented as the researched item.
 */
(() => {
  'use strict';
  if (window.WarzoneResearchArt) return;
  const entries = __CATALOG__;
  const genericUrl = '/warzone/ui/icons/question.svg';
  const labUrl = '/warzone/build-icons/A0ResearchFacility.png';
  const idFor = topic => typeof topic === 'string' ? topic : String(topic?.id || '');
  const entryFor = topic => entries[idFor(topic)] || null;
  const url = topic => entryFor(topic)?.url || genericUrl;
  function decorate(image, generic) {
    // Keep the original black question artwork readable on normal AND selected
    // rows. The neutral backing applies only to this generic icon, never stock
    // research thumbnails or native model previews.
    for (const [property, value] of Object.entries({
      background: '#dddddd', filter: 'none', padding: '6px',
      'box-sizing': 'border-box', 'object-fit': 'contain', 'border-radius': '3px'
    })) {
      if (generic) image.style.setProperty(property, value, 'important');
      else image.style.removeProperty(property);
    }
    image.dataset.researchArtGeneric = String(generic);
  }
  function applySource(image, source) {
    if (!image) return;
    const same = image.dataset.researchArtSource === source;
    if (!same) {
      image.dataset.researchArtSource = source;
      delete image.dataset.researchArtFailed;
    }
    const failed = image.dataset.researchArtFailed === 'true';
    const shown = failed ? genericUrl : source;
    decorate(image, shown === genericUrl);
    if (image.getAttribute('src') !== shown) image.src = shown;
    image.onerror = source === genericUrl || failed ? null : () => {
      image.onerror = null;
      image.dataset.researchArtFailed = 'true';
      decorate(image, true);
      image.src = genericUrl;
    };
  }
  window.WarzoneResearchArt = Object.freeze({
    version: 47, url, apply: (image, topic) => applySource(image, url(topic)),
    applyLab: image => applySource(image, labUrl), genericUrl, labUrl,
    // A conservative affordance only. A live Intelligence selection must also
    // verify actual native hasMessage and completed/starting-grant state.
    isReportDefinition: topic => entryFor(topic)?.reportDefinition === true
  });
})();
'''


def build_catalog():
    runtime = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'))
    script = (ASSETS / 'warzone2100.js').read_text(encoding='utf-8')
    data = (ASSETS / 'warzone2100.data').read_bytes()
    _, _, _, package = runtime['package_call'](script)
    row = next(r for r in package['files'] if r['filename'] == '/data/mp/stats/research.json')
    blob = data[row['start']:row['end']]
    stats = json.loads(blob)
    rows, entries = [], {}
    for ident, topic in stats.items():
        name = topic.get('name', ident)
        filename = ALIASES.get(ident, name + ('.png' if name == 'Avenger SAM' else '.gif'))
        exists = (ASSETS / 'research-icons' / filename).is_file()
        # Missing exact stock thumbnails stay generic; never substitute a
        # different researched item's image just to fill an empty slot.
        url = '/warzone/research-icons/' + quote(filename) if exists else '/warzone/ui/icons/question.svg'
        report = bool(topic.get('msgName')) and int(topic.get('techCode', 0)) == 0
        entries[ident] = {'url': url, 'reportDefinition': report}
        rows.append({'id': ident, 'name': name, 'statId': topic.get('statID'),
            'iconId': topic.get('iconID'), 'url': url,
            'resolution': 'explicit-alias' if ident in ALIASES else 'native-name' if exists else 'generic',
            'reportDefinition': report, 'message': topic.get('msgName')})
    return entries, {'version': '0.47', 'nativeResearchVFS': row['filename'],
        'nativeResearchSHA256': sha256(blob).hexdigest(),
        'frozenEngineDataSHA256': sha256(data).hexdigest(), 'topics': rows,
        'artworkPolicy': 'Stable native IDs; exact existing stock name or explicit alias; otherwise honest generic research symbol.',
        'emulatorUsed': False, 'nativeDataChanged': False}


def main():
    entries, catalog = build_catalog()
    HELPER.write_text(TEMPLATE.replace('__CATALOG__', json.dumps(entries, ensure_ascii=False, separators=(',', ':'))), encoding='utf-8')
    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    counts = {k: sum(r['resolution'] == k for r in catalog['topics']) for k in ('native-name', 'explicit-alias', 'generic')}
    print(json.dumps({'topics': len(entries), 'resolutionCounts': counts, 'helper': str(HELPER)}))


if __name__ == '__main__':
    main()
