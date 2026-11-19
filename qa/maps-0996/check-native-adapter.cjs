// Focused pre-start adapter check against the actual packaged native rule sources.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const path=require('path'),root=path.resolve(__dirname,'../..');
const asset=name=>fs.readFileSync(path.join(root,'app/src/main/assets',name),'utf8');
const original=JSON.parse(fs.readFileSync(path.join(__dirname,'native-adapter-inputs.json'),'utf8'));
let checked=0;
for(const count of [2,10])for(const type of ['cobra','nexus','nullbot','semperfi','bonecrusher','hover','turtle'])for(const difficulty of ['easy','medium','hard']){
 const hash='b'.repeat(64),id='download-'+hash,map={id,name:'Adapter map',sourceSHA256:hash,level:'FFA-'+hash.slice(0,12)+'-T1',mapDirectory:id,players:count,bots:count-1,width:64,height:64,scavengers:count===10};
 const context={URLSearchParams,location:{search:'?bnFfaMap='+id+'&bnFfaBotType='+type+'&battle_session=test'},atob:value=>Buffer.from(value,'base64').toString('binary'),Uint8Array,console};
 context.window=context;context.parent=context;vm.createContext(context);
 vm.runInContext(asset('warzone/downloaded-maps-stock.js'),context);vm.runInContext(asset('warzone/downloaded-maps.js'),context);
 const bot={id:type,...context.WarzoneDownloadedMaps.bots[type]},bundle={map,bot,lev:'level '+map.level+'\n',files:[{path:'/data/mp/multiplay/maps/'+id+'.gam',data:Buffer.from('{}').toString('base64')}]};
 context.BlockNightAndroid={mapsLaunchPayload:()=>JSON.stringify(bundle)};const catalogue=[];
 context.WarzoneDownloadedMaps.load(catalogue);assert.equal(catalogue[0].id,id);
 const files={...original};const module={FS:{mkdirTree(){},readFile:p=>{assert(p in files,p);return files[p]},writeFile:(p,value)=>{files[p]=value},analyzePath:p=>({exists:p in files})}};
 context.WarzoneDownloadedMaps.install(module,{map:id,botType:type,difficulty});
 const challenge=JSON.parse(files['/data/mp/tests/ffa-'+id+'-'+difficulty+'.json']);
 assert.equal(challenge.challenge.maxPlayers,count);assert.equal(challenge.challenge.scavengers,count===10?1:0);
 for(let i=1;i<count;i++){const slot=challenge['player_'+i];assert.equal(slot.ai,bot.script);assert.equal(slot.team,i);assert.equal(slot.difficulty,difficulty[0].toUpperCase()+difficulty.slice(1));}
 const rules=files['/data/mp/tests/ffa-rules.js'];new vm.Script(rules);assert(rules.includes('vtol:true, alliancesType:alliancesType'));
 assert.equal(context.WarzoneDownloadedMaps.nativeBot(type).script,bot.script);
 assert.equal(JSON.parse(files['/data/mp/multiplay/script/ffa-maps.json']).maps.at(-1).id,id);
 assert.equal(JSON.parse(files['/data/mp/multiplay/script/ffa-policy.json']).airComponents.length,0);
 assert(JSON.parse(files['/data/mp/stats/research.json'])['R-Struc-VTOLFactory']);checked++;
}
console.log('Native Maps adapter: '+checked+' setups checked against packaged rules; real engine launch remains separate.');
