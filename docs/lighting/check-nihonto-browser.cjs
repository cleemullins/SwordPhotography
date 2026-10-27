"use strict";
const fs=require("node:fs");
const path=require("node:path");
const {pathToFileURL}=require("node:url");
const {spawn}=require("node:child_process");
const assert=require("node:assert/strict");
const profile=path.join(__dirname,"nihonto-browser-profile");
const browser=spawn("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",[
  "--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check",
  "--remote-debugging-port=0",`--user-data-dir=${profile}`,"about:blank"
],{stdio:"ignore"});
let socket, id=0;
const pending=new Map(), errors=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function call(method,params={}) {
  return new Promise((resolve,reject)=>{
    const requestId=++id;
    const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error(`CDP timeout: ${method}`));},10000);
    pending.set(requestId,{resolve,reject,timer});
    socket.send(JSON.stringify({id:requestId,method,params}));
  });
}
async function evaluate(expression) {
  const result=await call("Runtime.evaluate",{expression,returnByValue:true});
  if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
(async()=>{
  const portFile=path.join(profile,"DevToolsActivePort");
  for(let i=0;!fs.existsSync(portFile)&&i<100;i++) await sleep(100);
  if(!fs.existsSync(portFile)) throw new Error("Browser did not expose a debugging endpoint.");
  const port=Number(fs.readFileSync(portFile,"utf8").split("\n")[0]);
  const pages=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page=pages.find(p=>p.type==="page");
  if(!page) throw new Error("No browser page available.");
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=event=>{
    const message=JSON.parse(event.data);
    if(message.method==="Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
    const p=pending.get(message.id);
    if(p) {
      clearTimeout(p.timer);pending.delete(message.id);
      if(message.error) p.reject(new Error(JSON.stringify(message.error))); else p.resolve(message.result);
    }
  };
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Emulation.setDeviceMetricsOverride",{width:1400,height:1100,deviceScaleFactor:1,mobile:false});
  await call("Page.navigate",{url:pathToFileURL(path.join(__dirname,"nihonto-lighting.html")).href});
  for(let i=0;i<100;i++) {
    if(await evaluate("Boolean(document.getElementById('angle')?.textContent)")) break;
    await sleep(50);
  }
  const initial=await evaluate(`({
    angle:document.getElementById('angle').textContent,
    planner:document.getElementById('planner').textContent,
    svg:document.getElementById('scene').children.length,
    error:document.getElementById('error').textContent
  })`);
  assert.match(initial.angle,/8.87/);
  assert.match(initial.planner,/15 frames/);
  assert.ok(initial.svg>10);
  assert.equal(initial.error,"");
  await evaluate("document.getElementById('match').click()");
  const matched=await evaluate(`({
    status:document.getElementById('status').textContent,
    hit:document.getElementById('hitFraction').textContent
  })`);
  assert.match(matched.status,/reflects an enabled tube/);
  assert.ok(parseFloat(matched.hit)>0);
  const screenshot=await call("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(__dirname,"nihonto-lighting-preview.png"),Buffer.from(screenshot.data,"base64"));
  await evaluate("document.getElementById('F').value='';document.getElementById('F').dispatchEvent(new Event('input'))");
  assert.match(await evaluate("document.getElementById('error').textContent"),/Enter valid/);
  await evaluate("document.getElementById('F').value='70';document.getElementById('F').dispatchEvent(new Event('input'))");
  await evaluate("document.getElementById('low').click()");
  assert.match(await evaluate("document.getElementById('angle').textContent"),/37.98/);
  await call("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"),true);
  await evaluate("document.documentElement.setAttribute('data-theme','dark');document.getElementById('flat').click()");
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log("Browser UI, ray matching, input errors, mobile layout and dark theme checks passed.");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(socket?.readyState===WebSocket.OPEN) {
    try { await call("Browser.close"); }
    catch(error) { console.error("Browser close did not acknowledge:",error.message); browser.kill(); }
    socket.close();
  } else browser.kill();
});
