/*
 * Block Night / Warzone 2100 mobile RTS bridge v49.
 *
 * The official SDL WebAssembly canvas primarily consumes mouse and keyboard
 * input. This adapter keeps menu and campaign taps as mouse clicks while
 * giving phones a dedicated camera gesture:
 *
 *   tap                         native contextual select / move / attack
 *   swipe one finger            native continuous Warzone mouse-pan
 *   hold, then drag             box-select several units
 *   stationary long-press       native right click / unit orders menu
 *   pinch                       zoom (gesture-locked; never pans as well)
 *   two fingers together up/down native camera tilt, without changing heading
 *   twist two fingers            native camera rotation
 *   BOX then drag               immediate one-shot rectangle selection
 *   +Q then build               sticky native construction queue
 *
 * The stock engine remains untouched. Block Night's custom match rule handles
 * the optional absolute camera presets requested by this wrapper.
 */
(() => {
  "use strict";

  if (window.__kalaWarzoneTouch?.version >= 57) return "already-installed";

  // Android's touch-slop model: tolerate a small finger wobble, then commit
  // immediately to a movement gesture. Scale gently for high-density panels.
  const DENSITY = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const TAP_SLOP = Math.round(5 + DENSITY);
  const PAN_START = TAP_SLOP;
  const LONG_PRESS_MS = 260;
  const BOX_SELECT_START = 8;
  const MULTI_PAN_START = 11;
  const PINCH_START = 11;
  const PINCH_STEP = 14;
  const TILT_STEP = 32;
  const ROTATE_START = Math.PI / 24;
  const ROTATE_STEP = Math.PI / 60;
  const ROTATE_HANDOFF = Math.PI / 12;
  const ROTATE_TRAVEL = 4;
  const ROTATE_SETTLE_MS = 48;
  const CLICK_HOLD_MS = 8;
  const DOUBLE_TAP_MS = 290;
  const DOUBLE_TAP_SLOP = 28;
  const campaign = window.__warzoneCampaignMode === true || (typeof location !== 'undefined' && typeof URLSearchParams === 'function' && new URLSearchParams(location.search).get('mode') === 'campaign');
  const ffa = window.__warzoneFfaConfig?.mode === 'ffa';
  const ZOOM_COMMAND_PATH = (campaign ? '/data/base/script/campaign/mobile/' : '/data/mp/multiplay/script/rules/') + 'blocknight-zoom-command.json';
  const ZOOM_PRESETS = Object.freeze({
    close: Object.freeze({ label: "NEAR", distance: 1600 }),
    battle: Object.freeze({ label: "BATTLE", distance: 2600 }),
    map: Object.freeze({ label: "MAP", distance: 3600 })
  });

  const keyCodes = {
    ArrowUp: 38,
    ArrowDown: 40,
    ArrowLeft: 37,
    ArrowRight: 39
  };
  const forwardedPointers = new WeakSet();

  const state = {
    pointers: new Map(),
    primaryId: null,
    single: null,
    multi: null,
    multiMoveFrame: null,
    multiMoveTimer: null,
    rotationIntentTimer: null,
    zoomIntentTimer: null,
    panMoveFrame: null,
    panMoveTimer: null,
    panMoveGesture: null,
    panRelease: null,
    panReleaseFrame: null,
    panReleaseTimer: null,
    panDeferredPointers: [],
    panDrainingPointers: false,
    panRearms: 0,
    panUnobservedRearms: 0,
    panHeldTimeouts: 0,
    panContextResets: 0,
    panQueueOverflows: 0,
    ignoreUntilAllUp: false,
    heldKeys: new Set(),
    longTimer: null,
    mouseReleaseTimer: null,
    mouseReleaseFrame: null,
    mouseButton: null,
    clickQueue: [],
    clickJob: null,
    clickFrame: null,
    clickTimer: null,
    pointerQueue: [],
    physicalPointers: new Set(),
    replayingPointers: false,
    afterInput: [],
    nativeFrameContext: null,
    nativeFrames: 0,
    nativeMusicInput: false,
    lastNativeLeftDownAt:-Infinity,boxCadenceWaits:0,boxPressGaps:[],
    stopNonce: null,
    stopTimer: null,
    stopAcks: 0,
    stoppedUnitIds: [],
    lastX: Math.round(innerWidth / 2),
    lastY: Math.round(innerHeight / 2),
    intercepted: 0,
    mouseEvents: 0,
    taps: 0,
    orders: 0,
    pans: 0,
    panMoves: 0,
    lastPanStartLatencyMs: null,
    lastPanDispatchMs: null,
    maxPanDispatchMs: 0,
    boxSelections: 0,
    manualSelectionRevision: 0,
    facilityNavigationSerial: 0, facilityOpens: 0, lastFacility: null, facilityError: '',
    pinchSteps: 0,
    tiltMoves: 0,
    tiltKey: null,
    tiltReleaseTimer: null,
    tiltReleaseFrame: null,
    tiltBudget: 0,
    rotationMoves: 0,
    rotationSteps: 0,
    rotationKey: null,
    rotationReleaseTimer: null,
    rotationReleaseFrame: null,
    rotationBudget: 0,
    saveNames: 0,
    radarTaps: 0,
    radarDrags: 0,
    radarMoves: 0,
    cameraFacings: 0,
    cameraFacingPending: false,
    cameraHeading: null,
    cameraFacingNonce: null,
    cameraFacingError: '',
    lastRadarPoint: null,
    combatLock: false,
    autoFight: false,
    boxMode: false,
    queueMode: false,
    queueModifierHeld: false,
    stickyBuildActivations: 0,
    nativeStatsOpen: false,
    nativeObjectsOpen: false,
    selectAlls: 0,
    manualSelectAlls: 0,
    combatOrders: 0,
    patrolOrders: 0,
    queuedOrders: 0,
    stopOrders: 0,
    baseJumps: 0,
    feedbacks: 0,
    doubleTaps: 0,
    coalescedSamples: 0,
    pointerCaptures: 0,
    lastTap: null,
    hudVisible: false,
    battleActive: true,
    zoomPreset: null,
    zoomPresetSelections: 0,
    zoomWheelEvents: 0,
    zoomCommandWrites: 0,
    zoomCommandErrors: 0,
    zoomAcks: 0,
    zoomCommandSequence: 0,
    zoomPendingNonce: null,
    zoomAckTimer: null,
    lastZoomDistance: null
  };

  const canvas = () => document.getElementById("canvas");

  function commandDocument() {
    return window.parent && window.parent !== window && window.parent.WarzoneHost
      ? window.parent.document : document;
  }

  function prepareCanvas() {
    const target = canvas();
    if (!target) return false;
    target.style.touchAction = "none";
    target.style.webkitUserSelect = "none";
    target.style.userSelect = "none";
    target.style.webkitTouchCallout = "none";
    document.documentElement.style.touchAction = "none";
    document.documentElement.style.overscrollBehavior = "none";
    document.body.style.touchAction = "none";
    document.body.style.overscrollBehavior = "none";
    return true;
  }

  function capturePointer(target, pointerId) {
    try {
      target.setPointerCapture(pointerId);
      state.pointerCaptures += 1;
    } catch (_) {
      // Android WebView normally applies implicit capture for direct touch.
    }
  }

  function releasePointer(target, pointerId) {
    try {
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    } catch (_) {}
  }

  function coalesced(event) {
    let samples = [];
    try {
      samples = event.getCoalescedEvents?.() || [];
    } catch (_) {}
    if (samples.length === 0) return [event];
    const last = samples[samples.length - 1];
    if (last.clientX !== event.clientX || last.clientY !== event.clientY) {
      samples.push(event);
    }
    state.coalescedSamples += Math.max(0, samples.length - 1);
    return samples;
  }

  function own(event) {
    if(state.replayingPointers)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state.intercepted += 1;
  }

  function focusCanvas() {
    if (!state.battleActive) return false;
    const target = canvas();
    if (!target) return false;
    try {
      target.focus({ preventScroll: true });
    } catch (_) {
      target.focus();
    }
    return true;
  }

  function mouse(type, x, y, button, buttons, movementX = 0, movementY = 0) {
    if (!state.battleActive) return false;
    const target = canvas();
    if (!target || !window.PointerEvent) return false;
    if(type==='pointerdown'&&button===0)state.lastNativeLeftDownAt=performance.now();
    state.lastX = x;
    state.lastY = y;
    const forwarded = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      movementX,
      movementY,
      button,
      buttons,
      ctrlKey: state.queueModifierHeld,
      shiftKey: false,
      pressure: buttons ? 0.5 : 0
    });
    forwardedPointers.add(forwarded);
    target.dispatchEvent(forwarded);
    state.mouseEvents += 1;
    return true;
  }

  function mouseMove(x, y, buttons = 0, movementX = 0, movementY = 0) {
    return mouse("pointermove", x, y, -1, buttons, movementX, movementY);
  }

  function mouseButtonMask(button) {
    if (button === 1) return 4;
    if (button === 2) return 2;
    return 1;
  }

  function clearMouseRelease() {
    if (state.mouseReleaseFrame != null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(state.mouseReleaseFrame);
      state.mouseReleaseFrame = null;
    }
    if (state.mouseReleaseTimer !== null) {
      clearTimeout(state.mouseReleaseTimer);
      state.mouseReleaseTimer = null;
    }
  }

  function releaseMouse(x = state.lastX, y = state.lastY) {
    clearMouseRelease();
    if (state.mouseButton === null) return;
    mouse("pointerup", x, y, state.mouseButton, 0);
    state.mouseButton = null;
  }

  function observeNativeFrames() {
    const ctx=window.LaunchedModule?.ctx||window.Module?.ctx;
    if(!ctx||ctx===state.nativeFrameContext||typeof ctx.clear!=='function'||typeof ctx.getParameter!=='function'||!ctx.FRAMEBUFFER_BINDING)return;
    const original=ctx.clear;
    ctx.clear=function(mask,...args){
      let screen=false;try{screen=ctx.getParameter(ctx.FRAMEBUFFER_BINDING)===null;}catch(_){}
      const result=original.call(this,mask,...args);
      if(screen&&(mask&ctx.COLOR_BUFFER_BIT))state.nativeFrames++;
      return result;
    };
    state.nativeFrameContext=ctx;
  }
  function pendingBuildPanelClose(){
    const commands=window.__warzoneCommands;
    return Boolean(commands?.nativeClosing?.()&&commands.report?.().buildOpen);
  }
  function pendingTruckSelection(){return Boolean(window.__warzoneCommands?.report?.().selectingTrucks);}
  function pendingNativeInput(){return Boolean(state.panRelease||state.panDeferredPointers.length||state.clickJob||state.clickQueue.length||state.clickFrame!==null||state.clickTimer!==null||state.pointerQueue.length||window.__warzoneCommands?.report?.()?.nativePendingSites||pendingBuildPanelClose()||pendingTruckSelection());}
  function afterNativeInput(callback){if(!pendingNativeInput())return false;state.afterInput.push(callback);return true;}
  function flushAfterInput(){if(!pendingNativeInput())state.afterInput.splice(0).forEach(callback=>callback());}
  function pumpPointerQueue(){
    if(state.panDeferredPointers.length&&!state.pointerQueue.length){pumpPanPointerQueue();if(state.panRelease||state.panDeferredPointers.length)return;}
    if(state.panRelease||state.clickJob||state.clickQueue.length||state.clickFrame!==null||state.clickTimer!==null||window.__warzoneCommands?.report?.()?.nativePendingSites||pendingBuildPanelClose()||pendingTruckSelection())return;
    const event=state.pointerQueue.shift();
    if(!event){flushAfterInput();return;}
    state.replayingPointers=true;try{processPointer(event,true);}finally{state.replayingPointers=false;}
    if(!state.clickJob&&state.clickFrame===null&&state.clickTimer===null)clickStep(()=>{pumpClicks();pumpPointerQueue();});
  }
  function clickStep(callback,frames=1) {
    observeNativeFrames();const clock=state.nativeFrameContext,frame=state.nativeFrames;
    let complete = false;
    const finish = () => {
      if (complete) return;
      if (state.clickFrame !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(state.clickFrame);
      clearTimeout(state.clickTimer); state.clickFrame = null; state.clickTimer = null;
      // Browser animation frames can run without an engine render/input frame.
      // Hold each mouse phase until the original renderer has consumed it.
      if(clock&&clock===state.nativeFrameContext&&state.nativeFrames-frame<frames){schedule();return;}
      complete = true;
      callback();
    };
    const schedule=()=>{if(typeof requestAnimationFrame==='function'){state.clickFrame=requestAnimationFrame(finish);state.clickTimer=setTimeout(finish,50);}else state.clickTimer=setTimeout(finish,16);};schedule();
  }

  function cancelClicks() {
    if(state.battleActive&&state.clickJob?.box&&state.clickJob.down){
      // Once the native mouse is down, finish its real drag/release. Releasing
      // at the starting point would turn a cancelled selection into a move click.
      state.clickJob.cancelled=true;for(const job of state.clickQueue)job.resolve?.(false);state.clickQueue.length=0;return;
    }
    if (state.clickFrame !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(state.clickFrame);
    clearTimeout(state.clickTimer); state.clickFrame = null; state.clickTimer = null;
    for(const job of [state.clickJob,...state.clickQueue])job?.resolve?.(false);
    state.clickQueue.length = 0; state.clickJob = null;
    releaseMouse();
  }

  function setQueueModifier(down, force = false) {
    if (!force && state.queueModifierHeld === down) return;
    dispatchKey("Control", "ControlLeft", 17, down, false, down);
    state.queueModifierHeld = down;
  }

  function pumpClicks() {
    if (!state.battleActive) { cancelClicks(); return; }
    if (state.panRelease || state.clickJob || state.clickFrame !== null || state.clickTimer !== null) return;
    if(!state.clickQueue.length){pumpPointerQueue();return;}
    const job = state.clickJob = state.clickQueue.shift();
    focusCanvas(); releaseMouse(); setQueueModifier(job.ctrl, job.ctrl);
    mouseMove(job.x, job.y, 0);
    if(job.box){
      const down=()=>{
        if(state.clickJob!==job)return;
        const gap=performance.now()-state.lastNativeLeftDownAt;
        if(gap<300){waitForPress();return;}
        state.boxPressGaps.push(gap);if(state.boxPressGaps.length>20)state.boxPressGaps.shift();
        mouse('pointerdown',job.x,job.y,0,1);state.mouseButton=0;job.down=true;
        clickStep(()=>{
          if(state.clickJob!==job)return;
          mouseMove(job.right,job.bottom,1,job.right-job.x,job.bottom-job.y);
          clickStep(()=>{
            if(state.clickJob!==job)return;
            releaseMouse(job.right,job.bottom);setQueueModifier(state.queueMode);
            clickStep(()=>{state.clickJob=null;state.boxSelections++;job.resolve?.(!job.cancelled);window.dispatchEvent(new CustomEvent('warzone-native-input-finished'));pumpClicks();},2);
          });
        });
      };
      const waitForPress=()=>{
        if(state.clickJob!==job)return;
        const remaining=300-(performance.now()-state.lastNativeLeftDownAt);
        if(remaining>0){state.boxCadenceWaits++;state.clickTimer=setTimeout(()=>{state.clickTimer=null;waitForPress();},Math.ceil(remaining));return;}
        // SDL 4.7 treats every rapid LMB press as DOUBLECLICK regardless of
        // position, and that state cannot begin a drag. Wait past its 250ms
        // interval, then consume a fresh native frame before pressing again.
        clickStep(down);
      };
      waitForPress();return;
    }
    // A complete frame must update terrain picking before mouse-down. Keep
    // up/down separate too; rapid taps are FIFO, never shortened by the next tap.
    const down = () => {
      if (state.clickJob !== job) return;
      mouse("pointerdown", job.x, job.y, job.button, mouseButtonMask(job.button));
      state.mouseButton = job.button;
      clickStep(() => {
        if (state.clickJob !== job) return;
        releaseMouse(job.x, job.y);
        if (!state.queueMode && job.ctrl) setQueueModifier(false);
        clickStep(()=>{state.clickJob=null;job.resolve?.(true);window.dispatchEvent(new CustomEvent('warzone-native-input-finished'));pumpClicks();},job.ui?1:2);
      });
    };
    // Known widget coordinates do not need a terrain-picking frame before
    // mouse-down. World orders retain every existing picking/release barrier.
    if(job.ui)down();else clickStep(down);
  }

  function click(button, x = state.lastX, y = state.lastY, ctrl = state.queueModifierHeld) {
    if (!canvas() || !state.battleActive) return false;
    state.clickQueue.push({ button, x, y, ctrl }); pumpClicks();
    return true;
  }
  function nativeMenuClick(x,y,ctrl=false){
    if(!canvas()||!state.battleActive)return Promise.resolve(false);
    return new Promise(resolve=>{state.clickQueue.push({button:0,x,y,ctrl,ui:true,resolve});pumpClicks();});
  }
  function nativeWorldClick(x,y,ctrl=false,button=0){
    if(!canvas()||!state.battleActive)return Promise.resolve(false);
    return new Promise(resolve=>{state.clickQueue.push({button,x,y,ctrl,resolve});pumpClicks();});
  }

  function nativeBoxSelect(left,top,right,bottom,add=false){
    const b=canvas()?.getBoundingClientRect();
    if(!b||!state.battleActive||![left,top,right,bottom].every(Number.isFinite)||right-left<8||bottom-top<8
      ||left<b.left||top<b.top||right>b.right||bottom>b.bottom)return Promise.resolve(false);
    return new Promise(resolve=>{state.clickQueue.push({box:true,button:0,x:left,y:top,right,bottom,ctrl:add,resolve});pumpClicks();});
  }
  function campaignRadarGeometry(){
    const bounds=canvas()?.getBoundingClientRect(),radar=window.__warzoneCampaign?.report?.().nativeState?.radar;
    if(!bounds||bounds.width<=0||bounds.height<=0||radar?.visible!==true||window.__warzoneCommands?.nativeHudHidden?.())return null;
    const numbers=['centerX','centerY','width','height','inverseCos','inverseSin','viewportWidth','viewportHeight'];
    if(numbers.some(name=>typeof radar[name]!=='number'||!Number.isFinite(radar[name]))
        ||radar.width<=0||radar.height<=0||radar.viewportWidth<=0||radar.viewportHeight<=0)return null;
    const c=radar.inverseCos,s=radar.inverseSin,det=c*c+s*s;
    if(det<0.5||det>1.5)return null;
    const scaleX=bounds.width/radar.viewportWidth,scaleY=bounds.height/radar.viewportHeight;
    const corners=[];
    for(const[u,v]of[[-radar.width/2,-radar.height/2],[radar.width/2,-radar.height/2],[radar.width/2,radar.height/2],[-radar.width/2,radar.height/2]]){
      // Invert the exact fixed-point-derived coefficients used by native
      // CoordInRadar. The displayed map may rotate and change scroll limits.
      corners.push({x:bounds.left+(radar.centerX+(c*u+s*v)/det)*scaleX,
        y:bounds.top+(radar.centerY+(-s*u+c*v)/det)*scaleY});
    }
    return {bounds,radar,scaleX,scaleY,c,s,
      box:{left:Math.min(...corners.map(point=>point.x))-3,top:Math.min(...corners.map(point=>point.y))-3,
        right:Math.max(...corners.map(point=>point.x))+3,bottom:Math.max(...corners.map(point=>point.y))+3}};
  }
  function nativeSelectionBounds(){
    const b=canvas()?.getBoundingClientRect();if(!b||b.width<=0||b.height<=24)return null;
    if(campaign)return {left:b.left,top:b.top,right:b.right,bottom:b.bottom-24,radar:campaignRadarGeometry()?.box||null};
    // Reuse the same native radar configuration as real touch picking.
    radarPoint(b.left,b.top);
    const side=state.radarSide||192,s=window.__warzoneCommands?.report?.().snapshot;
    const mw=s?.mapWidth||64,mh=s?.mapHeight||64,span=Math.max(mw,mh),rw=side*mw/span,rh=side*mh/span;
    const cx=b.right-24-side/2,cy=b.bottom-24-side/2;
    return {left:b.left,top:b.top,right:b.right,bottom:b.bottom-24,
      radar:window.__warzoneCommands?.nativeHudHidden?.()?null:{left:cx-rw/2-3,top:cy-rh/2-3,right:cx+rw/2+3,bottom:cy+rh/2+3}};
  }

  function tapNormalized(normalizedX, normalizedY) {
    const target = canvas();
    if (!target) return false;
    const bounds = target.getBoundingClientRect();
    const x = bounds.left + bounds.width * Math.max(0, Math.min(1, normalizedX));
    const y = bounds.top + bounds.height * Math.max(0, Math.min(1, normalizedY));
    return click(0, x, y);
  }

  function nativeUiClick(x, y) {
    // Native builder buttons interpret Ctrl as multi-select and do not open
    // their structure list. Queue placements need Ctrl; menu taps do not.
    state.autoFight = false;
    window.__warzoneCommands?.nativeBuildMenuTap?.(x,y);
    trackNativePanelTap(x, y);
    const result = click(0, x, y, false);
    // Keep Ctrl released throughout menu navigation. Restore it on the next
    // world placement, not on a short timer that can race a slow engine frame.
    updateCombatHud();
    return result;
  }

  function tapFrontend(x, y, lobby = false) {
    const target = canvas();
    if (!target) return false;
    const bounds = target.getBoundingClientRect();
    // The lobby expands vertically (multiint.cpp); Limits stays 640x480.
    const layoutHeight = lobby ? Math.max(480, Math.min(640, bounds.height - 80)) : 480;
    return nativeUiClick(bounds.left + (bounds.width - 640) / 2 + x,
        bounds.top + (bounds.height - layoutHeight) / 2 + y);
  }

  function pressMouse(button, x, y) {
    if (!focusCanvas()) return false;
    cancelClicks();
    const mask = mouseButtonMask(button);
    mouseMove(x, y, 0);
    mouse("pointerdown", x, y, button, mask);
    state.mouseButton = button;
    return true;
  }

  function dispatchKey(keyValue, code, keyCode, isDown,
      shiftKey = false, ctrlKey = false, location = 0) {
    if (!canvas() || !state.battleActive) return false;
    // SDL distinguishes the left/right modifier scancodes. A generic-location
    // release can leave the left Ctrl synthesized by mouse.ctrlKey held down.
    if (!location && /(?:Control|Shift|Alt|Meta)(?:Left|Right)$/.test(code)) {
      location = code.endsWith("Right") ? 2 : 1;
    }
    focusCanvas();
    canvas().dispatchEvent(new KeyboardEvent(isDown ? "keydown" : "keyup", {
      key: keyValue,
      code,
      bubbles: true,
      cancelable: true,
      repeat: false,
      shiftKey,
      ctrlKey,
      location,
      keyCode,
      which: keyCode
    }));
    return true;
  }

  function faceOpponent(mapId = "td2") {
    if (!canvas()) return false;
    releaseAll(true);
    state.cameraFacings += 1;
    state.cameraFacingPending = true;
    state.cameraFacingError = '';
    // Let SDL settle the real battlefield viewport before sending the chord.
    // The preparation dialog stays suppressed until its release is processed.
    showCombatHud();

    // The new levels, Dustfall and Greenhaven put the HQ at the south. Look north
    // into the battlefield; Iron Valley retains its established south view.
    // Rotate the real engine camera, so radar and world picking agree.
    const north = window.WarzoneLevelInfo?.[mapId]?.northFacing ?? (mapId === "td1" || mapId === "beginner");
    const direction = north ? "ArrowUp" : "ArrowDown";
    const directionCode = north ? 38 : 40;
    state.cameraHeading = north ? "north" : "south";
    const afterFrames = callback => {
      observeNativeFrames();
      const before = state.nativeFrames, started = performance.now();
      const tick = () => {
        if (!state.battleActive) return;
        if (state.nativeFrames > before) { callback(); return; }
        if (performance.now() - started > 3000) {
          dispatchKey(direction, direction, directionCode, false, false, true);
          dispatchKey("Control", "ControlLeft", 17, false, false, false);
          state.cameraFacingError = 'The engine did not consume the starting camera input.';
          return;
        }
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(tick);
        else setTimeout(tick, 16);
      };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(tick);
      else setTimeout(tick, 16);
    };
    afterFrames(() => {
      dispatchKey("Control", "ControlLeft", 17, true, false, true);
      afterFrames(() => {
        dispatchKey(direction, direction, directionCode, true, false, true);
        afterFrames(() => {
          dispatchKey(direction, direction, directionCode, false, false, true);
          dispatchKey("Control", "ControlLeft", 17, false, false, false);
          afterFrames(() => {
            if (north) {
              state.cameraFacingNonce = writeZoomCommand("dustfall-start");
              if (state.cameraFacingNonce) return;
              state.cameraFacingError = 'The starting camera position could not be sent.';
              return;
            }
            state.cameraFacingPending = false;
          });
        });
      });
    });
    return true;
  }

  let combatSerial=0, patrolArmed=false;
  const combatTimers=new Set();
  function combatLater(action,delay){
    const generation=combatSerial;
    const timer=setTimeout(()=>{combatTimers.delete(timer);if(generation===combatSerial)action();},delay);
    combatTimers.add(timer);return timer;
  }
  function cancelCombatInput(cancelTool = true){
    ++combatSerial;for(const timer of combatTimers)clearTimeout(timer);combatTimers.clear();
    if(!state.queueModifierHeld)dispatchKey('Control','ControlLeft',17,false);
    dispatchKey('a','KeyA',65,false);dispatchKey('u','KeyU',85,false);
    const cancelledTool=patrolArmed;
    patrolArmed=false;
    if(cancelledTool&&cancelTool)pressKey('Escape','Escape',27);
    return cancelledTool&&cancelTool;
  }
  function ctrlShortcut(keyValue, code, keyCode) {
    if (!canvas()) return false;
    const preserveStickyModifier = state.queueModifierHeld;
    if (!preserveStickyModifier) {
      dispatchKey("Control", "ControlLeft", 17, true, false, true);
    }
    combatLater(() => {
      dispatchKey(keyValue, code, keyCode, true, false, true);
    }, 12);
    combatLater(() => {
      dispatchKey(keyValue, code, keyCode, false, false, true);
      if (!preserveStickyModifier) {
        dispatchKey("Control", "ControlLeft", 17, false, false, false);
      }
    }, 58);
    return true;
  }

  function selectAllCombat() {
    if (window.__warzoneDuelConfig?.mode !== 'duel') return toggleCombatLock(true);
    const selected = ctrlShortcut("a", "KeyA", 65);
    if (selected) state.selectAlls += 1;
    return selected;
  }

  function selectAllUnits() {
    const selected = ctrlShortcut("u", "KeyU", 85);
    if (selected) state.manualSelectAlls += 1;
    return selected;
  }

  async function selectAllTrucks() {
    if (!canvas()) return false;
    holdCombatSelection('constructors');
    releaseAll(true);
    const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    // SDL needs a held modifier key, not only KeyboardEvent.shiftKey on T.
    dispatchKey('Shift', 'ShiftLeft', 16, true, true, false, 1);
    try {
      await frames();
      dispatchKey('t', 'KeyT', 84, true, true, false);
      await frames();
    } finally {
      dispatchKey('t', 'KeyT', 84, false, true, false);
      dispatchKey('Shift', 'ShiftLeft', 16, false, false, false, 1);
    }
    return true;
  }

  // Selection is observed independently of the persistent ALL command intent.
  // Two advancing native frames establish a current world after a session/load.
  let combatSelectionWatch = null, allCombatSelected = false;
  let combatWorld = null, combatPacket = null, combatIntent = null, combatActivation = '', combatOverride = '';
  let combatIntentSerial = 0, combatOrderSerial = 0, combatInteractionUntil = 0, combatOffPending = false, combatError = '';
  const combatPhysicalPointers = new Set();
  const combatOffNonces = new Set();
  function combatNow() { return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now(); }
  function paintCombatMode() {
    const doc = commandDocument();
    for (const id of ['wt-all-combat', 'wt-campaign-all-combat', 'blocknight-select-all']) {
      const button = doc.getElementById(id);
      if (button) { button.dataset.combatEnabled = String(state.combatLock); button.classList.toggle('active', state.combatLock); button.setAttribute('aria-pressed', String(state.combatLock)); }
    }
  }
  function combatSuspended() {
    const commands = window.__warzoneCommands?.report?.() || {}, research = window.__blockNightResearch?.report?.() || {};
    const doc = commandDocument(), input = doc.activeElement || document.activeElement;
    const help = doc.getElementById('warzone-towers-help-overlay'), music = doc.getElementById('wt-map-music-menu');
    return !state.battleActive || !state.hudVisible || !combatPacket?.playing || combatPacket?.worldSafe !== true
      || document.hidden || Boolean(combatOverride) || combatPhysicalPointers.size > 0 || combatNow() < combatInteractionUntil
      || pendingNativeInput() || state.pointers.size > 0 || state.mouseButton !== null || state.heldKeys.size > 0
      || state.panRelease || Boolean(state.single?.panning) || state.multi !== null
      || Boolean(commands.page || commands.buildOpen || commands.placement || commands.selectingTrucks || commands.nativeMenu
        || commands.nativeClosing || commands.exitingBuild || commands.buildingOpening || commands.demolition)
      || research.open || research.opening || window.__warzoneIntelligence?.isOpen?.()
      || Boolean(help && !help.hidden || music && !music.hidden) || window.WarzoneSavedGames?.busy === true
      || window.WarzoneSavedGames?.ready === false || Boolean(input && /^(INPUT|TEXTAREA|SELECT)$/.test(input.tagName || '') || input?.isContentEditable);
  }
  function bindCombatWorld(value, current) {
    if (value?.schemaVersion !== 89 || !value.combatLock || typeof value.combatLock.context !== 'string') return;
    const context = value.combatLock.context, session = window.__towersHtml?.session;
    if (combatWorld && (combatWorld.module !== current || combatWorld.session !== session || combatWorld.context !== context)) {
      state.combatLock = false; combatActivation = ''; combatOverride = ''; combatOffPending = false; combatOffNonces.clear(); combatIntent = null; ++combatOrderSerial;
    }
    combatWorld = {module:current, session, context};
  }
  function refreshCombatLock(value) {
    if (window.__warzoneDuelConfig?.mode === 'duel') return state.combatLock;
    const current = window.LaunchedModule || window.Module;
    if (combatWorld && (combatWorld.module !== current || combatWorld.session !== window.__towersHtml?.session)) {
      state.combatLock=false;combatActivation='';combatOverride='';combatOffPending=false;combatOffNonces.clear();combatIntent=null;combatWorld=null;++combatOrderSerial;
    }
    if (!value) { try { value = JSON.parse(current?.FS?.readFile('/tmp/warzone-combat-selection-v89.json', {encoding:'utf8'})); } catch (_) {} }
    if (value) { combatPacket = value; bindCombatWorld(value, current); }
    const context = combatWorld?.context;
    if (!context || !current?.FS?.writeFile || !current?.FS?.rename || current.calledRun !== true) { paintCombatMode(); return false; }
    const ack=combatPacket?.combatLock;
    if(combatOffPending&&ack?.context===context&&ack.activation===combatActivation
        &&(combatOffNonces.has(ack.deselectNonce)||combatOffNonces.has(ack.deselectAppliedNonce)))combatOffPending=false;
    const suspended = Boolean(combatSuspended()), key = JSON.stringify([context, state.combatLock, suspended, combatActivation]);
    if (!combatIntent || combatIntent.key !== key || combatOffPending && combatIntent.deselect !== true) {
      const request = {nonce:'offline-combat-'+Date.now()+'-'+(++combatIntentSerial), enabled:state.combatLock,
        suspended, activation:combatActivation, context, deselect:combatOffPending};
      try {
        current.FS.writeFile('/tmp/warzone-combat-lock-v90.json.tmp', JSON.stringify(request), {encoding:'utf8'});
        current.FS.rename('/tmp/warzone-combat-lock-v90.json.tmp', '/tmp/warzone-combat-lock-v90.json');
        combatIntent = {...request, key}; if(request.deselect)combatOffNonces.add(request.nonce); combatError = '';
      } catch (error) { combatError = String(error.message || error); }
    }
    paintCombatMode(); return true;
  }
  function holdCombatSelection(reason = 'constructors') { combatOverride = String(reason); refreshCombatLock(); return true; }
  function resumeCombatSelection(reason) { if (!reason || combatOverride === reason) combatOverride = ''; refreshCombatLock(); return !combatOverride; }
  function resetCombatMode() { state.combatLock = false; combatOverride = ''; combatOffPending = false; combatOffNonces.clear(); combatIntent = null; ++combatOrderSerial; refreshCombatLock(); }
  let constructorSelectionSerial = 0, combatFenceDisposed = false, pendingConstructorSelection = null;
  function cancelConstructorSelection() {
    const pending=pendingConstructorSelection;if(!pending)return;
    pendingConstructorSelection=null;
    try {
      const fs=pending.module.FS,path='/tmp/warzone-constructor-selection-v90.json';
      const current=JSON.parse(fs.readFile(path,{encoding:'utf8'}));
      if(current.nonce!==pending.request.nonce||current.action!=='select-visible-trucks')return;
      fs.writeFile(path+'.tmp',JSON.stringify({...pending.request,nonce:pending.request.nonce+'-cancel',action:'cancel'}),{encoding:'utf8'});
      fs.rename(path+'.tmp',path);
    } catch (_) {}
  }
  async function nativeSelectVisibleTrucks(options = {}) {
    holdCombatSelection('constructors');
    const current = window.LaunchedModule || window.Module, session = window.__towersHtml?.session;
    const context = combatWorld?.context, activation = combatActivation, requested = state.combatLock;
    const order = combatOrderSerial, manual = state.manualSelectionRevision, started = combatNow();
    const timeout = Math.min(2500, Math.max(1, Number(options.timeout) || 2500));
    const active = () => !combatFenceDisposed && options.current?.() !== false && state.battleActive && !document.hidden
      && current === (window.LaunchedModule || window.Module) && session === window.__towersHtml?.session
      && context === combatWorld?.context && activation === combatActivation && requested === state.combatLock
      && order === combatOrderSerial && manual === state.manualSelectionRevision && combatOverride === 'constructors';
    let request = null;
    while (combatNow() - started < timeout) {
      refreshCombatLock();
      if (!active() || !context) { cancelConstructorSelection(); return {ok:false, reason:'selection-cancelled'}; }
      const ack = combatPacket?.combatLock;
      if (!request && combatPacket?.playing === true && combatPacket.worldSafe === true
          && ack?.context === context && ack.activation === activation && ack.requestNonce === combatIntent?.nonce
          && ack.requestedSuspended === true && ack.suspended === true) {
        request = {nonce:'offline-constructors-'+Date.now()+'-'+(++constructorSelectionSerial),
          action:'select-visible-trucks', context, activation, combatIntentNonce:ack.requestNonce};
        try {
          current.FS.writeFile('/tmp/warzone-constructor-selection-v90.json.tmp', JSON.stringify(request), {encoding:'utf8'});
          current.FS.rename('/tmp/warzone-constructor-selection-v90.json.tmp', '/tmp/warzone-constructor-selection-v90.json');
          pendingConstructorSelection={module:current,request};
        } catch (error) { return {ok:false, reason:'native-unavailable'}; }
      }
      if (request) {
        if (combatIntent?.nonce !== request.combatIntentNonce) { cancelConstructorSelection(); return {ok:false, reason:'selection-cancelled'}; }
        const result = combatPacket?.constructorSelection;
        if (result?.nonce === request.nonce) {
          pendingConstructorSelection=null;
          const ids = result.selectedIds;
          if (result.context !== context || result.activation !== activation || result.combatIntentNonce !== request.combatIntentNonce
              || result.ok !== true || !Array.isArray(ids) || !ids.every(id=>Number.isInteger(id)&&id>0) || new Set(ids).size !== ids.length)
            return {ok:false, reason:result.reason || 'selection-changed'};
          return {ok:true, selectedIds:ids.slice(), player:combatPacket.player, current:active};
        }
      }
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    cancelConstructorSelection();return {ok:false, reason:'selection-timeout'};
  }
  function exactCombatSelection(value) {
    const combat = value?.combatIds, selected = value?.selectedIds;
    if (!Array.isArray(combat) || !Array.isArray(selected) || !combat.length || combat.length !== selected.length) return false;
    if (![...combat, ...selected].every(id => Number.isInteger(id) && id > 0)) return false;
    const wanted = new Set(combat), actual = new Set(selected);
    return wanted.size === combat.length && actual.size === selected.length && selected.every(id => wanted.has(id));
  }
  function refreshCombatSelection() {
    const current = window.LaunchedModule || window.Module;
    const now = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
    const session = window.__towersHtml?.session;
    let value = null;
    try { value = JSON.parse(current?.FS?.readFile('/tmp/warzone-combat-selection-v89.json', {encoding:'utf8'})); } catch (_) {}
    const valid = value?.schemaVersion === 89 && Number.isInteger(value.frame) && value.frame >= 0
      && Number.isFinite(value.gameTime) && Number.isFinite(value.realTime)
      && Number.isInteger(value.player) && value.player >= 0 && value.combatSelection?.player === value.player
      && value.playing === true && value.worldSafe === true;
    if (!valid) combatSelectionWatch = null;
    else {
      const previous = combatSelectionWatch;
      if (!previous || previous.module !== current || previous.session !== session || previous.player !== value.player
          || value.frame < previous.frame || value.gameTime < previous.gameTime) {
        combatSelectionWatch = {module:current, session, player:value.player, frame:value.frame, gameTime:value.gameTime, at:now, ready:false};
      } else {
        if (value.frame > previous.frame) { previous.frame = value.frame; previous.at = now; previous.ready = true; }
        previous.gameTime = value.gameTime;
      }
    }
    allCombatSelected = Boolean(valid && combatSelectionWatch?.ready && now - combatSelectionWatch.at < 1500
      && state.battleActive && state.hudVisible && !document.hidden && !window.__towersHtml?.isEnded?.()
      && exactCombatSelection(value.combatSelection));
    refreshCombatLock(value);
    const hudDocument = commandDocument();
    for (const id of ['wt-all-combat', 'wt-campaign-all-combat']) {
      const button = hudDocument.getElementById(id);
      if (button) button.dataset.combatSelected = String(allCombatSelected);
    }
    return allCombatSelected;
  }

  function updateCombatHud() {
    const hudDocument = commandDocument();
    const all = hudDocument.getElementById("blocknight-select-all");
    const auto = hudDocument.getElementById("blocknight-auto-fight");
    const box = hudDocument.getElementById("blocknight-box-select");
    const queue = hudDocument.getElementById("blocknight-queue-orders");
    if (all) all.classList.toggle("active", state.combatLock);
    paintCombatMode();
    hudDocument.getElementById('wt-all-combat')?.setAttribute('aria-pressed', String(state.combatLock));
    if (auto) auto.classList.toggle("active", state.autoFight);
    if (box) box.classList.toggle("active", state.boxMode);
    if (queue) queue.classList.toggle("active", state.queueMode);
    if (queue) queue.setAttribute("aria-pressed", String(state.queueMode));
    const saving = window.WarzoneSavedGames?.report?.();
    for (const button of hudDocument.querySelectorAll?.('#blocknight-combat-hud button,#wt-field-centre button,#lab-ops #wt-open-build') || []) {
      button.disabled = Boolean(state.stopNonce)
        || (button.id === 'blocknight-save' && (saving?.busy === true || saving?.ended === true));
    }
    for (const preset of Object.keys(ZOOM_PRESETS)) {
      const button = hudDocument.getElementById(`blocknight-zoom-${preset}`);
      if (button) {
        const selected = state.zoomPreset === preset;
        button.classList.toggle("active", selected);
        button.classList.toggle("pending", selected && state.zoomPendingNonce !== null);
        button.setAttribute("aria-pressed", String(selected));
      }
    }
  }

  function toggleCombatLock(force) {
    cancelCombatInput();
    refreshCombatLock();
    if (window.__warzoneDuelConfig?.mode !== 'duel' && !combatWorld?.context) return false;
    state.combatLock = typeof force === "boolean" ? force : !state.combatLock;
    combatOverride = ''; ++combatOrderSerial;
    combatOffNonces.clear();
    if (state.combatLock) combatActivation = 'offline-combat-user-'+Date.now()+'-'+(++combatIntentSerial);
    combatOffPending = !state.combatLock;
    if (!state.combatLock) state.autoFight = false;
    if (state.combatLock && window.__warzoneDuelConfig?.mode === 'duel') selectAllCombat();
    refreshCombatLock();
    updateCombatHud();
    return state.combatLock;
  }

  function bindTouchCommand(button, action) {
    let press = null, lastTouch = -Infinity;
    button.addEventListener("pointerdown", event => {
      event.preventDefault(); event.stopPropagation();
      if (event.pointerType === "touch") press = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });
    button.addEventListener("pointercancel", () => { press = null; });
    button.addEventListener("pointerup", event => {
      event.stopPropagation();
      const start = press; press = null;
      if (!start || start.id !== event.pointerId || button.disabled || !state.battleActive) return;
      event.preventDefault();
      const b = button.getBoundingClientRect();
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP
          || event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) return;
      lastTouch = performance.now(); action();
    });
    button.addEventListener("click", event => {
      event.preventDefault(); event.stopPropagation();
      // Touch commands run on release even when WebView suppresses the later
      // compatibility click. A delivered compatibility click must not run twice.
      if (performance.now() - lastTouch < 700 && (event.detail > 0 || event.pointerType === "touch")) return;
      if (!button.disabled && state.battleActive) action();
    });
  }

  function toggleAutoFight(force) {
    cancelCombatInput();
    state.autoFight = typeof force === "boolean" ? force : !state.autoFight;
    if (state.autoFight) {
      toggleCombatLock(true);
      // A native Patrol is armed only when a destination is supplied.
    }
    updateCombatHud();
    return state.autoFight;
  }

  function toggleBoxMode(force) {
    cancelCombatInput();
    state.boxMode = typeof force === "boolean" ? force : !state.boxMode;
    if (state.boxMode) {
      state.autoFight = false;
      vibrate(12);
    }
    updateCombatHud();
    return state.boxMode;
  }

  function toggleQueueMode(force) {
    const wasEnabled = state.queueMode;
    state.queueMode = typeof force === "boolean" ? force : !state.queueMode;
    // Enabling +Q only arms the mode. Ctrl belongs to world placements, not
    // selecting a truck or the first defence in the native construction menu.
    if (!state.queueMode) cancelClicks();
    if (!state.queueMode && state.queueModifierHeld) {
      dispatchKey("Control", "ControlLeft", 17, false);
      state.queueModifierHeld = false;
    }
    if (state.queueMode && !wasEnabled) state.stickyBuildActivations += 1;
    vibrate(8);
    updateCombatHud();
    return state.queueMode;
  }

  function contextualClick(x, y, queued = false) {
    if (!queued) return click(0, x, y);
    const result = click(0, x, y, true);
    if (result) state.queuedOrders += 1;
    return result;
  }

  function stopSelected() {
    if (state.stopNonce) return true;
    const fs = zoomModule()?.FS;
    if (!fs?.writeFile || !fs?.rename) return false;
    window.__warzoneCommands?.cancelLinePlacement?.(null,true);
    releaseAll(); state.autoFight = false;
    const nonce = `${Date.now().toString(36)}-stop-${state.stopOrders + 1}`;
    const path = (campaign ? '/data/base/script/campaign/mobile/' : '/data/mp/multiplay/script/rules/') + 'warzone-towers-control-command.json';
    try {
      fs.writeFile(path + '.tmp', JSON.stringify({ version: 1, nonce, action: 'stop-selected' }), { encoding: 'utf8' });
      fs.rename(path + '.tmp', path);
    } catch (error) { console.warn('[Warzone STOP]', error); return false; }
    state.stopNonce = nonce; state.stopOrders += 1;
    // Keep Ctrl and selection intact until the native rule has stopped exactly
    // those units. Keyboard S can become Ctrl+S while release is still pending.
    state.stopTimer = setTimeout(() => {
      if (state.stopNonce !== nonce) return;
      fs.writeFile(path + '.tmp', JSON.stringify({ version: 1, nonce: nonce + '-cancel', action: 'cancel' }));
      fs.rename(path + '.tmp', path);
      state.stopNonce = null; updateCombatHud();
      window.BlockNightAndroid?.showNotice('STOP has not responded. Please try it again.');
    }, 3000);
    updateCombatHud(); return true;
  }

  window.addEventListener('warzone-towers-control-ack', event => {
    const ack = event.detail;
    window.__towersHtml?.consume('warzone-towers-control-command.json',ack?.nonce);
    if (ack?.nonce !== state.stopNonce || ack.action !== 'stop-selected') return;
    clearTimeout(state.stopTimer); state.stopTimer = null; state.stopNonce = null;
    state.stopAcks += 1; state.stoppedUnitIds = Array.isArray(ack.stopped) ? ack.stopped.slice() : [];
    toggleQueueMode(false); vibrate(12); updateCombatHud();
  });

  function jumpToBase() {
    if(afterNativeInput(()=>jumpToBase()))return true;
    if (!writeZoomCommand("base")) return false;
    state.baseJumps += 1;
    vibrate(8);
    return true;
  }

  async function queueCombatOrder(x, y, patrol) {
    if (window.__warzoneDuelConfig?.mode !== 'duel') {
      const activation = combatActivation, context = combatWorld?.context, order = ++combatOrderSerial, generation = combatSerial;
      const started = combatNow();
      while (true) {
        refreshCombatLock();
        if (!state.combatLock || combatActivation !== activation || combatWorld?.context !== context || order !== combatOrderSerial
            || generation !== combatSerial || !state.battleActive || combatOverride) return false;
        const ack = combatPacket?.combatLock;
        if (combatPacket?.playing && ack?.enabled === true && ack.activation === activation && ack.context === context
            && exactCombatSelection(combatPacket.combatSelection)) break;
        if (combatNow() - started >= 2500) { combatError = 'Native combat selection was not ready for this order.'; return false; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      if(patrol){
        patrolArmed=true;pressKey('q','KeyQ',81);
        combatLater(()=>{if(state.combatLock&&combatActivation===activation&&combatWorld?.context===context&&order===combatOrderSerial)contextualClick(x,y,state.queueMode);patrolArmed=false;},67);
        state.patrolOrders+=1;
      }else contextualClick(x, y, state.queueMode);
      state.combatOrders += 1;
      feedback(x, y, patrol?'patrol':'order'); vibrate(8); return true;
    }
    if (!selectAllCombat()) return false;
    const delay = patrol ? 155 : 105;
    if (patrol) {
      combatLater(() => {patrolArmed=true;pressKey("q", "KeyQ", 81);},88);
    }
    // RightClickOrders is deliberately disabled. Warzone's native contextual
    // left click selects a unit when pressed on a unit and issues the correct
    // move / attack / repair order when pressed on a destination. Keeping the
    // same input path here makes ALL and AUTO agree with manual selection.
    combatLater(() => {contextualClick(x, y, state.queueMode);patrolArmed=false;},delay);
    state.combatOrders += 1;
    if (patrol) state.patrolOrders += 1;
    feedback(x, y, patrol ? "patrol" : "order");
    vibrate(8);
    return true;
  }

  function key(code, isDown) {
    if (!(code in keyCodes) || !canvas()) return false;
    if (isDown === state.heldKeys.has(code)) return true;
    if (isDown) state.heldKeys.add(code);
    else state.heldKeys.delete(code);
    return dispatchKey(code, code, keyCodes[code], isDown);
  }

  function pressKey(keyValue, code, keyCode, shiftKey = false) {
    if (!canvas() || !state.battleActive) return false;
    dispatchKey(keyValue, code, keyCode, true, shiftKey, state.queueModifierHeld);
    if (keyValue.length === 1 && keyCode >= 32) {
      const characterCode = keyValue.charCodeAt(0);
      canvas().dispatchEvent(new KeyboardEvent("keypress", {
        key: keyValue,
        code,
        bubbles: true,
        cancelable: true,
        repeat: false,
        shiftKey,
        ctrlKey: state.queueModifierHeld,
        charCode: characterCode,
        keyCode: characterCode,
        which: characterCode
      }));
    }
    dispatchKey(keyValue, code, keyCode, false, shiftKey, state.queueModifierHeld);
  }

  function describeCharacter(character) {
    if (/^[a-z]$/i.test(character)) {
      const upper = character.toUpperCase();
      return [character, `Key${upper}`, upper.charCodeAt(0), character === upper];
    }
    if (/^[0-9]$/.test(character)) {
      return [character, `Digit${character}`, character.charCodeAt(0), false];
    }
    if (character === " ") return [" ", "Space", 32, false];
    if (character === "-") return ["-", "Minus", 189, false];
    if (character === "_") return ["_", "Minus", 189, true];
    if (character === ".") return [".", "Period", 190, false];
    return null;
  }

  function saveName(value) {
    const requested = String(value ?? "").trim().slice(0, 32);
    const queue = [];
    if (requested.length > 0) {
      // The in-game field already contains Warzone's suggested mission name
      // with its cursor at the end. Clear it before entering the Android text.
      for (let index = 0; index < 64; index += 1) {
        queue.push(["Backspace", "Backspace", 8, false]);
      }
      for (const character of requested) {
        const descriptor = describeCharacter(character);
        if (descriptor) queue.push(descriptor);
      }
    }
    queue.push(["Enter", "Enter", 13, false]);

    releaseAll(true);
    const sendNext = () => {
      const descriptor = queue.shift();
      if (!descriptor) {
        state.saveNames += 1;
        return;
      }
      pressKey(...descriptor);
      setTimeout(sendNext, 8);
    };
    setTimeout(sendNext, 60);
    return true;
  }

  function releaseCameraKeys() {
    for (const code of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
      if (state.heldKeys.has(code)) key(code, false);
    }
  }

  function clearLongPress() {
    if (state.longTimer !== null) {
      clearTimeout(state.longTimer);
      state.longTimer = null;
    }
  }

  function vibrate(milliseconds) {
    try {
      navigator.vibrate?.(milliseconds);
    } catch (_) {
      // Haptics are an optional confirmation only.
    }
  }

  function feedback(x, y, kind = "tap") {
    const pulse = document.createElement("span");
    pulse.className = `blocknight-touch-pulse ${kind}`;
    pulse.style.left = `${x}px`;
    pulse.style.top = `${y}px`;
    document.body.appendChild(pulse);
    state.feedbacks += 1;
    setTimeout(() => pulse.remove(), 430);
  }

  function recordTap(x, y) {
    const now = performance.now();
    const previous = state.lastTap;
    if (previous && now - previous.time <= DOUBLE_TAP_MS
        && Math.hypot(x - previous.x, y - previous.y) <= DOUBLE_TAP_SLOP) {
      state.doubleTaps += 1;
      feedback(x, y, "double");
      vibrate(14);
      state.lastTap = null;
      return true;
    }
    state.lastTap = { x, y, time: now };
    return false;
  }

  function zoom(direction, x = state.lastX, y = state.lastY, keepPreset = false) {
    if (!state.battleActive) return false;
    const target = canvas();
    if (!target) return false;
    const bounds = target.getBoundingClientRect();
    const safeX = Math.max(bounds.left + 1, Math.min(x, bounds.right - 1));
    const safeY = Math.max(bounds.top + 1, Math.min(y, bounds.bottom - 1));
    target.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaMode: 0,
      deltaY: direction < 0 ? -120 : 120,
      deltaX: 0,
      clientX: safeX,
      clientY: safeY
    }));
    state.zoomWheelEvents += 1;
    if (!keepPreset && state.zoomPreset !== null) {
      state.zoomPreset = null;
      writeZoomCommand("manual");
      updateCombatHud();
    }
    return true;
  }

  function zoomModule() {
    if (window.LaunchedModule?.FS) return window.LaunchedModule;
    if (window.Module?.FS) return window.Module;
    return null;
  }

  function writeZoomCommand(preset) {
    const spec = ZOOM_PRESETS[preset];
    if (!state.battleActive || (!spec && !["manual", "base", "dustfall-start"].includes(preset))) return null;
    const module = zoomModule();
    const fs = module?.FS;
    if (!fs?.writeFile || !fs?.rename) {
      state.zoomCommandErrors += 1;
      return null;
    }

    const nonce = `${Date.now().toString(36)}-${(++state.zoomCommandSequence).toString(36)}`;
    const command = {
      version: 32,
      nonce,
      preset,
      distance: spec?.distance || 0
    };
    const temporaryPath = `${ZOOM_COMMAND_PATH}.tmp`;
    try {
      fs.writeFile(temporaryPath, JSON.stringify(command), { encoding: "utf8" });
      fs.rename(temporaryPath, ZOOM_COMMAND_PATH);
      state.zoomCommandWrites += 1;
      return nonce;
    } catch (error) {
      state.zoomCommandErrors += 1;
      console.warn("[BlockNight zoom] command write failed", error);
      return null;
    }
  }

  function clearZoomAckTimer() {
    clearTimeout(state.zoomAckTimer);
    state.zoomAckTimer = null;
  }

  /**
   * Sends an atomic command to Block Night's custom match rule. The rule calls
   * Warzone's cameraZoom(distance, 0), so presets are absolute and immediate.
   */
  function applyZoomPreset(preset) {
    if (!state.battleActive) return false;
    const spec = ZOOM_PRESETS[preset];
    if (!spec || !canvas()) return false;
    if(afterNativeInput(()=>applyZoomPreset(preset)))return true;
    const nonce = writeZoomCommand(preset);
    if (!nonce) return false;

    clearZoomAckTimer();
    state.zoomPreset = preset;
    state.zoomPresetSelections += 1;
    state.zoomPendingNonce = nonce;
    state.lastZoomDistance = spec.distance;
    state.zoomAckTimer = setTimeout(() => {
      if (state.zoomPendingNonce === nonce) {
        state.zoomPendingNonce = null;
        updateCombatHud();
      }
    }, 1800);
    updateCombatHud();
    vibrate(7);
    return true;
  }

  window.addEventListener("blocknight-zoom-ack", event => {
    const payload = event?.detail;
    window.__towersHtml?.consume('blocknight-zoom-command.json',payload?.nonce);
    if (payload?.nonce && payload.nonce === state.cameraFacingNonce) {
      state.cameraFacingNonce = null;
      state.cameraFacingPending = false;
    }
    if (!payload?.nonce || payload.nonce !== state.zoomPendingNonce) return;
    clearZoomAckTimer();
    state.zoomPendingNonce = null;
    state.zoomAcks += 1;
    if (Number.isFinite(Number(payload.distance))) {
      state.lastZoomDistance = Number(payload.distance);
    }
    updateCombatHud();
  });

  function advancePan(marker, x, y) {
    const dx = x - marker.panX;
    const dy = y - marker.panY;
    if (dx === 0 && dy === 0) return;
    const startedAt = performance.now();
    mouseMove(x, y, 4, dx, dy);
    const dispatchMs = performance.now() - startedAt;
    marker.panX = x;
    marker.panY = y;
    marker.panDx = dx;
    marker.panDy = dy;
    state.panMoves += 1;
    state.lastPanDispatchMs = dispatchMs;
    state.maxPanDispatchMs = Math.max(state.maxPanDispatchMs, dispatchMs);
  }

  function panPoint(x, y) {
    const bounds = canvas()?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
    // Captured touches can leave the canvas. SDL stores unsigned coordinates;
    // keep only synthetic one-finger pan input inside the native edge bands.
    const insetX = Math.min(8, bounds.width / 4), insetY = Math.min(8, bounds.height / 4);
    return {
      x: Math.max(bounds.left + insetX, Math.min(bounds.right - insetX,
          Number.isFinite(x) ? x : bounds.left + bounds.width / 2)),
      y: Math.max(bounds.top + insetY, Math.min(bounds.bottom - insetY,
          Number.isFinite(y) ? y : bounds.top + bounds.height / 2))
    };
  }

  function clearPanMove() {
    if (state.panMoveFrame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(state.panMoveFrame);
    clearTimeout(state.panMoveTimer);
    state.panMoveFrame = null; state.panMoveTimer = null; state.panMoveGesture = null;
  }

  function flushPanMove() {
    const gesture = state.panMoveGesture;
    clearPanMove();
    if (!state.battleActive || !gesture || gesture !== state.single || !gesture.panning || state.mouseButton !== 1) return;
    const point = panPoint(gesture.x, gesture.y);
    if (point) advancePan(gesture, point.x, point.y);
  }

  function schedulePanMove(gesture) {
    state.panMoveGesture = gesture;
    if (state.panMoveFrame !== null || state.panMoveTimer !== null) return;
    // SDL consumes the latest absolute position once per render. Replaying
    // every historical/coalesced sample only blocks the next camera frame.
    if (typeof requestAnimationFrame === 'function') state.panMoveFrame = requestAnimationFrame(flushPanMove);
    else state.panMoveTimer = setTimeout(flushPanMove, 16);
  }

  function clearPanReleaseCallbacks() {
    if (state.panReleaseFrame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(state.panReleaseFrame);
    clearTimeout(state.panReleaseTimer);
    state.panReleaseFrame = null; state.panReleaseTimer = null;
  }

  function panPhase(marker, phase) {
    marker.phase = phase;
    marker.frame = state.nativeFrames;
    marker.started = performance.now();
    marker.displayFrames = 0;
  }

  function releasePanEndpoint(marker) {
    // SDL still reports mouseDown during KEY_RELEASED. Leave the endpoint
    // untouched through that frame; moving the hover cursor now moves the map.
    if (state.mouseButton === 1) releaseMouse(marker.x, marker.y);
    panPhase(marker, 'rearm');
  }

  function schedulePanRelease() {
    if (!state.panRelease || state.panReleaseFrame !== null || state.panReleaseTimer !== null) return;
    if (typeof requestAnimationFrame === 'function') state.panReleaseFrame = requestAnimationFrame(() => advancePanRelease(true));
    state.panReleaseTimer = setTimeout(() => advancePanRelease(false), typeof requestAnimationFrame === 'function' ? 50 : 16);
  }

  function advancePanRelease(displayFrame = false) {
    const marker = state.panRelease;
    if (!marker) return;
    clearPanReleaseCallbacks();
    if (displayFrame) marker.displayFrames += 1;
    observeNativeFrames();
    if (marker.canvas !== canvas() || marker.clock && marker.clock !== state.nativeFrameContext) {
      if (state.mouseButton === 1) releaseMouse(marker.x, marker.y);
      state.panRelease = null; state.panContextResets += 1;
      pumpPanPointerQueue(); pumpClicks(); return;
    }
    if (!marker.clock && state.nativeFrameContext) {
      marker.clock = state.nativeFrameContext;
      panPhase(marker, marker.phase);
    }
    const elapsed = performance.now() - marker.started;
    const observed = Boolean(marker.clock);
    const frames = marker.phase === 'held' ? 1 : 2;
    const ready = observed ? state.nativeFrames - marker.frame >= frames
        : (typeof requestAnimationFrame !== 'function' || marker.displayFrames >= 3)
          && elapsed >= (marker.phase === 'held' ? 32 : 48);
    if (marker.phase === 'held' && !ready && elapsed >= 1000) {
      // A stalled renderer must not leave a mouse button held. Keep the rearm
      // guard: a wall-clock timeout cannot prove native panActive has cleared.
      releasePanEndpoint(marker); state.panHeldTimeouts += 1;
    } else if (ready && marker.phase === 'held') {
      releasePanEndpoint(marker);
    } else if (ready) {
      state.panRelease = null; state.panRearms += 1;
      if (!observed) state.panUnobservedRearms += 1;
      pumpPanPointerQueue(); pumpClicks(); return;
    }
    schedulePanRelease();
  }

  function finishFramePan(gesture, canceled) {
    clearPanMove();
    const point = panPoint(gesture.x, gesture.y);
    if (!canceled && point) advancePan(gesture, point.x, point.y);
    observeNativeFrames();
    const marker = state.panRelease = {x: gesture.panX, y: gesture.panY,
      canvas: canvas(), clock: state.nativeFrameContext};
    panPhase(marker, 'held');
    const heldFrame = gesture.panClock && gesture.panClock === state.nativeFrameContext
        && state.nativeFrames > gesture.panHeldFrame;
    if (canceled || heldFrame) releasePanEndpoint(marker);
    schedulePanRelease();
  }

  function cancelFramePan() {
    clearPanMove();
    if (state.panRelease) {
      if (state.panRelease.phase === 'held') releasePanEndpoint(state.panRelease);
      schedulePanRelease(); return;
    }
    const gesture = state.single?.framePan && state.single.panning ? state.single
        : window.__warzoneDuelConfig?.mode !== 'duel' && state.multi?.gesture === 'pan'
          ? {...state.multi, x: state.multi.center.x, y: state.multi.center.y} : null;
    if (gesture) finishFramePan(gesture, true);
  }

  function deferPanPointer(event, target) {
    own(event); forwardedPointers.add(event);
    if (event.type === 'pointerdown') capturePointer(target, event.pointerId);
    if (event.type === 'pointerup' || event.type === 'pointercancel') releasePointer(target, event.pointerId);
    if (event.type === 'pointermove') {
      const moves = [];
      for (let i = state.panDeferredPointers.length - 1; i >= 0; i--) {
        const previous = state.panDeferredPointers[i];
        if (previous.pointerId !== event.pointerId) continue;
        if (previous.type !== 'pointermove') break;
        moves.push(i);
      }
      if (moves.length >= 2) state.panDeferredPointers.splice(moves[0], 1);
    }
    if (state.panDeferredPointers.length >= 128) { state.panQueueOverflows += 1; releaseAll(false, false); return; }
    state.panDeferredPointers.push(event);
  }

  function pumpPanPointerQueue() {
    if (state.panDrainingPointers || state.panRelease || state.clickJob || state.clickQueue.length
        || state.clickFrame !== null || state.clickTimer !== null || state.pointerQueue.length
        || window.__warzoneCommands?.report?.()?.nativePendingSites || pendingBuildPanelClose() || pendingTruckSelection()) return;
    state.panDrainingPointers = true;
    const replaying = state.replayingPointers;
    state.replayingPointers = true;
    try {
      while (state.panDeferredPointers.length && !state.panRelease && !state.clickJob
          && state.clickFrame === null && state.clickTimer === null) {
        processPointer(state.panDeferredPointers.shift(), true);
      }
    } finally { state.replayingPointers = replaying; state.panDrainingPointers = false; }
    flushAfterInput();
  }

  function releaseTilt(clearBudget = true) {
    clearTimeout(state.tiltReleaseTimer);
    state.tiltReleaseTimer = null;
    if (state.tiltReleaseFrame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(state.tiltReleaseFrame);
    }
    state.tiltReleaseFrame = null;
    if (clearBudget) state.tiltBudget = 0;
    if (state.tiltKey) {
      const key = state.tiltKey;
      state.tiltKey = null;
      dispatchKey(key.value, key.code, key.number, false, false, state.queueModifierHeld, 3);
    }
  }

  function pumpTilt() {
    if (state.tiltKey || Math.abs(state.tiltBudget) < TILT_STEP || state.multi?.gesture !== "tilt") return;
    const direction = Math.sign(state.tiltBudget);
    state.tiltBudget -= direction * TILT_STEP;
    const next = direction < 0 ? { value: "2", code: "Numpad2", number: 98 }
        : { value: "8", code: "Numpad8", number: 104 };
    state.tiltKey = next;
    dispatchKey(next.value, next.code, next.number, true, false, state.queueModifierHeld, 3);
    const finish = () => { releaseTilt(false); pumpTilt(); };
    // One rendered native frame per deliberate step of travel, rather than holding the
    // engine's fast pitch binding for the whole drag. Slow drags stay precise.
    if (typeof requestAnimationFrame === "function") {
      state.tiltReleaseFrame = requestAnimationFrame(() => {
        state.tiltReleaseFrame = requestAnimationFrame(finish);
      });
      state.tiltReleaseTimer = setTimeout(finish, 100);
    } else state.tiltReleaseTimer = setTimeout(finish, 32);
  }

  function advanceTilt(dy) {
    if (!Number.isFinite(dy) || Math.abs(dy) < 1e-6) return;
    state.tiltBudget += dy;
    pumpTilt();
    state.tiltMoves += 1;
  }

  function rotationAllowed() {
    if (!state.battleActive || window.__towersHtml?.isEnded?.()
        || window.__towersHtml?.report?.().menuRequested) return false;
    if (campaign && (!window.__warzoneCampaign || window.__warzoneCampaign.nativeUiActive())) return false;
    if (ffa && (!window.__warzoneFfa || window.__warzoneFfa.nativeUiActive())) return false;
    if (window.__warzoneCommands?.nativeMenuOpen?.()
        || window.__blockNightResearch?.report?.().open
        || window.__warzoneIntelligence?.report?.().open) return false;
    return true;
  }

  function releaseRotation(clearBudget = true) {
    clearTimeout(state.rotationReleaseTimer);
    state.rotationReleaseTimer = null;
    if (state.rotationReleaseFrame !== null && typeof cancelAnimationFrame === 'function')
      cancelAnimationFrame(state.rotationReleaseFrame);
    state.rotationReleaseFrame = null;
    if (clearBudget) state.rotationBudget = 0;
    if (state.rotationKey) {
      const key = state.rotationKey; state.rotationKey = null;
      dispatchKey(key.value, key.code, key.number, false, false, false, 3);
    }
  }

  function pumpRotation() {
    if (state.rotationKey || Math.abs(state.rotationBudget) + 1e-9 < ROTATE_STEP
        || state.multi?.gesture !== 'rotate' || state.panRelease) return;
    if (!rotationAllowed()) {
      releaseRotation(); state.ignoreUntilAllUp = true; return;
    }
    const direction = Math.sign(state.rotationBudget);
    state.rotationBudget -= direction * ROTATE_STEP;
    const next = direction > 0 ? {value:'6',code:'Numpad6',number:102}
        : {value:'4',code:'Numpad4',number:100};
    state.rotationKey = next; state.rotationSteps += 1;
    dispatchKey(next.value, next.code, next.number, true, false, false, 3);
    const finish = () => {
      if (state.rotationKey !== next) return;
      releaseRotation(false); pumpRotation();
    };
    // Match the existing native pitch pulses: consume a rendered frame, with a
    // bounded fallback. Lift/cancel/navigation releases the key immediately.
    if (typeof requestAnimationFrame === 'function') {
      state.rotationReleaseFrame = requestAnimationFrame(() => {
        state.rotationReleaseFrame = requestAnimationFrame(finish);
      });
      state.rotationReleaseTimer = setTimeout(finish, 100);
    } else state.rotationReleaseTimer = setTimeout(finish, 32);
  }

  function advanceRotation(angle) {
    if (!Number.isFinite(angle) || Math.abs(angle) < 1e-6) return;
    if (state.rotationBudget * angle < 0 || state.rotationKey
        && (state.rotationKey.code === 'Numpad6' ? 1 : -1) !== Math.sign(angle)) releaseRotation();
    // Never leave an unbounded queue of camera movement after a fast twist.
    state.rotationBudget = Math.max(-Math.PI, Math.min(Math.PI, state.rotationBudget + angle));
    state.rotationMoves += 1;
    pumpRotation();
  }

  function clearRotationIntentTimer() {
    clearTimeout(state.rotationIntentTimer); state.rotationIntentTimer = null;
  }

  function clearZoomIntentTimer() {
    clearTimeout(state.zoomIntentTimer); state.zoomIntentTimer = null;
  }

  function sameMultiGesture(gesture) {
    const ids = [...state.pointers.keys()];
    return state.multi === gesture && state.pointers.size === 2 && !state.ignoreUntilAllUp
        && canvas() === gesture.canvas && gesture.session === (window.__towersHtml?.session || '')
        && ids.every((id, index) => id === gesture.pointerIds[index]);
  }

  function rotationIntentReady(gesture, distance, delta) {
    if (distance < 24 || gesture.startDistance < 24) {
      gesture.rotationIntent = null; clearRotationIntentTimer(); return false;
    }
    if (Math.abs(delta) > 1e-6) {
      const direction = Math.sign(delta), previous = gesture.rotationIntent;
      gesture.rotationIntent = previous?.direction === direction
          ? {...previous, samples:previous.samples + 1}
          : {direction, origin:gesture.angleTravel - delta, samples:1, since:performance.now()};
    }
    const intent = gesture.rotationIntent, offset = gesture.angleTravel - gesture.rotationBaseAngle;
    if (!intent || Math.sign(offset) !== intent.direction) { clearRotationIntentTimer(); return false; }
    const travel = Math.min(Math.abs(offset), intent.direction * (gesture.angleTravel - intent.origin));
    const threshold = gesture.gesture === null ? ROTATE_START : ROTATE_HANDOFF;
    const deliberate = gesture.rotationWorld && travel >= threshold
        && travel * Math.min(distance, gesture.startDistance) / 2 >= ROTATE_TRAVEL;
    if (!deliberate) { clearRotationIntentTimer(); return false; }
    if (intent.samples >= 2 || performance.now() - intent.since >= ROTATE_SETTLE_MS) {
      clearRotationIntentTimer(); return true;
    }
    if (state.rotationIntentTimer === null) {
      state.rotationIntentTimer = setTimeout(() => {
        state.rotationIntentTimer = null;
        if (sameMultiGesture(gesture)) {
          if (rotationAllowed()) handleMultiMove(); else cancelMulti();
        }
      }, Math.max(1, ROTATE_SETTLE_MS - (performance.now() - intent.since)));
    }
    return false;
  }

  function retainZoomOwnership(gesture, distance, distanceDelta, angleDelta) {
    const motion = gesture.zoomMotion;
    motion.push({distance, angle:gesture.angleTravel});
    if (motion.length > 6) motion.shift();
    if (gesture.gesture !== 'zoom' || !gesture.zoomOutput) return false;
    const previous = motion[motion.length - 2] || motion[0], recent = motion[0];
    const radial = Math.abs(distance - recent.distance);
    const angular = Math.abs(gesture.angleTravel - recent.angle) * Math.min(distance, recent.distance);
    const currentAngular = Math.abs(angleDelta) * Math.min(distance, previous.distance);
    if (Math.abs(distanceDelta) > 1e-6 && Math.abs(distanceDelta) > currentAngular * 1.2
        && radial > angular * 1.2) {
      // Ongoing emitted pinch owns its radial movement. Discard incidental
      // angular drift so stopping the pinch cannot replay that old drift as yaw.
      gesture.rotationBaseAngle = gesture.angleTravel; gesture.rotationIntent = null;
      clearRotationIntentTimer(); return true;
    }
    return false;
  }

  function zoomIntentReady(gesture, distance, delta) {
    if (Math.abs(delta) > 1e-6) {
      const direction = Math.sign(delta), previous = gesture.zoomIntent;
      gesture.zoomIntent = previous?.direction === direction
          ? {...previous, samples:previous.samples + 1}
          : {direction, samples:1, since:performance.now()};
    }
    const intent = gesture.zoomIntent, offset = distance - gesture.startDistance;
    if (!intent || Math.sign(offset) !== intent.direction || Math.abs(offset) < PINCH_START) {
      clearZoomIntentTimer(); return false;
    }
    if (intent.samples >= 2 || performance.now() - intent.since >= ROTATE_SETTLE_MS) {
      clearZoomIntentTimer(); return true;
    }
    if (state.zoomIntentTimer === null) state.zoomIntentTimer = setTimeout(() => {
      state.zoomIntentTimer = null;
      if (sameMultiGesture(gesture)) {
        if (rotationAllowed()) handleMultiMove(); else cancelMulti();
      }
    }, Math.max(1, ROTATE_SETTLE_MS - (performance.now() - intent.since)));
    return false;
  }

  function beginMultiRotation(gesture, delta) {
    const previous = gesture.gesture, offset = gesture.angleTravel - gesture.rotationBaseAngle;
    clearRotationIntentTimer(); clearZoomIntentTimer(); releaseTilt(); releaseRotation(); releaseCameraKeys();
    if (previous === 'pan' && window.__warzoneDuelConfig?.mode !== 'duel')
      finishFramePan({...gesture, x:gesture.center.x, y:gesture.center.y}, true);
    else releaseMouse();
    setQueueModifier(false);
    gesture.gesture = 'rotate';
    // A handoff accepts the present angular intent, not the old pan/span/tilt
    // history. Start with one small yaw step and rebase subsequent travel.
    const accepted = previous === null ? offset
        : Math.sign(offset) * Math.min(Math.abs(delta) || ROTATE_STEP, ROTATE_STEP);
    gesture.rotationAngle = gesture.angleTravel;
    advanceRotation(accepted);
    if (state.panRelease) state.afterInput.push(() => {
      if (sameMultiGesture(gesture) && rotationAllowed()) pumpRotation();
    });
  }

  function radarPoint(x, y) {
    if(campaign&&(!window.__warzoneCampaign||window.__warzoneCampaign.nativeUiActive()))return null;
    if(campaign){
      const geometry=campaignRadarGeometry();if(!geometry)return null;
      const {bounds,radar,scaleX,scaleY,c,s}=geometry;
      const dx=Math.trunc((x-bounds.left)/scaleX)-radar.centerX,dy=Math.trunc((y-bounds.top)/scaleY)-radar.centerY;
      const localX=dx*c-dy*s,localY=dx*s+dy*c;
      if(localX < -radar.width/2||localX >= radar.width/2||localY < -radar.height/2||localY >= radar.height/2)return null;
      return {x:(x-bounds.left)/bounds.width,y:(y-bounds.top)/bounds.height};
    }
    if(window.__warzoneCommands?.nativeHudHidden?.())return null;
    const target = canvas();
    if (!target) return null;
    const bounds = target.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    const normalizedX = (x - bounds.left) / bounds.width;
    const normalizedY = (y - bounds.top) / bounds.height;

    // radar.cpp fits the longest map side to 128 * radarZoom / 16. Both
    // supported maps use the startup's absolute 180-degree radar orientation.
    if (!state.radarSide) {
      try {
        const module = window.LaunchedModule?.FS ? window.LaunchedModule : window.Module;
        const path = (module.WZVAL_configDirPath || "/warzone2100") + "/config";
        const config = module.FS.readFile(path, { encoding: "utf8" });
        const zoom = Number(config.match(/^radarZoom=(\d+)/m)?.[1] || 24);
        state.radarSide = 128 * Math.max(8, Math.min(64, zoom)) / 16;
      } catch (_) { /* The engine config may not exist during startup. */ }
    }
    const side = state.radarSide || 192;
    const snapshot=window.__warzoneCommands?.report?.().snapshot;
    const mapWidth=snapshot?.mapWidth||64,mapHeight=snapshot?.mapHeight||64,span=Math.max(mapWidth,mapHeight);
    const radarWidth=side*mapWidth/span,radarHeight=side*mapHeight/span;
    const centreX=bounds.width-24-side/2,centreY=bounds.height-24-side/2;
    const localX = x - bounds.left, localY = y - bounds.top;
    if (localX < centreX-radarWidth/2 || localX > centreX+radarWidth/2
        || localY < centreY-radarHeight/2 || localY > centreY+radarHeight/2) return null;
    return { x: normalizedX, y: normalizedY };
  }

  function isBattlefieldPoint(x, y) {
    if(campaign&&(!window.__warzoneCampaign||window.__warzoneCampaign.nativeUiActive()))return false;
    const target = canvas();
    if (!target || radarPoint(x, y) !== null) return false;
    const bounds = target.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return false;
    if (window.__warzoneCommands?.tower) {
      if (window.__warzoneCommands.nativeMenuOpen()) return false;
      if (window.__warzoneCommands.nativeBuildOpen?.()&&!window.__warzoneCommands.isPlacement?.()&&!window.__warzoneCommands.nativeHudHidden?.()) {
        const ui=nativeUiRects(),lx=x-bounds.left,ly=y-bounds.top;
        if((window.__warzoneCommands.nativeBuildMenuOpen?.()&&inRect(lx,ly,ui.stats))||inRect(lx,ly,ui.objects))return false;
      }
      return x >= bounds.left && y >= bounds.top && x < bounds.right && y < bounds.bottom;
    }
    const normalizedX = (x - bounds.left) / bounds.width;
    const normalizedY = (y - bounds.top) / bounds.height;

    // Reserve the bottom HUD, the settings corner and the side radar for
    // their own UI actions. The remaining area is the orderable battlefield.
    return normalizedX >= Math.max(0.16, 140 / bounds.width) && normalizedX <= 0.83
        && normalizedY >= 0.06 && normalizedY <= 0.70;
  }

  function nativeUiRects() {
    const bounds = canvas()?.getBoundingClientRect();
    if (!bounds) return null;
    // Unscaled 4.7 hci.h rectangles. D_W centres the bottom object list.
    return { bounds,
      reticle: { x: 6, y: bounds.height - 136, w: 132, h: 132 },
      stats: { x: 6, y: bounds.height - 460, w: 132, h: 322 },
      objects: { x: 144 + (bounds.width - 640) / 2, y: bounds.height - 136, w: 320, h: 115 }
    };
  }

  function inRect(x, y, rect) {
    return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
  }

  function trackNativePanelTap(x, y) {
    if (window.__warzoneCommands?.tower) return;
    if (!state.hudVisible) return;
    const ui = nativeUiRects();
    if (!ui) return;
    x -= ui.bounds.left; y -= ui.bounds.top;
    if (inRect(x, y, ui.reticle)) {
      state.nativeObjectsOpen = true; state.nativeStatsOpen = true;
    } else if (state.nativeObjectsOpen && inRect(x, y, ui.objects)) {
      if (x > ui.objects.x + 300 && y < ui.objects.y + 18) {
        state.nativeObjectsOpen = false; state.nativeStatsOpen = false;
      } else state.nativeStatsOpen = true;
    } else if (state.nativeStatsOpen && inRect(x, y, ui.stats)) {
      const localY = y - ui.stats.y;
      if ((x > 120 && localY < 18) || localY >= 42) state.nativeStatsOpen = false;
    }
  }

  function isQueuePlacementPoint(x, y) {
    const ui = nativeUiRects();
    if (!ui || radarPoint(x, y)) return false;
    x -= ui.bounds.left; y -= ui.bounds.top;
    if (x < 0 || y < 0 || x >= ui.bounds.width || y >= ui.bounds.height) return false;
    if(window.__warzoneCommands?.nativeHudHidden?.())return true;
    if (inRect(x, y, ui.reticle)) return false;
    if ((state.nativeObjectsOpen||window.__warzoneCommands?.nativeBuildOpen?.()) && inRect(x, y, ui.objects)) return false;
    if ((state.nativeStatsOpen||window.__warzoneCommands?.nativeBuildMenuOpen?.()) && inRect(x, y, ui.stats)) return false;
    return true;
  }

  function showCombatHud() {
    if (!state.battleActive) return false;
    const hudDocument = commandDocument();
    let hud = hudDocument.getElementById("blocknight-combat-hud");
    if (!hud) {
      const style = document.createElement("style");
      style.textContent = `
        #blocknight-combat-hud {
          position: fixed; left: 7px; top: 7px; z-index: 2147483647;
          display: flex; align-items: center; gap: 4px; height: 32px;
          padding: 3px; box-sizing: border-box; pointer-events: auto;
          font-family: system-ui, sans-serif; background: rgba(2, 8, 12, .92);
          border: 1px solid rgba(240,180,60,.52); border-radius: 7px;
          box-shadow: 0 2px 8px rgba(0,0,0,.62);
        }
        #blocknight-combat-hud .bn-command-group {
          display: flex; align-items: center; gap: 2px; height: 24px;
        }
        #blocknight-combat-hud .bn-command-group + .bn-command-group {
          padding-left: 4px; border-left: 1px solid rgba(240,180,60,.28);
        }
        #blocknight-combat-hud button {
          width: 42px; height: 24px; min-width: 0; margin: 0; padding: 0 2px;
          border: 1px solid rgba(240,180,60,.72); border-radius: 4px;
          color: #f0d38a; background: rgba(3,7,5,.78);
          font: 800 9px/22px system-ui, sans-serif;
          letter-spacing: .2px; touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }
        #blocknight-combat-hud button.active {
          color: #061008; background: #78e889; border-color: #b8ffc1;
          box-shadow: 0 0 5px rgba(120,232,137,.65);
        }
        #blocknight-zoom-control {
          height: 24px; margin: 0; display: flex; overflow: hidden;
          border: 1px solid rgba(102,216,255,.62); border-radius: 5px;
          background: rgba(3,10,14,.82); box-shadow: inset 0 0 0 1px rgba(2,28,38,.7);
        }
        #blocknight-zoom-control button.zoom {
          width: auto; height: 22px; padding: 0 6px; border: 0;
          border-right: 1px solid rgba(102,216,255,.28); border-radius: 0;
          color: #9fcbd6; background: transparent; line-height: 22px;
          font-size: 8px; letter-spacing: .15px;
        }
        #blocknight-zoom-control button.zoom:last-child { border-right: 0; }
        #blocknight-combat-hud button.zoom.active {
          color: #071017; background: #66d8ff; border-color: #b8efff;
          box-shadow: inset 0 0 0 1px rgba(184,239,255,.5);
        }
        #blocknight-combat-hud button.zoom.pending {
          animation: blocknight-zoom-pending .45s ease-in-out infinite alternate;
        }
        .blocknight-touch-pulse {
          position: fixed; z-index: 2147483646; pointer-events: none;
          width: 22px; height: 22px; margin: -11px 0 0 -11px;
          border: 2px solid #f0b43c; border-radius: 50%;
          box-shadow: 0 0 7px rgba(240,180,60,.75);
          animation: blocknight-pulse .42s ease-out forwards;
        }
        .blocknight-touch-pulse.order { border-color: #7dff91; box-shadow: 0 0 8px #52df69; }
        .blocknight-touch-pulse.patrol { border-color: #61e8ff; box-shadow: 0 0 8px #42cce8; }
        .blocknight-touch-pulse.box, .blocknight-touch-pulse.double {
          border-color: #86b8ff; box-shadow: 0 0 8px #5d93df;
        }
        @keyframes blocknight-pulse {
          from { opacity: .95; transform: scale(.55); }
          to { opacity: 0; transform: scale(2.15); }
        }
        @keyframes blocknight-zoom-pending {
          from { filter: brightness(.82); }
          to { filter: brightness(1.18); }
        }
      `;
      document.head.appendChild(style);

      const theme = document.createElement("link");
      theme.rel = "stylesheet";
      theme.href = "/warzone/ui/towers-v4.css";
      document.head.appendChild(theme);
      if (hudDocument !== document) {
        const hostStyle = hudDocument.createElement("style");
        hostStyle.textContent = style.textContent;
        hudDocument.head.appendChild(hostStyle);
        const hostTheme = hudDocument.createElement("link");
        hostTheme.rel = "stylesheet";
        hostTheme.href = theme.href;
        hudDocument.head.appendChild(hostTheme);
      }

      // Towers' approved layout is isolated from the retained 1v1 interface.
      // These styles leave the native battlefield dimensions and input alone.
      if (window.__warzoneDuelConfig?.mode !== 'duel') {
        for (const surface of new Set([document, hudDocument])) {
          surface.body.classList.add('wt-towers-polished');
          if (!surface.getElementById('wt-towers-shell-style')) {
            const polishedTheme = surface.createElement('link');
            polishedTheme.id = 'wt-towers-shell-style';
            polishedTheme.rel = 'stylesheet';
            polishedTheme.href = '/warzone/ui/towers-shell.css';
            surface.head.appendChild(polishedTheme);
          }
          if (!surface.getElementById('wt-towers-monochrome-style')) {
            const monochromeTheme = surface.createElement('link');
            monochromeTheme.id = 'wt-towers-monochrome-style';
            monochromeTheme.rel = 'stylesheet';
            monochromeTheme.href = '/warzone/ui/towers-monochrome.css';
            surface.head.appendChild(monochromeTheme);
          }
          if (!surface.getElementById('wt-towers-game-controls-style')) {
            const gameControls = surface.createElement('link');
            gameControls.id = 'wt-towers-game-controls-style';
            gameControls.rel = 'stylesheet';
            gameControls.href = '/warzone/ui/towers-game-controls.css';
            surface.head.appendChild(gameControls);
          }
          if (!surface.getElementById('wt-towers-feedback-script')) {
            const feedback = surface.createElement('script');
            feedback.id = 'wt-towers-feedback-script';
            feedback.src = '/warzone/ui/towers-feedback.js';
            surface.head.appendChild(feedback);
          }
        }
      }

      hud = document.createElement("div");
      hud.id = "blocknight-combat-hud";
      hud.setAttribute("role", "toolbar");
      hud.setAttribute("aria-label", "Warzone Towers commands");
      const makeButton = (id, label, title, action) => {
        const button = document.createElement("button");
        button.id = id;
        button.type = "button";
        const iconNames = {
          "blocknight-select-all": "stack", "wt-all-combat": "stack", "blocknight-auto-fight": "arrows-clockwise",
          "blocknight-box-select": "selection", "blocknight-queue-orders": "stack-plus",
          "blocknight-stop": "hand-palm", "blocknight-base": "house",
          "blocknight-zoom-close": "x", "blocknight-zoom-battle": "crosshair",
          "blocknight-zoom-map": "map-pin", "blocknight-tech": "flask", "wt-open-players": "stack",
          "blocknight-help": "question", "blocknight-music": "music-notes", "blocknight-save": "save", "blocknight-rewards": "crystal", "blocknight-lassat": "crosshair", "wt-select-move": "crosshair", "wt-select-trucks": "stack", "wt-deselect-units": "deselect", "wt-demolish": "x", "wt-intelligence": "crosshair"
        };
        const icon = document.createElement("img");
        icon.src = `/warzone/ui/icons/${iconNames[id]}.svg`;
        if (id === 'blocknight-rewards') icon.style.filter = 'none';
        icon.alt = "";
        icon.setAttribute("aria-hidden", "true");
        const caption = document.createElement("span");
        caption.textContent = label;
        button.append(icon, caption);
        button.title = title;
        // Keep touch commands from stealing focus (and held native queue keys)
        // from the engine frame when the command row lives in its parent.
        bindTouchCommand(button, () => {
          if (id !== 'blocknight-lassat') window.WarzoneRewards?.cancelTarget?.();
          if (['blocknight-tech','blocknight-help','blocknight-music','blocknight-rewards'].includes(id)
              && !prepareHeaderMenu(id)) return;
          action();
        });
        return button;
      };
      const all = makeButton("blocknight-select-all", "ALL",
        "Keep all combat units selected (constructors excluded)", ()=>{const result=toggleCombatLock();window.__warzoneCommands?.afterBuildExit?.(()=>true);return result;});
      const auto = makeButton("blocknight-auto-fight", "AUTO",
        "Native Patrol orders for all combat units", async()=>{const enabled=state.autoFight;if(window.__warzoneCommands?.afterBuildExit)await window.__warzoneCommands.afterBuildExit(()=>toggleAutoFight(!enabled));else toggleAutoFight(!enabled);});
      const box = makeButton("blocknight-box-select", "BOX",
        "One-shot rectangle selection: tap BOX, then drag", async()=>{const enabled=state.boxMode;if(window.__warzoneCommands?.afterBuildExit)await window.__warzoneCommands.afterBuildExit(()=>toggleBoxMode(!enabled));else toggleBoxMode(!enabled);});
      const queue = makeButton("blocknight-queue-orders", "+Q",
        "Sticky build queue: select a structure once, then place it repeatedly", toggleQueueMode);
      const stop = makeButton("blocknight-stop", "STOP",
        "Stop currently selected units", async()=>{if(window.__warzoneCommands?.afterBuildExit)await window.__warzoneCommands.afterBuildExit(stopSelected,true);else stopSelected();});
      const base = makeButton("blocknight-base", "BASE",
        "Center camera on HQ", jumpToBase);
      let zoomGroup = null;
      if (window.__warzoneDuelConfig?.mode === 'duel') {
        const zoomControl = document.createElement("div");
        zoomControl.id = "blocknight-zoom-control";
        zoomControl.setAttribute("role", "group");
        zoomControl.setAttribute("aria-label", "Camera distance");
        const zoomButtons = Object.entries(ZOOM_PRESETS).map(([preset, spec]) => {
          const button = makeButton(`blocknight-zoom-${preset}`, spec.label,
            `${spec.label.toLowerCase()} camera view`, () => applyZoomPreset(preset));
          button.className = "zoom";
          button.setAttribute("aria-pressed", "false");
          return button;
        });
        zoomControl.append(...zoomButtons);
        zoomGroup = document.createElement("div");
        zoomGroup.className = "bn-command-group";
        zoomGroup.append(zoomControl);
      }
      const tech = makeButton("blocknight-tech", window.__warzoneDuelConfig?.mode === 'duel' ? "TECH" : "RESEARCH",
        "Open or close research", () => {
          if (window.__warzoneDuelConfig?.mode !== 'duel'
              && (window.__blockNightResearch?.report?.().open || window.__blockNightResearch?.report?.().opening)) {
            window.__blockNightResearch.close(); return;
          }
          if(window.__warzoneCommands?.afterBuildExit)window.__warzoneCommands.afterBuildExit(()=>window.__blockNightResearch?.open?.());
          else window.__blockNightResearch?.open?.();
        });
      tech.setAttribute('aria-controls','blocknight-research-shell');
      tech.setAttribute('aria-expanded','false');
      const help = makeButton("blocknight-help", "HELP", "Open or close how to play", toggleHelp);
      help.setAttribute('aria-controls','warzone-towers-help-overlay');
      help.setAttribute('aria-expanded','false');
      const orderGroup = document.createElement("div");
      orderGroup.className = "bn-command-group";
      orderGroup.append(all, auto, box, queue, stop, base);
      if (window.__warzoneCommands?.tower && !campaign && window.__warzoneDuelConfig?.mode !== 'duel') {
        const headerAll = makeButton('wt-all-combat', 'ALL COMBAT',
          'Keep all owned combat units selected; press again to turn off and deselect combat units', () => {
            const result=toggleCombatLock();window.__warzoneCommands?.afterBuildExit?.(()=>true);return result;
          });
        headerAll.setAttribute('aria-pressed', 'false');
        headerAll.dataset.combatSelected = 'false';
        orderGroup.appendChild(headerAll);
      }
      const techGroup = document.createElement("div");
      techGroup.className = "bn-command-group";
      techGroup.append(tech);
      if (window.__warzoneDuelConfig?.mode !== 'duel') {
        const music = makeButton("blocknight-music", "MUSIC", "Map soundtrack: turn music on or off",
          () => window.WarzoneMusic?.showMenu?.(music, hudDocument, bindTouchCommand));
        music.setAttribute('aria-haspopup', 'dialog');
        music.setAttribute('aria-controls', 'wt-map-music-menu');
        music.setAttribute('aria-expanded', 'false');
        techGroup.append(music);
        const rewards = makeButton('blocknight-rewards', 'REWARDS',
          'Crystal wallet and active match boosts', () => window.WarzoneRewards?.open?.());
        rewards.setAttribute('aria-expanded','false');
        techGroup.append(rewards);
        if(campaign||ffa)rewards.remove();
        const save = makeButton('blocknight-save', 'SAVE',
          'Save this game on your phone', () => window.WarzoneSavedGames?.save?.());
        save.setAttribute('aria-live', 'polite');
        let saveFeedbackTimer = 0;
        const syncSaveButton = () => {
          clearTimeout(saveFeedbackTimer);
          const snapshot = window.WarzoneSavedGames?.report?.() || {};
          const busy = snapshot.busy === true;
          const savedFor = Date.now() - Number(snapshot.statusAt || 0);
          const saved = snapshot.phase === 'saved' && savedFor < 4000;
          const failed = snapshot.phase === 'error';
          save.querySelector('span').textContent = busy ? 'SAVING…' : saved ? 'SAVED' : failed ? 'RETRY' : 'SAVE';
          save.disabled = Boolean(state.stopNonce) || busy || snapshot.ended === true;
          save.setAttribute('aria-busy', String(busy));
          save.dataset.saveState = busy ? 'saving' : saved ? 'saved' : failed ? 'error' : 'idle';
          save.title = (busy || saved || failed) && snapshot.status ? snapshot.status : 'Save this game on your phone';
          if (saved) saveFeedbackTimer = setTimeout(syncSaveButton, Math.max(1, 4000 - savedFor));
        };
        window.addEventListener('warzone-save-state', syncSaveButton);
        syncSaveButton();
        techGroup.append(save);
        const laser = makeButton('blocknight-lassat', 'SELECT SAT',
          'Select your Laser Satellite Command Post, then target an enemy', () => window.WarzoneRewards?.armLaser?.());
        laser.style.display = 'none';
        techGroup.append(laser);
      }
      const players=makeButton('wt-open-players','PLAYERS','Show current players and spectators',()=>{
        if(!prepareHeaderMenu('players'))return;
        window.__warzoneCommands?.toggle?.('players');
      });
      players.setAttribute('aria-controls','wt-command-pages');players.setAttribute('aria-expanded','false');
      techGroup.append(players);
      techGroup.append(help);
      window.WarzoneRewards?.updateBalance?.();
      if (window.__warzoneCommands?.tower) {
        hud.classList.add("wt-modern");
        const commands = document.createElement("div");
        commands.className = "bn-command-group";
        const duelNavigation = window.__warzoneDuelConfig?.mode === 'duel';
        // Actual DOM order also defines keyboard and accessibility navigation.
        // Moving the existing Research button keeps its toggle/input handlers.
        if (!duelNavigation) commands.appendChild(tech);
        for (const page of (duelNavigation ? ["build", "design", "factory", "queue"] : ["factory", "queue"])) {
          const b = document.createElement("button");
          b.id = `wt-open-${page}`; b.type = "button"; b.textContent = !duelNavigation && page === 'factory' ? 'MANUFACTURING' : page.toUpperCase();
          b.title = `Open ${!duelNavigation && page === 'factory' ? 'manufacturing' : page}`;
          b.setAttribute('aria-controls', page === 'build' ? 'wt-build-sidebar' : 'wt-command-pages');
          b.setAttribute('aria-expanded','false');
          bindTouchCommand(b, () => {
            if (!prepareHeaderMenu('commands')) return;
            if (!duelNavigation && window.__warzoneCommands.toggle) window.__warzoneCommands.toggle(page);
            else window.__warzoneCommands.open(page);
          });
          commands.appendChild(b);
        }
        hud.appendChild(commands);
      }
      if(window.__warzoneCommands?.tower){
        const centre=hudDocument.createElement('section');centre.id='wt-field-centre';centre.setAttribute('aria-label','Battlefield command centre');
        const select=makeButton('wt-select-move','SELECT / MOVE','Exit build placement and return to unit selection and movement',()=>window.__warzoneCommands.selectMode());
        const trucks=makeButton('wt-select-trucks','TRUCKS','Select construction trucks visible in the battlefield',()=>window.__warzoneCommands.selectNearbyTrucks());
        all.querySelector?.('span')&&(all.querySelector('span').textContent='ALL UNITS');
        auto.querySelector?.('span')&&(auto.querySelector('span').textContent='PATROL');
        if(window.__warzoneDuelConfig?.mode==='duel')centre.append(select,all,auto,box,stop,trucks);
        else {
          auto.remove();box.remove();
          const demolish=makeButton('wt-demolish','DEMOLISH','Use selected construction trucks to demolish one of your structures',()=>window.__warzoneCommands.toggleDemolish());
          demolish.setAttribute('aria-pressed','false');
      const intelligence=makeButton('wt-intelligence','INTELLIGENCE','Show intelligence for the current battle',()=>campaign?window.__warzoneCampaign?.openIntel?.():window.__warzoneIntelligence?.toggle());
          const deselect=makeButton('wt-deselect-units','DESELECT','Clear all unit selection; existing orders continue',()=>window.__warzoneCommands.deselectUnits());
          centre.append(demolish,intelligence,all,deselect,stop,trucks);
        }
        hudDocument.body.appendChild(centre);
        const toggle=hudDocument.createElement('button');toggle.id='wt-field-toggle';toggle.type='button';
        toggle.setAttribute('aria-controls','wt-field-centre');toggle.setAttribute('aria-label','Unit controls');toggle.title='Unit controls';
        toggle.innerHTML='<img src="/warzone/ui/icons/stack.svg" alt=""><span id="wt-field-toggle-count"></span>';
        const compact=hudDocument.defaultView.matchMedia('(max-width:1100px), (max-height:650px)');let expanded=!compact.matches;
        const update=()=>{hudDocument.body.dataset.fieldCompact=String(compact.matches);hudDocument.body.dataset.fieldExpanded=String(expanded);toggle.setAttribute('aria-expanded',String(expanded));centre.setAttribute('aria-hidden',String(!expanded));centre.inert=!expanded;};
        bindTouchCommand(toggle,()=>{expanded=!expanded;update();});
        const collapse=()=>{if(compact.matches){expanded=false;update();}};
        // Complete the button's release/click handler before making its parent
        // inert. A microtask here runs before the target listener in WebView.
        centre.addEventListener('click',()=>setTimeout(collapse,0),true);
        centre.addEventListener('pointerup',e=>{const b=e.target.closest('button');if(!b)return;const r=b.getBoundingClientRect();if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom)setTimeout(collapse,0);},true);
        compact.addEventListener('change',()=>{expanded=!compact.matches;update();});
        window.addEventListener('warzone-build-sidebar-open',()=>{if(compact.matches){expanded=false;update();}});
        hudDocument.body.appendChild(toggle);update();
      }
      hud.append(orderGroup);
      if (zoomGroup) hud.append(zoomGroup);
      hud.append(techGroup);
      (hudDocument.getElementById("warzone-command-strip") || hudDocument.body).appendChild(hud);
    }
    hud.hidden = false;
    state.hudVisible = true;
    refreshCombatSelection();
    showBattlefieldViewport();
    updateCombatHud();
    window.WarzoneMusic?.setBattleActive?.(true);
    return true;
  }

  function showBattlefieldViewport() {
    const container = document.getElementById("emscripten_container");
    if (!container || !state.hudVisible) return;
    container.style.transform = "none";
    container.style.transformOrigin = "";
    window.parent?.WarzoneHost?.setPlaying();
  }

  function setHeaderMenuState(id, open) {
    const aliases = {research:'blocknight-tech',tech:'blocknight-tech',help:'blocknight-help',music:'blocknight-music',rewards:'blocknight-rewards',build:'wt-open-build',factory:'wt-open-factory',production:'wt-open-factory',queue:'wt-open-queue',players:'wt-open-players'};
    const button = commandDocument().getElementById(aliases[id] || id);
    if (!button) return;
    const wasOpen = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(Boolean(open)));
    button.setAttribute('aria-pressed', String(Boolean(open)));
    button.classList.toggle('active', Boolean(open));
    if (wasOpen && !open) {
      const pages = window.__warzoneCommands?.report?.() || {};
      if (!pages.buildOpen && !pages.placement && !pages.selectingTrucks && !pages.nativeMenu && !pages.exitingBuild && !pages.demolition)
        resumeCombatSelection();
    }
  }

  function closeHelp() {
    const overlay = commandDocument().getElementById('warzone-towers-help-overlay');
    if (!overlay || overlay.hidden) return false;
    overlay._restoreBattle?.();
    return true;
  }

  function prepareHeaderMenu(id) {
    if (window.__warzoneDuelConfig?.mode === 'duel') return true;
    if (id !== 'blocknight-rewards') window.WarzoneRewards?.closeDrawer?.();
    if (id !== 'blocknight-help') closeHelp();
    if (id !== 'blocknight-music') window.WarzoneMusic?.closeMenu?.(false);
    if (id !== 'blocknight-tech') {
      const research = window.__blockNightResearch;
      if (research?.report?.().open || research?.report?.().opening) {
        research.close();
        // A failed queue sync keeps the Research page and its error visible.
        if (research.report().open || research.report().opening) return false;
      }
    }
    return true;
  }

  function activateFooterBuild() {
    if (window.__warzoneDuelConfig?.mode === 'duel' || !state.battleActive || state.stopNonce
        || window.__towersHtml?.isEnded?.() || !prepareHeaderMenu('commands')) return false;
    window.WarzoneRewards?.cancelTarget?.();
    // The existing toggle owns truck selection, queued work and input restoration.
    // Moving the control must not create another construction implementation.
    return window.__warzoneCommands?.toggle?.('build');
  }

  function toggleHelp() {
    if (window.__warzoneDuelConfig?.mode !== 'duel' && closeHelp()) return true;
    return showHelp();
  }

  function showHelp() {
    if (!state.battleActive) return false;
    if (!prepareHeaderMenu('blocknight-help')) return false;
    window.WarzoneMusic?.closeMenu?.(false);
    if(window.__warzoneCommands?.nativeBuildOpen?.()){window.__warzoneCommands.afterBuildExit(showHelp);return true;}
    window.__warzoneCommands?.close?.();
    window.__warzoneCommands?.closeNative?.();
    const hudDocument = commandDocument();
    const duel=window.__warzoneDuelConfig?.mode==='duel'&&Object.isFrozen(window.__warzoneDuelConfig);
    const helpMap = new URLSearchParams(window.location.search).get("map");
    const helpLevel = window.WarzoneLevelInfo?.[helpMap];
    const towersRounds = helpLevel?.rounds ?? (helpMap === "beginner" ? 15 : 30);
    const preparationMinutes = (helpLevel?.preparationSeconds ?? (helpMap === "beginner" ? 240 : 180)) / 60;
    const humanBranch=window.__warzoneDuelConfig?.humanBranch==='rockets'?'Rockets':'Cannon',botBranch=window.__warzoneDuelConfig?.botBranch==='rockets'?'Rockets':'Cannon';
    let help = hudDocument.getElementById("warzone-towers-help");
    const syncHelpSize = () => {
      if (duel) return;
      const size = Number(hudDocument.documentElement.style.getPropertyValue('--wt-command-scale')) || 1;
      for (const button of help.querySelectorAll('[data-ui-size]')) {
        const selected = Math.abs(Number(button.dataset.uiSize) - size) < 0.01;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
      }
    };
    if (!help) {
      const overlay = hudDocument.createElement("div");
      overlay.id = "warzone-towers-help-overlay";
      overlay.hidden = true;
      help = hudDocument.createElement("section");
      help.id = "warzone-towers-help";
      help.setAttribute("role", "dialog");
      help.setAttribute("aria-modal", duel ? "true" : "false");
      help.setAttribute("aria-labelledby", "wt-help-title");
      help.tabIndex = -1;
      const guideContent = duel ? `
          <section class="wt-help-queue"><h2>BUILD · QUEUE YOUR DEFENCES</h2>
            <ol><li><b>Open BUILD.</b> Scroll the sidebar and choose a structure.</li>
              <li><b>Tap each valid location.</b> Queued sites appear as Warzone’s green building blueprints.</li>
              <li><b>Visible trucks work together.</b> BUILD selects the trucks in view; your later manual selection is retained when choosing a structure.</li>
              <li><b>SELECT / MOVE</b> leaves placement and keeps queued work. Placement also ends when your group finishes.</li></ol>
            <p>Invalid taps keep your chosen structure active. STOP cancels selected trucks’ orders,
              and clears their remaining native queued sites.</p></section>
          <section><h2>DESTROY THE ENEMY COMMAND CENTRE</h2>
            <p>Your weapon branch is <b>${humanBranch}</b>. The opponent uses <b>${botBranch}</b>.
              Research your weapons and shared body, propulsion, armour and economy upgrades. Each laboratory follows your chosen queue.</p>
            <p>Build and command your ground forces with normal power and production time. Destroy the enemy Command Centre to win; protect your own to stay in the battle. Aircraft are unavailable.</p></section>
          <section><h2>MOVE &amp; LOOK</h2>
            <p><b>Tap</b> to select, move or attack. <b>Swipe</b> to pan. <b>Pinch</b> to zoom.
              <b>Slide two fingers together up/down</b> to tilt the camera. Map edges limit panning.
              <b>SELECT / MOVE</b> returns to ordinary unit selection and orders. Tap <b>BOX</b> then drag to select a group.</p>
            <p><b>NEAR / BATTLE / MAP</b> set camera distance. <b>BASE</b> returns to your command centre.</p></section>
          <section><h2>COMMANDS &amp; RESEARCH</h2>
            <p>On small screens, tap the bottom-left units icon to expand <b>ALL UNITS</b>, <b>PATROL</b>, <b>BOX</b>, <b>STOP</b> and <b>TRUCKS</b>. ALL selects combat units; TRUCKS selects the nearby constructor group. Control size and Commanders are at the top of this guide.
              <b>STOP</b> stops selected units.</p>
            <p><b>TECH</b> opens research. Choose a lab and add available topics to its queue.
              Each lab completes your choices in order. Use <b>BACK TO BATTLE</b> to return.</p>
            <p><b>DESIGN</b> creates blueprints from researched parts. SAVE DESIGN keeps them on this device.
              <b>FACTORY</b> produces saved or existing designs with normal power and build time.
              </p></section>
          <section><h2>MUSIC</h2><p>Choose your tracks on the start screen before starting a battle. Download Music once, select your playlist, then press <b>START GAME</b>. Your choices are saved for the next game.</p></section>` : `
          <section><h2>DEFEND &amp; SURVIVE</h2>
            <p>Protect your <b>Command Centre</b>; losing it ends the battle. You have <b>${preparationMinutes} minutes to prepare</b> before Wave 1 starts automatically. Survive <b>${towersRounds} rounds</b> and clear the final enemies to win.</p>
            <p>Waves follow their own timer, even while enemies remain. During a countdown, <b>SKIP WAVE</b> calls the next wave early; it does not clear enemies. Destroying enemies earns power.</p></section>
          <section><h2>CRYSTALS &amp; MATCH BOOSTS</h2>
            <p><b>REWARDS</b> on Home shows your saved phone wallet and portable inventory. A new wallet starts with <b>350 crystals</b>. Each actually completed wave earns <b>5 crystals</b>, saved once even if you later lose. Waves can overlap; starting or skipping a wave earns nothing. A win also pays <b>60 / 80 / 100</b> on Easy / Medium / Hard, plus <b>50</b> for that map's first completion. The final receipt includes crystals already earned during play.</p>
            <p>Tap a reward’s <b>picture or item row</b> to buy one at its crystal price. On Home, bought stock is selected for Play within the match limits. Tap its <b>Selected</b> count to choose how much to use; <b>0</b> leaves it stored. In-game <b>REWARDS</b> adds the item to the current match after the game accepts it. Purchases work on <b>any map</b>. You can use up to <b>three fortresses combined</b>. Every purchased structure still uses its normal in-game power cost. <b>Gain 10 Crystals</b> opens an optional rewarded ad. Ad privacy choices remain in the compact top row when available.</p>
            <p><b>SAVE</b> shows <b>SAVING…</b> while the game is written to your phone and <b>SAVED</b> only after it is verified. If saving fails, the button shows <b>RETRY</b> and explains the problem. Open <b>Saved Games</b> on Home to load or delete a match. Saved matches retain their wave credits, purchases and used allowances; reloading pays no crystals twice. Unused stock in a saved match stays reserved until its last save is deleted.</p>
            <p>A building purchase is used when its foundation appears, including if it is later destroyed. Unused building stock returns after the match or a confirmed return Home. Research accelerator adds <b>25%</b> speed while you choose topics; Supply reserve adds <b>1,000</b> starting power. These two boosts are used when the match starts.</p></section>
          <section><h2>LASER SATELLITE</h2>
            <p>The <b>Laser Satellite Command Post</b> is a weapon, separate from your Satellite Uplink. Build and complete the post, tap it on the battlefield to select it, then press <b>FIRE SAT</b> and tap a visible enemy unit or building. Its native recharge time is shown in the header. Press <b>CANCEL SAT</b> or Back to cancel targeting.</p></section>
          <section><h2>BUILD WITH YOUR TRUCKS</h2>
            <p><b>BUILD</b> in the bottom-left bar selects construction trucks visible in your view. Choose a structure, then tap valid locations to queue sites. For walls, gates, towers and hardpoints, drag a straight line and release to queue the clear sites shown in the preview. Factories, labs, power generators and modules stay single placements. Green blueprints mark accepted orders. Your manually selected truck group is kept when choosing structures.</p>
            <p>For another area, move the view and use <b>TRUCKS</b> to select its visible trucks. <b>EXIT · KEEP ORDERS</b> leaves placement while trucks continue. <b>STOP</b> cancels selected trucks’ work and remaining sites.</p>
            <p>To remove a structure, select construction trucks and choose <b>DEMOLISH</b>, then tap your structure or unfinished foundation. Your Command Centre is protected. If other trucks are building that foundation, stop them first. <b>CANCEL</b> leaves targeting; <b>STOP</b> stops selected trucks after an order. <b>REMOVE</b> in QUEUE only cancels the waiting order.</p></section>
          <section><h2>UPGRADE WITH MODULES</h2>
            <p>In <b>BUILD → MODULES</b>, choose an upgrade and tap a highlighted, completed matching building: Research Module → research lab; Power Module → power generator; Factory Module → vehicle or VTOL factory.</p>
            <p>Labs and power generators each take one module; vehicle and VTOL factories take two. Highlights show ready, upgrading or full buildings. Finish the matching structure or research the module first if none is ready.</p></section>
          <section><h2>CHOOSE YOUR RESEARCH</h2>
            <p>Top <b>RESEARCH</b> opens the full page. Choose a lab and tap one or more available topics. Numbers show your selection order; tap a selected topic again to deselect it. <b>ADD TO LAB … QUEUE</b> adds the selection in that order. Each lab follows its own queue. Use <b>×</b> to remove a waiting topic.</p>
            <p>Tap one of your completed labs on the battlefield to open that lab’s full research page.</p></section>
          <section><h2>CHECK CURRENT ACTIVITY</h2>
            <p>Bottom-left <b>ANALYSIS</b> and <b>MANUFACTURING</b> open narrow status panels while you watch the battlefield. Analysis shows each lab’s current topic and estimated progress; Manufacturing shows current units, with vehicle and cyborg tabs.</p>
            <p>These panels show current work only. Use top <b>RESEARCH</b> or <b>MANUFACTURING</b> to change queues. Tap the selected footer button again to close the panel.</p></section>
          <section><h2>MAKE UNITS IN A FACTORY</h2>
            <p>Open top <b>MANUFACTURING</b>, or tap one of your completed factories on the battlefield. Select the intended factory, choose <b>QUANTITY</b> (1, 5, 10 or 20), then <b>PRODUCE</b> a compatible design. Orders belong to the selected factory. Use <b>UNITS</b>, <b>DESIGN</b> and <b>BLUEPRINTS</b> inside Manufacturing to switch tasks.</p>
            <p>Manufacturing uses normal power and build time. Research, factory type, modules and unit limits still apply. The full page shows current work and waiting units; <b>QUEUE</b> shows wider activity.</p></section>
          <section><h2>KEEP YOUR BLUEPRINTS</h2>
            <p>In <b>MANUFACTURING → DESIGN</b>, choose a researched body, propulsion and weapon or system; name it and <b>SAVE BLUEPRINT</b>. Edit with <b>SAVE CHANGES</b>, or keep another version with <b>SAVE AS NEW</b>.</p>
            <p>In Manufacturing’s <b>•••</b> menu, <b>SAVE DESIGN TO PHONE</b> keeps the selected factory design. <b>BLUEPRINTS</b> stores blueprints on this phone between games and app restarts. Saving a blueprint does not unlock its parts: research them again in the current battle before production.</p></section>
          <section><h2>MOVE, LOOK &amp; RETURN</h2>
            <p><b>Tap</b> to select or give an order; <b>swipe</b> to pan; <b>pinch</b> to zoom. Move two fingers together up/down to tilt. Tap the minimap to move the view; <b>BASE</b> returns to your Command Centre.</p>
            <p>The bottom-left units icon opens <b>DEMOLISH</b>, <b>INTELLIGENCE</b>, <b>ALL UNITS</b>, <b>DESELECT</b>, <b>STOP</b> and <b>TRUCKS</b>. ALL UNITS selects combat units. DESELECT clears selection while units continue their existing orders. Android <b>Back</b> closes the current panel first; from the battlefield it asks <b>Return to Main Menu</b>.</p>
            <p>Tap a top menu button again to close its menu. Set control size above. Music is included in the app and available offline. Each map has an assigned soundtrack; top <b>MUSIC</b> shows its title and lets you turn music <b>ON</b> or <b>OFF</b>. Your choice stays saved on this phone and does not change sound effects.</p></section>`;
      help.innerHTML = `
        <header><div><span class="wt-help-eyebrow">${duel?'WARZONE 1V1':'WARZONE TOWERS'}</span>
          <h1 id="wt-help-title">${duel?'FIELD GUIDE':'HOW TO PLAY'}</h1></div>
          ${duel ? '<button type="button" class="wt-help-close" aria-label="Close help">CLOSE</button>' : ''}</header>
        <div class="wt-help-content"${duel?'':' tabindex="0" aria-label="How to play; scroll for more"'}>${guideContent}</div>
        <footer><span>The battle continues while this guide is open.</span>
          ${duel ? '<button type="button" class="wt-help-back">BACK TO BATTLE</button>' : ''}</footer>`;
      if(campaign){
        help.querySelector('.wt-help-eyebrow').textContent='WARZONE CAMPAIGN';
        help.querySelector('.wt-help-content').innerHTML='<section><h2>FOLLOW THE CAMPAIGN</h2><p>Read the original mission briefings in <b>INTELLIGENCE</b>. Recover artefacts to unlock research. Original enemies, mission timers and objectives apply.</p></section><section><h2>COMMAND YOUR UNITS</h2><p><b>ALL COMBAT</b> in the header keeps combat units selected, including new units. Constructors, repair units, sensors and transports are excluded. Turn it off to select units individually. Selection pauses while building, using native mission panels or reading a briefing.</p></section><section><h2>BUILD, RESEARCH &amp; MANUFACTURE</h2><p>Use the existing Build, Research and Manufacturing controls. Only parts and structures unlocked in the current campaign are available. Native transport loading and mission instructions remain part of the original game.</p></section><section><h2>SAVE &amp; RETURN</h2><p><b>SAVE</b> stores the complete campaign checkpoint on this phone. Campaign saves are separate from Towers. Android Back closes a mission panel first, then offers Return to Main Menu.</p></section>';
      }
      if(ffa){
        help.querySelector('.wt-help-eyebrow').textContent='FREE FOR ALL';
        help.querySelector('.wt-help-content').innerHTML='<section><h2>EMAG FREE FOR ALL</h2><p>You and three independent bots fight on the supplied EMAG map. Every player is an opponent. VTOL aircraft, factories and pads are disabled. Your chosen Easy, Medium or Hard difficulty applies to all three bots.</p></section><section><h2>BUILD YOUR ARMY</h2><p>Each authored base has trucks, research labs and a working economy. Build vehicle and cyborg factories, research ground technology, design units and manufacture your army. Use <b>BUILD</b>, <b>RESEARCH</b> and <b>MANUFACTURING</b>; tap a lab or factory to open its menu.</p></section><section><h2>COMMAND &amp; SURVIVE</h2><p>Tap to select or order, swipe to pan, pinch to zoom and use <b>BASE</b> to return home. The bottom-left drawer offers combat-unit selection, trucks, deselect, stop, demolish and Intelligence. The original skirmish rules decide victory when opposing players are eliminated; there are no Towers waves or crystal purchases in FFA.</p></section><section><h2>SAVE &amp; RETURN</h2><p><b>SAVE</b> stores this complete FFA match on your phone. Open <b>FFA SAVES</b> in the FFA setup to continue. FFA, Campaign and Towers saves are separate. Android Back closes the current menu, then offers Return to Main Menu.</p></section>';
      }
      if (!duel) {
        // The offline field guide shares the Home content and current mode data.
        // Keep the existing Help/input lifecycle; the reader never calls the game bridge.
        const reader = hudDocument.createElement('iframe');
        reader.title = 'Field guide: research paths and how to play';
        reader.src = '/assets/guide/index.html?embedded=1&mode=' + (campaign ? 'campaign' : ffa ? 'ffa' : 'towers');
        reader.className = 'wt-field-guide-reader';
        const content = help.querySelector('.wt-help-content');
        content.replaceChildren(reader);
        content.style.cssText = 'display:block;padding:0;flex:1 1 auto;min-height:0;overflow:hidden';
        help.style.cssText = 'width:calc(100vw - 24px);height:calc(100dvh - 88px);max-height:calc(100dvh - 88px)';
        reader.style.cssText = 'display:block;width:100%;height:100%;border:0;background:#0b0b0b';
        help.querySelector('h1').textContent = 'FIELD GUIDE';
        help.querySelector('header').style.display = 'none';
        help.querySelector('footer').style.display = 'none';
        help.classList.add('wt-towers-guide');
        const version = window.BlockNightAndroid?.appVersion?.();
        if (version) help.querySelector('.wt-help-eyebrow').textContent = (campaign?'CAMPAIGN':ffa?'FREE FOR ALL':'WARZONE TOWERS') + ' · v' + version;
        if (!hudDocument.getElementById('wt-towers-guide-style')) {
          const guideStyle = hudDocument.createElement('style');
          guideStyle.id = 'wt-towers-guide-style';
          guideStyle.textContent = `
            #warzone-towers-help.wt-towers-guide { display:flex; flex-direction:column; width:min(660px,calc(100vw - 24px)); max-height:calc(100dvh - 24px); overflow:hidden; font-size:calc(12px * var(--wt-command-scale,1)); line-height:1.5; }
            #warzone-towers-help.wt-towers-guide header { position:static; flex:0 0 auto; padding:12px 16px; gap:12px; flex-wrap:wrap; }
            #warzone-towers-help.wt-towers-guide header>div { min-width:0; }
            #warzone-towers-help.wt-towers-guide .wt-help-eyebrow { font-size:calc(11px * var(--wt-command-scale,1)); }
            #warzone-towers-help.wt-towers-guide h1 { font-size:calc(23px * var(--wt-command-scale,1)); overflow-wrap:anywhere; }
            #warzone-towers-help.wt-towers-guide .wt-help-close { margin-left:auto; }
            #warzone-towers-help.wt-towers-guide .wt-help-settings { flex:0 0 auto; padding:8px 16px; gap:6px; font-size:calc(9px * var(--wt-command-scale,1)); }
            #warzone-towers-help.wt-towers-guide .wt-help-settings button { font-size:calc(11px * var(--wt-command-scale,1))!important; }
            #warzone-towers-help.wt-towers-guide .wt-help-settings [aria-pressed=true] { background:#28574e; color:#effaf7; box-shadow:inset 0 -2px #9ad9d8; }
            #warzone-towers-help.wt-towers-guide .wt-help-content { flex:1 1 auto; min-height:0; overflow:auto; overscroll-behavior:contain; touch-action:pan-y; padding:14px 16px; gap:18px 22px; grid-template-columns:repeat(auto-fit,minmax(min(100%,max(calc((100% - 22px) / 2),calc(220px * var(--wt-command-scale,1)))),1fr)); overflow-wrap:anywhere; }
            #warzone-towers-help.wt-towers-guide .wt-help-content section { min-width:0; }
            #warzone-towers-help.wt-towers-guide h2 { margin-bottom:6px; font-size:calc(15px * var(--wt-command-scale,1)); color:var(--towers-accent,#9ad9d8); }
            #warzone-towers-help.wt-towers-guide footer { flex:0 0 auto; flex-wrap:wrap; padding:9px 16px; gap:8px 12px; }
            #warzone-towers-help.wt-towers-guide footer span { flex:1 1 150px; min-width:0; font-size:calc(12px * var(--wt-command-scale,1)); }
            #warzone-towers-help.wt-towers-guide button { max-width:100%; min-height:34px; padding:8px 11px; font-size:calc(12px * var(--wt-command-scale,1)); line-height:1.2; white-space:normal; overflow-wrap:anywhere; }
            #warzone-towers-help.wt-towers-guide .wt-help-back { margin-left:auto; flex:0 1 auto; }
            #warzone-towers-help.wt-towers-guide .wt-help-content:focus-visible { outline:1px solid #9ad9d8; outline-offset:-2px; }
            @media(max-width:560px) { #warzone-towers-help.wt-towers-guide .wt-help-content { grid-template-columns:1fr; } }
            @media(max-height:360px) { #warzone-towers-help.wt-towers-guide header { padding:6px 12px; } #warzone-towers-help.wt-towers-guide h1 { margin-top:2px; font-size:calc(20px * var(--wt-command-scale,1)); } #warzone-towers-help.wt-towers-guide .wt-help-settings { padding:5px 12px; } #warzone-towers-help.wt-towers-guide footer { padding:6px 12px; } }
          `;
          hudDocument.head.appendChild(guideStyle);
        }
      }
      const settings=hudDocument.createElement('div');settings.className='wt-help-settings';
      settings.innerHTML='<span>CONTROL SIZE</span>'+[1,1.2,1.4].map((n,i)=>`<button type="button" data-ui-size="${n}">${['STANDARD','LARGE','EXTRA LARGE'][i]}</button>`).join('')+(duel?'<button type="button" data-commanders>COMMANDERS</button>':'');
      settings.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.uiSize){window.__warzoneCommands.setSize(b.dataset.uiSize);syncHelpSize();}else if(b.hasAttribute('data-commanders')){restoreBattle();window.__warzoneCommands.open('commanders');}});
      help.querySelector('header').after(settings);
      overlay.appendChild(help);
      hudDocument.body.appendChild(overlay);
      const restoreBattle = () => {
        if (overlay.hidden) return;
        overlay.hidden = true;
        setHeaderMenuState('blocknight-help', false);
        for (const item of overlay._blockedRegions || []) item.element.inert = item.wasInert;
        overlay._blockedRegions = [];
        releaseAll();
        window.parent?.WarzoneHost?.restoreBattlefield();
        showCombatHud();
        // Finish the button gesture before moving focus into the engine.
        // There is no native dialog close/focus-restoration race to wait for.
        requestAnimationFrame(() => {
          if (overlay.hidden) focusCanvas();
        });
      };
      overlay._restoreBattle = restoreBattle;
      for (const button of help.querySelectorAll(".wt-help-close, .wt-help-back")) {
        bindTouchCommand(button, restoreBattle);
      }
      overlay.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          restoreBattle();
        } else if (duel && event.key === "Tab") {
          const buttons = [...help.querySelectorAll("button:not([disabled])")];
          const first = buttons[0], last = buttons[buttons.length - 1];
          if (event.shiftKey && (hudDocument.activeElement === first || hudDocument.activeElement === help)) {
            event.preventDefault(); last.focus();
          } else if (!event.shiftKey && hudDocument.activeElement === last) {
            event.preventDefault(); first.focus();
          }
        }
      });
    }
    const overlay = hudDocument.getElementById("warzone-towers-help-overlay");
    syncHelpSize();
    if (!overlay.hidden) return true;
    releaseAll();
    overlay._blockedRegions = (duel ? ["warzone-command-strip", "warzone-game-frame"] : ["warzone-game-frame"]).map(id => hudDocument.getElementById(id))
      .filter(Boolean).map(element => ({ element, wasInert: element.inert }));
    overlay.hidden = false;
    setHeaderMenuState('blocknight-help', true);
    for (const item of overlay._blockedRegions) item.element.inert = true;
    help.scrollTop = 0;
    if (!duel) help.querySelector('.wt-help-content').scrollTop = 0;
    help.focus({ preventScroll: true });
    return true;
  }

  function beginSingle(event) {
    const radar = radarPoint(event.clientX, event.clientY);
    if (radar) window.__warzoneCommands?.hidePreview?.();
    const boxOneShot = state.boxMode
        && isBattlefieldPoint(event.clientX, event.clientY);
    state.primaryId = event.pointerId;
    state.single = {
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      previousX: event.clientX,
      previousY: event.clientY,
      moved: false,
      panning: false,
      longPressArmed: false,
      selecting: false,
      panX: event.clientX,
      panY: event.clientY,
      panDx: 0,
      panDy: 0,
      downAt: performance.now(),
      downInputTime: Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now(),
      radar: radar !== null,
      radarMoved: false,
      radarDragging: false,
      boxOneShot
    };
    state.single.slop = (window.__warzoneCommands?.isPlacement()||window.__warzoneCommands?.nativeBuildOpen?.()) ? Math.max(TAP_SLOP, 14) : TAP_SLOP;
    state.single.nativeOnly=campaign&&(!window.__warzoneCampaign||window.__warzoneCampaign.nativeUiActive());
    focusCanvas();
    if(state.single.nativeOnly){mouseMove(event.clientX,event.clientY,0);return;}
    if (radar !== null) {
      state.lastRadarPoint = radar;
      // Classify taps first: tiny finger drift must not become a native drag.
      return;
    }
    // Resume camera observation at touch-down after closing an HTML page.
    // This is non-blocking; the ordinary touch-up uses the current projection.
    if(window.__warzoneDuelConfig?.mode!=='duel'&&isBattlefieldPoint(event.clientX,event.clientY))window.WarzoneTerrain?.active?.(true,false);
    if(window.__warzoneCommands?.isDemolishing?.()){
      state.single.demolition=true;
      window.__warzoneCommands.previewDemolish(event.clientX,event.clientY);
      mouseMove(event.clientX,event.clientY,0);return;
    }
    if (window.__warzoneCommands?.isPlacement()) window.__warzoneCommands.previewAt(event.clientX, event.clientY);
    if(!boxOneShot&&isBattlefieldPoint(event.clientX,event.clientY))state.single.linePlacement=window.__warzoneCommands?.beginLinePlacement?.(event.clientX,event.clientY)||null;
    mouseMove(event.clientX, event.clientY, 0);
    if (boxOneShot) {
      beginBoxSelection(state.single);
      feedback(event.clientX, event.clientY, "box");
      return;
    }

    const pointerId = event.pointerId;
    state.longTimer = setTimeout(() => {
        const gesture = state.single;
          if (state.primaryId !== pointerId || !gesture
                  || gesture.moved || gesture.panning || state.multi) return;
          if (state.queueMode || window.__warzoneCommands?.isPlacement() || !isBattlefieldPoint(gesture.startX, gesture.startY)) return;
          // Menu buttons are always ordinary clicks; a slow renderer must not
          // turn truck/defence selection into a right-click cancellation.
          gesture.longPressArmed = true;
          vibrate(24);
    }, LONG_PRESS_MS);
  }

  function beginBoxSelection(gesture) {
    if (gesture.selecting) return;
    releaseCameraKeys();
    releaseMouse();
    state.manualSelectionRevision += 1;
    gesture.selecting = pressMouse(0, gesture.startX, gesture.startY);
    if (gesture.selecting) state.boxSelections += 1;
  }

  function beginPan(gesture) {
    if (gesture.panning) return;
    window.__warzoneCommands?.hidePreview?.();
    clearLongPress();
    gesture.longPressArmed=false;
    releaseMouse();
    gesture.panning = true;
    state.pans += 1;
    state.lastPanStartLatencyMs = performance.now() - gesture.downAt;
    if (window.__warzoneDuelConfig?.mode === 'duel') {
      pressMouse(1, gesture.startX, gesture.startY);
      advancePan(gesture, gesture.x, gesture.y);
    } else {
      const point = panPoint(gesture.startX, gesture.startY);
      if (!point) { gesture.panning = false; return; }
      gesture.framePan = true;
      gesture.panX = point.x; gesture.panY = point.y;
      observeNativeFrames(); gesture.panClock = state.nativeFrameContext; gesture.panHeldFrame = state.nativeFrames;
      pressMouse(1, point.x, point.y);
      const first = panPoint(gesture.x, gesture.y);
      if (first) advancePan(gesture, first.x, first.y);
    }
  }

  function beginMulti() {
    window.__warzoneCommands?.hidePreview?.();
    clearMultiMove();
    clearLongPress();
    releaseTilt();
    releaseRotation();
    releaseMouse();
    releaseCameraKeys();
    if (state.single?.boxOneShot) {
      state.boxMode = false;
      updateCombatHud();
    }
    state.single = null;
    state.primaryId = null;
    const points = [...state.pointers.values()];
    if (points.length < 2) return;
    const center = {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2
    };
    state.multi = {
      gesture: null,
      canvas: canvas(),
      session: window.__towersHtml?.session || '',
      pointerIds: [...state.pointers.keys()].slice(0, 2),
      startCenter: center,
      startPoints: points.slice(0, 2).map(point => ({x:point.x, y:point.y})),
      center,
      panX: center.x,
      panY: center.y,
      panDx: 0,
      panDy: 0,
      startDistance: Math.hypot(points[0].x - points[1].x,
          points[0].y - points[1].y),
      stepDistance: 0
    };
    state.multi.stepDistance = state.multi.startDistance;
    state.multi.distance = state.multi.startDistance;
    state.multi.zoomIntent = null;
    state.multi.zoomOutput = 0;
    state.multi.zoomMotion = [{distance:state.multi.startDistance, angle:0}];
    state.multi.angle = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
    state.multi.angleTravel = 0;
    state.multi.rotationAngle = 0;
    state.multi.rotationBaseAngle = 0;
    state.multi.rotationIntent = null;
    state.multi.rotationWorld = points.slice(0, 2).every(point => isBattlefieldPoint(point.x, point.y));
  }

  function clearMultiMove() {
    clearRotationIntentTimer();
    clearZoomIntentTimer();
    if (state.multiMoveFrame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(state.multiMoveFrame);
    clearTimeout(state.multiMoveTimer);
    state.multiMoveFrame = null; state.multiMoveTimer = null;
  }

  function flushMultiMove() {
    const pending = state.multiMoveFrame !== null || state.multiMoveTimer !== null;
    clearMultiMove();
    if (pending && state.multi && state.pointers.size >= 2) handleMultiMove();
  }

  function scheduleMultiMove() {
    if (state.multiMoveFrame !== null || state.multiMoveTimer !== null) return;
    // Android dispatches the two pointer updates separately. Classifying the
    // first update mistakes a parallel horizontal pan for a changing span.
    state.multiMoveTimer = setTimeout(flushMultiMove, 16);
    if (typeof requestAnimationFrame === 'function') state.multiMoveFrame = requestAnimationFrame(flushMultiMove);
  }

  function handleMultiMove() {
    const points = [...state.pointers.values()];
    if (points.length < 2 || !state.multi) return;
    if (!sameMultiGesture(state.multi) || !rotationAllowed()) { cancelMulti(); return; }
    const center = {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2
    };
    const distance = Math.hypot(points[0].x - points[1].x,
        points[0].y - points[1].y);
    const distanceDelta = distance - state.multi.distance;
    state.multi.distance = distance;
    const angle = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
    // Accumulate adjacent signed angles, including a crossing of -pi/+pi.
    // Measuring only the angle from touchdown reverses a twist beyond 180deg.
    const delta = Math.atan2(Math.sin(angle - state.multi.angle), Math.cos(angle - state.multi.angle));
    state.multi.angle = angle;
    if (distance >= 24 && state.multi.startDistance >= 24) state.multi.angleTravel += delta;
    const centerDx = center.x - state.multi.startCenter.x;
    const centerDy = center.y - state.multi.startCenter.y;
    const centerTravel = Math.hypot(centerDx, centerDy);
    const distanceTravel = Math.abs(distance - state.multi.startDistance);
    const pinchScore = distanceTravel / PINCH_START;
    const movements = points.slice(0, 2).map((point, index) => ({
      x:point.x - state.multi.startPoints[index].x,
      y:point.y - state.multi.startPoints[index].y
    }));
    const lengths = movements.map(point => Math.hypot(point.x, point.y));
    const sharedDirection = lengths[0] > 0 && lengths[1] > 0
        ? (movements[0].x * movements[1].x + movements[0].y * movements[1].y) / (lengths[0] * lengths[1]) : 0;
    // A finger circling a stationary partner also moves the midpoint. That
    // translation is part of the twist, not a parallel two-finger tilt/pan.
    // Require useful movement from both fingers in roughly the same direction.
    const parallel = Math.min(...lengths) >= PAN_START
        && Math.min(...lengths) >= Math.max(...lengths) * .25 && sharedDirection >= .75;
    const panScore = parallel ? centerTravel / MULTI_PAN_START : 0;
    // Signed angular progression disambiguates separately delivered pointer
    // updates. A deliberate twist can take over an earlier provisional gesture.
    const zoomOwned = state.multi.gesture !== 'rotate' && retainZoomOwnership(state.multi, distance, distanceDelta, delta);
    if (state.multi.gesture !== 'rotate' && !zoomOwned && rotationIntentReady(state.multi, distance, delta))
      beginMultiRotation(state.multi, delta);
    if (state.multi.gesture === null) {
      const zoomReady = zoomIntentReady(state.multi, distance, distanceDelta);
      if (pinchScore >= 1 && pinchScore > panScore * 1.1 && zoomReady) {
        state.multi.gesture = "zoom";
        state.multi.rotationBaseAngle = state.multi.angleTravel;
        clearRotationIntentTimer();
        clearZoomIntentTimer();
        releaseCameraKeys();
      } else if (panScore >= 1 && panScore >= pinchScore) {
        state.multi.rotationBaseAngle = state.multi.angleTravel;
        clearRotationIntentTimer();
        clearZoomIntentTimer();
        if (Math.abs(centerDy) > Math.abs(centerDx) * 1.35) {
          state.multi.gesture = "tilt";
        } else {
          state.multi.gesture = "pan";
          state.pans += 1;
          if(window.__warzoneDuelConfig?.mode!=='duel'){observeNativeFrames();state.multi.panClock=state.nativeFrameContext;state.multi.panHeldFrame=state.nativeFrames;}
          pressMouse(1, state.multi.startCenter.x, state.multi.startCenter.y);
        }
      }
    }

    if (state.multi.gesture === 'rotate') {
      if (distance < 24) { cancelMulti(); return; }
      advanceRotation(state.multi.angleTravel - state.multi.rotationAngle);
      state.multi.rotationAngle = state.multi.angleTravel;
    } else if (state.multi.gesture === "pan") {
      advancePan(state.multi, center.x, center.y);
    } else if (state.multi.gesture === "tilt") {
      advanceTilt(center.y - state.multi.center.y);
    } else if (state.multi.gesture === "zoom") {
      let step = distance - state.multi.stepDistance;
      let emitted = 0;
      while (Math.abs(step) >= PINCH_STEP && emitted < 6) {
        const direction = step > 0 ? -1 : 1;
        if (zoom(direction, center.x, center.y)) state.multi.zoomOutput += 1;
        state.pinchSteps += 1;
        state.multi.stepDistance += step > 0 ? PINCH_STEP : -PINCH_STEP;
        step = distance - state.multi.stepDistance;
        emitted += 1;
      }
    }
    state.multi.center = center;
  }

  function endMultiIfNeeded() {
    if (state.pointers.size >= 2) return;
    if (state.multi !== null) {
      const gesture = state.multi;
      releaseTilt();
      releaseRotation();
      releaseCameraKeys();
      if(gesture.gesture==='pan'&&window.__warzoneDuelConfig?.mode!=='duel')finishFramePan({...gesture,x:gesture.center.x,y:gesture.center.y},false);
      else releaseMouse(gesture.center.x, gesture.center.y);
      state.multi = null;
      state.ignoreUntilAllUp = state.pointers.size > 0;
    }
  }

  function cancelMulti() {
    clearMultiMove(); releaseTilt(); releaseRotation(); releaseCameraKeys();
    const gesture = state.multi;
    if (gesture?.gesture === 'pan' && window.__warzoneDuelConfig?.mode !== 'duel')
      finishFramePan({...gesture, x:gesture.center.x, y:gesture.center.y}, true);
    else releaseMouse();
    state.multi = null; state.single = null; state.primaryId = null;
    state.ignoreUntilAllUp = true;
  }

  function cancelFacilityNavigation() { state.facilityNavigationSerial += 1; }
  function openFacilityAt(x,y) {
    const commands=window.__warzoneCommands, report=commands?.report?.();
    if(window.__warzoneDuelConfig?.mode==='duel'||!state.battleActive||state.queueMode||state.boxMode||state.stopNonce||report?.buildOpen||report?.placement||report?.page||report?.nativeMenu||report?.demolition||window.__warzoneIntelligence?.report?.().open||window.__towersHtml?.isEnded?.())return false;
    const target=window.WarzoneBuildDisplay?.pickFacilityTarget?.(x,y);
    if(!target)return false;
    const live=report.snapshot?.facilityTargets?.find(t=>t.id===target.id&&t.ready&&t.nativeStatus===1);
    if(!live)return false;
    // The live native snapshot already identifies this owned, completed
    // building. Open its page before SDL receives a stock structure click.
    // A fresh reply must not gate navigation or silently swallow a slow tap.
    const opened=live.kind==='research'?window.__blockNightResearch?.openForLabId?.(live.id):commands.openFactory?.(live.id);
    if(!opened)return false;
    state.facilityOpens++;state.lastFacility={id:live.id,kind:live.kind};state.facilityError='';
    commands.send('state').catch(error=>{state.facilityError=String(error.message||error);});
    return true;
  }
  commandDocument().addEventListener('pointerdown',cancelFacilityNavigation,{capture:true,passive:true});
  function handlePointer(event) {
    if(event.type==='pointerdown')cancelFacilityNavigation();
    if (!state.battleActive) { if (event.target === canvas()) own(event); return; }
    if (forwardedPointers.has(event)) return;
    const desktopPlacement = (window.__warzoneCommands?.isPlacement()||window.__warzoneCommands?.nativeBuildOpen?.()||window.__warzoneCommands?.isDemolishing?.())
        && (event.pointerType === "mouse" || event.pointerType === "pen");
    if (event.pointerType !== "touch" && !desktopPlacement && !state.physicalPointers.has(event.pointerId)){if(event.type==='pointerdown'&&event.button===0&&event.target===canvas())state.lastNativeLeftDownAt=performance.now();return;}
    const target = canvas();
    if (!target) return;
    if (state.stopNonce && event.target === target) { own(event); return; }
    if(window.__warzoneCommands?.report?.()?.exitingBuild&&!state.physicalPointers.has(event.pointerId)&&event.target===target){own(event);return;}
    if (desktopPlacement && event.target === target) {
      if (event.type === "pointermove" && !state.pointers.has(event.pointerId) && !event.buttons) {
        if (radarPoint(event.clientX, event.clientY) === null) {
          if(window.__warzoneCommands.isDemolishing?.())window.__warzoneCommands.previewDemolish(event.clientX,event.clientY);
          else window.__warzoneCommands.previewAt(event.clientX, event.clientY);
        }
        return;
      }
      if (event.type === "pointerdown" && event.button !== 0) {
        if (event.button === 2) { own(event); window.__warzoneCommands.selectMode?.(); }
        return; // Middle-button native camera movement remains available.
      }
    }
    const physical=event.target===target||state.physicalPointers.has(event.pointerId);
    if(event.type==='pointerdown'){if(event.target!==target)return;state.physicalPointers.add(event.pointerId);}
    if(!physical)return;
    if(event.type==='pointerup'||event.type==='pointercancel')state.physicalPointers.delete(event.pointerId);
    if(event.type==='pointercancel'&&(state.panRelease||state.single?.framePan&&state.single.panning
        ||window.__warzoneDuelConfig?.mode!=='duel'&&state.multi?.gesture==='pan')){
      own(event);releaseAll(false,false);return;
    }
    if(event.type==='pointerdown'&&state.single?.framePan&&state.single.panning&&state.pointers.size===1){
      const gesture=state.single;finishFramePan(gesture,false);gesture.panning=false;
    }
    if(state.panRelease||state.panDeferredPointers.length){deferPanPointer(event,target);pumpPanPointerQueue();return;}
    if(pendingNativeInput()){
      own(event);forwardedPointers.add(event);
      if(event.type==='pointerdown')capturePointer(target,event.pointerId);
      if(event.type==='pointerup'||event.type==='pointercancel')releasePointer(target,event.pointerId);
      if(event.type==='pointermove'){
        const moves=[];for(let i=state.pointerQueue.length-1;i>=0;i--){const prior=state.pointerQueue[i];if(prior.pointerId!==event.pointerId)continue;if(prior.type!=='pointermove')break;moves.push(i);}
        if(moves.length>=2)state.pointerQueue.splice(moves[0],1);
      }
      state.pointerQueue.push(event);pumpPointerQueue();return;
    }
    processPointer(event);
  }
  function processPointer(event,replayed=false){
    const target=canvas();if(!target)return;
    const tracked = state.pointers.has(event.pointerId);
    if (event.type === "pointerdown") {
      if (event.target !== target) return;
      own(event);
      if(!replayed)capturePointer(target, event.pointerId);
      state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (state.pointers.size === 1 && !state.ignoreUntilAllUp) {
        beginSingle(event);
      } else if (state.ignoreUntilAllUp) {
        return;
      } else if (state.pointers.size === 2) {
        if(!rotationAllowed()){clearLongPress();state.single=null;state.primaryId=null;state.ignoreUntilAllUp=true;}
        else beginMulti();
      } else if (state.pointers.size > 2) {
        cancelMulti();
      }
      return;
    }

    if (!tracked) {
      if (event.target === target) own(event);
      return;
    }

    own(event);
    if (event.type === "pointerup" || event.type === "pointercancel") {
      if(!replayed)releasePointer(target, event.pointerId);
    }
    const point = state.pointers.get(event.pointerId);
    point.x = event.clientX;
    point.y = event.clientY;

    if (event.type === "pointermove") {
      if (state.ignoreUntilAllUp) return;
      if (state.multi || state.pointers.size >= 2) {
        if (!state.multi) beginMulti();
        scheduleMultiMove();
        return;
      }
      if (state.ignoreUntilAllUp || event.pointerId !== state.primaryId || !state.single) {
        return;
      }

      const gesture = state.single;
      const samples = coalesced(event);
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      const distance = Math.hypot(dx, dy);
      gesture.previousX = gesture.x;
      gesture.previousY = gesture.y;
      gesture.x = event.clientX;
      gesture.y = event.clientY;
      if(gesture.nativeOnly){if(distance>TAP_SLOP)gesture.moved=true;return;}

      if (gesture.radar) {
        if (distance > TAP_SLOP) gesture.radarMoved = true;
        // Native Ctrl+radar drag resets the heading to North. While +Q is on,
        // choose the camera destination on release without sending that chord.
        if (gesture.radarMoved && !state.queueMode && !gesture.radarDragging) {
          gesture.radarDragging = pressMouse(2, gesture.x, gesture.y);
        }
        for (const sample of gesture.radarDragging ? samples : []) {
          const movementX = sample.clientX - gesture.previousX;
          const movementY = sample.clientY - gesture.previousY;
          mouseMove(sample.clientX, sample.clientY, 2, movementX, movementY);
          gesture.previousX = sample.clientX;
          gesture.previousY = sample.clientY;
          state.radarMoves += 1;
        }
        const pointOnRadar = radarPoint(gesture.x, gesture.y);
        if (pointOnRadar !== null) state.lastRadarPoint = pointOnRadar;
        return;
      }

      if (gesture.selecting) {
        for (const sample of samples) {
          mouseMove(sample.clientX, sample.clientY, 1,
              sample.clientX - gesture.previousX,
              sample.clientY - gesture.previousY);
          gesture.previousX = sample.clientX;
          gesture.previousY = sample.clientY;
        }
        gesture.moved = distance > TAP_SLOP;
        return;
      }

      if(gesture.linePlacement){
        // Defensive drag placement owns one finger from down to up. It never
        // starts native mouse dragging or camera movement beneath the preview.
        if(distance>=(gesture.slop||TAP_SLOP)){
          clearLongPress();gesture.moved=true;gesture.lineDragging=true;
          if(isBattlefieldPoint(gesture.x,gesture.y)&&radarPoint(gesture.x,gesture.y)===null)window.__warzoneCommands?.updateLinePlacement?.(gesture.linePlacement,gesture.x,gesture.y);
        }
        return;
      }

      const inputElapsed = (Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now()) - gesture.downInputTime;
      if(gesture.demolition&&!gesture.panning)window.__warzoneCommands?.previewDemolish?.(gesture.x,gesture.y);
      if(inputElapsed>=LONG_PRESS_MS&&!gesture.demolition&&!gesture.moved&&!gesture.panning&&!state.queueMode&&!window.__warzoneCommands?.isPlacement()&&isBattlefieldPoint(gesture.startX,gesture.startY))gesture.longPressArmed=true;
      if (gesture.longPressArmed && inputElapsed >= LONG_PRESS_MS) {
        if (!gesture.selecting && distance >= BOX_SELECT_START) {
          beginBoxSelection(gesture);
        }
        if (gesture.selecting) {
          for (const sample of samples) {
            mouseMove(sample.clientX, sample.clientY, 1,
                sample.clientX - gesture.previousX,
                sample.clientY - gesture.previousY);
            gesture.previousX = sample.clientX;
            gesture.previousY = sample.clientY;
          }
          gesture.moved = true;
        }
        return;
      }
      const slop = gesture.slop || TAP_SLOP;
      if (distance > slop) gesture.moved = true;

      const wasPanning = gesture.panning;
      if (!gesture.panning && distance >= Math.max(PAN_START, slop)) beginPan(gesture);
      if (wasPanning && gesture.panning) {
        if (gesture.framePan) schedulePanMove(gesture);
        else for (const sample of samples) advancePan(gesture, sample.clientX, sample.clientY);
      }
      return;
    }

    if (event.type !== "pointerup" && event.type !== "pointercancel") return;
    const canceled = event.type === "pointercancel";
    if (state.multi) {
      if (canceled) clearMultiMove(); else flushMultiMove();
    }
    state.pointers.delete(event.pointerId);

    if (state.multi) {
      endMultiIfNeeded();
      if (state.pointers.size === 0) state.ignoreUntilAllUp = false;
      return;
    }
    if (state.ignoreUntilAllUp) {
      if (state.pointers.size === 0) state.ignoreUntilAllUp = false;
      return;
    }
    if (event.pointerId !== state.primaryId || !state.single) return;

    const gesture = state.single;
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    clearLongPress();
    const heldFor=(Number.isFinite(event.timeStamp)?event.timeStamp:performance.now())-gesture.downInputTime;
    if(gesture.nativeOnly){if(!canceled&&!gesture.moved)nativeUiClick(gesture.x,gesture.y);state.primaryId=null;state.single=null;return;}
    if(gesture.linePlacement){
      const commands=window.__warzoneCommands;
      if(canceled||gesture.lineDragging){
        if(!canceled&&isBattlefieldPoint(gesture.x,gesture.y)&&radarPoint(gesture.x,gesture.y)===null&&commands?.endLinePlacement?.(gesture.linePlacement,gesture.x,gesture.y)){
          feedback(gesture.x,gesture.y,'tap');vibrate(8);
        }else commands?.cancelLinePlacement?.(gesture.linePlacement);
        state.primaryId=null;state.single=null;return;
      }
      // A stationary defence tap retains the original one-site placeAt path.
      commands?.cancelLinePlacement?.(gesture.linePlacement);gesture.linePlacement=null;
    }
    if(!canceled&&!gesture.demolition&&!gesture.moved&&!gesture.panning&&heldFor>=LONG_PRESS_MS&&!state.queueMode&&!window.__warzoneCommands?.isPlacement()&&isBattlefieldPoint(gesture.startX,gesture.startY))gesture.longPressArmed=true;

    if (gesture.radar) {
      if (gesture.radarDragging && !canceled) {
        mouseMove(gesture.x, gesture.y, 2,
            gesture.x - gesture.previousX, gesture.y - gesture.previousY);
      }
      if (gesture.radarDragging) releaseMouse(gesture.x, gesture.y);
      else if (!canceled) click(2, gesture.x, gesture.y);
      if (!canceled && gesture.radarMoved) state.radarDrags += 1;
      else if (!canceled) state.radarTaps += 1;
    } else if (gesture.selecting) {
      mouseMove(gesture.x, gesture.y, 1,
          gesture.x - gesture.previousX, gesture.y - gesture.previousY);
      releaseMouse(gesture.x, gesture.y);
      if (gesture.boxOneShot) {
        state.boxMode = false;
        updateCombatHud();
      }
    } else if (gesture.panning) {
      if (gesture.framePan) finishFramePan(gesture, canceled);
      else releaseMouse(gesture.x, gesture.y);
    } else if (gesture.demolition) {
      // This touch belongs to targeting even if a menu cancelled the mode
      // during the gesture. Never leak it into selection or a movement order.
      if(!canceled&&!gesture.moved&&isBattlefieldPoint(gesture.x,gesture.y)){
        if(window.__warzoneCommands?.demolishAt?.(gesture.x,gesture.y))feedback(gesture.x,gesture.y,'order');
      }
    } else if (!canceled && !gesture.moved && isBattlefieldPoint(gesture.x,gesture.y)
        && window.WarzoneRewards?.handleTap?.(gesture.x,gesture.y)) {
      feedback(gesture.x,gesture.y,'order');state.taps += 1;
    } else if (!canceled && !gesture.moved && isBattlefieldPoint(gesture.x,gesture.y)
        && openFacilityAt(gesture.x,gesture.y)) {
      // A stationary touch on an owned lab/factory opens its Towers page,
      // including slower finger taps and while combat units are selected.
      feedback(gesture.x,gesture.y,"tap");
      state.taps += 1;
    } else if (!canceled && gesture.longPressArmed
        && (Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now()) - gesture.downInputTime >= LONG_PRESS_MS) {
      click(2, gesture.x, gesture.y);
      state.orders += 1;
      feedback(gesture.x, gesture.y, "double");
    } else if (!canceled && !gesture.moved) {
      if (window.__warzoneCommands?.isPlacement() && isBattlefieldPoint(gesture.x, gesture.y)) {
        if(window.__warzoneCommands.placeAt(gesture.x, gesture.y,state.replayingPointers)){
          feedback(gesture.x, gesture.y, "tap");
          vibrate(8);
        }
        state.taps += 1;
      } else if (state.combatLock && isBattlefieldPoint(gesture.x, gesture.y)) {
        if (combatOverride) contextualClick(gesture.x, gesture.y, state.queueMode);
        else void queueCombatOrder(gesture.x, gesture.y, state.autoFight);
      } else if (state.queueMode && isQueuePlacementPoint(gesture.x, gesture.y)) {
        if(!window.__warzoneCommands?.queueNativeSite?.(gesture.x,gesture.y,state.replayingPointers))contextualClick(gesture.x, gesture.y, true);
        feedback(gesture.x, gesture.y, "order");
        vibrate(8);
        state.taps += 1;
      } else {
        if (isBattlefieldPoint(gesture.x, gesture.y)) {state.manualSelectionRevision += 1;click(0, gesture.x, gesture.y);}
        else nativeUiClick(gesture.x, gesture.y);
        if (isBattlefieldPoint(gesture.x, gesture.y)) {
          feedback(gesture.x, gesture.y, "tap");
          recordTap(gesture.x, gesture.y);
        }
        state.taps += 1;
      }
      window.__blockNightResearch?.afterNativeTap?.(gesture.x, gesture.y);
    }

    state.primaryId = null;
    state.single = null;
  }

  function releaseAll(clearModes = false, cancelTool = true) {
    cancelFacilityNavigation();
    cancelFramePan();
    window.__warzoneCommands?.cancelLinePlacement?.();
    const cancelledTool = cancelCombatInput(cancelTool);
    clearMultiMove();
    clearLongPress();
    releaseTilt();
    releaseRotation();
    releaseCameraKeys();
    cancelClicks();
    state.pointerQueue.length=0;state.panDeferredPointers.length=0;state.afterInput.length=0;
    for(const pointerId of state.physicalPointers)releasePointer(canvas(),pointerId);
    state.physicalPointers.clear();
    for (const pointerId of state.pointers.keys()) releasePointer(canvas(), pointerId);
    state.pointers.clear();
    state.primaryId = null;
    state.single = null;
    state.multi = null;
    state.ignoreUntilAllUp = false;
    if (state.queueModifierHeld && (clearModes || !state.queueMode)) {
      dispatchKey("Control", "ControlLeft", 17, false, false, false, 1);
      state.queueModifierHeld = false;
    }
    if (clearModes) {
      state.queueMode=false;state.autoFight=false;
      setQueueModifier(false,true);
      dispatchKey('Shift','ShiftLeft',16,false,false,false,1);
    }
    updateCombatHud();
    if (state.boxMode) {
      state.boxMode = false;
      updateCombatHud();
    }
    return cancelledTool;
  }

  function setBattleActive(active) {
    if (active) { state.battleActive = true; if (canvas()) canvas().inert = false; window.WarzoneMusic?.setBattleActive?.(true); return; }
    // Release held buttons before disabling dispatch. A transition out of the
    // battle must never send Escape into the next native screen.
    resetCombatMode(); releaseAll(true, false);
    state.battleActive = false;
    window.WarzoneMusic?.setBattleActive?.(false);
    state.hudVisible = false;
    if (canvas()) canvas().inert = true;
    const doc = commandDocument();
    for (const id of ['blocknight-combat-hud','wt-field-centre','wt-field-toggle','warzone-towers-help-overlay']) {
      const control = doc.getElementById(id);
      if (control) { control.hidden = true; control.inert = true; }
    }
  }

  /** Deterministic ADB regression exercise; never runs during a normal launch. */
  function runSyntheticSuite() {
    const target = canvas();
    if (!target || !window.PointerEvent) return false;
    const bounds = target.getBoundingClientRect();
    const point = (nx, ny) => ({
      x: bounds.left + bounds.width * nx,
      y: bounds.top + bounds.height * ny
    });
    const fire = (type, id, nx, ny, primary = true) => {
      const p = point(nx, ny);
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: id,
        pointerType: "touch",
        isPrimary: primary,
        clientX: p.x,
        clientY: p.y,
        button: type === "pointerdown" ? 0 : -1,
        buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
        pressure: type === "pointerup" ? 0 : 0.5
      }));
    };

    // One-shot BOX drag around the four starting constructors.
    toggleBoxMode(true);
    fire("pointerdown", 901, 0.35, 0.45);
    setTimeout(() => fire("pointermove", 901, 0.50, 0.60), 28);
    setTimeout(() => fire("pointerup", 901, 0.50, 0.60), 56);

    // Direct one-finger camera pan with several high-frequency samples.
    setTimeout(() => fire("pointerdown", 902, 0.45, 0.30), 180);
    for (let index = 1; index <= 6; index += 1) {
      setTimeout(() => fire("pointermove", 902,
          0.45 + index * 0.012, 0.30 + index * 0.004), 180 + index * 14);
    }
    setTimeout(() => fire("pointerup", 902, 0.522, 0.324), 285);

    // Locked two-finger pinch: it must zoom without also panning.
    setTimeout(() => {
      fire("pointerdown", 903, 0.46, 0.34, true);
      fire("pointerdown", 904, 0.54, 0.34, false);
    }, 390);
    setTimeout(() => {
      fire("pointermove", 903, 0.44, 0.34, true);
      fire("pointermove", 904, 0.56, 0.34, false);
    }, 430);
    setTimeout(() => {
      fire("pointerup", 903, 0.44, 0.34, true);
      fire("pointerup", 904, 0.56, 0.34, false);
    }, 500);

    // Exercise every compact command path. The queued click deliberately uses
    // Warzone's native Ctrl+contextual-click implementation.
    setTimeout(() => {
      toggleCombatLock(true);
      toggleAutoFight(true);
      toggleQueueMode(true);
      const queued = point(0.42, 0.20);
      contextualClick(queued.x, queued.y, true);
    }, 620);
    setTimeout(() => {
      toggleAutoFight(false);
      toggleCombatLock(false);
      toggleQueueMode(false);
      stopSelected();
    }, 820);

    // A continuous radar drag must use Warzone's camera button, not issue a
    // battlefield order. Return to base afterward so the test leaves a useful
    // playable view.
    setTimeout(() => fire("pointerdown", 905, 0.89, 0.52), 930);
    setTimeout(() => fire("pointermove", 905, 0.89, 0.61), 980);
    setTimeout(() => fire("pointerup", 905, 0.89, 0.61), 1030);
    setTimeout(jumpToBase, 1120);
    return true;
  }

  document.addEventListener('mousedown',event=>{if(event.target===canvas()&&event.button===0)state.lastNativeLeftDownAt=performance.now();},true);
  for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
    document.addEventListener(type, handlePointer, { capture: true, passive: false });
  }
  for (const type of ['keydown','keyup','keypress','wheel']) {
    document.addEventListener(type, event => {
      if (!state.battleActive && event.target === canvas()) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, {capture:true, passive:false});
  }
  document.addEventListener("touchstart", event => {
    if (event.target === canvas()) event.preventDefault();
  }, { capture: true, passive: false });
  document.addEventListener("contextmenu", event => {
    if (event.target === canvas()) event.preventDefault();
  }, { capture: true, passive: false });
  document.addEventListener("dragstart", event => {
    if (event.target === canvas()) event.preventDefault();
  }, { capture: true, passive: false });
  document.addEventListener("selectstart", event => {
    if (event.target === canvas()) event.preventDefault();
  }, { capture: true, passive: false });
  window.addEventListener("blur", event => {
    if (event.target !== window && event.target !== canvas()) return;
    const host = commandDocument();
    const help = host.getElementById("warzone-towers-help-overlay");
    const music = host.getElementById("wt-map-music-menu");
    const tech = window.__blockNightResearch?.report?.();
    const commands=window.__warzoneCommands,commandState=commands?.report?.();
    // These controls share this WebView. Moving focus from the canvas to a
    // catalogue card must not cancel an in-flight native rectangle selection.
    // Actual app/window focus loss still reaches SDL and releases all input.
    const commandFocus=commands?.isOpen?.()||commandState?.buildOpen||commandState?.selectingTrucks;
    if (host.hasFocus?.() && ((help && !help.hidden) || (music && !music.hidden) || tech?.open || tech?.opening || commandFocus)) {
      event.stopImmediatePropagation();
      return;
    }
    releaseAll();
  }, true);
  window.addEventListener("pagehide", () => {
    clearZoomAckTimer();
    resetCombatMode();
    releaseAll(true);
  });
  window.addEventListener('warzone-battle-ended', resetCombatMode);

  prepareCanvas();
  const canvasTimer = setInterval(() => {
    if (prepareCanvas()) clearInterval(canvasTimer);
  }, 500);
  setTimeout(() => clearInterval(canvasTimer), 20000);
  window.__kalaWarzoneTouch = {
    cancelFacilityNavigation,
    setHeaderMenuState,
    prepareHeaderMenu,
    activateFooterBuild,
    closeHelp,
    showHelp,
    toggleHelp,
    version: 57,
    ready: true,
    key,
    zoom,
    applyZoomPreset,
    tapNormalized,
    tapFrontend,
    faceOpponent,
    selectAllCombat,
    selectAllUnits,
    selectAllTrucks,
    toggleCombatLock,
    refreshCombatLock, holdCombatSelection, resumeCombatSelection, resetCombatMode,
    toggleAutoFight,
    toggleBoxMode,
    toggleQueueMode,
    stopSelected,
    jumpToBase,
    nativeClick: (x, y, button = 0) => click(button, x, y),
    nativeSelectClick: (x,y,add=false)=>{state.manualSelectionRevision += 1;cancelConstructorSelection();return click(0,x,y,add);},
    nativeWorldClick,nativeBoxSelect,nativeSelectionBounds,nativeSelectVisibleTrucks,
    isBattlefieldPoint,
    nativeMenuClick,
    nativeUiClick,
    queuedClick: (x, y) => contextualClick(x, y, true),
    resumeInput: ()=>pumpClicks(),
    nativeMove: (x, y, buttons = 0) => mouseMove(x, y, buttons),
    nativePressKey: (keyValue, code, keyCode, shiftKey = false) => pressKey(keyValue, code, keyCode, shiftKey),
    runSyntheticSuite,
    showCombatHud,
    setBattleActive,
    saveName,
    releaseAll,
    isGestureActive: () => state.pointers.size > 0 || state.mouseButton !== null || state.heldKeys.size > 0 || state.tiltKey !== null || state.rotationKey !== null,
    report: () => ({
      active: true,
      version: 57,
      intercepted: state.intercepted,
      mouseEvents: state.mouseEvents,
      taps: state.taps,
      orders: state.orders,
      pans: state.pans,
      panMoves: state.panMoves,
      lastPanStartLatencyMs: state.lastPanStartLatencyMs,
      lastPanDispatchMs: state.lastPanDispatchMs,
      maxPanDispatchMs: state.maxPanDispatchMs,
      panPhase:state.panRelease?.phase||(state.single?.framePan&&state.single.panning?'drag':'idle'),
      panQueuedPointers:state.panDeferredPointers.length,panRearms:state.panRearms,
      panUnobservedRearms:state.panUnobservedRearms,panHeldTimeouts:state.panHeldTimeouts,panContextResets:state.panContextResets,
      panQueueOverflows:state.panQueueOverflows,
      boxSelections: state.boxSelections,boxCadenceWaits:state.boxCadenceWaits,boxPressGaps:state.boxPressGaps,lastNativeLeftDownAt:state.lastNativeLeftDownAt,
      manualSelectionRevision: state.manualSelectionRevision,
      facilityOpens:state.facilityOpens, lastFacility:state.lastFacility, facilityError:state.facilityError,
      pinchSteps: state.pinchSteps,
      tiltMoves: state.tiltMoves,
      tiltHeld: state.tiltKey?.code || null,
      rotationMoves: state.rotationMoves,
      rotationSteps: state.rotationSteps,
      rotationHeld: state.rotationKey?.code || null,
      saveNames: state.saveNames,
      radarTaps: state.radarTaps,
      radarDrags: state.radarDrags,
      radarMoves: state.radarMoves,
      cameraFacings: state.cameraFacings,
      cameraFacingPending: state.cameraFacingPending,
      cameraHeading: state.cameraHeading,
      cameraFacingError: state.cameraFacingError,
      lastRadarPoint: state.lastRadarPoint,
      combatLock: state.combatLock,
      combatLockRequested: state.combatLock, combatLockSuspended:Boolean(combatSuspended()), combatOverride,
      combatLockState:combatPacket?.combatLock||null, combatContext:combatWorld?.context||'', combatError,
      allCombatSelected,
      autoFight: state.autoFight,
      boxMode: state.boxMode,
      queueMode: state.queueMode,
      queueModifierHeld: state.queueModifierHeld,
      stickyBuildActivations: state.stickyBuildActivations,
      nativeStatsOpen: state.nativeStatsOpen,
      nativeObjectsOpen: state.nativeObjectsOpen,
      pendingClicks: state.clickQueue.length + (state.clickJob ? 1 : 0) + state.pointerQueue.length + ((state.clickFrame!==null||state.clickTimer!==null)&&!state.clickJob?1:0),
      nativeRenderFrames: state.nativeFrames,
      queuedPointerEvents: state.pointerQueue.length,
      selectAlls: state.selectAlls,
      manualSelectAlls: state.manualSelectAlls,
      combatOrders: state.combatOrders,
      patrolOrders: state.patrolOrders,
      queuedOrders: state.queuedOrders,
      stopOrders: state.stopOrders,
      stopPending: Boolean(state.stopNonce),
      stopAcks: state.stopAcks,
      stoppedUnitIds: state.stoppedUnitIds.slice(),
      baseJumps: state.baseJumps,
      feedbacks: state.feedbacks,
      doubleTaps: state.doubleTaps,
      coalescedSamples: state.coalescedSamples,
      pointerCaptures: state.pointerCaptures,
      zoomPreset: state.zoomPreset,
      zoomPresetSelections: state.zoomPresetSelections,
      zoomWheelEvents: state.zoomWheelEvents,
      zoomCommandWrites: state.zoomCommandWrites,
      zoomCommandErrors: state.zoomCommandErrors,
      zoomAcks: state.zoomAcks,
      zoomPending: state.zoomPendingNonce !== null,
      lastZoomDistance: state.lastZoomDistance,
      gestureActive: state.pointers.size > 0 || state.mouseButton !== null || state.heldKeys.size > 0 || state.tiltKey !== null || state.rotationKey !== null,
      hudVisible: state.hudVisible,
      battleActive: state.battleActive,
      heldKeys: [...state.heldKeys]
    })
  };

  function physicalCombatInput(event) {
    if (forwardedPointers.has(event) || !(event.pointerType === 'touch' || event.pointerType === 'pen' || event.isTrusted === true)) return;
    if (event.type === 'pointerdown') { combatPhysicalPointers.add(event.pointerId); ++combatOrderSerial; cancelConstructorSelection(); }
    else { combatPhysicalPointers.delete(event.pointerId); combatInteractionUntil = combatNow() + 160; }
    refreshCombatLock();
  }
  const combatFenceTargets = new Set([document, commandDocument()].map(doc=>doc.defaultView || window));
  const combatFenceTypes = ['pointerdown','pointerup','pointercancel'];
  for (const target of combatFenceTargets) for (const type of combatFenceTypes)
    target.addEventListener(type, physicalCombatInput, {capture:true, passive:true});
  window.addEventListener('blur', () => { combatPhysicalPointers.clear(); combatInteractionUntil = combatNow() + 160; refreshCombatLock(); });
  const combatSelectionTimer = setInterval(refreshCombatSelection, 100);
  window.addEventListener('pagehide', () => {
    combatFenceDisposed = true; ++combatOrderSerial; cancelConstructorSelection();
    for (const target of combatFenceTargets) for (const type of combatFenceTypes) target.removeEventListener(type, physicalCombatInput, true);
    combatFenceTargets.clear(); combatPhysicalPointers.clear();
    clearInterval(combatSelectionTimer); combatSelectionWatch = null; allCombatSelected = false;
  });
  return "warzone-towers-touch-v49-music-controls";
})();

