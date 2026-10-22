const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../extension');
const url='https://first.feishu.cn/base/Base123?table=tblOne&view=viewOne';
const event=()=>({listeners:[],addListener(fn){this.listeners.push(fn);}});
const clone=value=>structuredClone(value);
function fixture(state){
  state ||= {session:{},local:{},tabs:new Map([[1,{id:1,windowId:10,url}],[2,{id:2,windowId:10,url:'https://example.org/'}]]),windows:new Map([[10,{id:10,state:'normal'}],[20,{id:20,state:'normal'}]]),calls:[]};
  const storageEvent=event();
  const area=data=>({get:async key=>clone({[key]:data[key]}),set:async values=>{Object.assign(data,clone(values));}});
  const chrome={
    storage:{session:area(state.session),local:area(state.local),onChanged:storageEvent},
    runtime:{onInstalled:event(),onMessage:event(),openOptionsPage:async()=>{}},
    commands:{onCommand:event()},
    action:{setBadgeText:async value=>state.calls.push(['badge',value]),setTitle:async value=>state.calls.push(['title',value])},
    windows:{
      get:async id=>{if(!state.windows.has(id))throw new Error('missing window');return clone(state.windows.get(id));},
      update:async(id,change)=>{if(!state.windows.has(id))throw new Error('missing window');Object.assign(state.windows.get(id),change);state.calls.push(['window',id,clone(change)]);return clone(state.windows.get(id));}
    },
    tabs:{
      onRemoved:event(),onUpdated:event(),
      get:async id=>{if(!state.tabs.has(id))throw new Error('missing tab');return clone(state.tabs.get(id));},
      update:async(id,change)=>{Object.assign(state.tabs.get(id),change);state.calls.push(['tab',id,clone(change)]);return clone(state.tabs.get(id));},
      create:async options=>{const tab={id:100+state.tabs.size,windowId:options.windowId||10,...options};state.tabs.set(tab.id,tab);state.calls.push(['create',clone(tab)]);return clone(tab);},
      query:async()=>[clone(state.tabs.get(2))],
      getZoomSettings:async()=>({mode:'automatic',scope:'per-tab'}),setZoomSettings:async()=>{},
      getZoom:async()=>1,setZoom:async()=>{},
      sendMessage:async()=>({ok:true})
    }
  };
  const context=vm.createContext({chrome,console,URL,Map,Set});
  context.importScripts=(...names)=>{for(const name of names)vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),context);};
  vm.runInContext(fs.readFileSync(path.join(root,'background.js'),'utf8'),context);
  const sender=id=>({tab:clone(state.tabs.get(id)),url:state.tabs.get(id)?.url});
  const message=(value,from=sender(1))=>new Promise(resolve=>chrome.runtime.onMessage.listeners[0](value,from,resolve));
  const command=value=>chrome.commands.onCommand.listeners[0](value);
  return {state,chrome,sender,message,command};
}
test('TV enters fullscreen, and power returns to the latest meeting tab from another page',async()=>{
  const f=fixture();assert.equal((await f.message({type:'presentation',enabled:true})).ok,true);
  assert.equal(f.state.windows.get(10).state,'fullscreen');
  await f.command('return-to-meeting');
  assert.equal(f.state.tabs.get(1).active,true);assert.equal(f.state.windows.get(10).focused,true);
  assert.equal(f.state.tabs.size,2);
});
test('the most recently started meeting wins, including across windows',async()=>{
  const f=fixture();await f.message({type:'presentation',enabled:true});
  f.state.tabs.set(3,{id:3,windowId:20,url:'https://second.feishu.cn/base/OtherBase'});
  await f.message({type:'presentation',enabled:true},f.sender(3));await f.command('return-to-meeting');
  assert.equal(f.state.tabs.get(3).active,true);assert.equal(f.state.windows.get(20).focused,true);
});
test('a worker restart preserves the meeting tab and original window state',async()=>{
  const first=fixture();first.state.windows.get(10).state='maximized';await first.message({type:'presentation',enabled:true});
  const restarted=fixture(first.state);await restarted.command('return-to-meeting');
  assert.equal(restarted.state.tabs.get(1).active,true);
  await restarted.message({type:'presentation',enabled:false});
  assert.equal(restarted.state.windows.get(10).state,'maximized');
});
test('leaving meeting mode preserves a fullscreen window the extension did not enter',async()=>{
  const f=fixture();f.state.windows.get(10).state='fullscreen';
  await f.message({type:'presentation',enabled:true});await f.message({type:'presentation',enabled:false});
  assert.equal(f.state.windows.get(10).state,'fullscreen');
});
test('two meeting tabs share fullscreen ownership without an early restore',async()=>{
  const f=fixture();f.state.tabs.get(2).url='https://second.feishu.cn/base/Base456';
  await Promise.all([f.message({type:'presentation',enabled:true}),f.message({type:'presentation',enabled:true},f.sender(2))]);
  await f.message({type:'presentation',enabled:false});assert.equal(f.state.windows.get(10).state,'fullscreen');
  await f.message({type:'presentation',enabled:false},f.sender(2));assert.equal(f.state.windows.get(10).state,'normal');
});
test('returning reopens a missing meeting page without replacing unrelated content',async()=>{
  const f=fixture();await f.message({type:'presentation',enabled:true});
  f.state.tabs.get(1).url='https://example.org/unsaved-form';
  await f.command('return-to-meeting');
  assert.equal(f.state.tabs.get(1).url,'https://example.org/unsaved-form');
  const created=f.state.calls.find(x=>x[0]==='create');assert.equal(created[1].url,url);
  f.state.tabs.delete(created[1].id);await f.command('return-to-meeting');
  assert.equal(f.state.calls.filter(x=>x[0]==='create').length,2);
});
test('ordinary pages cannot enter meeting mode; a navigating tab can release its window',async()=>{
  const f=fixture();assert.equal((await f.message({type:'presentation',enabled:true},f.sender(2))).ok,false);
  await f.message({type:'presentation',enabled:true});
  f.state.tabs.get(1).url='https://acme.feishu.cn/docx/Doc123';
  assert.equal((await f.message({type:'presentation',enabled:false})).ok,true);assert.equal(f.state.windows.get(10).state,'normal');
});
test('power without a previous meeting produces a useful error and opens nothing',async()=>{
  const f=fixture();const result=await f.message({type:'return-to-meeting'},{});
  assert.equal(result.ok,false);assert.match(result.error,/先在/);assert.equal(f.state.tabs.size,2);
});
test('field links open a new tab and retain the meeting origin; unsafe URLs are rejected',async()=>{
  const f=fixture();await f.message({type:'presentation',enabled:true});
  assert.equal((await f.message({type:'open-field-link',url:'https://example.org/guide'})).ok,true);
  const created=f.state.calls.find(x=>x[0]==='create')[1];assert.equal(created.openerTabId,1);assert.equal(created.active,true);assert.equal(f.state.session.lastMeeting.tabId,1);
  for(const url of ['javascript:alert(1)','file:///etc/passwd','https://user:password@example.org/','data:text/html,test'])assert.equal((await f.message({type:'open-field-link',url})).ok,false);
  assert.equal((await f.message({type:'open-field-link',url:'https://example.org/'},f.sender(2))).ok,false);
  assert.equal(f.state.calls.filter(x=>x[0]==='create').length,1);
});
