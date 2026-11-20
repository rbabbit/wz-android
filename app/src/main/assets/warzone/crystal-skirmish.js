/* Install the bundled Centerpede preset before the native FFA map registry loads. */
(() => {
  'use strict';
  const payload = window.WarzoneCrystalMap;
  const map = payload.map;
  function select(catalogue, requestedMap) {
    if (requestedMap === map.id) catalogue.push(map);
  }
  function install(module, config) {
    if (config.map !== map.id) return;
    const fs = module.FS;
    const maps = '/data/mp/multiplay/maps/';
    fs.mkdirTree(maps + map.mapDirectory);
    for (const [path, raw] of Object.entries(payload.files)) {
      fs.writeFile(maps + path, Uint8Array.from(atob(raw), byte => byte.charCodeAt(0)));
    }
    const registration = '/data/mp/addon.lev';
    fs.writeFile(registration, fs.readFile(registration, {encoding:'utf8'}) + '\n' + payload.registration);
    fs.writeFile('/data/mp/tests/ffa-' + map.id + '-easy.json', JSON.stringify(payload.challenge));
    for (const folder of ['script', 'script/rules', 'skirmish']) {
      const path = '/data/mp/multiplay/' + folder + '/ffa-maps.json';
      const catalogue = JSON.parse(fs.readFile(path, {encoding:'utf8'}));
      catalogue.maps.push(map);
      fs.writeFile(path, JSON.stringify(catalogue));
    }
    const rules = '/data/mp/multiplay/script/rules/init.js';
    const source = fs.readFile(rules, {encoding:'utf8'});
    const telemetry = 'vtol:false, alliancesType:alliancesType';
    if (!source.includes(telemetry)) throw new Error('Crystal Skirmish telemetry is unavailable.');
    fs.writeFile(rules, source.replace(telemetry, 'techLevel:getMultiTechLevel(), ' + telemetry));
  }
  window.WarzoneCrystalSkirmish = Object.freeze({map, select, install});
})();
