"use strict";
const [url, method, json = "{}"] = process.argv.slice(2);
const socket = new WebSocket(url);
const timer = setTimeout(() => { console.error("CDP command timed out"); process.exit(1); }, 10000);
socket.addEventListener("open", () => socket.send(JSON.stringify({ id: 1, method, params: JSON.parse(json) })));
socket.addEventListener("message", event => {
  const response = JSON.parse(String(event.data));
  if (response.id !== 1) return;
  clearTimeout(timer);
  console.log(JSON.stringify(response.error || response.result));
  process.exitCode = response.error ? 1 : 0;
  socket.close();
});
