const fs=require('node:fs'),vm=require('node:vm');const original=fs.readFileSync;
fs.readFileSync=function(p,...args){const data=original.call(this,p,...args);return String(p).endsWith('warzone-terrain-picker.js')?data.replace("||(names.includes('paramx2')&&names.includes('lightmap_tex'))",''):data};
try{require('./test-terrain-picker.cjs');throw Error('Regression unexpectedly passed without fix')}catch(e){if(!String(e).includes('optimized depth shader updates'))throw e;console.log('PASS: optimizer regression fails without paramx2/lightmap detection');}
