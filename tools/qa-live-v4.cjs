"use strict";
// Live Android WebView layout checks. Screenshots come from adb, including WebGL.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const {adb} = require('./android-sdk.cjs');
const url = fs.readFileSync(path.join(__dirname, "live-cdp-url.txt"), "utf8").trim();
const out = path.join(__dirname, "../qa/v4");
fs.mkdirSync(out, { recursive: true });
const socket = new WebSocket(url);
let sequence = 0;
const pending = new Map();
socket.addEventListener("message", event => {
  const message = JSON.parse(String(event.data));
  if (!message.id) return;
  const call = pending.get(message.id);
  if (!call) return;
  pending.delete(message.id);
  if (message.error) call.reject(new Error(JSON.stringify(message.error)));
  else call.resolve(message.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function screenshot(name) {
  execFileSync(adb, ["-s", "emulator-5554", "shell", "screencap", "-p", "/sdcard/towers-qa.png"]);
  execFileSync(adb, ["-s", "emulator-5554", "pull", "/sdcard/towers-qa.png", path.join(out, `${name}.png`)], { stdio: "ignore" });
}
async function main() {
  await new Promise(resolve => socket.addEventListener("open", resolve, { once: true }));
  assert.equal(await evaluate("Boolean(window.__kalaWarzoneTouch?.report().hudVisible)"), true, "wait until startup finishes");
  const results = [];
  for (const [name, width, height] of [["wide",1280,576], ["compact",642,482]]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: false });
    await wait(1100);
    await evaluate("document.fonts.ready.then(()=>true)");
    const metrics = await evaluate(`(()=>{
      const rail=document.getElementById('blocknight-combat-hud');
      const wave=document.getElementById('warzone-towers-wave-hud');
      const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};
      return {view:[innerWidth,innerHeight,devicePixelRatio],rail:rect(rail),railScroll:[rail.scrollWidth,rail.clientWidth],wave:rect(wave),canvas:rect(canvas),
        icons:[...rail.querySelectorAll('img')].every(i=>i.complete&&i.naturalWidth>0),font:document.fonts.check('12px Towers'),
        touch:__kalaWarzoneTouch.report(),waveState:__warzoneTowersWaves.report()};})()`);
    assert.deepEqual(metrics.view.slice(0,2), [width,height]);
    assert.ok(metrics.railScroll[0] <= metrics.railScroll[1] + 1, "every persistent control must fit");
    assert.ok(metrics.canvas.y >= metrics.rail.bottom, "native message strip must stay below command rail");
    assert.ok(metrics.canvas.bottom <= height+1 && metrics.canvas.right <= width+1, "whole native frame must fit");
    assert.ok(metrics.icons && metrics.font, "all local icons and font must load");
    screenshot(name);
    await evaluate("document.getElementById('blocknight-help').click()");
    const help = await evaluate("(()=>{const d=document.getElementById('warzone-towers-help');const r=d.getBoundingClientRect();return {open:d.open,width:r.width,height:r.height,scroll:d.scrollHeight,client:d.clientHeight,top:r.top,bottom:r.bottom};})()");
    assert.equal(help.open, true);
    assert.ok(help.top>=0 && help.bottom<=height+1, "help must fit the viewport and scroll internally");
    screenshot(`${name}-help`);
    await evaluate("(()=>{const d=document.getElementById('warzone-towers-help');d.scrollTop=d.scrollHeight;})()");
    screenshot(`${name}-help-bottom`);
    await evaluate("document.querySelector('#warzone-towers-help .wt-help-back').click()");
    assert.equal(await evaluate("document.getElementById('warzone-towers-help').open"), false);
    results.push({name,metrics,help});
  }
  await send("Emulation.clearDeviceMetricsOverride");
  await wait(1000);
  for(let i=0;i<3;i++) { await evaluate("dispatchEvent(new Event('resize'));true"); await wait(400); }
  const after = await evaluate("JSON.stringify({view:[innerWidth,innerHeight],canvas:canvas.getBoundingClientRect(),touch:__kalaWarzoneTouch.report(),waves:__warzoneTowersWaves.report()})");
  results.push({resizeAfterThreeEvents:JSON.parse(after)});
  fs.writeFileSync(path.join(out,"layout-results.json"),JSON.stringify(results,null,2));
  screenshot("tablet-final");
  console.log(JSON.stringify(results));
  socket.close();
}
const timeout = setTimeout(()=>{console.error("Live QA timed out");process.exit(1)},55000);
main().then(()=>{clearTimeout(timeout);process.exit(0)}).catch(error=>{console.error(error);socket.close();process.exit(1)});
