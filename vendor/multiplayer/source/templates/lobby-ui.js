/* Official 4.7 NetLobby JSON-Lines listing; joining stays in the stock engine. */
(() => {
  'use strict';
  const endpoint = 'https://wzlobby.wz2100.net/lobby/api/v1/games';
  const expectedNetcode = [16384, 104];
  let loading = false;

  function playerCounts(value) {
    if (!value || !Number.isInteger(value.max) || value.max < 0 || value.max > 1024) return null;
    const current = value.cur === undefined ? null : value.cur;
    if (current !== null && (!Number.isInteger(current) || current < 0 || current > value.max)) return null;
    return { current, max: value.max };
  }

  function parseListings(text) {
    if (typeof text !== 'string' || text.length > 4 * 1024 * 1024) throw Error('Invalid lobby response');
    const games = [];
    let motd = '', rejected = 0;
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let item;
      try { item = JSON.parse(line); } catch { rejected++; continue; }
      if (!item || Array.isArray(item) || typeof item !== 'object') { rejected++; continue; }
      if (item.type === 'header') {
        if (typeof item.motd === 'string' && !motd) motd = item.motd;
        continue;
      }
      const players = playerCounts(item.players);
      if (typeof item.id !== 'string' || !item.id || item.id.length > 256 || /[\s\u0000-\u001f]/.test(item.id)
          || typeof item.name !== 'string' || typeof item.v !== 'string' || !players
          || !Array.isArray(item.netv) || item.netv.length !== 2 || !item.netv.every(Number.isInteger)
          || !Array.isArray(item.conn) || !item.conn.every(value => typeof value === 'string')) {
        rejected++; continue;
      }
      const compatible = /^4\.7\.0(?:$|[\s+-])/.test(item.v)
        && item.netv.every((value, index) => value === expectedNetcode[index]);
      const ipv4Tcp = item.conn.includes('tcp:ip4');
      const open = players.max > 0 && (players.current === null || players.current < players.max);
      games.push({ id: item.id, name: item.name, version: item.v, map: typeof item.map === 'string' ? item.map : '', players, connections: item.conn,
        private: item.private === true, compatible, ipv4Tcp,
        joinable: compatible && ipv4Tcp && open,
        unavailable: !compatible ? 'Different engine version' : !ipv4Tcp ? 'IPv4 TCP unavailable' : !open ? 'Room full' : '' });
      if (games.length === 1000) break;
    }
    if (!games.length && rejected) throw Error('Unrecognized lobby response');
    return { games, motd, rejected };
  }

  function renderRooms(target, games) {
    target.replaceChildren();
    if (!games.length) {
      target.textContent = 'No public rooms are currently listed. You can still join a PC host directly below.';
      return;
    }
    for (const game of games) {
      const row = document.createElement('div');
      row.className = 'room';
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 0';
      const details = document.createElement('div');
      details.style.cssText = 'flex:1;min-width:0;overflow-wrap:anywhere';
      const name = document.createElement('strong');
      name.textContent = game.name || 'Unnamed room';
      const meta = document.createElement('small');
      meta.style.cssText = 'display:block;margin-top:3px';
      meta.textContent = game.version + ' · ' + (game.players.current === null
        ? 'Up to ' + game.players.max + ' players' : game.players.current + '/' + game.players.max + ' players')
        + (game.map ? ' · ' + game.map : '') + (game.private ? ' · Password' : '');
      const join = document.createElement('button');
      join.type = 'button';
      join.textContent = game.joinable ? 'Join' : game.unavailable;
      join.disabled = !game.joinable;
      join.style.cssText = 'flex:none;font-size:12px;max-width:170px;white-space:normal';
      join.addEventListener('click', () => {
        if (!game.joinable || typeof globalThis.start !== 'function') return;
        join.disabled = true;
        globalThis.start(['--lobbyjoin=' + game.id, '--window',
          '--resolution=' + innerWidth + 'x' + innerHeight, '--noshadows']);
      });
      details.append(name, meta);
      row.append(details, join);
      target.append(row);
    }
  }

  async function refreshPcLobby() {
    if (loading) return;
    const button = document.querySelector('#lobby');
    const state = document.querySelector('#lobby-status');
    const rooms = document.querySelector('#rooms');
    if (!button || !state || !rooms) return;
    loading = true;
    button.disabled = true;
    state.textContent = 'Loading…';
    rooms.replaceChildren();
    let timer;
    try {
      const response = await Promise.race([
        fetch(endpoint, { headers: {
          Accept: 'application/jsonl',
          'User-Agent': 'Warzone2100/4.7.0 (+https://github.com/Warzone2100/warzone2100)',
          Origin: 'wz2100://wz2100.net',
          Referer: 'https://github.com/Warzone2100/warzone2100?wz_internal=list'
        } }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Request timed out')), 20000); })
      ]);
      if (!response.ok) throw Error('HTTP ' + response.status);
      const result = parseListings(await response.text());
      globalThis.pcLobbyResponse = result;
      renderRooms(rooms, result.games);
      state.textContent = result.games.length + (result.games.length === 1 ? ' room' : ' rooms');
    } catch (error) {
      state.textContent = 'PC lobby unavailable';
      rooms.textContent = 'Could not retrieve public rooms (' + error.message
        + '). Use “Join PC host” below for a direct connection.';
      console.warn('PC lobby list unavailable:', error.message);
    } finally {
      clearTimeout(timer);
      loading = false;
      button.disabled = false;
    }
  }

  globalThis.refreshPcLobby = refreshPcLobby;
  globalThis.PcLobbyUi = Object.freeze({ parseListings });
  if (typeof document !== 'undefined') {
    const wire = () => { const button = document.querySelector('#lobby'); if (button) { button.onclick = refreshPcLobby; refreshPcLobby(); } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire, { once: true });
    else wire();
  }
})();
