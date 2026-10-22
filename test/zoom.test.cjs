const test=require('node:test');
const assert=require('node:assert/strict');
const ZoomQueue=require('../extension/zoom-queue.js');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function fixture(initial=1){
  const values=new Map([[1,initial],[2,1]]),writes=[],settingsCalls=[];
  const api={
    getZoomSettings:async()=>({mode:'automatic',scope:'per-origin'}),
    setZoomSettings:async(id,options)=>{settingsCalls.push({id,options});},
    getZoom:async id=>{await delay(3);return values.get(id);},
    setZoom:async(id,value)=>{await delay(15);values.set(id,value);writes.push({id,value});}
  };
  return {api,values,writes,settingsCalls,queue:new ZoomQueue(api)};
}
test('ten rapid volume presses accumulate ten zoom steps despite a slow browser',async()=>{
  const f=fixture();
  await Promise.all(Array.from({length:10},()=>f.queue.enqueue(1,1,10)));
  assert.equal(f.values.get(1),2);assert.equal(f.settingsCalls.length,1);assert.equal(f.writes.length,1);
});
test('presses arriving while a zoom is in flight are retained, with no busy-drop',async()=>{
  const f=fixture();const pending=[f.queue.enqueue(1,1,10)];
  await delay(8);
  for(let i=0;i<7;i++)pending.push(f.queue.enqueue(1,1,10));
  await Promise.all(pending);assert.equal(f.values.get(1),1.8);assert.equal(f.writes.length,2);
});
test('alternating steps and reset retain their order at zoom boundaries',async()=>{
  const f=fixture(2.45);
  await Promise.all([1,1,-1].map(direction=>f.queue.enqueue(1,direction,10)));
  assert.equal(f.values.get(1),2.4);
  await Promise.all([0,-1,-1,1].map(direction=>f.queue.enqueue(1,direction,10)));
  assert.equal(f.values.get(1),.9);
});
test('separate tabs have independent zoom queues',async()=>{
  const f=fixture();await Promise.all([f.queue.enqueue(1,1,10),f.queue.enqueue(2,-1,5)]);
  assert.equal(f.values.get(1),1.1);assert.equal(f.values.get(2),.95);
});
test('a rejected browser operation clears the queue so the next key can retry',async()=>{
  const f=fixture();let fail=true;
  f.api.setZoom=async(id,value)=>{if(fail)throw new Error('browser closed');f.values.set(id,value);};
  const first=await Promise.allSettled([f.queue.enqueue(1,1,10),f.queue.enqueue(1,1,10)]);
  assert.ok(first.every(x=>x.status==='rejected'));fail=false;
  await f.queue.enqueue(1,1,10);assert.equal(f.values.get(1),1.1);
});
