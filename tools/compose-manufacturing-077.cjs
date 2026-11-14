'use strict';
// Regenerate only command scripts. Never rebuild maps, research, stock AI or engines.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),check=process.argv.includes('--check');
const read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n');
const commands=read('scenario/warzone-towers-commands.js');
const line='setTimer("wtcmd_tick", 250);';
if(commands.split(line).length!==2)throw Error('Review FFA manufacturing timer source');
const ffa=commands.replace(line,'ffaSetTimer("wtcmd_tick", 250);')+'\n'+read('scenario/ffa/command-policy.js');
const target=path.join(root,'scenario/ffa/commands.js');
if(check){if(fs.readFileSync(target,'utf8')!==ffa)throw Error('FFA command assembly differs');}
else fs.writeFileSync(target,ffa);
cp.execFileSync(process.execPath,[path.join(__dirname,'compose-multiplayer-ui-077.cjs'),...(check?['--check']:[])],{cwd:root,stdio:'inherit'});
console.log(JSON.stringify({passed:true,version:'0.77',mode:check?'checked':'generated',ffa:'scenario/ffa/commands.js'}));
