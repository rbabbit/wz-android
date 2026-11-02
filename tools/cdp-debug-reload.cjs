"use strict";
(async () => {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const page = targets.find(t => t.type === "page");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  const source = `document.addEventListener("DOMContentLoaded",()=>{
    const original=constructWZModuleConfig;
    window.__liveEngineLog=[];
    constructWZModuleConfig=function(...args){
      WZ_CONFIG_DIR_SUFFIX="-emulator-v2-check";
      const m=original(...args);m.arguments.push("--debug=all");
      for(const k of ["print","printErr"]){const old=m[k];m[k]=(...a)=>{
        __liveEngineLog.push(a.join(" "));if(__liveEngineLog.length>1000)__liveEngineLog.shift();old(...a);
      };}return m;
    };
  });`;
  socket.addEventListener("open", () => socket.send(JSON.stringify({id: 0, method: "Page.enable"})));
  socket.addEventListener("message", e => {
    const m = JSON.parse(String(e.data));
    if (m.error) console.log(JSON.stringify(m));
    if (m.id === 0) socket.send(JSON.stringify({id: 1, method: "Page.addScriptToEvaluateOnNewDocument", params: {source}}));
    if (m.id === 1) socket.send(JSON.stringify({id: 2, method: "Page.reload", params: {ignoreCache: true}}));
    if (m.id === 2) setTimeout(() => { console.log("Reloaded with isolated emulator-only config and diagnostic logging"); socket.close(); }, 3000);
  });
})();
