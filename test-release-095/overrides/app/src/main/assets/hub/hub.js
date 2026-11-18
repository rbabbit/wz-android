(function () {
  'use strict';
  const el = id => document.getElementById(id);
  const main = el('hub-main'), status = el('hub-status'), search = el('hub-search');
  const tabs = {results: el('tab-results'), rankings: el('tab-rankings')};
  const boards = el('hub-boards'), pagination = el('hub-pagination');
  const previous = el('hub-previous'), next = el('hub-next'), pageCount = el('hub-page-count');
  const refresh = el('hub-refresh');
  const PAGE_SIZE = 30;
  let worker = null, sequence = 0, queryId = 0, disposed = false, paused = false;
  let waitingForLoad = true, searchTimer = 0, lastResult = null, lastPartialQueryAt = 0;
  let state = {status: 'loading', summary: {complete: false}};
  let route = {view: 'results', board: 'global', search: '', offset: 0};
  const history = [];
  let replayFrame = null, replayTrigger = null, activeReplayUrl = '';

  function trustedReplay(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || url.hash) return null;
      if (url.hostname === 'warzone2100.retropaganda.info' && /^\/replays\/[0-9]{10,20}\.wzrp$/.test(url.pathname) && !url.search) return url.href;
      if (url.hostname === 'desktop-0467j9q.tail41fd3a.ts.net' && /^\/wzstats\/api\/v1\/replays\/[a-f0-9]{64}$/.test(url.pathname) && !url.search) return url.href;
    } catch (_) {}
    return null;
  }
  function replayLifecycle(name) {
    try { replayFrame?.contentWindow?.dispatchEvent(new Event(name)); } catch (_) {}
  }
  function closeReplay(restoreFocus = true) {
    if (!replayFrame) return false;
    const frame = replayFrame; replayFrame = null; activeReplayUrl = '';
    try { frame.contentWindow?.WarzoneReplay?.dispose?.(); } catch (_) {}
    frame.remove(); document.body.classList.remove('hub-replay-open');
    if (restoreFocus && replayTrigger?.isConnected) replayTrigger.focus({preventScroll: true});
    replayTrigger = null; return true;
  }
  function watchReplay(value, trigger) {
    const replay = trustedReplay(value);
    if (!replay || disposed || paused || replayFrame) return;
    replayTrigger = trigger; activeReplayUrl = replay;
    const frame = document.createElement('iframe');
    frame.id = 'hub-replay-frame'; frame.title = 'Battlefield replay'; frame.className = 'hub-replay-frame';
    frame.setAttribute('allow', 'fullscreen'); frame.setAttribute('allowfullscreen', '');
    frame.src = 'replay/index.html?replay=' + encodeURIComponent(replay);
    frame.addEventListener('load', () => { if (paused) replayLifecycle('warzone-hub-pause'); });
    replayFrame = frame; document.body.classList.add('hub-replay-open'); document.body.append(frame);
  }

  function node(tag, className, text) {
    const value = document.createElement(tag);
    if (className) value.className = className;
    if (text !== undefined && text !== null) value.textContent = String(text);
    return value;
  }
  function button(text, className, action) {
    const value = node('button', className, text);
    value.type = 'button';
    if (action) value.addEventListener('click', action);
    return value;
  }
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const number = value => finite(value) ? Math.round(value).toLocaleString() : '—';
  function duration(value) {
    if (!finite(value) || value < 0) return '—';
    const minutes = Math.floor(value / 60000);
    return minutes >= 60 ? Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0') : minutes + 'm';
  }
  function date(value, full) {
    if (!finite(value) && typeof value !== 'string') return 'Date unavailable';
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return 'Date unavailable';
    return parsed.toLocaleString(undefined, full
      ? {year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'}
      : {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});
  }
  function percent(value) {
    return finite(value) && value >= 0 ? Math.round(value * 100) + '%' : '—';
  }
  function researchValue(value) { return value && value.researchRecorded === true ? value.researchRatio : null; }
  function players(match) { return Array.isArray(match && match.players) ? match.players : []; }
  function playerCount(match) {
    return finite(match.playerCount) ? match.playerCount : players(match).filter(p => p.outcome !== 'spectator').length;
  }
  function outcome(player) {
    switch (player.outcome) {
      case 'winner': return 'Winner';
      case 'loser': return 'Defeated';
      case 'contender': return 'Contender';
      case 'spectator': return 'Spectator';
      default: return 'Not recorded';
    }
  }
  function rootView() { return route.view === 'rankings' || history.some(r => r.view === 'rankings') ? 'rankings' : 'results'; }
  function send(type, values) {
    if (!worker || disposed || paused) return 0;
    const requestId = ++sequence;
    worker.postMessage(Object.assign({type, requestId}, values || {}));
    return requestId;
  }
  function syncChrome() {
    const detail = route.view === 'match' || route.view === 'player';
    const view = rootView();
    Object.entries(tabs).forEach(([key, tab]) => tab.setAttribute('aria-pressed', String(key === view)));
    search.closest('label').hidden = detail;
    boards.hidden = detail || view !== 'rankings';
    document.querySelector('.hub-tools').hidden = detail;
    if (!detail) search.value = route.search || '';
    for (const b of boards.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.board === route.board));
    search.placeholder = view === 'rankings' ? 'Find a player' : 'Find a player or map';
  }
  function showStatus() {
    const summary = state.summary || {}, progress = state.progress || {};
    const statusName = state.status || 'loading';
    refresh.dataset.loading = String(statusName === 'loading');
    refresh.setAttribute('aria-label', statusName === 'loading' ? 'Restart game information sync' : 'Refresh game information');
    let text;
    if (statusName === 'loading') {
      const count = finite(progress.records) ? progress.records : summary.gameCount;
      text = 'Syncing' + (finite(count) ? ' · ' + number(count) + ' games' : ' game information') + '…';
      if (summary.complete) text += ' Saved results available.';
    } else if (statusName === 'offline') {
      text = 'Offline · ' + (summary.complete || finite(summary.gameCount) && summary.gameCount > 0 ? 'saved data' : 'no saved data');
      if (summary.lastUpdated) text += ' · ' + date(summary.lastUpdated, false);
    } else if (statusName === 'error') {
      text = String(state.message || state.error || 'Could not load game information. Refresh to try again.');
    } else if (statusName === 'cancelled') {
      text = 'Sync paused · refresh to continue';
    } else {
      text = (finite(summary.gameCount) ? number(summary.gameCount) + ' games' : 'Game information ready');
      if (finite(summary.playerCount)) text += ' · ' + number(summary.playerCount) + ' players';
      if (summary.lastUpdated) text += ' · ' + date(summary.lastUpdated, false);
      if (!summary.complete) text += ' · partial history';
    }
    if (state.cacheWarning) text += ' · ' + String(state.cacheWarning);
    status.textContent = text;
  }
  function empty(title, message, retry) {
    main.replaceChildren();
    const box = node('section', 'empty-state');
    box.append(node('h2', '', title), node('p', '', message));
    if (retry) box.append(button('Refresh', '', load));
    main.append(box);
    pagination.hidden = true;
  }
  function heading(labels, className) {
    const row = node('div', 'column-heading ' + className);
    labels.forEach((label, i) => row.append(node('span', i >= (className === 'rankings-heading' ? 2 : 1) ? 'numeric' : '', label)));
    return row;
  }
  function fact(value, hint) {
    const box = node('div', 'row-fact');
    box.append(node('b', '', value));
    if (hint) box.append(node('small', '', hint));
    return box;
  }
  function resultRow(match) {
    const row = node('article', 'result-row');
    row.dataset.matchId = String(match.id || '');
    const open = button('', 'row-main', () => openMatch(match));
    const names = players(match).filter(p => p.outcome !== 'spectator').map(p => p.name || 'Unnamed player');
    open.append(node('strong', '', match.mapName || 'Unknown map'), node('span', 'row-subtitle',
      date(match.endDate || match.startDate, false) + (names.length ? ' · ' + names.join(', ') : '')));
    open.setAttribute('aria-label', 'Match on ' + (match.mapName || 'unknown map') + ', ' + date(match.endDate || match.startDate, true));
    row.append(open, fact(duration(match.duration)), fact(number(playerCount(match))));
    return row;
  }
  function rankingRow(player) {
    const row = node('article', 'ranking-row');
    row.dataset.playerId = String(player.id || '');
    const open = button('', 'player-link', () => openPlayer(player.id));
    open.append(node('strong', '', player.name || 'Unnamed player'));
    if (player.bot) open.append(node('span', 'row-subtitle', 'Bot'));
    row.append(node('span', 'rank-number', finite(player.rank) ? '#' + player.rank : '—'), open,
      fact(finite(player.rating) ? Math.round(player.rating).toLocaleString() : '—', player.eligible === false ? 'unrated' : ''),
      fact(number(player.games)));
    return row;
  }
  function updatePagination(total, count) {
    const offset = route.offset || 0;
    pagination.hidden = !count && !offset;
    previous.disabled = offset === 0;
    next.disabled = !finite(total) || offset + count >= total;
    pageCount.textContent = count ? (offset + 1).toLocaleString() + '–' + (offset + count).toLocaleString()
      + (finite(total) ? ' of ' + number(total) : '') : 'No results';
  }
  function renderRows(response) {
    const items = Array.isArray(response.items) ? response.items : [];
    if (route.view === 'rankings' && !(state.summary || {}).complete) {
      empty('Rankings need a complete history', 'The first sync is still running. Results remain available while it finishes.');
      return;
    }
    if (!items.length) {
      const isSearching = Boolean(route.search);
      if (state.status === 'loading' && !isSearching) empty('Syncing game information', 'Results will appear as the data arrives.');
      else if (state.status === 'error' || state.status === 'offline' && !(state.summary || {}).gameCount) {
        empty('Game information unavailable', 'There is no saved history to show. Connect to the internet and refresh.', true);
      } else empty(isSearching ? 'No matches found' : route.view === 'rankings' ? 'No ranked players yet' : 'No results yet',
        isSearching ? 'Try a different player or map name.' : 'Refresh later to check for completed games.');
      return;
    }
    main.replaceChildren(heading(route.view === 'rankings' ? ['Rank', 'Player', 'Rating', 'Games'] : ['Map / players', 'Length', 'Players'],
      route.view === 'rankings' ? 'rankings-heading' : 'results-heading'));
    for (const item of items) main.append(route.view === 'rankings' ? rankingRow(item) : resultRow(item));
    updatePagination(response.total, items.length);
  }
  function detailHeading(title, breadcrumb) {
    main.replaceChildren();
    pagination.hidden = true;
    const top = node('div', 'detail-toolbar');
    top.append(node('h2', '', title));
    main.append(top);
    const meta = node('div', 'detail-meta');
    if (breadcrumb) meta.append(node('span', '', breadcrumb));
    main.append(meta);
    return meta;
  }
  function renderMatch(match) {
    if (!match) { empty('Match unavailable', 'This result could not be found in the saved history.'); return; }
    const meta = detailHeading(match.mapName || 'Unknown map', 'Match result');
    [date(match.endDate || match.startDate, true), duration(match.duration), number(playerCount(match)) + ' players', match.version ? 'Warzone ' + match.version : '']
      .filter(Boolean).forEach(value => meta.append(node('span', '', value)));
    const replay = trustedReplay(match.replayUrl);
    const watch = button('Watch Replay', 'watch-replay', () => watchReplay(replay, watch));
    watch.disabled = !replay;
    watch.setAttribute('aria-label', replay ? 'Watch this match replay' : 'Replay unavailable for this match');
    const replayActions = node('div', 'replay-actions'); replayActions.append(watch);
    if (!replay) replayActions.append(node('span', 'replay-unavailable', 'Replay unavailable for this match.'));
    main.append(replayActions);
    main.append(node('h3', 'detail-heading', 'Players'));
    for (const player of players(match)) {
      const row = node('article', 'detail-player');
      const open = button('', 'player-link', () => openPlayer(player.id));
      open.disabled = !player.id;
      open.append(node('strong', '', player.name || 'Unnamed player'));
      const labels = [player.bot ? 'Bot' : '', finite(player.team) ? 'Team ' + (player.team + 1) : '', player.earlyQuit ? 'Left early' : ''].filter(Boolean);
      if (labels.length) open.append(node('span', 'row-subtitle', labels.join(' · ')));
      const research = node('div', 'research-stat');
      research.append(node('b', '', percent(researchValue(player))), node('span', '', 'research'));
      row.append(open, node('span', 'outcome' + (player.outcome ? '' : ' muted'), outcome(player)), research);
      main.append(row);
    }
    if (match.valid === false) main.append(node('p', 'detail-note', match.ratingReason || 'This game was not counted for ratings.'));
    main.append(node('p', 'detail-note', 'Research activity comes from the public match data. Missing values are shown as —.'));
  }
  function renderPlayer(response) {
    const player = response.player;
    if (!player) { empty('Player unavailable', 'This player could not be found in the selected history.'); return; }
    detailHeading(player.name || 'Unnamed player', 'Player history');
    const stats = node('dl', 'player-stats');
    for (const [label, value] of [['Rating', finite(player.rating) ? Math.round(player.rating).toLocaleString() : '—'],
      ['Games', number(player.games)], ['Wins', number(player.wins)], ['Losses', number(player.losses)],
      ['Draws', number(player.draws)], ['Research', percent(researchValue(player))]]) {
      const stat = node('div'); stat.append(node('dt', '', label), node('dd', '', value)); stats.append(stat);
    }
    main.append(stats);
    if (player.eligible === false) main.append(node('p', 'detail-note', 'This account is not eligible for a rating in this leaderboard.'));
    main.append(node('h3', 'detail-heading', 'Recent matches'));
    const items = Array.isArray(response.items) ? response.items : [];
    if (!items.length) main.append(node('p', 'detail-note', 'No recent matches found.'));
    else {
      const list = node('section', 'detail-history');
      for (const match of items) list.append(resultRow(match));
      main.append(list); updatePagination(response.total, items.length);
    }
  }
  function query(resetScroll) {
    if (disposed || paused) return;
    syncChrome();
    queryId = send('query', {view: route.view, board: route.board || 'global', search: route.search || '',
      offset: route.offset || 0, limit: PAGE_SIZE, playerId: route.view === 'player' ? route.id : undefined,
      matchId: route.view === 'match' ? route.id : undefined});
    if (resetScroll) main.scrollTop = 0;
  }
  function showRoot(view) {
    clearTimeout(searchTimer);
    history.length = 0;
    route = {view, board: route.board || 'global', search: '', offset: 0};
    lastResult = null;
    query(true);
  }
  function openMatch(match) {
    history.push(Object.assign({}, route));
    route = {view: 'match', id: match.id, board: route.board || 'global', offset: 0};
    syncChrome(); renderMatch(match); main.scrollTop = 0;
    if (match.id) query(false);
  }
  function openPlayer(id) {
    if (!id) return;
    history.push(Object.assign({}, route));
    route = {view: 'player', id, board: route.board || 'global', offset: 0};
    empty('Loading player history', 'Reading saved game information…');
    query(true);
  }
  function back() {
    if (closeReplay()) return true;
    if (!history.length) return false;
    route = history.pop();
    lastResult = null;
    query(true);
    return true;
  }
  function onMessage(event) {
    if (disposed || paused || !event || !event.data) return;
    const message = event.data;
    if (message.type === 'state') {
      const prior = state.summary || {}, summary = message.summary || prior;
      const newSnapshot = summary.complete !== prior.complete || summary.lastUpdated !== prior.lastUpdated;
      state = Object.assign({}, state, message);
      showStatus();
      if ((message.status === 'ready' || message.status === 'offline') && (waitingForLoad || newSnapshot)) {
        waitingForLoad = false; query(false);
      } else if (message.status === 'error' && waitingForLoad) {
        waitingForLoad = false;
        if (summary.gameCount > 0) query(false);
        else if (!lastResult) empty('Could not load game information', 'Check your connection and refresh to try again.', true);
      } else if (message.status === 'loading' && route.view === 'results' && summary.gameCount > 0
          && Date.now() - lastPartialQueryAt >= 1000) {
        lastPartialQueryAt = Date.now(); query(false);
      }
      return;
    }
    if (message.type === 'error') {
      if (message.requestId && message.requestId !== queryId) return;
      empty('Game information unavailable', String(message.message || message.error || 'Refresh to try again.'), true);
      return;
    }
    if (message.type !== 'result' || message.requestId !== queryId) return;
    lastResult = message;
    if (route.view === 'match') renderMatch(message.match);
    else if (route.view === 'player') renderPlayer(message);
    else renderRows(message);
  }
  function startWorker() {
    try {
      worker = new Worker('hub-worker.js');
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', () => {
        if (disposed || paused) return;
        state.status = 'error'; state.message = 'Game information could not start.'; showStatus();
        empty('Game information unavailable', 'Refresh to try loading the saved history again.', true);
      });
      return true;
    } catch (_) {
      state.status = 'error'; state.message = 'Game information could not start.'; showStatus();
      empty('Game information unavailable', 'Refresh to try again.', true);
      return false;
    }
  }
  function load() {
    if (disposed || paused) return;
    const freshWorker = !worker;
    if (freshWorker && !startWorker()) return;
    waitingForLoad = true;
    state.status = 'loading'; showStatus();
    send(freshWorker || !lastResult ? 'load' : 'refresh');
  }
  function pause() {
    if (disposed || paused) return;
    clearTimeout(searchTimer);
    replayLifecycle('warzone-hub-pause');
    send('cancel');
    paused = true;
    if (worker) { worker.terminate(); worker = null; }
  }
  function resume() {
    if (disposed || !paused) return;
    paused = false; replayLifecycle('warzone-hub-resume'); load();
  }
  function dispose() {
    if (disposed) return;
    pause(); closeReplay(false); disposed = true;
  }
  tabs.results.addEventListener('click', () => showRoot('results'));
  tabs.rankings.addEventListener('click', () => showRoot('rankings'));
  refresh.addEventListener('click', load);
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { route.search = search.value.trim(); route.offset = 0; query(true); }, 180);
  });
  for (const b of boards.querySelectorAll('button')) b.addEventListener('click', () => {
    route.board = b.dataset.board; route.offset = 0; query(true);
  });
  previous.addEventListener('click', () => { route.offset = Math.max(0, (route.offset || 0) - PAGE_SIZE); query(true); });
  next.addEventListener('click', () => { route.offset = (route.offset || 0) + PAGE_SIZE; query(true); });
  addEventListener('warzone-hub-pause', pause);
  addEventListener('warzone-hub-resume', resume);
  addEventListener('pagehide', dispose);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else resume(); });
  window.WarzoneHub = Object.freeze({back, dispose, pause, resume,
    report: () => ({view: route.view, board: route.board, search: route.search || '', offset: route.offset || 0, historyDepth: history.length,
      replayActive: Boolean(replayFrame), replayUrl: activeReplayUrl,
      status: state.status, paused, disposed, workerActive: Boolean(worker), requestId: queryId,
      summary: {complete: Boolean((state.summary || {}).complete), gameCount: (state.summary || {}).gameCount,
        playerCount: (state.summary || {}).playerCount, cached: Boolean((state.summary || {}).cached)}})});
  syncChrome(); empty('Loading game information', 'Reading saved results and checking for updates…'); load();
}());
