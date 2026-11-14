/* Derive MP playback from the proven bundled player without editing other modes. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),input='app/src/main/assets/warzone/music-loader.js',output='app/src/main/assets/multiplayer/music.js';
let source=fs.readFileSync(path.join(root,input),'utf8').replaceAll('\r\n','\n');
const original=source;
function replace(before,after){if(source.split(before).length!==2)throw Error('Music composer seam changed: '+before.slice(0,90));source=source.replace(before,after);}
const seam="  const enabled=parameters.get('music')==='1';";
if(source.split(seam).length!==2)throw Error('Retained native-only music branch changed');
source=source.slice(0,source.indexOf(seam))+'})();\n';
replace('/* Assigned Towers music and bundled FFA/Campaign playlists; native Duel stays intact. */',
 '/* Generated MP-only 39-track shuffled player. See tools/compose-multiplayer-music-072.cjs. */');
replace("  if (!/\\/index-duel\\.html$/.test(location.pathname)) {",'  if (true) {');
replace("    const session=parameters.get('battle_session')||'';","    const session=parameters.get('battle_session')||'';");
replace("    const mode=/\\/index-ffa\\.html$/.test(location.pathname)?'ffa':/\\/index-campaign\\.html$/.test(location.pathname)?'campaign':'map';","    const mode='ffa'; // Reuse the exact bundled 39-song shuffle policy for Multiplayer.");
source=source.replaceAll('window.BlockNightAndroid','window.AndroidMultiplayerMusic');
replace("(mode==='ffa'?'FFA':'Campaign')","(mode==='ffa'?'Multiplayer':'Campaign')");
replace("(mode==='ffa'?'FFA music':'Campaign music')","(mode==='ffa'?'Multiplayer music':'Campaign music')");
replace("      menu.hidden=true;anchor?.setAttribute('aria-expanded','false');", "      menu.hidden=true;anchor?.setAttribute('aria-expanded','false');refresh();");
replace("return {...state,transport:'track-blob'", "return {...state,menuOpen:Boolean(menu&&!menu.hidden),transport:'track-blob'");
replace('background:#0d2027fa;color:#e2edec','background:#111;color:#f5f5f5');
replace('box-shadow:0 8px 24px #0005','box-shadow:0 8px 24px #0007');
source=source.replaceAll('#8bd3cc','#f5f5f5').replaceAll('background:#193039;color:#d7e6e6','background:#282828;color:#f5f5f5')
 .replaceAll('color:#092025','color:#111').replaceAll('color:#9bb1b5','color:#aaa').replaceAll('color:#b4c6c8','color:#bbb');
replace('    return;\n  }\n})();','    window.WarzoneMapMusic=window.WarzoneMusic;\n    return;\n  }\n})();');
if(source.includes('BlockNightAndroid')||source.includes('optional/music-v1.data')||source.includes('musicSelection('))throw Error('Unexpected main-game bridge or whole-pack loader in MP player');
new (require('node:vm').Script)(source,{filename:output});
const file=path.join(root,output),check=process.argv.includes('--check');
if(check){if(fs.readFileSync(file,'utf8')!==source)throw Error('MP music differs from its retained source composition');}
else fs.writeFileSync(file,source);
const sha=text=>crypto.createHash('sha256').update(text).digest('hex');
const proof={passed:true,mode:check?'checked':'generated',input,inputSHA256:sha(original),output,outputSHA256:sha(source),bytes:Buffer.byteLength(source),sharedSourcesEdited:false};
fs.mkdirSync(path.join(root,'qa/multiplayer-072'),{recursive:true});fs.writeFileSync(path.join(root,'qa/multiplayer-072/music-compose.json'),JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify(proof));
