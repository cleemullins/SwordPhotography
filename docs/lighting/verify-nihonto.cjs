"use strict";
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const html=fs.readFileSync(path.join(__dirname,"nihonto-lighting.html"),"utf8");
const code=html.match(/<script id="model">([\s\S]*?)<\/script>/)[1];
const sandbox={module:{exports:{}}};
vm.runInNewContext(code,sandbox);
const m=sandbox.module.exports;
const s={H:180,h:250,d:80,diameter:25,alpha:0,width:35,cy:0,left:true,right:true};
function close(a,b,epsilon=1e-8) { assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`); }
const a=m.centralAngles(s);
assert.equal(m.sample([0,0,0],s).hit,false);
assert.equal(m.sample([0,0,0],{...s,alpha:a.a}).hit,true);
assert.equal(m.sample([0,0,0],{...s,alpha:-a.a}).hit,true);
assert.equal(m.sample([0,0,0],{...s,alpha:a.a,right:false}).hit,false);
assert.equal(m.sample([0,700,0],{...s,cy:700,alpha:a.a}).hit,false);
const x=s.H*s.d/(s.H+s.h);
assert.equal(m.sample([x,0,0],s).hit,true);
assert.equal(m.sample([0,0,0],{...s,left:false,right:false}).hit,false);
close(m.cylinderHit([0,0,0],[0,0,1],0,100,10),90);
close(m.cylinderHit([0,0,100],[0,1,0],0,100,10),1219.2/2);
assert.equal(m.cylinderHit([20,0,100],[0,1,0],0,100,10),Infinity);
for(let angle=-40;angle<=40;angle+=5) {
  const n=m.normal(angle), v=m.unit([0.1,0.2,1]);
  const r=m.reflected(v,n);
  close(Math.hypot(...r),1);
  const recovered=m.reflected(r,n);
  recovered.forEach((value,i)=>close(value,v[i]));
}
const plan=m.opticalPlan(700,70,0.35,60,35.9);
assert.equal(plan.count,15);
close(plan.step,45.5);
close(plan.u,60*(1+70/35.9));
assert.equal(m.opticalPlan(50,70,0.35,60,35.9).count,1);
assert.equal(m.opticalPlan(707,70,0.35,60,35.9).count,15);
for(const h of [5,20,100,250,450,700]) for(const d of [20,80,400]) for(const alpha of [-45,0,45]) {
  const current={...s,h,d,alpha};
  for(const shape of m.sceneShapes(current)) for(const value of Object.values(shape)) {
    if(typeof value==="number") assert.ok(Number.isFinite(value));
  }
  for(const y of [-650,0,650]) for(const x of [-17.5,0,17.5]) {
    const point=[x,y,-x*Math.tan(alpha*Math.PI/180)];
    assert.equal(typeof m.sample(point,current).hit,"boolean");
  }
}
const drawing=m.toExcalidraw({...s,alpha:Math.round(a.a*10)/10});
assert.equal(new Set(drawing.elements.map(e=>e.id)).size,drawing.elements.length);
for(const element of drawing.elements) {
  assert.ok(element.width>=0 && element.height>=0);
  if(element.type==="text") { assert.ok(element.width>0 && element.height>0); assert.equal(element.strokeColor,"#000000"); }
}
fs.writeFileSync(path.join(__dirname,"nihonto-geometry.excalidraw"),JSON.stringify(drawing,null,2));
console.log("Geometry, finite-cylinder boundaries, mirror symmetry, frame coverage and diagram checks passed.");
console.log(JSON.stringify({centralNormalDegrees:a.a,halfWidthDegrees:a.half,flatReflectionX:x,plan},null,2));
