"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../archive/legacy-html-ui/warzone-towers-wave-hud.js"), "utf8");
const functions = source.slice(source.indexOf("  function consumeLine("), source.indexOf("\n  ensureHud();", source.indexOf("  function pollLogs(")));
let log = Buffer.from("historical text\n".repeat(100000));
let bytesRead = 0;
let opens = 0;
let closes = 0;
const context = {
  state: { offsets: {}, partialLines: {}, decoders: {}, polls: 0, errors: 0 },
  TextDecoder, Uint8Array, render: () => {},
  window: { LaunchedModule: { WZVAL_configDirPath: "/config", FS: {
    readdir: () => ["rules.log"], stat: () => ({ size: log.length }),
    open: () => { opens++; return {}; }, close: () => { closes++; },
    read: (_, target, start, size, position) => {
      bytesRead += size;
      target.set(log.subarray(position, position + size), start);
      return size;
    }
  } } }
};
vm.createContext(context);
vm.runInContext(functions, context);
context.pollLogs();
assert.equal(bytesRead, 0, "baseline must not copy historical logs");
const first = Buffer.from('BNWAVE:{"wave":1,"phase":"active"}\n');
log = Buffer.concat([log, first]);
context.pollLogs();
assert.equal(bytesRead, first.length, "read only the newly appended bytes");
assert.equal(context.state.snapshot.wave, 1);
const second = Buffer.from('BNWAVE:{"wave":2,"note":"défence"}\n');
const split = second.indexOf(Buffer.from("é")) + 1;
log = Buffer.concat([log, second.subarray(0, split)]);
context.pollLogs();
assert.equal(context.state.snapshot.wave, 1, "partial line must wait for its newline");
log = Buffer.concat([log, second.subarray(split)]);
context.pollLogs();
assert.equal(context.state.snapshot.note, "défence", "preserve UTF-8 across partial writes");
log = Buffer.from('BNWAVE:{"wave":3}\n');
context.pollLogs();
assert.equal(context.state.snapshot.wave, 3, "truncated/rotated log must start at byte zero");
assert.equal(opens, closes, "every opened file must be closed");
assert.equal(context.state.errors, 0);
console.log("PASS: incremental wave log reads skip history, preserve partial UTF-8/JSON lines, handle truncation, and close files");

const researchSource=fs.readFileSync(path.join(__dirname,"../archive/legacy-html-ui/warzone-mobile-research.js"),"utf8");
const researchPoll=researchSource.slice(researchSource.indexOf("  function pollResearchLogs()"),researchSource.indexOf("  setTimeout(pollResearchLogs, 500)"));
const outputs=[];
const researchContext={...context,state:{logOffsets:{},fsPolls:0,fsErrors:0},handleEngineOutput:event=>outputs.push(event.detail.text)};
log=Buffer.from("historical text\n".repeat(100000));bytesRead=0;
vm.createContext(researchContext);vm.runInContext(researchPoll,researchContext);
researchContext.pollResearchLogs();assert.equal(bytesRead,0);
log=Buffer.concat([log,Buffer.from('BNTECH:{"topics":[]}\nBNTECHDONE:{"player":0')]);
researchContext.pollResearchLogs();assert.equal(outputs.length,1);
log=Buffer.concat([log,Buffer.from('}\n')]);
researchContext.pollResearchLogs();assert.equal(outputs.length,2);
assert.equal(researchContext.state.fsErrors,0);
console.log("PASS: research polling also skips archived bytes and waits for complete event lines");

// A real WebView touch can suppress compatibility click after pointerdown was
// cancelled. Calling nextWave() directly would miss this reported input bug.
const handlers=new Map();let waveCalls=0,now=1000;
const button={disabled:false,addEventListener:(type,fn)=>handlers.set(type,fn),
 getBoundingClientRect:()=>({left:0,top:0,right:100,bottom:50})};
const owner={getElementById:()=>null,createElement:()=>({querySelector:()=>button,setAttribute:()=>{}}),body:{appendChild:()=>{}}};
const touchContext={hudDocument:()=>owner,nextWave:()=>waveCalls++,performance:{now:()=>now},Math};
vm.createContext(touchContext);
vm.runInContext(source.slice(source.indexOf('  function ensureHud()'),source.indexOf('  function showPreparation()')),touchContext);
touchContext.ensureHud();
const event=(extra={})=>({pointerType:'touch',pointerId:1,clientX:20,clientY:20,preventDefault(){},...extra});
handlers.get('pointerdown')(event());handlers.get('pointerup')(event());
assert.equal(waveCalls,1,'touch release calls the wave even if no compatibility click follows');
handlers.get('click')(event({detail:1}));assert.equal(waveCalls,1,'compatibility click cannot call two waves');
handlers.get('pointerdown')(event());handlers.get('pointercancel')();handlers.get('pointerup')(event());assert.equal(waveCalls,1);
handlers.get('pointerdown')(event());handlers.get('pointerup')(event({clientX:80}));assert.equal(waveCalls,1,'dragging away cannot call a wave');
handlers.get('click')(event({pointerType:undefined,detail:0}));assert.equal(waveCalls,2,'keyboard activation remains available');
button.disabled=true;now+=1000;handlers.get('click')(event({detail:1}));assert.equal(waveCalls,2);
console.log('PASS: Skip Wave accepts touch release once, ignores cancellation/drag/duplicates, and retains keyboard activation');
