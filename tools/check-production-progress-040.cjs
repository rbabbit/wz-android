/* Focused source/VM data fixtures; no native runtime, Android or emulator. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
const SOURCE = 'scenario/warzone-towers-commands.js';
const file = fs.readFileSync(path.join(ROOT, SOURCE), 'utf8');
const sandbox = { namespace() {}, includeJSON() { return {buildings:[],components:{}}; }, BUILT:1 };
vm.createContext(sandbox);
vm.runInContext(file, sandbox, {filename:SOURCE});
const observe = sandbox.wtcmd_productionObservation;
const current = {name:'Truck',body:'Body1REC',propulsion:'wheeled01',turrets:['Spade1Mk1']};
const active = {id:'app-job-4', started:-999999, design:current};
const native = {active:true,nativeQueueEmpty:true,templateId:117,currentName:'Truck · F9',timeStarted:12000,
    totalBuildPoints:100,remainingBuildPoints:70,buildPointsPerSecond:10,state:'building'};
const factory = raw => ({id:9,status:1,towersProduction:raw});
const plain = value => JSON.parse(JSON.stringify(value));
const checks = [];
function check(name, test) { test(); checks.push({name,passed:true}); }
check('Native point sample yields exact ratio and rate-based simulation estimate, independent of active.started', () => {
    const value = observe(factory(native), current, active);
    assert.deepStrictEqual(plain(value.progress), {available:true,currentId:'9:117:12000',currentName:'Truck',templateId:117,
        completedBuildPoints:30,totalBuildPoints:100,ratio:.3,state:'building',remainingSeconds:7});
    assert.strictEqual(value.queueKnown,true);
    assert.deepStrictEqual(plain(observe(factory(native),current,{...active,started:999999})),plain(value));
});
check('Paused, power and capacity samples retain real work but never publish a countdown', () => {
    for (const state of ['paused','waiting-power','waiting-capacity']) {
        const result=observe(factory({...native,state}),current,active).progress;
        assert.strictEqual(result.available,true); assert.strictEqual(result.ratio,.3);
        assert.strictEqual(result.state,state); assert.strictEqual('remainingSeconds' in result,false);
    }
});
check('Fresh no-subject confirmation clears completed-unit progress despite lingering app active bookkeeping', () => {
    const result=observe(factory({active:false,nativeQueueEmpty:true}),null,active);
    assert.strictEqual(result.progress.state,'idle'); assert.strictEqual(result.progress.available,false);
    assert.strictEqual(result.progress.currentId,''); assert.strictEqual(result.progress.ratio,null);
    assert.strictEqual(result.queueKnown,true);
});
check('Missing or inconsistent native state remains unavailable and never claims an authoritative total', () => {
    for (const raw of [undefined,{active:false,nativeQueueEmpty:true},{...native,currentName:'Another unit'},
        {...native,totalBuildPoints:0},{...native,remainingBuildPoints:101},{...native,templateId:NaN}]) {
        const result=observe(factory(raw),current,active);
        assert.strictEqual(result.progress.available,false); assert.strictEqual(result.progress.state,'unavailable');
        assert.strictEqual(result.progress.ratio,null); assert.strictEqual(result.queueKnown,false);
    }
    assert.strictEqual(observe(factory(undefined),null,active).progress.state,'unavailable');
});
check('Replacement subject and loaded native start identity are sampled freshly, without cached carryover', () => {
    const fresh={...native,templateId:118,timeStarted:600,remainingBuildPoints:95};
    const result=observe(factory(fresh),current,active).progress;
    assert.strictEqual(result.currentId,'9:118:600'); assert.strictEqual(result.ratio,.05);
    assert.strictEqual(observe(factory(native),current,active).progress.ratio,.3);
});
check('External/native future orders keep queue total unknown; custom known queue requires matching current design', () => {
    assert.strictEqual(observe(factory({...native,nativeQueueEmpty:false}),current,active).queueKnown,false);
    assert.strictEqual(observe(factory(native),current,null).queueKnown,false);
    assert.strictEqual(observe(factory(native),current,{design:{...current,body:'Different'}}).queueKnown,false);
});
check('Finished work and zero-rate samples do not invent a completion countdown', () => {
    const done=observe(factory({...native,remainingBuildPoints:0}),current,active).progress;
    assert.strictEqual(done.ratio,1); assert.strictEqual('remainingSeconds' in done,false);
    assert.strictEqual('remainingSeconds' in observe(factory({...native,buildPointsPerSecond:0}),current,active).progress,false);
});
check('Factory snapshot includes fresh observer state and explicit queue completeness', () => {
    assert(file.includes('const observation = wtcmd_productionObservation(s, current, active);'));
    assert(file.includes('progress: observation.progress, queueKnown: observation.queueKnown,'));
    const functionBody=observe.toString();
    assert(!functionBody.includes('active.started')); assert(!functionBody.includes('Date.now'));
    assert(!functionBody.includes('gameTime -')); assert(!functionBody.includes('setTimer'));
});
check('Native observer reads existing counters and is Towers-gated without calling mutating production functions', () => {
    const helper=fs.readFileSync(path.join(ROOT,'archive/native-production-0.40/production-helper.inc'),'utf8');
    assert(helper.includes('fopen("/tmp/warzone-towers-ui-v34", "rb")'));
    assert(helper.includes('structure->player != selectedPlayer'));
    for (const field of ['factory.buildPointsRemaining','calcTemplateBuild(subject)','getBuildingProductionPoints(structure)',
        'factory.timeStartHold','checkPowerRequest(structure)','factory.timeStarted','subject->multiPlayerID']) assert(helper.includes(field));
    const code=helper.replace(/\/\/[^\n]*/g,'');
    assert(!/\b(?:requestPowerFor|structSetManufacture|buildDroid|checkHaltOnMaxUnitsReached|gameTimeAdjustedAverage)\s*\(/.test(code));
    assert(!/factory\.\w+\s*=(?!=)/.test(code));
});
const inputs=[SOURCE,'archive/native-production-0.40/production-helper.inc',
    'archive/native-production-0.40/quickjs_backend.cpp','tools/check-production-progress-040.cjs'];
const digest = p => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,p))).digest('hex');
const report={version:'0.40',passed:true,emulatorUsed:false,androidRuntimeExecuted:false,gameplayVerified:false,
    scope:'Source and mocked native-field snapshot normalization only; no actual native execution, production, save/load or rendered UI acceptance.',
    checksPassed:checks.length,checks,sources:inputs.map(p=>({path:p,sha256:digest(p)})),recordedUTC:new Date().toISOString()};
fs.writeFileSync(path.join(ROOT,'archive/production-progress-0.40-checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,checks:checks.length,emulatorUsed:false}));
