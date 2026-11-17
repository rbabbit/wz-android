'use strict';
// Hash-only preservation helper for the actual headless Android update journey.
// The private version85 client is current code, not the historical v0.85 release.
const fs=require('node:fs'),path=require('node:path');
const d=require('./device-086.cjs'),pkg='com.rbabbit.warzonetowers.lab';
function fingerprint(name){
 const original=JSON.parse(fs.readFileSync(path.join(d.out,'offline475-original-data-restored.json'),'utf8'));
 const names=original.entries.map(e=>e.path);
 if(names.some(p=>! /^(files\/(towers|campaign|ffa)-saved-games\/[a-zA-Z0-9_.-]+|shared_prefs\/[a-zA-Z0-9_.-]+)$/.test(p)))throw Error('Unexpected preserved path');
 const raw=d.adb('shell','run-as',pkg,'sha256sum',...names).toString();
 const entries=raw.trim().split(/\r?\n/).map(s=>{const m=s.match(/^([a-f0-9]{64})\s+(.+)$/);if(!m)throw Error('Invalid SHA output');return{path:m[2],sha256:m[1]};});
 if(entries.length!==names.length)throw Error('Incomplete preserved inventory');
 const record={at:new Date().toISOString(),count:entries.length,entries,hashOnly:true};
 fs.writeFileSync(path.join(d.out,name+'.json'),JSON.stringify(record,null,2)+'\n');return record;
}
function rows(){return d.nativeRows().filter(r=>r.text||r['content-desc']).map(r=>({text:r.text,description:r['content-desc'],bounds:r.bounds,enabled:r.enabled}));}
if(require.main===module){const[a,b]=process.argv.slice(2);if(a==='fingerprint')console.log(JSON.stringify(fingerprint(b)));else if(a==='rows')console.log(JSON.stringify(rows()));else throw Error('fingerprint NAME | rows');}
module.exports={...d,fingerprint,rows};
