(() => {
 'use strict';
 const expectedAPK='https://wz2100.uk/downloads/warzone/warzone2100-andriod.apk';
 const status=document.getElementById('release-status');let checking=false;
 async function checkRelease(){
  if(checking)return;checking=true;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
   const response=await fetch('/downloads/warzone/latest.json',{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error('Release unavailable');
   const feed=await response.json();
   if(feed.schemaVersion!==1||feed.applicationId!=='com.rbabbit.warzonetowers.lab'||!Number.isSafeInteger(feed.versionCode)||feed.versionCode<1||typeof feed.versionName!=='string'||!/^\d+(?:\.\d+){1,3}$/.test(feed.versionName)||feed.apkUrl!==expectedAPK||!Number.isSafeInteger(feed.sizeBytes)||feed.sizeBytes<1||!/^[a-f0-9]{64}$/i.test(feed.sha256))throw Error('Invalid release information');
   document.querySelectorAll('[data-release-version]').forEach(e=>e.textContent=feed.versionName);
   document.querySelectorAll('[data-release-size]').forEach(e=>e.textContent=(feed.sizeBytes/1000000).toFixed(1)+' MB');
   if(status)status.hidden=true;
  }catch{
   if(status){status.replaceChildren(document.createTextNode('Live version information is temporarily unavailable. The APK download remains available. '));const retry=document.createElement('button');retry.type='button';retry.textContent='Retry';retry.addEventListener('click',checkRelease);status.append(retry);status.hidden=false;}
  }finally{clearTimeout(timer);checking=false;}
 }
 checkRelease();
 if(/Android/i.test(navigator.userAgent)){const hint=document.querySelector('.install-hint');if(hint)hint.textContent='Download the APK, then open it to approve installation on your Android phone or tablet.';}
 const dialog=document.getElementById('image-viewer'),links=[...document.querySelectorAll('[data-gallery]')];
 if(!dialog||typeof dialog.showModal!=='function'||!links.length)return;
 let active=0,opener=null;
 function show(index){const window=document.querySelector('.image-window');window.classList.remove('zoomed');window.scrollTo(0,0);const zoom=document.getElementById('zoom-image');zoom.textContent='Zoom in';zoom.setAttribute('aria-pressed','false');active=(index+links.length)%links.length;const link=links[active],img=document.getElementById('large-image');img.src=link.href;img.alt=link.dataset.caption;document.getElementById('image-caption').textContent=link.dataset.caption;document.getElementById('image-count').textContent='Screenshot '+(active+1)+' of '+links.length;document.getElementById('previous-image').hidden=links.length<2;document.getElementById('next-image').hidden=links.length<2;}
 links.forEach((link,index)=>link.addEventListener('click',event=>{event.preventDefault();opener=link;show(index);dialog.showModal();document.documentElement.classList.add('has-image');}));
 document.getElementById('close-image').addEventListener('click',()=>dialog.close());
 document.getElementById('zoom-image').addEventListener('click',()=>{const view=document.querySelector('.image-window'),zoom=document.getElementById('zoom-image'),enabled=view.classList.toggle('zoomed');zoom.textContent=enabled?'Fit image':'Zoom in';zoom.setAttribute('aria-pressed',String(enabled));if(!enabled)view.scrollTo(0,0);});
 document.getElementById('previous-image').addEventListener('click',()=>show(active-1));
 document.getElementById('next-image').addEventListener('click',()=>show(active+1));
 dialog.addEventListener('keydown',event=>{if(document.querySelector('.image-window.zoomed')?.contains(event.target))return;if(event.key==='ArrowRight'){event.preventDefault();show(active+1);}if(event.key==='ArrowLeft'){event.preventDefault();show(active-1);}});
 dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
 dialog.addEventListener('close',()=>{document.documentElement.classList.remove('has-image');if(opener)opener.focus({preventScroll:true});});
})();
