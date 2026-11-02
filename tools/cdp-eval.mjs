const [url, expression] = process.argv.slice(2);

if (!url || !expression) {
  console.error("Usage: node tools/cdp-eval.mjs <websocket-url> <expression>");
  process.exit(2);
}

const socket = new WebSocket(url);
const timeout = setTimeout(() => {
  console.error("Timed out waiting for the WebView debugger");
  socket.close();
  process.exit(3);
}, 10000);

socket.addEventListener("open", () => {
  socket.send(JSON.stringify({
    id: 1,
    method: "Runtime.evaluate",
    params: {
      expression,
      returnByValue: true,
      awaitPromise: true
    }
  }));
});

socket.addEventListener("message", event => {
  const message = JSON.parse(event.data);
  if (message.id !== 1) return;
  clearTimeout(timeout);
  console.log(JSON.stringify(message.result, null, 2));
  socket.close();
});

socket.addEventListener("error", event => {
  clearTimeout(timeout);
  console.error(event.message || "WebSocket error");
  process.exit(4);
});
