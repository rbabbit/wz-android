"use strict";

const fs = require("node:fs");

const [webSocketUrl, outputPath] = process.argv.slice(2);
if (!webSocketUrl || !outputPath) {
  console.error("Usage: node cdp-screenshot.cjs <websocket-url> <output.png>");
  process.exit(2);
}

const socket = new WebSocket(webSocketUrl);
const timeout = setTimeout(() => {
  console.error("Timed out waiting for the WebView screenshot");
  process.exit(1);
}, 10000);

socket.addEventListener("open", () => {
  socket.send(JSON.stringify({
    id: 1,
    method: "Page.captureScreenshot",
    params: { format: "png", fromSurface: true, captureBeyondViewport: false }
  }));
});
socket.addEventListener("message", event => {
  const message = JSON.parse(String(event.data));
  if (message.id !== 1) return;
  clearTimeout(timeout);
  if (message.error || !message.result?.data) {
    console.error(JSON.stringify(message.error || message));
    process.exitCode = 1;
  } else {
    fs.writeFileSync(outputPath, Buffer.from(message.result.data, "base64"));
    console.log(outputPath);
  }
  socket.close();
});
socket.addEventListener("error", error => {
  clearTimeout(timeout);
  console.error(error.message || error);
  process.exit(1);
});
