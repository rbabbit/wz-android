/* An offline reader. This document never calls the engine or the Android game bridge. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const practical = window.WarzoneGuidePracticalData || {chapters:[]};
  const research = window.WarzoneGuideResearchData || {};
  const screenshots = window.WarzoneGuideScreenshots || {};
  const chapters = practical.chapters || [];
  const pages = new Map(chapters.flatMap(ch => ch.pages.map(page => [page.id,{...page,chapter:ch}])));
  const sections = Array.isArray(research.sections) ? research.sections : Object.entries(research.sections || {}).map(([id,value]) => ({id,...value}));
  const modes = ['towers','ffa','campaign'];
  let mode = modes.includes(new URLSearchParams(location.search).get('mode')) ? new URLSearchParams(location.search).get('mode') : 'towers';
  let route = {kind:'research'}, stack = [], query = '', imageZoom = 1, previousImageFocus = null;
  let queryTimer;
  const node = (tag, text, cls) => {
    const el = document.createElement(tag); if (text != null) el.textContent = String(text); if (cls) el.className = cls; return el;
  };
  function button(text, action, cls) { const el=node('button',text,cls); el.type='button'; el.addEventListener('click',action); return el; }
  const description = value => typeof value === 'string' ? value : Array.isArray(value) ? value.join(' · ') : '';
  function catalogue() {
    const raw = research.catalogues?.[mode] || research.modes?.[mode]?.topics || [];
    return Array.isArray(raw) ? raw : Array.isArray(raw.topics) ? raw.topics : Object.entries(raw.topics || raw).map(([id,value]) => ({id,...value}));
  }
  const topicById = id => catalogue().find(t => t.id === id);
  const matchesMode = page => !page.modes?.length || page.modes.includes(mode);
  const modeName = () => mode === 'ffa' ? 'FFA' : mode === 'campaign' ? 'Campaign' : 'Towers';
  function icon(src, fallback) {
    if (!src) return null;
    const img=node('img',null,'icon'); img.alt=''; img.loading='lazy';
    img.src = src.startsWith('/warzone/') ? '../warzone/' + src.slice(9) : src;
    img.addEventListener('error',() => { if(fallback && img.dataset.fallback !== '1'){img.dataset.fallback='1';img.src=fallback;}else img.remove(); });
    return img;
  }
  function go(next, remember=true) {
    if (remember) stack.push({...route,query,scroll:$('main').scrollTop});
    route=next; query=''; $('query').value=''; closeContents(); render();
    $('main').scrollTop=0; $('main').focus({preventScroll:true});
  }
  function back() {
    if ($('image-viewer').open) { closeImage(); return true; }
    if ($('outline').classList.contains('open')) { closeContents(); return true; }
    if (!stack.length) return false;
    const previous=stack.pop(); route={kind:previous.kind,id:previous.id}; query=previous.query||'';
    $('query').value=query; render(); $('main').scrollTop=previous.scroll||0; return true;
  }
  function closeContents() { $('outline').classList.remove('open'); $('contents').setAttribute('aria-expanded','false'); }
  function heading(title, summary, eyebrow) {
    const box=document.createDocumentFragment();
    if(eyebrow)box.append(node('p',eyebrow,'eyebrow'));
    box.append(node('h1',title)); if(summary)box.append(node('p',summary,'lead')); return box;
  }
  function addCard(container, title, detail, action, src) {
    const b=button('',action,'card'); const img=icon(src);if(img)b.append(img);
    const copy=node('span',null,'copy');copy.append(node('strong',title));if(detail)copy.append(node('small',detail));
    b.append(copy,node('span','›','chevron'));container.append(b);return b;
  }
  function navigateRelated(id) {
    if (id.startsWith('section:')) return go({kind:'section',id:id.slice(8)});
    if (pages.has(id)) return go({kind:'page',id});
    if (topicById(id)) return go({kind:'topic',id});
    if (sections.some(s=>s.id===id))return go({kind:'section',id});
    if(chapters.some(ch=>ch.id===id))return go({kind:'chapter',id});
  }
  function renderOutline() {
    const outline=$('outline'); outline.replaceChildren();
    const entry=(label, target, selected)=>{const b=button(label,()=>go(target));if(selected)b.classList.add('selected');outline.append(b);};
    outline.append(node('h2','RESEARCH PATHS'));
    entry('All research families',{kind:'research'},route.kind==='research');
    sections.forEach(s=>entry(s.title||s.name||s.id,{kind:'section',id:s.id},route.kind==='section'&&route.id===s.id));
    outline.append(node('h2','HOW TO PLAY'));
    chapters.forEach(ch=>entry(ch.title,{kind:'chapter',id:ch.id},route.id===ch.id||(route.kind==='page'&&pages.get(route.id)?.chapter.id===ch.id)));
    entry('Sources & availability',{kind:'sources'},route.kind==='sources');
  }
  function renderResearch(main) {
    main.append(heading('Research paths','Choose a weapon family and its supporting upgrades.',modeName()+' · bundled research catalogue'));
    const cards=node('div',null,'cards');
    sections.forEach(s=>{
      const count=catalogue().filter(t=>t.section===s.id || t.sections?.includes(s.id)).length;
      if(count)addCard(cards,s.title||s.name||s.id,`${count} topics`,()=>go({kind:'section',id:s.id}),s.icon);
    });
    main.append(cards);
    main.append(node('p',mode==='campaign'?'Campaign topics can also depend on mission progress and recovered artefacts. The current mission decides availability.':mode==='ffa'?'FFA uses ground technology. VTOL topics are disabled. Anti-air research may still exist but is unnecessary against these no-VTOL opponents.':'The battle decides which topics are available now. Crystal purchases can enable specific structures without completing their normal research path.','branch-note'));
    const links=node('div',null,'links'); links.style.marginTop='18px';
    const researchChapter=chapters.find(ch=>ch.id.includes('research'));
    if(researchChapter)links.append(button('How to assign labs and queue topics',()=>go({kind:'chapter',id:researchChapter.id})));
    main.append(links);
  }
  function topicRow(t) {
    const b=button('',()=>go({kind:'topic',id:t.id}),'topic-row');const img=icon(t.icon||t.image);if(img)b.append(img);
    const copy=node('span',null,'copy');copy.append(node('strong',t.name||t.id));
    const tags=[...(t.kinds||[])]; if(t.disabled||t.disabledReason)tags.push('Unavailable in this mode');
    if(t.requiresAll?.length)tags.push(`${t.requiresAll.length} prerequisite${t.requiresAll.length===1?'':'s'}`);
    if(tags.length)copy.append(node('small',tags.join(' · ')));
    b.append(copy,node('span','›','chevron')); return b;
  }
  function renderSection(main) {
    const s=sections.find(s=>s.id===route.id);
    if(!s){renderMissing(main);return;}
    main.append(heading(s.title||s.name||s.id,description(s.summary||s.description),modeName()+' · research family'));
    for(const line of [s.strategy,s.support,s.note].flat().filter(Boolean))main.append(node('p',description(line),'branch-note'));
    const topics=catalogue().filter(t=>t.section===s.id || t.sections?.includes(s.id));
    const list=node('div',null,'topic-list'); topics.forEach(t=>list.append(topicRow(t)));main.append(list);
    if(!topics.length)main.append(node('p','This family has no topics in this mode.','empty'));
  }
  function topicLabel(id) { return topicById(id)?.name || id; }
  function topicLinks(ids) {
    const links=node('div',null,'links');
    ids.forEach(id=>{const value=typeof id==='string'?id:id.id;links.append(button(topicLabel(value),()=>go({kind:'topic',id:value})));});return links;
  }
  function unlockLabel(item) {
    if(typeof item==='string')return research.components?.[mode]?.[item]?.name||topicById(item)?.name||item;
    return item.name||item.label||item.id||'Technology';
  }
  function effectLabel(effect) {
    if(typeof effect==='string')return effect;
    if(effect.description||effect.text)return effect.description||effect.text;
    const {class:kind,parameter,value,filterParameter,filterValue}=effect;
    const target=[kind,filterParameter&&filterValue?filterParameter+' '+filterValue:''].filter(Boolean).join(' · ');
    return [target,parameter,typeof value==='number'?(value>0?'+':'')+value:description(value)].filter(Boolean).join(' · ') || JSON.stringify(effect);
  }
  function renderTopic(main) {
    const t=topicById(route.id);if(!t){renderMissing(main);return;}
    const section=sections.find(s=>s.id===t.section);
    main.append(node('p',modeName()+' · '+(section?.title||section?.name||'Research'),'eyebrow'));
    const hero=node('div',null,'topic-hero'),image=icon(t.icon||t.image);if(image)hero.append(image);
    const intro=node('div');intro.append(node('h1',t.name||t.id));
    const facts=node('div',null,'facts');
    if(t.cost?.power!=null)facts.append(node('span',t.cost.power+' power'));
    if(t.cost?.points!=null)facts.append(node('span',t.cost.points+' research points'));
    if(t.kinds?.length)facts.append(node('span',t.kinds.join(' · ')));intro.append(facts);hero.append(intro);main.append(hero);
    if(t.disabled||t.disabledReason||t.available===false)main.append(node('p',t.disabledReason||'Unavailable in this mode.','notice'));
    if(t.campaignGate)main.append(node('p',t.campaignGate,'note'));
    const grid=node('div',null,'details-grid');const needed=node('section');needed.append(node('h2','Requires all of these'));
    if(t.requiresAll?.length)needed.append(topicLinks(t.requiresAll));else needed.append(node('p','No earlier research topic is listed.'));
    if(t.requiredStructures?.length){needed.append(node('h3','Required structures'));const ul=node('ul');t.requiredStructures.forEach(v=>ul.append(node('li',unlockLabel(v))));needed.append(ul);}
    needed.append(node('p',mode==='campaign'?'Mission scripts and artefacts may also unlock this topic. Check the current mission and Research screen.':'Finish every listed topic. A completed, powered lab must be available; other upgrades can change its research speed.','note'));
    const result=node('section');result.append(node('h2','What it unlocks or improves'));
    const unlocks=Array.isArray(t.unlocks)?t.unlocks:Object.values(t.unlocks||{}).flat();
    if(unlocks.length){const ul=node('ul',null,'effect-list');unlocks.forEach(v=>ul.append(node('li',unlockLabel(v)+(v.type?' · '+v.type:''))));result.append(ul);}
    if(t.effects?.length){const ul=node('ul',null,'effect-list');t.effects.forEach(e=>ul.append(node('li',effectLabel(e))));result.append(ul);}
    if(!unlocks.length&&!t.effects?.length)result.append(node('p','This topic is part of the technology chain. Its native result may be applied through mission or component data.'));
    grid.append(needed,result);main.append(grid);
    if(t.artifactSources?.length){
      main.append(node('h2','Campaign artefact references'));
      const list=node('ul');t.artifactSources.forEach(source=>list.append(node('li',[source.label,source.mission].filter(Boolean).join(' · '))));main.append(list);
      main.append(node('p','These are references in the bundled mission scripts. Mission variants and conditions still decide what is granted in your playthrough.','note'));
    }
    const next=t.requiredBy||t.opens||t.reverseLinks||catalogue().filter(v=>v.requiresAll?.includes(t.id)).map(v=>v.id);
    if(next.length){main.append(node('h2','Leads to'));main.append(topicLinks(next));}
    const obsolete=t.obsolete||t.obsoletes||[];
    if(obsolete.length){main.append(node('h2','Replaces'));const ul=node('ul');obsolete.forEach(v=>ul.append(node('li',unlockLabel(v))));main.append(ul);}
    main.append(node('p','Reference: '+t.id+'. Research points are work required, not a fixed countdown; the active lab, modules, upgrades and power affect completion.','note'));
  }
  function renderPlay(main) {
    main.append(heading('How to play','Short, practical instructions for this app. Start with your first five minutes, or open a chapter.',modeName()));
    const cards=node('div',null,'cards');chapters.forEach((ch,i)=>addCard(cards,`${i+1}. ${ch.title}`,ch.summary,()=>go({kind:'chapter',id:ch.id})));main.append(cards);
  }
  function renderChapter(main) {
    const ch=chapters.find(ch=>ch.id===route.id);if(!ch){renderMissing(main);return;}
    main.append(heading(ch.title,ch.summary,modeName()+' · how to play'));
    const list=node('div',null,'chapter-pages');
    ch.pages.filter(matchesMode).forEach(p=>addCard(list,p.title,p.steps?.[0]?.title,()=>go({kind:'page',id:p.id})));main.append(list);
    if(!ch.pages.some(matchesMode))main.append(node('p','This chapter applies to a different game mode. Change the mode above to read it.','notice'));
  }
  function screenshotWrap(record, callouts, focusRect) {
    const wrap=node('div',null,'screen-wrap'),img=node('img');img.src=record.src;img.alt=record.caption||'Actual game screen';
    img.width=record.width;img.height=record.height;wrap.append(img);
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 1000 1000');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');
    const shape=(tag,attrs)=>{const e=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));svg.append(e);return e;};
    const defs=document.createElementNS(ns,'defs'),marker=document.createElementNS(ns,'marker'),tip=document.createElementNS(ns,'path');
    marker.id='arrow-'+Math.random().toString(36).slice(2);marker.setAttribute('viewBox','0 0 10 10');marker.setAttribute('refX','9');marker.setAttribute('refY','5');marker.setAttribute('markerWidth','7');marker.setAttribute('markerHeight','7');marker.setAttribute('orient','auto-start-reverse');
    tip.setAttribute('d','M 0 0 L 10 5 L 0 10 z');tip.setAttribute('fill','#fff');tip.setAttribute('stroke','#000');tip.setAttribute('stroke-width','.5');marker.append(tip);defs.append(marker);svg.append(defs);
    const aspect=(record.width||2)/(record.height||1);
    const bounds=focusRect||[0,0,1,1];
    // A narrow sidebar crop magnifies the original image. Keep badges readable
    // at the thumbnail's scale and inside its actual visible bounds.
    const badgeScale=focusRect?Math.min(bounds[2],bounds[3]/aspect*5):1;
    const radius=17*badgeScale,margin=5*badgeScale;
    const badges=[];
    const placed=[];
    const minX=bounds[0]*1000+radius+margin,maxX=(bounds[0]+bounds[2])*1000-radius-margin;
    const minY=bounds[1]*1000+(radius+margin)*aspect,maxY=(bounds[1]+bounds[3])*1000-(radius+margin)*aspect;
    const separation=radius*2+9*badgeScale;
    function reserveBadge(x,y) {
      const clamp=(x,y)=>[Math.max(minX,Math.min(maxX,x)),Math.max(minY,Math.min(maxY,y))];
      const fits=([x,y])=>placed.every(([px,py])=>Math.hypot(x-px,(y-py)/aspect)>=separation-0.0001);
      const initial=clamp(x,y);
      let spot=fits(initial)?initial:null;
      // Nearby callouts can describe a list and its first row, sharing a corner.
      // Separate their labels in screen space, keeping arrows at their targets.
      for(let ring=1;!spot&&ring<=8;ring++) {
        for(let direction=0;direction<16;direction++) {
          const angle=direction*Math.PI/8;
          const candidate=clamp(initial[0]+Math.cos(angle)*ring*separation,
            initial[1]+Math.sin(angle)*ring*separation*aspect);
          if(fits(candidate)){spot=candidate;break;}
        }
      }
      for(let gy=minY;!spot&&gy<=maxY;gy+=separation*aspect) {
        for(let gx=minX;gx<=maxX;gx+=separation) {
          if(fits([gx,gy])){spot=[gx,gy];break;}
        }
      }
      spot=spot||initial;placed.push(spot);return spot;
    }
    for(const c of callouts){
      if(!c.targetRect||c.targetRect.length!==4)continue;
      const [x,y,w,h]=c.targetRect.map(v=>v*1000),cx=x+w/2,cy=y+h/2;
      shape('rect',{x,y,width:w,height:h,rx:5,fill:'none',stroke:'#000','stroke-width':7,'vector-effect':'non-scaling-stroke'});
      shape('rect',{x,y,width:w,height:h,rx:5,fill:'none',stroke:'#fff','stroke-width':2,'vector-effect':'non-scaling-stroke'});
      const [bx,by]=reserveBadge(x-27*badgeScale,y-38*badgeScale);
      shape('line',{x1:bx,y1:by,x2:cx,y2:cy,stroke:'#000','stroke-width':6,'vector-effect':'non-scaling-stroke'});
      shape('line',{x1:bx,y1:by,x2:cx,y2:cy,stroke:'#fff','stroke-width':2,'vector-effect':'non-scaling-stroke','marker-end':'url(#'+marker.id+')'});
      // Use an ellipse to stay circular when the SVG spans a landscape screenshot.
      const badge=shape('ellipse',{cx:bx,cy:by,rx:radius,ry:radius*aspect,fill:'#fff',stroke:'#000','stroke-width':2,'vector-effect':'non-scaling-stroke'});
      const label=shape('text',{x:bx,y:by+6*aspect*badgeScale,'text-anchor':'middle',fill:'#000','font-size':20*aspect*badgeScale,'font-family':'sans-serif','font-weight':'700',transform:`translate(${bx},${by}) scale(${1/aspect},1) translate(${-bx},${-by})`});label.textContent=c.number;
      badges.push(badge,label);
    }
    // Container outlines can cross an earlier callout. Numbers stay on top.
    badges.forEach(badge=>svg.append(badge));
    wrap.append(svg);return wrap;
  }
  function appendScreenshot(main,page) {
    const record=screenshots[page.screenshotId];if(!record)return;
    const callouts=page.callouts?.length?page.callouts:record.callouts||[];
    const fig=node('figure',null,'screenshot'),b=button('',()=>openImage(record,callouts,page.title));
    b.setAttribute('aria-label','Enlarge screenshot: '+page.title);
    const focus=record.focusRect,wrap=screenshotWrap(record,callouts,focus);
    if(focus?.length===4 && focus[2]>0 && focus[3]>0){
      const [x,y,w,h]=focus,crop=node('div');
      crop.style.cssText=`position:relative;overflow:hidden;width:100%;aspect-ratio:${record.width*w/(record.height*h)}`;
      wrap.style.cssText=`position:absolute;width:${100/w}%;left:${-100*x/w}%;top:${-100*y/h}%`;
      crop.append(wrap);b.append(crop);
    }else b.append(wrap);
    fig.append(b,node('figcaption',(record.caption||'Actual game screen')+' · Tap image to enlarge.'));
    main.append(fig);
    if(callouts.length){const list=node('ol',null,'annotation-key');callouts.forEach(c=>{const li=node('li');li.append(node('span',c.number,'number'),node('span',c.label));list.append(li);});main.append(list);}
  }
  function renderPage(main) {
    const p=pages.get(route.id);if(!p){renderMissing(main);return;}
    main.append(heading(p.title,p.summary,modeName()+' · '+p.chapter.title));
    if(!matchesMode(p))main.append(node('p','This page describes '+p.modes.map(m=>m==='ffa'?'FFA':m[0].toUpperCase()+m.slice(1)).join(' / ')+'. Change mode above for matching research data.','notice'));
    appendScreenshot(main,p);
    const steps=node('ol',null,'steps');(p.steps||[]).forEach(step=>{const li=node('li');if(step.title)li.append(node('strong',step.title));li.append(node('span',step.text));steps.append(li);});main.append(steps);
    (p.notes||[]).forEach(note=>main.append(node('p',note,'note')));
    if(p.related?.length){main.append(node('h2','Related'));const related=node('div',null,'links');p.related.forEach(id=>related.append(button(pages.get(id)?.title||topicById(id)?.name||sections.find(s=>s.id===id.replace('section:',''))?.title||id,()=>navigateRelated(id))));main.append(related);}
    const siblings=p.chapter.pages.filter(matchesMode),index=siblings.findIndex(v=>v.id===p.id),flow=node('div',null,'page-flow');
    flow.append(button('‹ '+p.chapter.title,()=>go({kind:'chapter',id:p.chapter.id})));
    if(index>=0&&index<siblings.length-1)flow.append(button('Next: '+siblings[index+1].title+' ›',()=>go({kind:'page',id:siblings[index+1].id})));
    main.append(flow);
  }
  function renderSearch(main) {
    const needle=query.trim().toLocaleLowerCase();main.append(heading('Find research or help',null,modeName()));
    const topicMatches=catalogue().filter(t=>[t.name,t.id,t.section,...(t.kinds||[])].join(' ').toLocaleLowerCase().includes(needle));
    const pageMatches=[...pages.values()].filter(matchesMode).filter(p=>[p.title,p.summary,...p.steps.map(s=>s.title+' '+s.text),...(p.notes||[])].join(' ').toLocaleLowerCase().includes(needle));
    main.append(node('p',`${topicMatches.length} research topics · ${pageMatches.length} help pages`,'search-summary'));
    if(topicMatches.length){main.append(node('h2','Research'));const list=node('div',null,'topic-list');topicMatches.forEach(t=>list.append(topicRow(t)));main.append(list);}
    if(pageMatches.length){main.append(node('h2','How to play'));const list=node('div',null,'chapter-pages');pageMatches.forEach(p=>addCard(list,p.title,p.chapter.title,()=>go({kind:'page',id:p.id})));main.append(list);}
    if(!topicMatches.length&&!pageMatches.length)main.append(node('p','No matches. Try cannon, module, power, queue, save or rotate.','empty'));
  }
  function renderSources(main) {
    main.append(heading('Sources & availability','This guide is included in the APK and works offline. It describes the controls and native data shipped with this app.','Reference'));
    main.append(node('p','Research paths come from the bundled native catalogues: Towers/MP, FFA with its no-air restrictions, and the separate Campaign catalogue. All listed research prerequisites are required. Costs are power and research work, not fixed completion times.','notice'));
    main.append(node('p','The official Warzone guide informs the explanations of weapon roles and research strategy. Its older numeric values are not used as this app’s live tech tree. Campaign missions and artefacts remain authoritative for availability.'));
    const list=node('div',null,'source-list');[
      ['Warzone research guide','https://betaguide.wz2100.net/research.html','Research lists, prerequisite trees and technology roles.'],
      ['Warzone weapon guide','https://betaguide.wz2100.net/weapons.html','Weapon families and damage roles.'],
      ['Warzone early-game strategy','https://betaguide.wz2100.net/earlygamestrategy.html','Specialisation and supporting upgrades; older numeric data may differ.'],
      ['Official Warzone quick-start guide','https://github.com/Warzone2100/warzone2100/blob/master/doc/quickstartguide.asciidoc','Research, campaign artefacts, manufacturing and Intelligence.']
    ].forEach(([title,url,detail])=>{const item=node('article');item.append(node('h3',title),node('p',detail),node('p',url));list.append(item);});
    main.append(list,node('h2','Screenshots and annotations'),node('p','Pictures are real app or phone captures. Numbered arrows and outlines are drawn over the original image. Captions identify the screen and capture source; some menu captures use an emulator whose terrain is dark. Screenshots illustrate controls, not a universal starting base.'));
    const count=catalogue().length;main.append(node('p',`${modeName()}: ${count} topics in this reference. The guide does not inspect or change your current battle, research, saves or wallet.`,'note'));
  }
  function renderMissing(main) {main.append(heading('Not available here','This entry is not in the selected mode’s catalogue. Choose another mode or return to the contents.'));}
  function render() {
    const main=$('main');main.replaceChildren();$('mode').value=mode;
    const active=['research','section','topic'].includes(route.kind)?'research':'play';
    document.querySelectorAll('[data-root]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.root===active)));
    $('back').hidden=!stack.length;renderOutline();
    if(query.trim()){renderSearch(main);return;}
    const renders={research:renderResearch,section:renderSection,topic:renderTopic,play:renderPlay,chapter:renderChapter,page:renderPage,sources:renderSources};
    (renders[route.kind]||renderResearch)(main);
  }
  function openImage(record,callouts,title) {
    previousImageFocus=document.activeElement;imageZoom=1;$('image-title').textContent=title;$('image-caption').textContent=record.caption||'';
    $('image-stage').replaceChildren(screenshotWrap(record,callouts));$('image-stage').style.width='100%';
    $('image-out').disabled=true;$('image-in').disabled=false;
    $('image-viewer').showModal();$('image-close').focus();
  }
  function closeImage() {$('image-viewer').close();previousImageFocus?.focus({preventScroll:true});}
  function zoomImage(delta) {imageZoom=Math.max(1,Math.min(4,imageZoom+delta));$('image-stage').style.width=(imageZoom*100)+'%';$('image-out').disabled=imageZoom===1;$('image-in').disabled=imageZoom===4;}
  $('image-close').addEventListener('click',closeImage);$('image-in').addEventListener('click',()=>zoomImage(.5));$('image-out').addEventListener('click',()=>zoomImage(-.5));
  $('image-viewer').addEventListener('cancel',e=>{e.preventDefault();closeImage();});
  $('contents').addEventListener('click',()=>{const open=$('outline').classList.toggle('open');$('contents').setAttribute('aria-expanded',String(open));});
  $('main').addEventListener('click',()=>closeContents());
  $('back').addEventListener('click',back);$('sources').addEventListener('click',()=>go({kind:'sources'}));
  $('mode').addEventListener('change',e=>{mode=e.target.value;render();});
  $('type-size').addEventListener('click',()=>{const large=$('type-size').getAttribute('aria-pressed')!=='true';$('type-size').setAttribute('aria-pressed',String(large));$('type-size').setAttribute('aria-label',large?'Use standard guide text':'Use larger guide text');document.documentElement.style.setProperty('--scale',large?'1.2':'1');});
  document.querySelectorAll('[data-root]').forEach(b=>b.addEventListener('click',()=>go({kind:b.dataset.root})));
  $('query').addEventListener('input',e=>{query=e.target.value;clearTimeout(queryTimer);queryTimer=setTimeout(()=>{render();$('main').scrollTop=0;},120);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();back();}});
  window.WarzoneGuide={back,state:()=>({mode,route:{...route},query,depth:stack.length,imageOpen:$('image-viewer').open}),go,counts:()=>({chapters:chapters.length,pages:pages.size,topics:catalogue().length})};
  render();
})();
