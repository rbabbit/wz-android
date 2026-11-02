"use strict";

const [webSocketUrl, ...expressionParts] = process.argv.slice(2);
const expression = expressionParts.join(" ");
if (!webSocketUrl || !expression) {
  console.error("Usage: node cdp-evaluate.cjs <websocket-url> <expression>");
  process.exit(2);
}

const socket = new WebSocket(webSocketUrl);
const timeout = setTimeout(() => {
  console.error("Timed out waiting for the WebView debugger");
  process.exit(1);
}, 5000);

socket.addEventListener("open", () => {
  socket.send(JSON.stringify({
    id: 1,
    method: "Runtime.evaluate",
    params: {
      expression: `(() => { const frame = document.getElementById("warzone-game-frame");
        return frame ? frame.contentWindow.eval(${JSON.stringify(expression)}) : eval(${JSON.stringify(expression)}); })()`,
      returnByValue: true, awaitPromise: true
    }
  }));
});
socket.addEventListener("message", event => {
  const message = JSON.parse(String(event.data));
  if (message.id !== 1) return;
  clearTimeout(timeout);
  if (message.error || message.result?.exceptionDetails) {
    console.error(JSON.stringify(message.error || message.result.exceptionDetails));
    process.exitCode = 1;
  } else {
    console.log(message.result?.result?.value ?? message.result?.result?.description ?? "undefined");
  }
  socket.close();
});
socket.addEventListener("error", error => {
  clearTimeout(timeout);
  console.error(error.message || error);
  process.exit(1);
});
