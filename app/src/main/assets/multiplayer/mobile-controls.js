/*
 * Multiplayer input adapter, extracted from the existing mobile controls.
 * SDL owns world input; the MP-only bridge owns local selection/state queries.
 * Ordinary synchronized native orders still own all simulation changes.
 */
(() => {
  'use strict';
  if (window.PcMultiplayerControls) return;

  const DENSITY=Math.max(1,Math.min(3,devicePixelRatio||1));
  const SLOP=Math.round(5+DENSITY), HOLD_MS=260, BOX_START=8;
  const PINCH_START=11, MULTI_START=11, TILT_STEP=32;
  const ROTATE_START=Math.PI/24, ROTATE_HANDOFF=Math.PI/12;
  const forwarded=new WeakSet(), points=new Map(), jobs=[];
  const counts={taps:0,rightClicks:0,pans:0,panMoves:0,boxes:0,pinches:0,tilts:0,rotations:0,commandCalls:0,cancels:0,dropped:0};
  let enabled=false,phase='room',single=null,multi=null,ignoreUntilUp=false;
  let generation=0,pumping=false,activeJob=null,heldMouse=null,longTimer=null,multiTimer=null,intentTimer=null;
  let panelOpen=false,lastMiddleDown=-Infinity,lastLeftDown=-Infinity;
  let lastPoint={x:0,y:0},lastAction='idle',lastError='';
  let manualSelectionRevision=0,combatLock=false,facadeSerial=0;
  let combatIntent=null,combatQueries=0,combatInteractionUntil=0,combatTimer=null,combatPageHidden=false,combatActivation='',combatActivationSerial=0;
  const heldKeys=new Map();
  const canvas=()=>document.getElementById('canvas');
  const modal=()=>{
    const help=window.parent?.WarzoneHost?window.parent.document.getElementById('warzone-towers-help-overlay'):null;
    return Boolean(window.__warzoneCommands?.isOpen?.()||window.__warzoneIntelligence?.isOpen?.()||window.__blockNightResearch?.report?.().open||window.__blockNightResearch?.report?.().opening||help&&!help.hidden);
  };
  const worldReady=()=>enabled&&phase==='game'&&window.PcMultiplayerState?.worldReady===true&&window.PcMultiplayerState?.worldSafe!==false&&window.PcMultiplayerState?.nativeMenuOpen!==true;
  const game=()=>worldReady()&&!modal();
  function combatSuspended(){
    const pages=window.__warzoneCommands?.report?.()||{};
    return !worldReady()||document.hidden||combatPageHidden||modal()||Boolean(pages.buildOpen||pages.placement||pages.selectingTrucks||pages.nativeMenu||pages.nativeClosing||pages.exitingBuild||pages.buildingOpening||window.__warzoneCommands?.isDemolishing?.())||
      points.size>0||heldMouse!==null||heldKeys.size>0||jobs.length>0||Boolean(activeJob&&!activeJob.finished)||combatQueries>0||performance.now()<combatInteractionUntil;
  }
  function refreshCombatLock(force=false){
    const native=window.PcMultiplayerNative,snapshot=native?.state?.combatLock;
    // Acknowledged native overrides (selection/control groups/session end) are
    // authoritative. An old OFF snapshot cannot cancel a newly requested ON.
    if(!force&&combatLock&&combatIntent?.enabled===true&&combatIntent.nonce&&snapshot?.requestNonce===combatIntent.nonce&&snapshot.enabled===false)combatLock=false;
    const suspended=combatSuspended();
    if(force||!combatIntent||combatIntent.enabled!==combatLock||combatIntent.suspended!==suspended){
      if(native?.setCombatLock?.({enabled:combatLock,suspended,activation:combatActivation})===true){
        combatIntent={enabled:combatLock,suspended,activation:combatActivation,nonce:native.combatLockIntent?.nonce||null};
      }
    }
    return snapshot?.enabled===true;
  }
  function setCombatLock(value){
    if(typeof value!=='boolean'||value&&!worldReady())return false;
    const previous=combatLock,previousIntent=combatIntent,previousActivation=combatActivation;combatLock=value;
    // A native manual selection blocks this activation, including a late
    // unsuspend written before its snapshot arrives. Only a new user enable
    // receives a new activation; background refreshes cannot re-arm it.
    if(value)combatActivation='mp-combat-user-'+Date.now()+'-'+(++combatActivationSerial);
    refreshCombatLock(true);
    if(combatIntent===previousIntent){combatLock=previous;combatActivation=previousActivation;return false;}
    return value;
  }
  const toggleCombatLock=()=>{refreshCombatLock();return setCombatLock(!combatLock);};
  function watchCombatLock(){
    combatTimer=null;if(combatPageHidden)return;
    refreshCombatLock();combatTimer=setTimeout(watchCombatLock,100);
  }
  const frame=()=>new Promise(resolve=>{
    let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);resolve();};
    const timer=setTimeout(finish,70);requestAnimationFrame(finish);
  });
  const frames=async()=>{await frame();await frame();};
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const focus=()=>{try{canvas()?.focus({preventScroll:true});}catch{canvas()?.focus();}};

  function bounds(){return canvas()?.getBoundingClientRect();}
  function contains(rect,x,y){return rect&&x>=rect.left&&x<rect.right&&y>=rect.top&&y<rect.bottom;}
  function nativeRegions(){
    const b=bounds();if(!b)return {};
    const snapshot=window.PcMultiplayerNative?.state||window.PcMultiplayerState;
    const radar=snapshot?.radar,view=snapshot?.view;
    if(radar?.visible!==true||!view||![radar.left,radar.top,radar.right,radar.bottom,view.width,view.height].every(Number.isFinite)||view.width<=0||view.height<=0)return {};
    const sx=b.width/view.width,sy=b.height/view.height;
    return {radar:{left:b.left+radar.left*sx,top:b.top+radar.top*sy,right:b.left+radar.right*sx,bottom:b.top+radar.bottom*sy}};
  }
  function parentBlocked(x,y){
    if(!window.parent||window.parent===window)return false;
    try{
      const frameElement=window.frameElement,frameBounds=frameElement?.getBoundingClientRect();if(!frameBounds)return true;
      const target=window.parent.document.elementFromPoint(frameBounds.left+x,frameBounds.top+y);
      return Boolean(target&&target!==frameElement&&!target.closest?.('#warzone-game-frame'));
    }catch{return true;}
  }
  function hit(x,y){
    if(!game())return phase==='room'?'menu':'blocked';
    if(parentBlocked(x,y))return 'blocked';
    const regions=nativeRegions();
    if(contains(regions.radar,x,y))return 'radar';
    return 'world';
  }
  function trackPanel(point){
    panelOpen=Boolean(window.PcMultiplayerState?.nativeMenuOpen);
  }
  function mouse(type,p,button=-1,buttons=0){
    const target=canvas(),b=bounds();if(!target||!b)return false;
    const x=Math.max(b.left+1,Math.min(b.right-1,p.x)),y=Math.max(b.top+1,Math.min(b.bottom-1,p.y));
    const event=new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'mouse',pointerId:1,isPrimary:true,
      clientX:x,clientY:y,screenX:x,screenY:y,movementX:x-lastPoint.x,movementY:y-lastPoint.y,
      button,buttons,pressure:buttons?0.5:0});
    forwarded.add(event);target.dispatchEvent(event);lastPoint={x,y};return true;
  }
  function key(value,code,number,down,modifiers={}){
    const target=canvas();if(!target)return false;
    const location=code.startsWith('Numpad')?3:code.endsWith('Left')?1:0;
    target.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{key:value,code,keyCode:number,which:number,
      bubbles:true,cancelable:true,repeat:false,location,...modifiers}));
    if(down)heldKeys.set(code,{value,code,number,modifiers});else heldKeys.delete(code);
    return true;
  }
  function releaseMouse(){if(heldMouse!==null){mouse('pointerup',lastPoint,heldMouse,0);heldMouse=null;}}
  function releaseKeys(){for(const k of [...heldKeys.values()])key(k.value,k.code,k.number,false,{});}
  function finishJob(job,ok){if(job&&!job.finished){job.finished=true;job.resolve?.(ok);}}
  function cancelJobs(){generation++;for(const job of jobs)finishJob(job,false);jobs.length=0;if(activeJob){activeJob.cancelled=true;finishJob(activeJob,false);}releaseMouse();releaseKeys();}
  function releaseCamera(){releaseKeys();}
  function clearLong(){clearTimeout(longTimer);longTimer=null;}
  function releaseAll(){
    clearLong();clearTimeout(multiTimer);multiTimer=null;clearTimeout(intentTimer);intentTimer=null;cancelJobs();releaseCamera();
    window.PcMultiplayerNative?.cancelCamera?.();
    if(single?.linePlacement)window.__warzoneCommands?.cancelLinePlacement?.(single.linePlacement);
    single=null;multi=null;points.clear();ignoreUntilUp=false;counts.cancels++;
    combatInteractionUntil=performance.now()+160;refreshCombatLock();
  }
  function live(job,token){return enabled&&token===generation&&!job.cancelled;}
  function enqueue(job){if(!enabled)return false;if(jobs.length>=24){counts.dropped++;return false;}jobs.push(job);refreshCombatLock();pump();return true;}
  async function pump(){
    if(pumping)return;pumping=true;
    try{
      while(enabled&&jobs.length){
        const job=activeJob=jobs.shift(),token=generation;if(!live(job,token)){finishJob(job,false);continue;}focus();
        if(job.kind==='key'){
          const modifier=job.ctrl?{value:'Control',code:'ControlLeft',number:17,flag:'ctrlKey'}:
            job.shift?{value:'Shift',code:'ShiftLeft',number:16,flag:'shiftKey'}:null;
          const flags=modifier?{[modifier.flag]:true}:{};
          if(modifier)key(modifier.value,modifier.code,modifier.number,true,flags);
          key(job.value,job.code,job.number,true,flags);await frames();
          key(job.value,job.code,job.number,false,flags);
          if(modifier)key(modifier.value,modifier.code,modifier.number,false,{});
          await frames();finishJob(job,live(job,token));continue;
        }
        releaseMouse();mouse('pointermove',job.start||job,-1,0);await frames();
        if(!live(job,token)){finishJob(job,false);continue;}
        if(job.ctrl)key('Control','ControlLeft',17,true,{ctrlKey:true});
        if(job.kind==='pan'||job.kind==='box'||job.kind==='radar'||job.kind==='ui-drag'){
          const button=job.kind==='pan'?1:job.kind==='radar'?2:0;
          const mask=button===1?4:button===2?2:1;
          // Stock SDL treats rapid middle presses as desktop double clicks.
          // Wait only for the remaining native interval, not for every swipe.
          const last=job.kind==='pan'?lastMiddleDown:job.kind==='box'?lastLeftDown:-Infinity;
          while(live(job,token)&&performance.now()-last<300)await frame();
          if(!live(job,token))continue;
          mouse('pointerdown',job.start,button,mask);heldMouse=button;
          if(button===1)lastMiddleDown=performance.now();if(button===0)lastLeftDown=performance.now();
          await frames();
          while(live(job,token)&&!job.ended){mouse('pointermove',job,-1,mask);await frame();}
          if(live(job,token)&&heldMouse===button){mouse('pointermove',job,-1,mask);await frames();}
        }else{
          mouse('pointerdown',job,job.button,job.button===2?2:1);heldMouse=job.button;
          if(job.button===0)lastLeftDown=performance.now();await frames();
        }
        if(live(job,token))releaseMouse();if(job.ctrl)key('Control','ControlLeft',17,false,{});await frames();finishJob(job,live(job,token));
      }
    }catch(error){lastError=String(error);finishJob(activeJob,false);console.error('Multiplayer touch:',error);releaseMouse();releaseKeys();}
    finally{activeJob=null;pumping=false;refreshCombatLock();if(enabled&&jobs.length)pump();}
  }
  function click(point,button=0){
    if(button===2)counts.rightClicks++;else counts.taps++;
    lastAction=button===2?'secondary-click':'contextual-tap';trackPanel(point);
    return enqueue({kind:'click',x:point.x,y:point.y,button});
  }
  function beginDrag(gesture,kind){
    if(kind==='box'){setCombatLock(false);if(combatLock){clearLong();gesture.moved=true;gesture.job={cancelled:true,ended:true};return;}}
    clearLong();gesture.kind=kind;gesture.moved=true;
    gesture.job={kind,start:{...gesture.start},x:gesture.x,y:gesture.y,ended:false};
    if(kind==='pan'){counts.pans++;lastAction='pan';}else if(kind==='box'){counts.boxes++;lastAction='box-select';}
    enqueue(gesture.job);
  }
  function setCamera(value,kind){
    if(!game()||!window.PcMultiplayerNative?.setCamera?.(value))return false;
    if(kind==='rotate')counts.rotations++;else if(kind==='tilt')counts.tilts++;else counts.pinches++;
    lastAction=kind;return true;
  }
  function newMulti(){
    clearLong();clearTimeout(intentTimer);intentTimer=null;if(single?.job){single.job.cancelled=true;single.job.ended=true;}
    cancelJobs();single=null;releaseCamera();
    const [a,b]=[...points.values()];
    const center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    const camera=window.PcMultiplayerNative?.state?.view?.camera;
    if(!camera||![camera.yaw,camera.pitch,camera.distance].every(Number.isFinite)){ignoreUntilUp=true;multi=null;return;}
    multi={startDistance:distance(a,b),distance:distance(a,b),startCenter:center,center,
      angle:Math.atan2(b.y-a.y,b.x-a.x),angleTravel:0,rotationBase:0,rotationIntent:null,
      mode:null,camera:{...camera},limits:{yawPeriod:65536,pitchMin:49516,pitchMax:65353,distanceMin:0,distanceMax:5000,...camera.limits},
      rotationOrigin:0,rotationYaw:camera.yaw,world:hit(a.x,a.y)==='world'&&hit(b.x,b.y)==='world',zoomOutput:false,recent:[]};
    if(!game()||!multi.world){ignoreUntilUp=true;multi=null;}
  }
  function rotateReady(g,d,delta){
    if(d<24||g.startDistance<24)return false;
    if(Math.abs(delta)>1e-6){const direction=Math.sign(delta),old=g.rotationIntent;
      g.rotationIntent=old?.direction===direction?{...old,samples:old.samples+1}:{direction,origin:g.angleTravel-delta,samples:1,since:performance.now()};}
    const intent=g.rotationIntent,offset=g.angleTravel-g.rotationBase;
    if(!intent||Math.sign(offset)!==intent.direction)return false;
    const travel=Math.min(Math.abs(offset),intent.direction*(g.angleTravel-intent.origin));
    const deliberate=travel>=(g.mode===null?ROTATE_START:ROTATE_HANDOFF)&&travel*Math.min(d,g.startDistance)/2>=4;
    if(!deliberate)return false;
    const elapsed=performance.now()-intent.since;
    if(intent.samples>=2||elapsed>=48){clearTimeout(intentTimer);intentTimer=null;return true;}
    if(intentTimer===null)intentTimer=setTimeout(()=>{intentTimer=null;if(multi===g&&points.size===2)flushMulti();},Math.max(1,49-elapsed));
    return false;
  }
  function flushMulti(){
    clearTimeout(multiTimer);multiTimer=null;
    if(!game()||!multi||points.size!==2)return;
    const [a,b]=[...points.values()],g=multi;
    const d=distance(a,b),angle=Math.atan2(b.y-a.y,b.x-a.x),delta=wrap(angle-g.angle);
    const center={x:(a.x+b.x)/2,y:(a.y+b.y)/2},radialDelta=d-g.distance;
    g.angleTravel+=delta;g.angle=angle;g.distance=d;g.center=center;
    g.recent.push({d,angle:g.angleTravel});if(g.recent.length>6)g.recent.shift();
    const first=g.recent[0],radial=Math.abs(d-first.d),arc=Math.abs(g.angleTravel-first.angle)*Math.min(d,first.d);
    const zoomOwns=g.mode==='zoom'&&g.zoomOutput&&Math.abs(radialDelta)>Math.abs(delta)*d*1.2&&radial>arc*1.2;
    if(zoomOwns){g.rotationBase=g.angleTravel;g.rotationIntent=null;clearTimeout(intentTimer);intentTimer=null;}
    if(g.mode!=='rotate'&&!zoomOwns&&rotateReady(g,d,delta)){
      if(g.job){g.job.cancelled=true;g.job.ended=true;}cancelJobs();releaseCamera();
      const was=g.mode;g.mode='rotate';
      // A deliberate handoff begins at the current heading, without replaying
      // the uncertain arc that belonged to the previous gesture.
      g.rotationOrigin=was===null?0:g.angleTravel;
      g.rotationYaw=was===null?g.camera.yaw:window.PcMultiplayerNative.state.view.camera.yaw;
      setCamera({yaw:g.rotationYaw+(g.angleTravel-g.rotationOrigin)*g.limits.yawPeriod/(2*Math.PI)},'rotate');return;
    }
    const dx=center.x-g.startCenter.x,dy=center.y-g.startCenter.y,span=d-g.startDistance;
    if(g.mode===null){
      if(Math.abs(span)>=PINCH_START){g.mode='zoom';}
      else if(Math.hypot(dx,dy)>=MULTI_START){
        g.mode=Math.abs(dy)>Math.abs(dx)*1.3?'tilt':'pan';
        if(g.mode==='pan'){g.job={kind:'pan',start:g.startCenter,...center,ended:false};enqueue(g.job);counts.pans++;}
      }
    }
    if(g.mode==='rotate'){
      setCamera({yaw:g.rotationYaw+(g.angleTravel-g.rotationOrigin)*g.limits.yawPeriod/(2*Math.PI)},'rotate');
    }else if(g.mode==='zoom'){
      const requested=g.camera.distance*g.startDistance/Math.max(1,d);
      g.zoomOutput=setCamera({distance:Math.max(Math.max(350,g.limits.distanceMin),Math.min(g.limits.distanceMax,requested))},'pinch')||g.zoomOutput;
      if(g.zoomOutput&&radial>arc*1.2){g.rotationBase=g.angleTravel;g.rotationIntent=null;clearTimeout(intentTimer);intentTimer=null;}
    }else if(g.mode==='tilt'){
      const pitch=g.camera.pitch+(center.y-g.startCenter.y)/TILT_STEP*2*g.limits.yawPeriod/360;
      setCamera({pitch:Math.max(g.limits.pitchMin,Math.min(g.limits.pitchMax,pitch))},'tilt');
    }else if(g.mode==='pan'){
      Object.assign(g.job,center);counts.panMoves++;
    }
  }
  function scheduleMulti(){if(multiTimer===null)multiTimer=setTimeout(flushMulti,16);}
  function own(event){event.preventDefault();event.stopImmediatePropagation();}
  function pointer(event){
    if(!enabled||forwarded.has(event)||event.pointerType!=='touch')return;
    const target=canvas(),tracked=points.has(event.pointerId);
    if(!target||event.target!==target&&!tracked)return;
    own(event);
    if(event.type==='pointerdown'){
      try{target.setPointerCapture(event.pointerId);}catch{}
      points.set(event.pointerId,{x:event.clientX,y:event.clientY});
      refreshCombatLock();
      if(ignoreUntilUp)return;
      if(points.size===1){
        focus();const point={x:event.clientX,y:event.clientY},region=hit(point.x,point.y);
        single={id:event.pointerId,start:point,...point,downAt:performance.now(),region,kind:null,moved:false,armed:false};
        if(region==='blocked'){ignoreUntilUp=true;return;}
        if(region==='world'&&!window.__warzoneCommands?.isDemolishing?.())single.linePlacement=window.__warzoneCommands?.beginLinePlacement?.(point.x,point.y)||null;
        clearLong();longTimer=setTimeout(()=>{if(single?.id===event.pointerId&&!single.moved&&game()&&region==='world')single.armed=true;},HOLD_MS);
      }else if(points.size===2)newMulti();
      else{clearLong();cancelJobs();releaseCamera();window.PcMultiplayerNative?.cancelCamera?.();single=null;multi=null;ignoreUntilUp=true;counts.cancels++;}
      return;
    }
    if(!tracked)return;
    points.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(event.type==='pointermove'){
      if(ignoreUntilUp)return;
      if(multi||points.size===2){scheduleMulti();return;}
      const s=single;if(!s||s.id!==event.pointerId)return;
      s.x=event.clientX;s.y=event.clientY;const travel=distance(s.start,s);
      if(s.linePlacement){s.moved=travel>=SLOP;window.__warzoneCommands?.updateLinePlacement?.(s.linePlacement,s.x,s.y);return;}
      if(s.region==='world'&&(window.__warzoneCommands?.isPlacement?.()||window.__warzoneCommands?.isDemolishing?.())){
        if(travel>=SLOP){clearLong();s.moved=true;}
        if(window.__warzoneCommands.isDemolishing?.())window.__warzoneCommands.previewDemolish(s.x,s.y);else window.__warzoneCommands.previewAt?.(s.x,s.y);
        return;
      }
      if(s.job){Object.assign(s.job,{x:s.x,y:s.y});if(s.kind==='pan')counts.panMoves++;return;}
      if(game()&&s.region==='world'){
        if((s.armed||performance.now()-s.downAt>=HOLD_MS)&&travel>=BOX_START)beginDrag(s,'box');
        else if(travel>=SLOP)beginDrag(s,'pan');
      }else if(travel>=SLOP)beginDrag(s,s.region==='radar'?'radar':'ui-drag');
      return;
    }
    clearLong();try{target.releasePointerCapture(event.pointerId);}catch{}
    const cancelled=event.type==='pointercancel';
    if(multi){
      if(!cancelled)flushMulti();if(multi.job){Object.assign(multi.job,multi.center);multi.job.ended=true;multi.job.cancelled=cancelled;}
      multi=null;clearTimeout(intentTimer);intentTimer=null;releaseCamera();ignoreUntilUp=true;
    }else if(single?.id===event.pointerId){
      const s=single;s.x=event.clientX;s.y=event.clientY;
      if(s.linePlacement){if(!cancelled&&!ignoreUntilUp&&hit(s.x,s.y)==='world')window.__warzoneCommands?.endLinePlacement?.(s.linePlacement,s.x,s.y);else window.__warzoneCommands?.cancelLinePlacement?.(s.linePlacement);}
      else if(s.region==='world'&&!cancelled&&!ignoreUntilUp&&window.__warzoneCommands?.isDemolishing?.())window.__warzoneCommands.demolishAt(s.x,s.y);
      else if(s.region==='world'&&!cancelled&&!ignoreUntilUp&&window.__warzoneCommands?.isPlacement?.())window.__warzoneCommands.placeAt(s.x,s.y);
      else if(s.job){Object.assign(s.job,{x:s.x,y:s.y,ended:true});s.job.cancelled=cancelled;}
      else if(!cancelled&&!ignoreUntilUp){
        const button=s.region==='radar'?2:game()&&s.region==='world'&&performance.now()-s.downAt>=HOLD_MS?2:0;
        if(s.region==='world')manualSelectionRevision++;
        click(s,button);
      }
      single=null;
    }
    points.delete(event.pointerId);
    if(!points.size){ignoreUntilUp=false;single=null;multi=null;}
    if(cancelled){cancelJobs();releaseCamera();window.PcMultiplayerNative?.cancelCamera?.();counts.cancels++;}
    refreshCombatLock();
  }

  const commands={
    combat:{value:'a',code:'KeyA',number:65,ctrl:true},
    'all-combat':{value:'a',code:'KeyA',number:65,ctrl:true},
    'all-units':{value:'u',code:'KeyU',number:85,ctrl:true},
    trucks:{value:'T',code:'KeyT',number:84,shift:true},
    stop:{value:'s',code:'KeyS',number:83},base:{value:'b',code:'KeyB',number:66},
    manufacturing:{value:'F1',code:'F1',number:112},research:{value:'F2',code:'F2',number:113},build:{value:'F3',code:'F3',number:114}
  };
  function command(action){
    if(!game())return false;
    const normalized=String(action).toLowerCase();
    if(['research','manufacturing','build','queue'].includes(normalized))return window.parent?.PcMultiplayerSession?.command(normalized)||false;
    if(normalized==='deselect'){setCombatLock(false);if(combatLock)return false;manualSelectionRevision++;releaseAll();return window.PcMultiplayerNative?.command('deselect',{});}
    if(normalized==='trucks'){setCombatLock(false);if(combatLock)return false;manualSelectionRevision++;releaseAll();return window.__warzoneCommands?.selectNearbyTrucks?.();}
    if(normalized==='all-units'){setCombatLock(false);if(combatLock)return false;}
    const binding=commands[normalized];if(!binding)return false;
    clearLong();if(single||multi)releaseAll();counts.commandCalls++;lastAction='command:'+action;
    if(['combat','all-combat','all-units'].includes(normalized))manualSelectionRevision++;
    return enqueue({kind:'key',...binding});
  }
  function setPhase(value){
    const next=['room','game','frontend','loading'].includes(value)?value:'frontend';
    if(next!==phase){if(next!=='game')setCombatLock(false);releaseAll();panelOpen=false;phase=next;lastAction='phase:'+phase;refreshCombatLock();}
    return phase;
  }
  function enable(){
    enabled=true;const target=canvas();if(target){target.style.touchAction='none';target.style.userSelect='none';target.style.webkitUserSelect='none';target.style.webkitTouchCallout='none';}
    setPhase(window.PcMultiplayerState?.phase||phase);if(combatTimer===null&&!combatPageHidden)watchCombatLock();return true;
  }
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])document.addEventListener(type,pointer,{capture:true,passive:false});
  for(const type of ['touchstart','contextmenu','dragstart','selectstart'])document.addEventListener(type,event=>{if(enabled&&event.target===canvas())event.preventDefault();},{capture:true,passive:false});
  window.addEventListener('blur',()=>releaseAll());window.addEventListener('pagehide',()=>{combatPageHidden=true;setCombatLock(false);releaseAll();enabled=false;clearTimeout(combatTimer);combatTimer=null;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAll();refreshCombatLock();});
  const report=()=>({version:2,enabled,phase,...counts,pointers:points.size,queued:jobs.length,
      activeJob:activeJob?.kind||null,heldMouse,heldKeys:[...heldKeys.keys()],gesture:multi?.mode||single?.kind||null,
      panelOpen,lastAction,lastError,commands:Object.keys(commands),manualSelectionRevision,hudVisible:enabled&&phase==='game',battleActive:enabled&&phase==='game',
      pendingClicks:jobs.length+(activeJob&&!activeJob.finished?1:0),queuedPointerEvents:0,gestureActive:points.size>0||heldMouse!==null||heldKeys.size>0,
      pinchSteps:counts.pinches,tiltMoves:counts.tilts,rotationMoves:counts.rotations,combatLock:window.PcMultiplayerNative?.state?.combatLock?.enabled===true,
      combatLockRequested:combatLock,combatLockSuspended:combatSuspended(),combatLockState:window.PcMultiplayerNative?.state?.combatLock||null,baseJumps:counts.commandCalls});
  window.PcMultiplayerControls=Object.freeze({enable,setPhase,command,releaseAll,report,setCombatLock,toggleCombatLock,refreshCombatLock});
  function parentDocument(){return window.parent?.WarzoneHost?window.parent.document:document;}
  function setHeaderMenuState(id,open){
    const aliases={factory:'wt-open-factory',queue:'wt-open-queue',build:'wt-open-build'};
    const control=parentDocument().getElementById(aliases[id]||id);if(!control)return;
    control.setAttribute('aria-expanded',String(Boolean(open)));control.classList.toggle('active',Boolean(open));
  }
  function closeHelp(){const node=parentDocument().getElementById('warzone-towers-help-overlay');if(!node||node.hidden)return false;node.hidden=true;setHeaderMenuState('blocknight-help',false);return true;}
  function prepareHeaderMenu(id){
    if(id!=='blocknight-help')closeHelp();
    if(id!=='blocknight-tech'){window.__blockNightResearch?.close?.();if(window.__blockNightResearch?.report?.().open)return false;}
    window.__warzoneIntelligence?.close?.();return true;
  }
  function nativeSelectionBounds(){const b=bounds();return b?{left:b.left,top:b.top,right:b.right,bottom:b.bottom-24,radar:nativeRegions().radar||null}:null;}
  function nativeBoxSelect(left,top,right,bottom,add=false){
    const b=bounds(),view=window.PcMultiplayerNative?.state?.view;
    if(!game()||!b||!view||![view.width,view.height,left,top,right,bottom].every(Number.isFinite)||view.width<=0||view.height<=0||right<=left||bottom<=top||left<b.left||top<b.top||right>b.right||bottom>b.bottom)return Promise.resolve(false);
    combatQueries++;refreshCombatLock();
    try{return Promise.resolve(window.PcMultiplayerNative.command('select-box',{left:(left-b.left)*view.width/b.width,top:(top-b.top)*view.height/b.height,right:(right-b.left)*view.width/b.width,bottom:(bottom-b.top)*view.height/b.height,add:Boolean(add)})).then(r=>r?.ok===true).finally(()=>{combatQueries--;refreshCombatLock();});}
    catch(error){combatQueries--;refreshCombatLock();lastError=String(error);return Promise.resolve(false);}
  }
  function nativeWorldClick(x,y,ctrl=false,button=0){
    const b=bounds();if(!game()||!b||![x,y].every(Number.isFinite)||x<b.left||x>=b.right||y<b.top||y>=b.bottom||hit(x,y)!=='world')return Promise.resolve(false);
    return new Promise(resolve=>{const job={kind:'click',x,y,button,ctrl,resolve,nonce:++facadeSerial};if(!enqueue(job))resolve(false);});
  }
  window.__kalaWarzoneTouch={version:70,ready:true,report,releaseAll,resumeInput:pump,isGestureActive:()=>report().gestureActive,
    nativeSelectionBounds,nativeBoxSelect,nativeWorldClick,nativeMenuClick:(x,y,ctrl=false)=>nativeWorldClick(x,y,ctrl),
    nativeUiClick:(x,y)=>nativeWorldClick(x,y),nativeClick:(x,y,button=0)=>nativeWorldClick(x,y,false,button),
    nativeSelectClick:(x,y,add=false)=>{setCombatLock(false);if(combatLock)return Promise.resolve(false);manualSelectionRevision++;return nativeWorldClick(x,y,add);},
    queuedClick:(x,y)=>nativeWorldClick(x,y,true),nativeMove:(x,y,buttons=0)=>mouse('pointermove',{x,y},-1,buttons),
    nativePressKey:(value,code,number,shift=false)=>enqueue({kind:'key',value,code,number,shift}),
    isBattlefieldPoint:(x,y)=>hit(x,y)==='world',setHeaderMenuState,prepareHeaderMenu,closeHelp,
    cancelFacilityNavigation:()=>{},activateFooterBuild:()=>prepareHeaderMenu('commands')&&window.__warzoneCommands?.toggle('build'),
    selectAllCombat:()=>command('combat'),selectAllUnits:()=>command('all-units'),selectAllTrucks:()=>command('trucks'),
    stopSelected:()=>command('stop'),jumpToBase:()=>command('base'),
    toggleCombatLock,
    showHelp:()=>window.parent?.PcMultiplayerSession?.command('help'),toggleHelp:()=>window.parent?.PcMultiplayerSession?.command('help')};
})();
