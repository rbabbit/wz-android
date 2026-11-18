  // App integration: read-only observation and lifecycle control, no game-state mutation.
  let replayBootTimedOut = false;
  const replayBootTimeout = setTimeout(() => {
    if (replayDisposed || (!analysisRunning && !battlefield3dLoading)) return;
    replayBootTimedOut = true;
    replayRequests.forEach(request => request.abort());
    stopBattlefieldPlayback();
    setStatus("Replay loading timed out. Please try again.", true);
  }, 90000);

  function pauseReplay() {
    if (replayDisposed || replayLifecyclePaused) return;
    replayResumeOnVisible = battlefieldPlaying || battlefield3dResumeAfterLoading;
    replayLifecyclePaused = true;
    stopBattlefieldPlayback();
  }

  function resumeReplay() {
    if (replayDisposed || !replayLifecyclePaused) return;
    replayLifecyclePaused = false;
    if (replayResumeOnVisible) {
      replayResumeOnVisible = false;
      autoplayBattlefieldWhenReady();
    }
    drawBattlefield();
  }

  function disposeReplay() {
    if (replayDisposed) return;
    replayDisposed = true;
    clearTimeout(replayBootTimeout);
    // A removed iframe must never leave its aborted Promise in the parent Hub.
    if (appSharedIndex.pending === appPublishedIndexPromise) appSharedIndex.pending = null;
    replayRequests.forEach(request => request.abort());
    replayRequests.clear();
    stopBattlefieldPlayback();
    battlefield3dResumeAfterLoading = false;
    battlefieldSpriteBufferGeneration += 1;
    if (battlefield3dLoadingHideTimer) clearTimeout(battlefield3dLoadingHideTimer);
    const disposed = new Set();
    const disposeOnce = value => {
      if (!value || disposed.has(value)) return;
      disposed.add(value);
      value.dispose?.();
    };
    battlefield3d?.scene?.traverse?.(object => {
      disposeOnce(object.geometry);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.filter(Boolean).forEach(material => {
        Object.values(material).filter(value => value?.isTexture).forEach(disposeOnce);
        disposeOnce(material);
      });
    });
    resetBattlefield3dReplay();
    battlefield3d?.renderer?.dispose?.();
    battlefield3d?.renderer?.forceContextLoss?.();
    battlefieldModelLibraryPromise?.then(library => {
      library.renderer?.dispose?.();
      library.renderer?.forceContextLoss?.();
    }).catch(() => {});
    battlefieldFrames = [];
    battlefieldExtraction = null;
    latestExtraction = null;
    document.documentElement.classList.remove("replay-battlefield-scroll-lock");
    document.getElementById("replayLoadOverlay")?.remove();
  }

  function replayReport() {
    const canvas = battlefield3dIsActive() ? battlefield3dCanvas : battlefieldCanvas;
    const rect = canvas?.getBoundingClientRect();
    const frame = battlefieldFrames.length ? battlefieldFramePair(battlefieldCurrentTime).current : null;
    return {
      version: 95,
      sourceCommit: "dcaf96520aa47f7a71160cae33da32e5ece1d5f0",
      ready: Boolean(battlefieldFrames.length && !analysisRunning && !replayDisposed),
      supported: Boolean(battlefieldFrames.length),
      disposed: replayDisposed,
      lifecyclePaused: replayLifecyclePaused,
      loading: analysisRunning || battlefield3dLoading,
      timedOut: replayBootTimedOut,
      playing: battlefieldPlaying,
      time: battlefieldCurrentTime,
      duration: Number(battlefieldRange.max),
      speed: battlefieldPlaybackSpeed(),
      view: battlefieldViewMode.value,
      active3d: battlefield3dIsActive(),
      presented3d: Boolean(battlefield3d?.hasPresentedFrame),
      frames: battlefieldFrames.length,
      visibleFrame: frame ? { time: frame.time, droids: frame.droids?.length || 0, structures: frame.structures?.length || 0 } : null,
      modelDefinitions: { droids: battlefieldDroidDefinitions.size, structures: battlefieldStructureDefinitions.size },
      models: battlefield3d?.prototypes?.size || 0,
      objects: battlefield3d?.objects?.size || 0,
      terrain: Boolean(battlefieldTerrain),
      terrainTiles: Boolean(battlefieldTerrain?.tileCanvas),
      camera: { ...battlefieldView },
      canvas: rect ? { width: rect.width, height: rect.height, pixelWidth: canvas.width, pixelHeight: canvas.height } : null,
      pendingRequests: replayRequests.size,
      sourceReplay: latestReplayId,
      sourceSHA256: latestReplaySha256,
      status: status.textContent,
      errors: replayErrors.slice(-10),
      analyticsVisible: false,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }
    };
  }

  window.WarzoneReplay = Object.freeze({ report: replayReport, pause: pauseReplay, resume: resumeReplay, dispose: disposeReplay });
  window.HubReplay = window.WarzoneReplay;
  window.addEventListener("warzone-hub-pause", pauseReplay);
  window.addEventListener("warzone-hub-resume", resumeReplay);
  window.addEventListener("pagehide", disposeReplay, { once: true });
  document.addEventListener("visibilitychange", () => document.hidden ? pauseReplay() : resumeReplay());
  document.getElementById("replayRetry")?.addEventListener("click", () => location.reload());
