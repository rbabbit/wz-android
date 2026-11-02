"use strict";
(async () => {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  await Promise.all(targets.filter(t => t.type === "worker").map(t => new Promise(resolve => {
    const socket = new WebSocket(t.webSocketDebuggerUrl);
    const timer = setTimeout(() => { socket.close(); resolve(); }, 3000);
    socket.addEventListener("open", () => socket.send(JSON.stringify({id: 1, method: "Debugger.enable"})));
    socket.addEventListener("message", event => {
      const m = JSON.parse(String(event.data));
      if (m.id === 1) socket.send(JSON.stringify({id: 2, method: "Debugger.pause"}));
      if (m.method === "Debugger.paused") {
        console.log(JSON.stringify({id: t.id, frames: m.params.callFrames.slice(0, 12).map(f => ({name: f.functionName, url: f.url, line: f.location.lineNumber, column: f.location.columnNumber}))}));
        socket.send(JSON.stringify({id: 3, method: "Debugger.resume"}));
      }
      if (m.id === 3) { clearTimeout(timer); socket.close(); resolve(); }
    });
    socket.addEventListener("error", () => { clearTimeout(timer); resolve(); });
  })));
})();
