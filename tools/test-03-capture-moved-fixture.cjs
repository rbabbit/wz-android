'use strict';
process.env.WZ_NATIVE_QA ||= require('path').join(__dirname,'../qa/test-03/audit');
const fs=require('fs'),path=require('path'),crypto=require('crypto'),j=require('./lab-journey.cjs'),live=require('./native-live.cjs');
(async()=>{const c=await j.connectReady();try{
 await j.resume(c);await j.closeOverlays(c);const native=await c.save('moved-fixture-native-save');
 const files=await c.evaluate(`(()=>{const f=LaunchedModule.FS,p=LaunchedModule.WZVAL_configDirPath+'/savegames/skirmish/QuickSave',r={};for(const n of f.readdir(p))if(n!=='.'&&n!=='..'&&f.isFile(f.stat(p+'/'+n).mode))r[n]=Array.from(f.readFile(p+'/'+n));return r})()`);
 const r={seeded:false,source:'Complete unmodified genuine F7 from ordinary authored Dustfall; two actual completed structures and moved constructors; original Test02 APK',identity:j.installedIdentity(),files,sha256:crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex'),gameTime:native['gam.json'].gameTime};
 const target=path.join(live.root,'qa/test-03/fixtures/dustfall-moved.json');fs.mkdirSync(path.dirname(target),{recursive:true});if(fs.existsSync(target))throw Error('Refusing to overwrite fixture');fs.writeFileSync(target,JSON.stringify(r));
 console.log(JSON.stringify({files:Object.keys(files).length,gameTime:r.gameTime,sha256:r.sha256}));
}finally{await j.pause(c);c.close()}})().catch(e=>{console.error(e);process.exitCode=1});
