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
      onRemoved:event(),onUpdated:event(),onZoomChange:event(),
      get:async id=>{if(!state.tabs.has(id))throw new Error('missing tab');return clone(state.tabs.get(id));},
      update:async(id,change)=>{Object.assign(state.tabs.get(id),change);state.calls.push(['tab',id,clone(change)]);return clone(state.tabs.get(id));},
      create:async options=>{const tab={id:100+state.tabs.size,windowId:options.windowId||10,...options};state.tabs.set(tab.id,tab);state.calls.push(['create',clone(tab)]);return clone(tab);},
      query:async()=>[clone(state.tabs.get(2))],
      getZoomSettings:async()=>({mode:'automatic',scope:'per-tab'}),setZoomSettings:async()=>{},
      getZoom:async id=>state.tabs.get(id).zoom||1,setZoom:async(id,zoom)=>{state.tabs.get(id).zoom=zoom;state.calls.push(['zoom',id,zoom]);for(const fn of chrome.tabs.onZoomChange.listeners)fn({tabId:id,newZoomFactor:zoom});},reload:async id=>state.calls.push(['reload',id]),
      sendMessage:async(id,msg)=>{state.calls.push(['message',id,clone(msg)]);return {ok:true};}
    }
  };
  const context=vm.createContext({chrome,console,URL,Map,Set,setTimeout,clearTimeout});
  context.importScripts=(...names)=>{for(const name of names)vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),context);};
  vm.runInContext(fs.readFileSync(path.join(root,'background.js'),'utf8'),context);
  const sender=id=>({tab:clone(state.tabs.get(id)),url:state.tabs.get(id)?.url});
  const message=(value,from=sender(1))=>new Promise(resolve=>chrome.runtime.onMessage.listeners[0](value,from,resolve));
  const command=(value,tab)=>chrome.commands.onCommand.listeners[0](value,tab);
  return {state,chrome,sender,message,command};
}
test('TV enters fullscreen, and Home returns to the latest meeting tab from another page',async()=>{
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
test('Home never replaces or reopens an unrelated page after the meeting has ended',async()=>{
  const f=fixture();await f.message({type:'presentation',enabled:true});
  f.state.tabs.get(1).url='https://example.org/unsaved-form';
  assert.equal((await f.message({type:'return-to-meeting'},{})).ok,false);
  assert.equal(f.state.tabs.get(1).url,'https://example.org/unsaved-form');
  assert.equal(f.state.calls.filter(x=>x[0]==='create').length,0);
});
test('Home falls back to a still-active meeting when the latest meeting has ended',async()=>{
  const f=fixture();f.state.tabs.get(2).url='https://second.feishu.cn/base/Base456';
  await f.message({type:'presentation',enabled:true});await f.message({type:'presentation',enabled:true},f.sender(2));
  await f.message({type:'presentation',enabled:false},f.sender(2));
  await f.command('return-to-meeting');assert.equal(f.state.tabs.get(1).active,true);
  await f.message({type:'presentation',enabled:false});
  assert.equal((await f.message({type:'return-to-meeting'},{})).ok,false);
});
test('ordinary pages cannot enter meeting mode; a navigating tab can release its window',async()=>{
  const f=fixture();assert.equal((await f.message({type:'presentation',enabled:true},f.sender(2))).ok,false);
  await f.message({type:'presentation',enabled:true});
  f.state.tabs.get(1).url='https://acme.feishu.cn/docx/Doc123';
  assert.equal((await f.message({type:'presentation',enabled:false})).ok,true);assert.equal(f.state.windows.get(10).state,'normal');
});
test('Home without an active meeting produces a useful error and opens nothing',async()=>{
  const f=fixture();const result=await f.message({type:'return-to-meeting'},{});
  assert.equal(result.ok,false);assert.match(result.error,/先在/);assert.equal(f.state.tabs.size,2);
});
test('custom page reload is available without meeting mode and limited to its own Feishu tab',async()=>{
  const f=fixture();assert.equal((await f.message({type:'reload-page'})).ok,true);
  assert.deepEqual(f.state.calls.filter(x=>x[0]==='reload'),[['reload',1]]);
  assert.equal((await f.message({type:'reload-page'},f.sender(2))).ok,false);
  assert.equal(f.state.calls.filter(x=>x[0]==='reload').length,1);
});
test('Power reloads a non-Feishu active tab without a meeting or content access',async()=>{
  const f=fixture();f.state.tabs.get(2).url='https://github.com/example/demo';
  await f.command('reload-current-tab');
  assert.deepEqual(f.state.calls.filter(x=>x[0]==='reload'),[['reload',2]]);
  assert.deepEqual(f.state.session,{});
  assert.equal(f.state.calls.some(x=>x[0]==='create'||x[0]==='window'),false);
});
test('Power uses the invocation tab even if the active window changes, and needs no URL',async()=>{
  const f=fixture();f.chrome.tabs.query=async()=>{throw new Error('must not query');};
  await f.command('reload-current-tab',{id:1});
  assert.deepEqual(f.state.calls.filter(x=>x[0]==='reload'),[['reload',1]]);
});
test('Power reports a missing tab or reload failure without switching pages',async()=>{
  const f=fixture();f.chrome.tabs.query=async()=>[];
  await f.command('reload-current-tab');
  assert.equal(f.state.calls.some(x=>x[0]==='reload'),false);
  assert.match(f.state.calls.find(x=>x[0]==='title')[1].title,/要刷新/);
  f.state.calls=[];f.chrome.tabs.reload=async()=>{throw new Error('Tab closed');};
  await f.command('reload-current-tab',{id:2});
  assert.equal(f.state.calls.find(x=>x[0]==='badge')[1].text,'!');
  assert.equal(f.state.calls.find(x=>x[0]==='title')[1].title,'Tab closed');
});
test('field links open a new tab and retain the meeting origin; unsafe URLs are rejected',async()=>{
  const f=fixture();await f.message({type:'presentation',enabled:true});
  assert.equal((await f.message({type:'open-field-link',url:'https://example.org/guide'})).ok,true);
  const created=f.state.calls.find(x=>x[0]==='create')[1];assert.equal(created.openerTabId,1);assert.equal(created.active,true);assert.equal(f.state.session.lastMeeting.tabId,1);
  for(const url of ['javascript:alert(1)','file:///etc/passwd','https://user:password@example.org/','data:text/html,test'])assert.equal((await f.message({type:'open-field-link',url})).ok,false);
  assert.equal((await f.message({type:'open-field-link',url:'https://example.org/'},f.sender(2))).ok,false);
  assert.equal(f.state.calls.filter(x=>x[0]==='create').length,1);
});

test('native Chrome zoom updates the active meeting HUD without applying another zoom',async()=>{
  const f=fixture();await f.message({type:'presentation',enabled:true});
  for(const fn of f.chrome.tabs.onZoomChange.listeners)fn({tabId:1,newZoomFactor:3});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(f.state.calls.filter(c=>c[0]==='message'),[['message',1,{type:'meeting-zoom',zoom:3}]]);
  assert.equal(f.state.calls.some(c=>c[0]==='zoom'),false);
  for(const fn of f.chrome.tabs.onZoomChange.listeners)fn({tabId:2,newZoomFactor:1.2});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(f.state.calls.filter(c=>c[0]==='message').length,1);
});
