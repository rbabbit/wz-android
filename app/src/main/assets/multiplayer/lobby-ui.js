/* Official 4.7 NetLobby JSON-Lines listing; joining stays in the stock engine. */
(() => {
  'use strict';
  const endpoint = 'https://wzlobby.wz2100.net/lobby/api/v1/games';
  const expectedNetcode = [16384, 104];
  const filterKey = 'mp.lobby.hide-empty.v1';
  let loading = false, listedGames = [], listingsAvailable = false, hideEmpty = false, listError = '';
  try { hideEmpty = globalThis.localStorage?.getItem(filterKey) === '1'; } catch {}
  const snapshot=()=>({loading,hideEmpty,games:listedGames,error:listError});
  const publish=()=>globalThis.PcNativeLobby?.publish?.(snapshot());

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
      games.push({ id: item.id, name: item.name, version: item.v, map: typeof item.map === 'string' ? item.map : Array.isArray(item.map) && typeof item.map[0] === 'string' ? item.map[0] : '', players, connections: item.conn,
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
      const empty = document.createElement('p');
      empty.className = 'lobby-empty';
      empty.textContent = hideEmpty && listedGames.length ? 'No occupied rooms are listed. Turn off Hide empty to see empty rooms.'
        : 'No public rooms are currently listed. You can still join a PC host directly below.';
      target.append(empty);
      return;
    }
    for (const game of games) {
      const row = document.createElement('article');
      row.className = 'room';
      row.setAttribute('role', 'listitem');
      row.dataset.roomId = game.id;
      row.dataset.current = game.players.current === null ? 'unknown' : String(game.players.current);

      const details = document.createElement('div');
      details.className = 'room-details';
      const name = document.createElement('h2');
      name.textContent = game.name || 'Unnamed room';
      name.title = game.name || 'Unnamed room';
      const flags = document.createElement('small');
      flags.className = 'room-flags';
      flags.textContent = game.version + (game.private ? ' · Password' : '');
      flags.title = flags.textContent;
      const map = document.createElement('span');
      map.className = 'room-map';
      map.textContent = game.map || '—';
      map.title = game.map || 'Map not supplied';
      const players = document.createElement('span');
      players.className = 'room-players' + (game.players.current === null ? ' unknown' : '');
      players.textContent = game.players.current === null ? 'Up to ' + game.players.max
        : game.players.current + ' / ' + game.players.max;
      players.title = game.players.current === null ? 'Capacity ' + game.players.max + '; current player count unavailable'
        : 'Advertised player slots; may include AI. Spectators are counted separately.';
      const join = document.createElement('button');
      join.type = 'button';
      join.textContent = game.joinable ? 'JOIN' : !game.compatible ? 'VERSION' : !game.ipv4Tcp ? 'NO IPv4' : 'FULL';
      join.title = game.joinable ? 'Join ' + name.textContent : game.unavailable;
      join.setAttribute('aria-label', game.joinable ? 'Join ' + name.textContent : name.textContent + ': ' + game.unavailable);
      join.disabled = !game.joinable;
      join.className = 'room-join';
      join.addEventListener('click', () => {
        if (!game.joinable || typeof globalThis.start !== 'function') return;
        const started = globalThis.start(['--lobbyjoin=' + game.id, '--window',
          '--resolution=' + innerWidth + 'x' + innerHeight, '--noshadows']);
        if (started) { join.disabled = true; join.textContent = 'JOINING…'; join.setAttribute('aria-busy', 'true'); }
      });
      details.append(name, flags);
      row.append(details, map, players, join);
      target.append(row);
    }
  }

  function selectListings(games, filterEmpty) {
    const rank = game => game.players.current === null ? 1 : game.players.current > 0 ? 0 : 2;
    return games.map((game, index) => ({ game, index }))
      .filter(({ game }) => !filterEmpty || game.players.current !== 0)
      .sort((a, b) => rank(a.game) - rank(b.game) || a.index - b.index)
      .map(({ game }) => game);
  }

  function fitRows() {
    const rooms = document.querySelector('#rooms');
    if (!rooms) return;
    const minimum = globalThis.innerWidth <= 460 ? 74 : 62;
    rooms.style.setProperty('--visible', String(Math.max(1, Math.floor(rooms.clientHeight / minimum) || 1)));
  }

  function renderCurrentRooms() {
    const rooms = document.querySelector('#rooms'), state = document.querySelector('#lobby-status');
    if (!rooms || !state) return;
    const visible = selectListings(listedGames, hideEmpty);
    renderRooms(rooms, visible);
    state.textContent = visible.length === listedGames.length ? listedGames.length + (listedGames.length === 1 ? ' room' : ' rooms')
      : visible.length + ' / ' + listedGames.length;
    state.title = visible.length + ' visible of ' + listedGames.length + ' rooms';
    rooms.scrollTop = 0;
    fitRows();
    publish();
  }

  async function refreshPcLobby() {
    if (loading) return;
    const button = document.querySelector('#lobby');
    const state = document.querySelector('#lobby-status');
    const rooms = document.querySelector('#rooms');
    if (!button || !state || !rooms) return;
    loading = true;
    listError = '';
    publish();
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
      listedGames = result.games;
      listingsAvailable = true;
      renderCurrentRooms();
    } catch (error) {
      listedGames = [];
      listingsAvailable = false;
      state.textContent = 'PC lobby unavailable';
      listError = 'Could not retrieve public rooms (' + error.message + '). Refresh to try again.';
      const message = document.createElement('p');
      message.className = 'lobby-empty';
      message.textContent = 'Could not retrieve public rooms (' + error.message
        + '). Use “Join by IP address” below for a direct connection.';
      rooms.replaceChildren();
      rooms.append(message);
      console.warn('PC lobby list unavailable:', error.message);
    } finally {
      clearTimeout(timer);
      loading = false;
      button.disabled = false;
      publish();
    }
  }

  globalThis.refreshPcLobby = refreshPcLobby;
  globalThis.PcLobbyUi = Object.freeze({ parseListings, selectListings, snapshot });
  if (typeof document !== 'undefined') {
    const wire = () => {
      const button = document.querySelector('#lobby'), filter = document.querySelector('#hide-empty'), rooms = document.querySelector('#rooms');
      if (filter) {
        filter.checked = hideEmpty;
        filter.addEventListener('change', () => {
          hideEmpty = filter.checked;
          try { globalThis.localStorage?.setItem(filterKey, hideEmpty ? '1' : '0'); } catch {}
          if (!loading && listingsAvailable) renderCurrentRooms();
          else publish();
        });
      }
      if (rooms && globalThis.ResizeObserver) new ResizeObserver(fitRows).observe(rooms);
      globalThis.addEventListener?.('resize', fitRows);
      document.fonts?.ready?.then(fitRows);
      if (button) { button.onclick = refreshPcLobby; refreshPcLobby(); }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire, { once: true });
    else wire();
  }
})();
