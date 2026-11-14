/* Configure the native join flow with the same base URL as the PC client. */
(() => {
  'use strict';
  const address = 'https://wzlobby.wz2100.net/lobby';
  function update(text) {
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    let section = '', general = -1, nextSection = -1;
    for (let i = 0; i < lines.length; i++) {
      const heading = lines[i].match(/^\s*\[([^\]]+)\]\s*$/);
      if (heading) {
        if (section === 'General' && nextSection < 0) nextSection = i;
        section = heading[1];
        if (section === 'General') general = i;
      }
      if (section === 'General' && /^\s*lobbyserver\s*=/i.test(lines[i])) {
        lines[i] = 'lobbyserver=' + address;
      }
    }
    if (general < 0) lines.push('[General]', 'lobbyserver=' + address);
    else {
      const end = nextSection < 0 ? lines.length : nextSection;
      if (!lines.slice(general + 1, end).some(line => /^\s*lobbyserver\s*=/i.test(line))) {
        lines.splice(general + 1, 0, 'lobbyserver=' + address);
      }
    }
    return lines.join('\n').replace(/\n*$/, '\n');
  }
  function apply(fs, dir) {
    const path = dir + '/config';
    let text = '';
    try { text = fs.readFile(path, {encoding:'utf8'}); } catch (error) {
      if (fs.analyzePath(path).exists) throw error;
    }
    fs.writeFile(path, update(text));
  }
  globalThis.PcLobbyConfig = Object.freeze({address, update, apply});
})();
