/* Reproduce the private MP UI adapter. Shared offline-mode sources stay frozen. */
'use strict';
const fs=require('fs'),path=require('path');
let acorn;try{acorn=require('acorn');}catch{acorn=require('../vendor/multiplayer/native-070/tooling/acorn.cjs');}
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,'');
const cmd=read('scenario/warzone-towers-commands.js');
const queue=read('scenario/blocknight-queue-rules.js');
const research=read('scenario/warzone-towers-bridge.js');
const pick=(source,names)=>{
 const nodes=acorn.parse(source,{ecmaVersion:'latest'}).body;
 return names.map(name=>{const n=nodes.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);if(!n)throw Error('Missing '+name);return source.slice(n.start,n.end);}).join('\n\n');
};
let commands=cmd.replace('namespace("wtcmd_");','');
commands=commands.replace('Object.keys(wtcmd_native).forEach(function(id){if(wtcmd_native[id].group==="Building"&&isStructureAvailable(id,selectedPlayer))enableStructure(id,selectedPlayer);});','');
commands=commands.replace('showInterface();showReticuleWidget(0);','').replace('if (codes[command.menu]) showReticuleWidget(codes[command.menu]);','');
// Native stock panels cannot cancel this private FIFO. Our explicit cancellation
// path removes its active record immediately, so a remaining active record at
// a newly idle factory is an observed completion, not an inferred cancellation.
commands=commands.replace('// Production was cancelled through the ordinary factory controls.\n            previous.status = "cancelled";','// Native production finished; explicit UI cancellation already removed its active record.\n            previous.status = "done";');
// Native validLocation handles REF_RESOURCE_EXTRACTOR separately: an oil job
// must sit on oil, but does not use the ordinary one-tile base-building gap.
// This is deliberately directional: a factory/lab requested beside oil keeps
// its normal spacing. Reservation overlap and native validation remain intact.
const spacingFunction=pick(commands,['wtcmd_tooClose']);
const spacingLine='    return gap < (wtcmd_buildPackability(aw)+wtcmd_buildPackability(bw)<=3?0:1);';
if(spacingFunction.split(spacingLine).length!==2)throw Error('MP oil spacing source changed; review the native exemption');
const oilSpacing=spacingFunction.replace(spacingLine,
 '    if(aw.kind==="RESOURCE EXTRACTOR")return gap<0;\n'+spacingLine);
commands=commands.replace(spacingFunction,oilSpacing);
const helpers=pick(queue,['blockNightV32PollQueueCommand','blockNightV28AvailableResearch','blockNightV28QueuePayload','blockNightV28EmitQueueState']);
const start=pick(research,['blockNightV28StartNext','blockNightV28ContinueQueue']);
const full=read('vendor/multiplayer/native-070/mobile-ui-bootstrap.js')+'\n'+helpers+'\n'+start+'\n'+commands;
acorn.parse(full,{ecmaVersion:'latest'});
const out=path.join(root,'app/src/main/assets/multiplayer/mobile-ui-runtime.js');
if(process.argv.includes('--check')){if(fs.readFileSync(out,'utf8')!==full)throw Error('Generated MP UI runtime differs');}
else fs.writeFileSync(out,full);
console.log(JSON.stringify({passed:true,file:out,bytes:Buffer.byteLength(full),mode:process.argv.includes('--check')?'checked':'generated'}));
