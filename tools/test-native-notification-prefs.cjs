'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const window={};vm.runInNewContext(fs.readFileSync('app/src/main/assets/warzone/native-notification-prefs.js','utf8'),{window});
for(const original of [undefined,'bad JSON',null,[],{other:'kept',notifications:{important:{skip:false},'displayscale::prompt_increase':{seen:2},'displayscale::tip':{seen:5}}}]){
 let output;const FS={readFile(){if(original===undefined)throw Error('missing');return typeof original==='string'?original:JSON.stringify(original);},writeFile(path,data){assert.equal(path,'/user/notifications.json');output=JSON.parse(data);}};
 window.WarzoneNativeNotifications.prepare({FS},'/user');
 assert.equal(output.notifications['displayscale::prompt_increase'].skip,true);
 assert.ok(output.notifications['displayscale::tip'].seen>=1);
 if(original?.other){assert.equal(output.other,'kept');assert.equal(output.notifications.important.skip,false);assert.equal(output.notifications['displayscale::prompt_increase'].seen,2);assert.equal(output.notifications['displayscale::tip'].seen,5);}
}
console.log('PASS: native scale tips suppressed before startup; unrelated notification preferences preserved');
