"""Make the app's focused replay view from the verified pinned upstream sources."""
from pathlib import Path
from hashlib import sha256
import re,json,difflib,shutil
ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
OUT=ROOT/'app/src/main/assets/hub/replay'
PIN='dcaf96520aa47f7a71160cae33da32e5ece1d5f0'
def one(text,old,new):
    assert text.count(old)==1,(old[:100],text.count(old))
    return text.replace(old,new,1)
def function(text,start,end,replacement):
    a=text.index(start);b=text.index(end,a)
    return text[:a]+replacement+'\n\n'+text[b:]
def main():
    original=(HERE/'upstream/replay-analyzer.js').read_text()
    js=original
    js=one(js,'(function () {','''/* Adapted for Warzone Towers' focused replay viewer. Upstream MIT notice in LICENSE. */
(function () {
  let replayDisposed = false;
  let replayLifecyclePaused = document.hidden;
  let replayResumeOnVisible = false;
  const replayRequests = new Set();
  const replayErrors = [];
  async function replayFetch(input, options = {}) {
    if (replayDisposed) throw new DOMException("Replay closed", "AbortError");
    const remote = new URL(String(input), document.baseURI);
    const isRemote = remote.origin !== location.origin;
    const requestURL = isRemote
      ? new URL("/hub-replay-data?url=" + encodeURIComponent(remote.href), location.origin).href
      : remote.href;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, isRemote ? 45000 : 20000);
    replayRequests.add(controller);
    try {
      return await fetch(requestURL, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      replayRequests.delete(controller);
      options.signal?.removeEventListener("abort", abort);
    }
  }
''')
    # Route only the upstream renderer's fetch calls; local model modules remain unmodified.
    offset=js.index('  const wzstatsPublishedUrl')
    js=js[:offset]+re.sub(r'\bfetch\(', 'replayFetch(', js[offset:])
    js=one(js,'new URL("stats/published/matches.json", document.baseURI)','new URL("https://maway2000.github.io/boha/stats/published/matches.json")')
    js=one(js,'new URL("stats/published/wavehoster.json", document.baseURI)','new URL("https://maway2000.github.io/boha/stats/published/wavehoster.json")')
    # Hub matches are Retropaganda URLs. Resolve their real identity once and use
    # the verified stored WZrp copy: some originals are genuinely Brotli encoded,
    # while others were served with a misleading compression header.
    a=js.index('    let match = null;',js.index('  async function loadWzstatsResult('))
    b=js.index('    let detailMatch = null;',a)
    js=js[:a]+'''    let match = appReplayMatch;
    if (!match) {
      const index = await appPublishedIndex();
      match = index.matches.find(item => (
        (replaySha256 && item.replay_sha256 === replaySha256)
        || (replayId && String(item.source_match_id) === String(replayId))
      ));
    }
    if (!match) return null;

'''+js[b:]
    js=function(js,'  async function loadReplay() {','  async function analyzeReplay(','''  let appPublishedIndexPromise = null;
  let appReplayMatch = null;
  const appSharedIndex = (() => {
    try {
      const owner = parent !== window && parent.location.origin === location.origin ? parent : window;
      return owner.__warzoneReplayIndexCache ||= { data: null, expires: 0, pending: null };
    } catch (_) { return { data: null, expires: 0, pending: null }; }
  })();
  async function appPublishedIndex() {
    if (appSharedIndex.data && appSharedIndex.expires > Date.now()) return appSharedIndex.data;
    if (appSharedIndex.pending) return appSharedIndex.pending;
    if (!appPublishedIndexPromise) {
      appPublishedIndexPromise = (async () => {
        const response = await replayFetch(wzstatsPublishedUrl, { cache: "no-store" });
        if (!response.ok) throw new Error("The replay list could not be loaded. Please try again.");
        const index = await response.json();
        if (!Array.isArray(index.matches)) throw new Error("The replay list is unavailable.");
        // Keep only real identity fields needed by later replay opens, not the
        // much larger leaderboard/player statistics payload.
        const data = { matches: index.matches.map(item => ({ id: item.id,
          source_match_id: item.source_match_id, replay_sha256: item.replay_sha256,
          replay_url: item.replay_url, started_at: item.started_at, ended_at: item.ended_at })) };
        appSharedIndex.data = data;
        appSharedIndex.expires = Date.now() + 300000;
        return data;
      })().catch(error => {
        if (appSharedIndex.pending === appPublishedIndexPromise) appSharedIndex.pending = null;
        appPublishedIndexPromise = null;
        throw error;
      }).finally(() => {
        if (appSharedIndex.pending === appPublishedIndexPromise) appSharedIndex.pending = null;
      });
      appSharedIndex.pending = appPublishedIndexPromise;
    }
    return appPublishedIndexPromise;
  }
  async function loadReplay() {
    latestReplayId = "";
    latestReplaySha256 = "";
    appReplayMatch = null;
    const value = replayUrl.value.trim();
    const url = new URL(value);
    if (url.origin !== "https://warzone2100.retropaganda.info"
        || !/^\\/replays\\/\\d{10,}\\.wzrp$/.test(url.pathname)
        || url.search || url.hash) {
      throw new Error("This replay link is not supported.");
    }
    latestReplayId = extractReplayId(url.href);
    setStatus("Finding replay…");
    const index = await appPublishedIndex();
    const match = index.matches.find(item => String(item.source_match_id) === latestReplayId);
    if (!match || !Number.isSafeInteger(Number(match.id)) || Number(match.id) <= 0
        || !/^[a-f0-9]{64}$/.test(match.replay_sha256 || "")) {
      throw new Error("Replay view is not available for this match yet.");
    }
    appReplayMatch = match;
    setStatus("Loading replay…");
    const response = await replayFetch(`https://desktop-0467j9q.tail41fd3a.ts.net/wzstats/api/v1/replays/${match.replay_sha256}`);
    if (!response.ok) throw new Error("The replay could not be downloaded. Please try again.");
    const bytes = await response.arrayBuffer();
    const actualSHA256 = await calculateReplaySha256(bytes);
    if (actualSHA256 !== match.replay_sha256) throw new Error("The replay identity could not be verified.");
    latestReplaySha256 = actualSHA256;
    return bytes;
  }''')
    # Keep the real telemetry/terrain/model rendering path, without constructing analytics UI.
    js=one(js,'    populateBattlefieldLegend(extraction);\n    renderBattlefieldMomentum(extraction);','    // The app viewer deliberately has no player tables or momentum graph.')
    js=function(js,'  function renderExtendedAnalysis(extraction) {','  function appendOption(','''  function renderExtendedAnalysis(extraction) {
    const tacticalReplay = extraction.engineAnalysis?.extended?.tacticalReplay;
    const frames = Array.isArray(tacticalReplay?.positionFrames) ? tacticalReplay.positionFrames : [];
    const supported = Boolean(extraction.battlefieldPreviewSupported && frames.some(frame => !frame.eventsOnly));
    battlefieldPanel.classList.toggle("is-unsupported", !supported);
    battlefieldPanel.hidden = false;
    if (supported) {
      renderBattlefield(extraction, tacticalReplay, true);
    } else {
      stopBattlefieldPlayback();
      resetBattlefield3dReplay();
      battlefieldFrames = [];
      battlefieldExtraction = null;
      battlefieldTerrain = null;
      battlefieldUnsupported.textContent = "Replay view is unavailable for this match.";
      battlefieldStatus.textContent = extraction.battlefieldPreviewError || "Battlefield telemetry unavailable";
    }
  }''')
    js=function(js,'  function renderExtraction(extraction) {','  function setStatus(','''  function renderExtraction(extraction) {
    renderExtendedAnalysis(extraction);
    results.hidden = false;
  }''')
    js=one(js,'  function startBattlefieldPlayback() {','  function startBattlefieldPlayback() {\n    if (replayDisposed) return;\n    if (replayLifecyclePaused) { replayResumeOnVisible = true; return; }')
    js=one(js,'  function drawBattlefield() {','  function drawBattlefield() {\n    if (replayDisposed || replayLifecyclePaused) return;')
    # Hidden analytics are not updated as frames advance.
    name=re.search(r'  function updateBattlefieldPlayerStats\([^\n]*\) \{',js).group()
    js=one(js,name,name+'\n    return; // No statistics panel in the app viewer.\n')
    js=one(js,'  function setStatus(message, isError = false) {','  function setStatus(message, isError = false) {\n    if (replayDisposed) return;\n    if (isError) replayErrors.push(String(message));')
    # Parent activity pauses while backgrounded, and removes this iframe on Back.
    lifecycle=(HERE/'viewer-lifecycle.js').read_text()
    assert js.endswith('})();\n')
    js=js[:-len('})();\n')]+lifecycle+'\n})();\n'
    (OUT/'renderer.js').write_text(js)
    html=(HERE/'upstream/replay-analyzer.html').read_text()
    body=re.search(r'<body[^>]*>([\s\S]*)</body>',html).group(1)
    body=re.sub(r'<script\b[\s\S]*?</script>','',body)
    # All upstream compatibility nodes stay inert and outside the visible player.
    out='''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="referrer" content="no-referrer"><title>Replay</title><link rel="stylesheet" href="viewer.css"></head>
<body><div id="compatibility" hidden inert aria-hidden="true">'''+body+'''</div>
<script src="viewer-layout.js"></script><script src="stats/replay-telemetry.js"></script><script src="renderer.js"></script></body></html>
'''
    (OUT/'index.html').write_text(out)
    (HERE/'upstream-renderer.patch').write_text(''.join(difflib.unified_diff(original.splitlines(True),js.splitlines(True),fromfile='upstream/replay-analyzer.js',tofile='app/src/main/assets/hub/replay/renderer.js')))
    (OUT/'NOTICE.txt').write_text('''Warzone Towers focused replay viewer

Adapted from MaWay2000/boha by MM, pinned source commit '''+PIN+'''.
https://github.com/MaWay2000/boha
The upstream web code is MIT licensed; see LICENSE and mapmaker/LICENSE.
Adaptations: focused battlefield layout; native allowlisted data proxy; lifecycle
pause/dispose and read-only QA report. Raw replay parsing, real telemetry-derived
positions, map terrain, Three.js models and camera/playback retain upstream logic.
Hidden inert compatibility DOM is retained; analytics UI is not rendered or shown.

Warzone 2100 game data/models/textures retain upstream provenance and licenses.
See COPYING.WARZONE, COPYING.WARZONE.README and assets/vendor/warzone-effects/.
Three.js is MIT licensed; see mapmaker/js/THREE-LICENSE.txt.
No third-party accounts or credentials are bundled. Replays require online raw
replay data and compatible processed replay telemetry; unsupported matches are
reported as unavailable, never replaced by invented or simulated footage.
''')
    shutil.copyfile(ROOT/'vendor/engine/COPYING',OUT/'COPYING.WARZONE')
    shutil.copyfile(ROOT/'vendor/engine/COPYING.README',OUT/'COPYING.WARZONE.README')
    shutil.copyfile(OUT/'assets/vendor/three-r149/LICENSE',OUT/'mapmaker/js/THREE-LICENSE.txt')
    manifest={'commit':PIN,'adaptedFiles':{p.name:sha256(p.read_bytes()).hexdigest()for p in [OUT/'index.html',OUT/'renderer.js',OUT/'viewer.css',OUT/'viewer-layout.js']},'analyticsVisible':False,'analyticsRenderingRemoved':True}
    (HERE/'viewer-adaptation.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps(manifest,indent=2))
if __name__=='__main__':main()
