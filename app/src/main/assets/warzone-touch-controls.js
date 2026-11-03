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
 *   BOX then drag               immediate one-shot rectangle selection
 *   +Q then build               sticky native construction queue
 *
 * The stock engine remains untouched. Block Night's custom match rule handles
 * the optional absolute camera presets requested by this wrapper.
 */
(() => {
  "use strict";

  if (window.__kalaWarzoneTouch?.version >= 54) return "already-installed";

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
  const CLICK_HOLD_MS = 8;
  const DOUBLE_TAP_MS = 290;
  const DOUBLE_TAP_SLOP = 28;
  const ZOOM_COMMAND_PATH = "/data/mp/tests/blocknight-zoom-command.json";
  const ZOOM_PRESETS = Object.freeze({
    close: Object.freeze({ label: "CLOSE", distance: 1600 }),
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
    pinchSteps: 0,
    tiltMoves: 0,
    tiltKey: null,
    tiltReleaseTimer: null,
    tiltReleaseFrame: null,
    tiltBudget: 0,
    saveNames: 0,
    radarTaps: 0,
    radarDrags: 0,
    radarMoves: 0,
    cameraFacings: 0,
    cameraFacingPending: false,
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
    const target = canvas();
    if (!target || !window.PointerEvent) return false;
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
  function pendingNativeInput(){return Boolean(state.clickJob||state.clickQueue.length||state.clickFrame!==null||state.clickTimer!==null||state.pointerQueue.length||window.__warzoneCommands?.report?.()?.nativePendingSites);}
  function afterNativeInput(callback){if(!pendingNativeInput())return false;state.afterInput.push(callback);return true;}
  function flushAfterInput(){if(!pendingNativeInput())state.afterInput.splice(0).forEach(callback=>callback());}
  function pumpPointerQueue(){
    if(state.clickJob||state.clickQueue.length||state.clickFrame!==null||state.clickTimer!==null||window.__warzoneCommands?.report?.()?.nativePendingSites)return;
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
    if (state.clickFrame !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(state.clickFrame);
    clearTimeout(state.clickTimer); state.clickFrame = null; state.clickTimer = null;
    state.clickQueue.length = 0; state.clickJob = null;
    releaseMouse();
  }

  function setQueueModifier(down, force = false) {
    if (!force && state.queueModifierHeld === down) return;
    dispatchKey("Control", "ControlLeft", 17, down, false, down);
    state.queueModifierHeld = down;
  }

  function pumpClicks() {
    if (state.clickJob || state.clickFrame !== null || state.clickTimer !== null) return;
    if(!state.clickQueue.length){pumpPointerQueue();return;}
    const job = state.clickJob = state.clickQueue.shift();
    focusCanvas(); releaseMouse(); setQueueModifier(job.ctrl, job.ctrl);
    mouseMove(job.x, job.y, 0);
    // A complete frame must update terrain picking before mouse-down. Keep
    // up/down separate too; rapid taps are FIFO, never shortened by the next tap.
    clickStep(() => {
      if (state.clickJob !== job) return;
      mouse("pointerdown", job.x, job.y, job.button, mouseButtonMask(job.button));
      state.mouseButton = job.button;
      clickStep(() => {
        if (state.clickJob !== job) return;
        releaseMouse(job.x, job.y);
        if (!state.queueMode && job.ctrl) setQueueModifier(false);
        clickStep(()=>{state.clickJob=null;window.dispatchEvent(new CustomEvent('warzone-native-input-finished'));pumpClicks();},2);
      });
    });
  }

  function click(button, x = state.lastX, y = state.lastY, ctrl = state.queueModifierHeld) {
    if (!canvas()) return false;
    state.clickQueue.push({ button, x, y, ctrl }); pumpClicks();
    return true;
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
    state.combatLock = false;
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
    if (!canvas()) return false;
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

  function faceOpponent() {
    if (!canvas()) return false;
    releaseAll(true);
    state.cameraFacings += 1;
    state.cameraFacingPending = true;
    // Let SDL settle the real battlefield viewport before sending the chord.
    // The preparation dialog stays suppressed until its release is processed.
    showCombatHud();

    // The supplied map runs north-to-south: player 0 starts in the north and
    // player 1 in the south. Warzone's absolute Face South binding is
    // Ctrl+Down. Call once under the startup splash, never on a wave change.
    const afterFrames = callback => {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => requestAnimationFrame(callback));
      else setTimeout(callback, 40);
    };
    afterFrames(() => {
      dispatchKey("Control", "ControlLeft", 17, true, false, true);
      afterFrames(() => {
        dispatchKey("ArrowDown", "ArrowDown", 40, true, false, true);
        afterFrames(() => {
          dispatchKey("ArrowDown", "ArrowDown", 40, false, false, true);
          dispatchKey("Control", "ControlLeft", 17, false, false, false);
          afterFrames(() => { state.cameraFacingPending = false; });
        });
      });
    });
    return true;
  }

  function ctrlShortcut(keyValue, code, keyCode) {
    if (!canvas()) return false;
    const preserveStickyModifier = state.queueModifierHeld;
    if (!preserveStickyModifier) {
      dispatchKey("Control", "ControlLeft", 17, true, false, true);
    }
    setTimeout(() => {
      dispatchKey(keyValue, code, keyCode, true, false, true);
    }, 12);
    setTimeout(() => {
      dispatchKey(keyValue, code, keyCode, false, false, true);
      if (!preserveStickyModifier) {
        dispatchKey("Control", "ControlLeft", 17, false, false, false);
      }
    }, 58);
    return true;
  }

  function selectAllCombat() {
    const selected = ctrlShortcut("a", "KeyA", 65);
    if (selected) state.selectAlls += 1;
    return selected;
  }

  function selectAllUnits() {
    const selected = ctrlShortcut("u", "KeyU", 85);
    if (selected) state.manualSelectAlls += 1;
    return selected;
  }

  function updateCombatHud() {
    const hudDocument = commandDocument();
    const all = hudDocument.getElementById("blocknight-select-all");
    const auto = hudDocument.getElementById("blocknight-auto-fight");
    const box = hudDocument.getElementById("blocknight-box-select");
    const queue = hudDocument.getElementById("blocknight-queue-orders");
    if (all) all.classList.toggle("active", state.combatLock);
    if (auto) auto.classList.toggle("active", state.autoFight);
    if (box) box.classList.toggle("active", state.boxMode);
    if (queue) queue.classList.toggle("active", state.queueMode);
    if (queue) queue.setAttribute("aria-pressed", String(state.queueMode));
    for (const button of hudDocument.querySelectorAll?.('#blocknight-combat-hud button,#wt-field-centre button') || []) {
      button.disabled = Boolean(state.stopNonce);
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
    state.combatLock = typeof force === "boolean" ? force : !state.combatLock;
    if (!state.combatLock) state.autoFight = false;
    if (state.combatLock) selectAllCombat();
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
      if (!start || start.id !== event.pointerId || button.disabled) return;
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
      if (!button.disabled) action();
    });
  }

  function toggleAutoFight(force) {
    state.autoFight = typeof force === "boolean" ? force : !state.autoFight;
    if (state.autoFight) {
      state.combatLock = true;
      selectAllCombat();
      setTimeout(() => pressKey("q", "KeyQ", 81), 90);
      state.patrolOrders += 1;
    }
    updateCombatHud();
    return state.autoFight;
  }

  function toggleBoxMode(force) {
    state.boxMode = typeof force === "boolean" ? force : !state.boxMode;
    if (state.boxMode) {
      state.combatLock = false;
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
    releaseAll(); state.autoFight = false;
    const nonce = `${Date.now().toString(36)}-stop-${state.stopOrders + 1}`;
    const path = '/data/mp/tests/warzone-towers-control-command.json';
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

  function queueCombatOrder(x, y, patrol) {
    if (!selectAllCombat()) return false;
    const delay = patrol ? 155 : 105;
    if (patrol) {
      setTimeout(() => pressKey("q", "KeyQ", 81), 88);
    }
    // RightClickOrders is deliberately disabled. Warzone's native contextual
    // left click selects a unit when pressed on a unit and issues the correct
    // move / attack / repair order when pressed on a destination. Keeping the
    // same input path here makes ALL and AUTO agree with manual selection.
    setTimeout(() => contextualClick(x, y, state.queueMode), delay);
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
    if (!spec && preset !== "manual" && preset !== "base") return null;
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
    if (Math.abs(dy) < 1) return;
    state.tiltBudget += dy;
    pumpTilt();
    state.tiltMoves += 1;
  }

  function radarPoint(x, y) {
    const target = canvas();
    if (!target) return null;
    const bounds = target.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    const normalizedX = (x - bounds.left) / bounds.width;
    const normalizedY = (y - bounds.top) / bounds.height;

    // TowerDefense2_m uses the native square radar. Warzone radar.cpp fits
    // its longest side to 128 * radarZoom / 16 and leaves BASE_GAP * 4 (24px).
    // The previous tall-map hit area consumed drags above the actual minimap.
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
    const localX = x - bounds.left, localY = y - bounds.top;
    if (localX < bounds.width - 24 - side || localX > bounds.width - 24
        || localY < bounds.height - 24 - side || localY > bounds.height - 24) return null;
    return { x: normalizedX, y: normalizedY };
  }

  function isBattlefieldPoint(x, y) {
    const target = canvas();
    if (!target || radarPoint(x, y) !== null) return false;
    const bounds = target.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return false;
    if (window.__warzoneCommands?.tower) {
      if (window.__warzoneCommands.nativeMenuOpen()) return false;
      if (window.__warzoneCommands.nativeBuildOpen?.()) {
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
    if (inRect(x, y, ui.reticle)) return false;
    if ((state.nativeObjectsOpen||window.__warzoneCommands?.nativeBuildOpen?.()) && inRect(x, y, ui.objects)) return false;
    if ((state.nativeStatsOpen||window.__warzoneCommands?.nativeBuildMenuOpen?.()) && inRect(x, y, ui.stats)) return false;
    return true;
  }

  function showCombatHud() {
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

      hud = document.createElement("div");
      hud.id = "blocknight-combat-hud";
      hud.setAttribute("role", "toolbar");
      hud.setAttribute("aria-label", "Warzone Towers commands");
      const makeButton = (id, label, title, action) => {
        const button = document.createElement("button");
        button.id = id;
        button.type = "button";
        const iconNames = {
          "blocknight-select-all": "stack", "blocknight-auto-fight": "arrows-clockwise",
          "blocknight-box-select": "selection", "blocknight-queue-orders": "stack-plus",
          "blocknight-stop": "hand-palm", "blocknight-base": "house",
          "blocknight-zoom-close": "x", "blocknight-zoom-battle": "crosshair",
          "blocknight-zoom-map": "map-pin", "blocknight-tech": "flask",
          "blocknight-help": "question", "wt-select-move": "crosshair", "wt-select-trucks": "stack"
        };
        const icon = document.createElement("img");
        icon.src = `/warzone/ui/icons/${iconNames[id]}.svg`;
        icon.alt = "";
        icon.setAttribute("aria-hidden", "true");
        const caption = document.createElement("span");
        caption.textContent = label;
        button.append(icon, caption);
        button.title = title;
        // Keep touch commands from stealing focus (and held native queue keys)
        // from the engine frame when the command row lives in its parent.
        bindTouchCommand(button, action);
        return button;
      };
      const all = makeButton("blocknight-select-all", "ALL",
        "Keep all combat units selected (constructors excluded)", async()=>{const enabled=state.combatLock;if(window.__warzoneCommands?.afterBuildExit)await window.__warzoneCommands.afterBuildExit(()=>toggleCombatLock(!enabled));else toggleCombatLock(!enabled);});
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
      const tech = makeButton("blocknight-tech", "TECH",
        "Open the tactical research queue", () => {
          if(window.__warzoneCommands?.afterBuildExit)window.__warzoneCommands.afterBuildExit(()=>window.__blockNightResearch?.open?.());
          else window.__blockNightResearch?.open?.();
        });
      const help = makeButton("blocknight-help", "HELP", "How to play and use +Q", showHelp);
      const orderGroup = document.createElement("div");
      orderGroup.className = "bn-command-group";
      orderGroup.append(all, auto, box, queue, stop, base);
      const zoomGroup = document.createElement("div");
      zoomGroup.className = "bn-command-group";
      zoomGroup.append(zoomControl);
      const techGroup = document.createElement("div");
      techGroup.className = "bn-command-group";
      techGroup.append(tech, help);
      if (window.__warzoneCommands?.tower) {
        hud.classList.add("wt-modern");
        const commands = document.createElement("div");
        commands.className = "bn-command-group";
        for (const page of ["build", "design", "factory", "stats", "more"]) {
          const b = document.createElement("button");
          b.id = `wt-open-${page}`; b.type = "button"; b.textContent = page.toUpperCase();
          b.title = `Open ${page}`;
          bindTouchCommand(b, () => window.__warzoneCommands.open(page));
          commands.appendChild(b);
        }
        hud.appendChild(commands);
      }
      if(window.__warzoneCommands?.tower){
        const centre=hudDocument.createElement('section');centre.id='wt-field-centre';centre.setAttribute('aria-label','Battlefield command centre');
        const select=makeButton('wt-select-move','SELECT / MOVE','Exit build placement and return to unit selection and movement',()=>window.__warzoneCommands.selectMode());
        const trucks=makeButton('wt-select-trucks','TRUCKS','Select the nearby group of construction trucks',()=>window.__warzoneCommands.selectNearbyTrucks());
        all.querySelector?.('span')&&(all.querySelector('span').textContent='ALL UNITS');
        auto.querySelector?.('span')&&(auto.querySelector('span').textContent='PATROL');
        centre.append(select,all,auto,box,stop,trucks);hudDocument.body.appendChild(centre);
      }
      hud.append(orderGroup, zoomGroup, techGroup);
      (hudDocument.getElementById("warzone-command-strip") || hudDocument.body).appendChild(hud);
    }
    hud.hidden = false;
    state.hudVisible = true;
    showBattlefieldViewport();
    updateCombatHud();
    return true;
  }

  function showBattlefieldViewport() {
    const container = document.getElementById("emscripten_container");
    if (!container || !state.hudVisible) return;
    container.style.transform = "none";
    container.style.transformOrigin = "";
    window.parent?.WarzoneHost?.setPlaying();
  }

  function showHelp() {
    if(window.__warzoneCommands?.nativeBuildOpen?.()){window.__warzoneCommands.afterBuildExit(showHelp);return true;}
    window.__warzoneCommands?.close?.();
    window.__warzoneCommands?.closeNative?.();
    const hudDocument = commandDocument();
    let help = hudDocument.getElementById("warzone-towers-help");
    if (!help) {
      const overlay = hudDocument.createElement("div");
      overlay.id = "warzone-towers-help-overlay";
      overlay.hidden = true;
      help = hudDocument.createElement("section");
      help.id = "warzone-towers-help";
      help.setAttribute("role", "dialog");
      help.setAttribute("aria-modal", "true");
      help.setAttribute("aria-labelledby", "wt-help-title");
      help.tabIndex = -1;
      help.innerHTML = `
        <header><div><span class="wt-help-eyebrow">WARZONE TOWERS</span>
          <h1 id="wt-help-title">FIELD GUIDE</h1></div>
          <button type="button" class="wt-help-close" aria-label="Close help">CLOSE</button></header>
        <div class="wt-help-content">
          <section class="wt-help-queue"><h2>BUILD · QUEUE YOUR DEFENCES</h2>
            <ol><li><b>Open BUILD.</b> Choose a structure in Warzone’s original build list.</li>
              <li><b>Tap each valid location.</b> Queued sites appear as Warzone’s green building blueprints.</li>
              <li><b>Nearby trucks work together.</b> BUILD selects the nearby group; multiple manually selected trucks are retained.</li>
              <li><b>SELECT / MOVE</b> leaves placement and keeps queued work. Placement also ends when your group finishes.</li></ol>
            <p>Invalid taps keep your chosen structure active. STOP cancels selected trucks’ orders,
              and clears their remaining native queued sites.</p></section>
          <section><h2>PROTECT YOUR COMMAND CENTRE</h2>
            <p>You have <b>4 minutes to prepare</b>. Wave 1 starts automatically, even if you have not built anything.
              If your command centre is destroyed, you have failed.</p>
            <p><b>SKIP WAVE</b> calls the next wave immediately. Every surviving enemy stays on the map.</p></section>
          <section><h2>MOVE &amp; LOOK</h2>
            <p><b>Tap</b> to select, move or attack. <b>Swipe</b> to pan. <b>Pinch</b> to zoom.
              <b>Slide two fingers together up/down</b> to tilt the camera. Map edges limit panning.
              <b>SELECT / MOVE</b> returns to ordinary unit selection and orders. Tap <b>BOX</b> then drag to select a group.</p>
            <p><b>CLOSE / BATTLE / MAP</b> set camera distance. <b>BASE</b> returns to your command centre.</p></section>
          <section><h2>COMMANDS &amp; RESEARCH</h2>
            <p>The bottom-left console keeps <b>ALL UNITS</b>, <b>PATROL</b>, <b>BOX</b>, <b>STOP</b> and <b>TRUCKS</b> available. ALL selects combat units; TRUCKS selects the nearby constructor group. MORE contains control size and extra options.
              <b>STOP</b> stops selected units.</p>
            <p><b>TECH</b> opens research. Choose a lab and add available topics to its queue.
              Each lab completes your choices in order. Use <b>BACK TO BATTLE</b> to return.</p>
            <p><b>DESIGN</b> creates blueprints from researched parts. SAVE DESIGN keeps them on this device.
              <b>FACTORY</b> produces saved or existing designs with normal power and build time.
              <b>STATS</b> opens player and kill statistics.</p></section>
          <section><h2>MUSIC</h2><p>Choose your tracks on the start screen before starting a battle. Download Music once, select your playlist, then press <b>START GAME</b>. Your choices are saved for the next game.</p></section>
        </div>
        <footer><span>The battle continues while this guide is open.</span>
          <button type="button" class="wt-help-back">BACK TO BATTLE</button></footer>`;
      overlay.appendChild(help);
      hudDocument.body.appendChild(overlay);
      const restoreBattle = () => {
        if (overlay.hidden) return;
        overlay.hidden = true;
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
      for (const button of help.querySelectorAll(".wt-help-close, .wt-help-back")) {
        bindTouchCommand(button, restoreBattle);
      }
      overlay.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          restoreBattle();
        } else if (event.key === "Tab") {
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
    if (!overlay.hidden) return true;
    releaseAll();
    overlay._blockedRegions = ["warzone-command-strip", "warzone-game-frame"].map(id => hudDocument.getElementById(id))
      .filter(Boolean).map(element => ({ element, wasInert: element.inert }));
    overlay.hidden = false;
    for (const item of overlay._blockedRegions) item.element.inert = true;
    help.scrollTop = 0;
    help.focus({ preventScroll: true });
    return true;
  }

  function beginSingle(event) {
    const radar = radarPoint(event.clientX, event.clientY);
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
    focusCanvas();
    if (radar !== null) {
      state.lastRadarPoint = radar;
      // Classify taps first: tiny finger drift must not become a native drag.
      return;
    }
    if (window.__warzoneCommands?.isPlacement()) window.__warzoneCommands.previewAt(event.clientX, event.clientY);
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
    pressMouse(1, gesture.startX, gesture.startY);
    advancePan(gesture, gesture.x, gesture.y);
  }

  function beginMulti() {
    window.__warzoneCommands?.hidePreview?.();
    clearMultiMove();
    clearLongPress();
    releaseTilt();
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
      startCenter: center,
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
  }

  function clearMultiMove() {
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
    const center = {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2
    };
    const distance = Math.hypot(points[0].x - points[1].x,
        points[0].y - points[1].y);
    const centerDx = center.x - state.multi.startCenter.x;
    const centerDy = center.y - state.multi.startCenter.y;
    const centerTravel = Math.hypot(centerDx, centerDy);
    const distanceTravel = Math.abs(distance - state.multi.startDistance);
    const pinchScore = distanceTravel / PINCH_START;
    const panScore = centerTravel / MULTI_PAN_START;

    // Lock to one gesture after a deliberate threshold. A pinch cannot also
    // accidentally pan the battlefield, and a two-finger pan cannot zoom.
    if (state.multi.gesture === null) {
      if (pinchScore >= 1 && pinchScore > panScore * 1.1) {
        state.multi.gesture = "zoom";
        releaseCameraKeys();
      } else if (panScore >= 1 && panScore >= pinchScore) {
        if (Math.abs(centerDy) > Math.abs(centerDx) * 1.35) {
          state.multi.gesture = "tilt";
        } else {
          state.multi.gesture = "pan";
          state.pans += 1;
          pressMouse(1, state.multi.startCenter.x, state.multi.startCenter.y);
        }
      }
    }

    if (state.multi.gesture === "pan") {
      advancePan(state.multi, center.x, center.y);
    } else if (state.multi.gesture === "tilt") {
      advanceTilt(center.y - state.multi.center.y);
    } else if (state.multi.gesture === "zoom") {
      let step = distance - state.multi.stepDistance;
      let emitted = 0;
      while (Math.abs(step) >= PINCH_STEP && emitted < 6) {
        const direction = step > 0 ? -1 : 1;
        zoom(direction, center.x, center.y);
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
      releaseCameraKeys();
      releaseMouse(gesture.center.x, gesture.center.y);
      state.multi = null;
      state.ignoreUntilAllUp = state.pointers.size > 0;
    }
  }

  function handlePointer(event) {
    if (forwardedPointers.has(event)) return;
    const desktopPlacement = (window.__warzoneCommands?.isPlacement()||window.__warzoneCommands?.nativeBuildOpen?.())
        && (event.pointerType === "mouse" || event.pointerType === "pen");
    if (event.pointerType !== "touch" && !desktopPlacement && !state.physicalPointers.has(event.pointerId)) return;
    const target = canvas();
    if (!target) return;
    if (state.stopNonce && event.target === target) { own(event); return; }
    if(window.__warzoneCommands?.report?.()?.exitingBuild&&!state.physicalPointers.has(event.pointerId)&&event.target===target){own(event);return;}
    if (desktopPlacement && event.target === target) {
      if (event.type === "pointermove" && !state.pointers.has(event.pointerId) && !event.buttons) {
        if (radarPoint(event.clientX, event.clientY) === null) window.__warzoneCommands.previewAt(event.clientX, event.clientY);
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
      } else if (state.pointers.size === 2) {
        beginMulti();
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

      const inputElapsed = (Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now()) - gesture.downInputTime;
      if(inputElapsed>=LONG_PRESS_MS&&!gesture.moved&&!gesture.panning&&!state.queueMode&&!window.__warzoneCommands?.isPlacement()&&isBattlefieldPoint(gesture.startX,gesture.startY))gesture.longPressArmed=true;
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
        for (const sample of samples) {
          advancePan(gesture, sample.clientX, sample.clientY);
        }
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
    if(!canceled&&!gesture.moved&&!gesture.panning&&heldFor>=LONG_PRESS_MS&&!state.queueMode&&!window.__warzoneCommands?.isPlacement()&&isBattlefieldPoint(gesture.startX,gesture.startY))gesture.longPressArmed=true;

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
      releaseMouse(gesture.x, gesture.y);
    } else if (!canceled && gesture.longPressArmed
        && (Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now()) - gesture.downInputTime >= LONG_PRESS_MS) {
      click(2, gesture.x, gesture.y);
      state.orders += 1;
      feedback(gesture.x, gesture.y, "double");
    } else if (!canceled && !gesture.moved) {
      if (window.__warzoneCommands?.isPlacement() && isBattlefieldPoint(gesture.x, gesture.y)) {
        window.__warzoneCommands.placeAt(gesture.x, gesture.y);
        state.taps += 1;
      } else if (state.combatLock && isBattlefieldPoint(gesture.x, gesture.y)) {
        queueCombatOrder(gesture.x, gesture.y, state.autoFight);
      } else if (state.queueMode && isQueuePlacementPoint(gesture.x, gesture.y)) {
        if(!window.__warzoneCommands?.queueNativeSite?.(gesture.x,gesture.y,state.replayingPointers))contextualClick(gesture.x, gesture.y, true);
        feedback(gesture.x, gesture.y, "order");
        vibrate(8);
        state.taps += 1;
      } else {
        if (isBattlefieldPoint(gesture.x, gesture.y)) click(0, gesture.x, gesture.y);
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

  function releaseAll(clearModes = false) {
    clearMultiMove();
    clearLongPress();
    releaseTilt();
    releaseCameraKeys();
    cancelClicks();
    state.pointerQueue.length=0;state.afterInput.length=0;
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
      state.queueMode=false;state.combatLock=false;state.autoFight=false;
      setQueueModifier(false,true);
      dispatchKey('Shift','ShiftLeft',16,false,false,false,1);
    }
    updateCombatHud();
    if (state.boxMode) {
      state.boxMode = false;
      updateCombatHud();
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

  for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
    document.addEventListener(type, handlePointer, { capture: true, passive: false });
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
    const tech = window.__blockNightResearch?.report?.();
    // HELP and TECH are wrapper interfaces inside this WebView. Forwarding
    // their focus transfer to SDL clears every native key, cancelling the
    // engine's quick-build ghost even though +Q is still armed. A real app or
    // window focus loss must still reach SDL and release transient input.
    if (host.hasFocus?.() && ((help && !help.hidden) || tech?.open || tech?.opening || window.__warzoneCommands?.isOpen())) {
      event.stopImmediatePropagation();
      return;
    }
    releaseAll();
  }, true);
  window.addEventListener("pagehide", () => {
    clearZoomAckTimer();
    releaseAll(true);
  });

  prepareCanvas();
  const canvasTimer = setInterval(() => {
    if (prepareCanvas()) clearInterval(canvasTimer);
  }, 500);
  setTimeout(() => clearInterval(canvasTimer), 20000);
  window.__kalaWarzoneTouch = {
    version: 54,
    ready: true,
    key,
    zoom,
    applyZoomPreset,
    tapNormalized,
    tapFrontend,
    faceOpponent,
    selectAllCombat,
    selectAllUnits,
    toggleCombatLock,
    toggleAutoFight,
    toggleBoxMode,
    toggleQueueMode,
    stopSelected,
    jumpToBase,
    nativeClick: (x, y, button = 0) => click(button, x, y),
    nativeSelectClick: (x,y,add=false)=>click(0,x,y,add),
    nativeUiClick,
    queuedClick: (x, y) => contextualClick(x, y, true),
    resumeInput: ()=>pumpClicks(),
    nativeMove: (x, y, buttons = 0) => mouseMove(x, y, buttons),
    nativePressKey: (keyValue, code, keyCode, shiftKey = false) => pressKey(keyValue, code, keyCode, shiftKey),
    runSyntheticSuite,
    showCombatHud,
    saveName,
    releaseAll,
    isGestureActive: () => state.pointers.size > 0 || state.mouseButton !== null || state.heldKeys.size > 0 || state.tiltKey !== null,
    report: () => ({
      active: true,
      version: 54,
      intercepted: state.intercepted,
      mouseEvents: state.mouseEvents,
      taps: state.taps,
      orders: state.orders,
      pans: state.pans,
      panMoves: state.panMoves,
      lastPanStartLatencyMs: state.lastPanStartLatencyMs,
      lastPanDispatchMs: state.lastPanDispatchMs,
      maxPanDispatchMs: state.maxPanDispatchMs,
      boxSelections: state.boxSelections,
      pinchSteps: state.pinchSteps,
      tiltMoves: state.tiltMoves,
      tiltHeld: state.tiltKey?.code || null,
      saveNames: state.saveNames,
      radarTaps: state.radarTaps,
      radarDrags: state.radarDrags,
      radarMoves: state.radarMoves,
      cameraFacings: state.cameraFacings,
      cameraFacingPending: state.cameraFacingPending,
      lastRadarPoint: state.lastRadarPoint,
      combatLock: state.combatLock,
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
      gestureActive: state.pointers.size > 0 || state.mouseButton !== null || state.heldKeys.size > 0 || state.tiltKey !== null,
      hudVisible: state.hudVisible,
      heldKeys: [...state.heldKeys]
    })
  };

  return "warzone-towers-touch-v49-music-controls";
})();

