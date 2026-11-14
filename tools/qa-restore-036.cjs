'use strict';
// Restore only this task's backed-up emulator app data; never the stable app.
const fs=require('fs'),cp=require('child_process');
const adb=require('./android-sdk.cjs').adb,serial='emulator-5556',pkg='com.rbabbit.warzonetowers.lab';
const backup='C:/timerApp/_release-records/emulator036-original-data.tar';
const run=(...x)=>cp.execFileSync(adb,['-s',serial,...x],{maxBuffer:512*1024*1024,timeout:60000});
if(!fs.statSync(backup).isFile())throw Error('Original app backup is missing');
run('shell','am','force-stop',pkg);if(!run('shell','pm','clear',pkg).toString().includes('Success'))throw Error('Clear failed');
cp.execFileSync(adb,['-s',serial,'exec-in','run-as',pkg,'tar','-xf','-'],{input:fs.readFileSync(backup),maxBuffer:512*1024*1024,timeout:60000});
fs.writeFileSync('C:/timerApp/_release-records/emulator036-restored-data.tar',run('exec-out','run-as',pkg,'tar','-cf','-','shared_prefs','files','app_webview'));
run('shell','wm','size','600x1080');run('shell','wm','density','240');run('shell','settings','put','system','font_scale','1.0');run('shell','settings','delete','global','sys_storage_threshold_percentage');
