'use strict';
/* Bounded VM source fixtures. No browser, emulator, native UI or gameplay QA. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const names=['app/src/main/assets/warzone/rewards.js','app/src/main/assets/warzone-html-session.js',
    'app/src/main/assets/warzone-command-pages.js','app/src/main/assets/warzone-touch-controls.js',
    'app/src/main/assets/warzone/index.html','app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java',
    'tools/check-rewards-web-025.cjs'];
const hash=name=>createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex');
const sources=names.map(name=>({path:name,sha256:hash(name)}));
const rewardSource=read(names[0]),sessionSource=read(names[1]),commandSource=read(names[2]);
const clone=x=>JSON.parse(JSON.stringify(x)),checks=[];
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function events(window){
    const listeners=new Map();
    window.addEventListener=(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);};
    window.dispatchEvent=event=>{for(const fn of listeners.get(event.type)||[])fn(event);return true;};
}
function rewardFixture(options={}){
    const timers=new Map(),calls=[],exitCallbacks=[],pending=deferred(),caption={textContent:''};let serial=0;
    const config={session:'web-fixture',balance:350,fortress:true,research:false,supply:true,...options.config};
    const button={querySelector:()=>caption,setAttribute:(name,value)=>calls.push({kind:'attribute',name,value})};
    const document={getElementById:id=>id==='blocknight-rewards'?button:null};
    const window={parent:{document},__towersHtml:{session:'web-fixture',isActive:()=>options.active!==false},
        __warzoneCommands:{send:(action,data)=>{calls.push({kind:'send',action,data:clone(data||{})});return action==='apply-rewards'?pending.promise:Promise.resolve({ok:true});},
            afterBuildExit:fn=>{calls.push({kind:'build-exit'});exitCallbacks.push(fn);}},
        BlockNightAndroid:{rewardConfig:()=>JSON.stringify(config),
            rewardApplied:session=>{calls.push({kind:'persist',session});return options.persist!==false;},
            rewardFailed:(session,error)=>calls.push({kind:'failure',session,error}),
            showRewards:session=>calls.push({kind:'show',session})}};
    if(options.duel)window.__warzoneDuelConfig={mode:'duel'};
    events(window);
    vm.runInNewContext(rewardSource,{window,document,Promise,setInterval:fn=>{timers.set(++serial,fn);return serial;},clearInterval:id=>timers.delete(id)},{filename:names[0]});
    return{window,api:window.WarzoneRewards,timers,calls,config,pending,caption,exitCallbacks,
        async tick(){for(const fn of [...timers.values()])fn();await settle();},
        async end(){window.dispatchEvent({type:'warzone-battle-ended'});await settle();},
        async accept(reply={ok:true,result:{ok:true,session:'web-fixture'}}){pending.resolve(reply);await settle();}};
}
function sessionFixture(duel=false){
    const calls=[],document={getElementById:()=>null};
    const window={parent:{document,WarzoneHost:{setPlaying:()=>calls.push({kind:'playing'}),endBattle:()=>calls.push({kind:'end-host'})}},
        __kalaWarzoneTouch:{setBattleActive:on=>calls.push({kind:'touch',on}),releaseAll:()=>calls.push({kind:'release'})},
        WarzoneBuildDisplay:{reset:()=>calls.push({kind:'reset'})},BlockNightAndroid:{
            rewardProgress:(session,wave)=>calls.push({kind:'progress',session,wave}),
            battleWon:session=>calls.push({kind:'won',session}),battleFinished:session=>calls.push({kind:'lost',session}),
            battleExited:session=>calls.push({kind:'exited',session})}};
    if(duel)window.__warzoneDuelConfig=Object.freeze({mode:'duel',humanBranch:'cannon',botBranch:'rockets'});
    events(window);const console={log(){},warn(){},error(){}};
    class CustomEvent{constructor(type,init){this.type=type;this.detail=init?.detail;}}
    vm.runInNewContext(sessionSource,{window,document,console,CustomEvent,URLSearchParams,
        location:{search:'?battle_session=session-fixture'}},{filename:names[1]});
    return{window,api:window.__towersHtml,calls,console};
}
function extractFunction(name){
    const start=commandSource.indexOf('function '+name+'(');assert.ok(start>=0,'Actual function missing: '+name);
    const brace=commandSource.indexOf('{',start);let depth=0,quote='',escaped=false,line=false,block=false;
    for(let i=brace;i<commandSource.length;i++){
        const ch=commandSource[i],next=commandSource[i+1];
        if(line){if(ch==='\n')line=false;continue;}
        if(block){if(ch==='*'&&next==='/'){block=false;i++;}continue;}
        if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote='';continue;}
        if(ch==='/'&&next==='/'){line=true;i++;continue;}if(ch==='/'&&next==='*'){block=true;i++;continue;}
        if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}
        if(ch==='{')depth++;if(ch==='}'&&--depth===0)return commandSource.slice(start,i+1);
    }
    throw Error('Actual function does not terminate: '+name);
}
function placementFixture(natural=false,itemId='X-Super-Cannon'){
    const state={nativeMenu:'build',nativeToolReady:true,exitingBuild:false,nativeItem:itemId,cancelSerial:0,
        nativeBuildGroup:[11,12],siteChecks:0,nativePendingSites:[],session:'placement',
        placement:{id:itemId,category:'DEFENCES',kind:itemId==='X-Super-Cannon'?'FORTRESS':'DEFENSE'},
        snapshot:{rewards:{fortress:true,fortressNatural:natural,fortressType:'X-Super-Cannon'}}};
    const calls=[],window={WarzoneTerrain:{pick:()=>({x:15,y:17})}};
    const context={state,window,polishedTowers:true,Date,Promise,notify:text=>calls.push({kind:'notice',text}),reason:r=>r,
        send:(action,data)=>{calls.push({kind:'send',action,data:clone(data)});return Promise.resolve({ok:true});},
        requestState:()=>calls.push({kind:'state'}),flushNativeSites:()=>{
            for(const p of state.nativePendingSites.splice(0))calls.push({kind:'native-click',point:p});},
        setTimeout:()=>{throw Error('Unexpected delayed native-tool fixture path');}};
    vm.createContext(context);vm.runInContext(['rewardFortress','canLinePlace','queueNativeSite'].map(extractFunction).join('\n'),context);
    return{context,state,calls};
}
async function check(name,run){await run();checks.push({name,passed:true});}
(async()=>{
    await check('One native apply request survives repeated timer polls while pending and becomes ready only after durable acknowledgement',async()=>{
        const f=rewardFixture();assert.equal(f.api.ready,false);await f.tick();await f.tick();await f.tick();
        const apply=f.calls.filter(c=>c.action==='apply-rewards');assert.equal(apply.length,1);
        assert.deepEqual(apply[0].data.rewards,{session:'web-fixture',fortress:true,research:false,supply:true});
        assert.equal(f.calls.some(c=>c.kind==='persist'),false);assert.equal(f.api.ready,false);
        await f.accept();assert.equal(f.api.ready,true);await f.tick();
        assert.equal(f.calls.filter(c=>c.action==='apply-rewards').length,1);
        assert.equal(f.calls.filter(c=>c.kind==='persist').length,1);assert.equal(f.caption.textContent,'REWARDS 350');
    });
    await check('Rewards opens a read-only native view only after Build exit completes',async()=>{
        const f=rewardFixture();f.api.open();assert.equal(f.exitCallbacks.length,0);
        await f.tick();await f.accept();f.api.open();
        assert.equal(f.calls.filter(c=>c.kind==='show').length,0);assert.equal(f.exitCallbacks.length,1);
        f.exitCallbacks[0]();assert.deepEqual(f.calls.filter(c=>c.kind==='show'),[{kind:'show',session:'web-fixture'}]);
        assert.equal(f.calls.some(c=>c.action==='buy-rewards'),false);
    });
    await check('Native rejection and persistence failure keep the startup gate closed',async()=>{
        const rejected=rewardFixture();await rejected.tick();await rejected.accept({ok:false,reason:'reward-session-conflict',result:{ok:false}});
        assert.equal(rejected.api.ready,false);assert.equal(rejected.calls.filter(c=>c.kind==='failure').length,1);
        await rejected.tick();assert.equal(rejected.calls.filter(c=>c.action==='apply-rewards').length,1);
        const unsaved=rewardFixture({persist:false});await unsaved.tick();await unsaved.accept();
        assert.equal(unsaved.api.ready,false);assert.equal(unsaved.calls.filter(c=>c.kind==='failure').length,1);
        assert.equal(unsaved.calls.some(c=>c.action==='state'),false);
    });
    await check('Ending a match before an apply acknowledgement prevents persistence and use of its late result',async()=>{
        const f=rewardFixture();await f.tick();await f.end();await f.accept();
        assert.equal(f.api.ready,false);assert.equal(f.api.report().ended,true);assert.equal(f.timers.size,0);
        assert.equal(f.calls.filter(c=>c.kind==='persist'||c.kind==='show').length,0);
        f.api.open();assert.equal(f.exitCallbacks.length,0);
    });
    await check('Stale saved configuration and acknowledgements from another session fail closed',async()=>{
        const stale=rewardFixture({config:{session:'stale'}});await stale.tick();
        assert.equal(stale.api.ready,false);assert.equal(stale.calls.filter(c=>c.action==='apply-rewards').length,0);
        assert.equal(stale.calls.filter(c=>c.kind==='failure').length,1);
        const reply=rewardFixture();await reply.tick();await reply.accept({ok:true,result:{ok:true,session:'stale'}});
        assert.equal(reply.api.ready,false);assert.equal(reply.calls.some(c=>c.kind==='persist'),false);
    });
    await check('Dormant Duel receives no rewards module, timer, bridge call or reward progress callback',async()=>{
        const f=rewardFixture({duel:true});assert.equal(f.api,undefined);assert.equal(f.timers.size,0);assert.equal(f.calls.length,0);
        const h=sessionFixture(true);h.api.nativeOutput('BNDUEL:'+JSON.stringify({mode:'duel',phase:'active',humanBranch:'cannon',botBranch:'rockets',wave:5}));
        assert.equal(h.api.isActive(),true);assert.equal(h.calls.some(c=>c.kind==='progress'),false);
    });
    await check('Actual native wave progress is forwarded before terminal settlement and duplicated output settles once',async()=>{
        for(const won of [false,true]){
            const h=sessionFixture(),phase=won?'victory':'defeated',packet='BNWAVE:'+JSON.stringify({mode:'tower-defense',phase,wave:25});
            h.api.nativeOutput(packet);h.console.log(packet);h.window.dispatchEvent({type:'blocknight-engine-output',detail:{text:packet}});
            const progress=h.calls.findIndex(c=>c.kind==='progress'),end=h.calls.findIndex(c=>c.kind===(won?'won':'lost'));
            assert.ok(progress>=0&&end>progress);assert.equal(h.calls[progress].wave,25);
            assert.equal(h.calls.filter(c=>c.kind==='won'||c.kind==='lost').length,1);
            assert.equal(h.calls.filter(c=>c.kind==='end-host').length,1);assert.equal(h.api.isEnded(),true);
        }
    });
    await check('Unrelated mode packets do not establish a Towers battle or report reward progress',async()=>{
        const h=sessionFixture();h.api.nativeOutput('BNWAVE:'+JSON.stringify({mode:'duel',phase:'active',wave:10}));
        assert.equal(h.api.isActive(),false);assert.equal(h.calls.length,0);
    });
    await check('Actual fortress line policy forbids purchased lines and preserves normal researched and ordinary defence lines',async()=>{
        assert.equal(placementFixture().context.canLinePlace(),false);
        assert.equal(placementFixture(true).context.canLinePlace(),true);
        assert.equal(placementFixture(false,'GuardTower1').context.canLinePlace(),true);
    });
    await check('Legacy paid fortress taps use native queue reservation instead of Ctrl-click; ordinary paths stay intact',async()=>{
        const paid=placementFixture();assert.equal(paid.context.queueNativeSite(100,200),true);await settle();
        assert.equal(paid.calls.find(c=>c.kind==='send').action,'queue-build');
        assert.deepEqual(paid.calls.find(c=>c.kind==='send').data.workerIds,[11,12]);
        assert.equal(paid.calls.some(c=>c.kind==='native-click'),false);assert.equal(paid.state.siteChecks,0);
        for(const f of [placementFixture(true),placementFixture(false,'GuardTower1')]){
            f.context.queueNativeSite(100,200);await settle();
            assert.equal(f.calls.find(c=>c.kind==='send').action,'track-site');
            assert.equal(f.calls.filter(c=>c.kind==='native-click').length,1);assert.equal(f.state.siteChecks,0);
        }
    });
    // Read-only checks of Java source guards. Java is not executed in this tool.
    const java=read(names[5]);
    assert.match(java,/if \(inGame && \(isDuelBattle\(\)[\s\S]{0,180}loadingOverlay != null \|\| graphicsSetup != null\)\) return;/);
    assert.match(java,/if \(inGame \|\| graphicsSetup == null \|\| rewardsView == null\) return;/);
    assert.ok(sources.every(entry=>hash(entry.path)===entry.sha256),'Checked sources changed during fixtures');
    const report={scope:'Bounded Node VM fixtures execute actual web source and extracted actual placement functions. Java bridge guards are source-inspected only. No emulator, browser, native UI, gameplay or device persistence verified.',
        emulatorUsed:false,screensVerified:false,gameplayVerified:false,passed:checks.length,checks,sources,
        javaSourceAuditOnly:['In-game reward view blocks Duel, ended/loading/home states','In-game reward purchase callback returns without buying']};
    fs.writeFileSync(path.join(root,'archive/rewards-web-0.25-checks.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({emulatorUsed:false,gameplayVerified:false,passed:checks.length,checks},null,2));
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
