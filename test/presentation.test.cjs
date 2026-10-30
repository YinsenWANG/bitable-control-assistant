const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../extension'),read=n=>fs.readFileSync(path.join(root,n),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(config={nativeBindings:{zoomIn:false,zoomOut:false}},blockedStorage=false){
  const d=new JSDOM('<main class="app-main"><header class="navigation-bar-wrapper">文档路径、分享和自动化</header><section class="suite-body">表格</section></main>',{url:'https://example.feishu.cn/base/ExampleBase',runScripts:'outside-only',pretendToBeVisual:true}),w=d.window;
  let now=0,next=1,keydown,listener,shadow;const timers=new Map(),messages=[],state={base:true,draft:false};
  w.setTimeout=(fn,delay=0)=>{const id=next++;timers.set(id,{fn,at:now+delay});return id;};w.clearTimeout=id=>timers.delete(id);
  async function advance(ms){const end=now+ms;while(true){await settle();const entry=[...timers].sort((a,b)=>a[1].at-b[1].at).find(([,t])=>t.at<=end);if(!entry)break;now=entry[1].at;timers.delete(entry[0]);entry[1].fn();}now=end;await settle();}
  const listen=w.addEventListener.bind(w);w.addEventListener=(type,fn,...args)=>{if(type==='keydown'&&!keydown)keydown=fn;return listen(type,fn,...args);};
  if(blockedStorage)Object.defineProperty(w,'sessionStorage',{get(){throw new w.DOMException('Storage blocked','SecurityError');}});
  const attach=w.HTMLElement.prototype.attachShadow;w.HTMLElement.prototype.attachShadow=function(options){const result=attach.call(this,options);if(this.id==='fmr-hud')shadow=result;return result;};
  w.eval(read('shared.js'));
  w.MeetingRemote.FeishuAdapter=class {
    isBasePage(){return state.base;}card(){return null;}state(){return '记录列表';}viewName(){return '示例视图';}hasDraft(){return state.draft;}
    guardDraft(){if(state.draft)throw new Error('请先处理评论草稿');}async ensureSelection(){}restoreHidden(){}clearFieldFocus(){}cancelCommentAutoClose(){}
    async collapseSidebarForMeeting(){state.sidebarAttempts=(state.sidebarAttempts||0)+1;if(state.sidebarReady!==false)this.meetingSidebar={expanded:true};}
    async restoreMeetingSidebar(){this.meetingSidebar=null;}
    inputContext(){throw new Error('Volume keys must not inspect editor layout');}editorPopupOpen(){throw new Error('Volume keys must not inspect popup layout');}
  };
  w.chrome={storage:{local:{get:async()=>({config:w.MeetingRemote.config(config)})},onChanged:{addListener(){}}},runtime:{getManifest:()=>({version:'1.5.0'}),onMessage:{addListener(fn){listener=fn;}},sendMessage:async msg=>{messages.push(msg);if(msg.type==='zoom'&&state.zoomReply)return state.zoomReply;if(msg.type==='presentation'&&state.presentationReply)return state.presentationReply;return {ok:true,zoom:1.5};}}};
  w.eval(read('dictation-relay.js'));w.eval(read('content.js'));await settle();
  const message=msg=>new Promise(resolve=>listener(msg,{},resolve));
  const run=action=>message({type:'meeting-action',action});
  function volume(repeat=false,onHud=false,mods={ctrlKey:true,shiftKey:true}){const e={isTrusted:true,code:'Equal',...mods,repeat,composedPath:()=>onHud?[shadow.querySelector('button'),w.document.querySelector('#fmr-hud')]:[],preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};keydown(e);return e;}
  return {d,w,state,messages,advance,run,volume,message,get shadow(){return shadow;}};
}
test('meeting header visibility restores, and paused HUD expires after 3 seconds despite DOM updates',async()=>{
  const f=await fixture();await f.run('toggle');assert.ok(f.w.document.documentElement.hasAttribute('data-fmr-presentation'));
  await f.run('toggle');assert.equal(f.w.document.documentElement.hasAttribute('data-fmr-presentation'),false);
  const hud=f.w.document.querySelector('#fmr-hud');assert.equal(hud.hidden,false);
  await f.advance(2999);assert.equal(hud.hidden,false);await f.advance(1);assert.equal(hud.hidden,true);
  f.w.document.querySelector('.suite-body').append(' rerender');await f.advance(5000);assert.equal(hud.hidden,true);
  await f.run('toggle');assert.equal(hud.hidden,false);assert.ok(f.w.document.documentElement.hasAttribute('data-fmr-presentation'));f.d.window.close();
});
test('header hiding can be disabled without disabling meeting controls',async()=>{
  const f=await fixture({hideHeader:false});assert.equal((await f.run('toggle')).ok,true);assert.equal(f.w.document.documentElement.hasAttribute('data-fmr-presentation'),false);f.d.window.close();
});
test('TV requests an explicit window exit while background page cleanup does not',async()=>{
  const f=await fixture();await f.run('toggle');await f.run('toggle');
  assert.deepEqual(f.messages.filter(m=>m.type==='presentation').map(m=>m.exitFullscreen),[undefined,true]);
  await f.run('toggle');f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide',{persisted:true}));await settle();
  assert.equal(f.messages.filter(m=>m.type==='presentation').at(-1).exitFullscreen,undefined);f.d.window.close();
});
test('a failed native fullscreen exit does not partially turn off the meeting layout',async()=>{
  const f=await fixture();await f.run('toggle');f.state.presentationReply={ok:false,error:'Window transition rejected'};
  assert.equal((await f.run('toggle')).ok,false);assert.equal((await f.message({type:'meeting-status'})).enabled,true);
  assert.equal(f.w.document.documentElement.hasAttribute('data-fmr-presentation'),true);assert.equal(f.state.sidebarAttempts,1);f.d.window.close();
});
test('all rapid repeat volume keys reach the queue from HUD focus and during Base rerender',async()=>{
  const f=await fixture();assert.equal((await f.run('toggle')).enabled,true);f.state.base=false;assert.equal((await f.run('zoomIn')).ok,true);
  for(let i=0;i<12;i++){const e=f.volume(i>0,true);assert.equal(e.prevented,true);assert.equal(e.stopped,true);}
  await settle();assert.equal(f.messages.filter(m=>m.type==='zoom').length,13);
  f.d.reconfigure({url:'https://example.feishu.cn/wiki/OrdinaryDocument'});const e=f.volume();assert.equal(e.prevented,undefined);assert.equal(f.messages.filter(m=>m.type==='zoom').length,13);f.d.window.close();
});
test('custom reload works while paused and protects a pending comment draft',async()=>{
  const f=await fixture();assert.equal((await f.run('reloadPage')).ok,true);assert.equal(f.messages.filter(m=>m.type==='reload-page').length,1);
  f.state.draft=true;assert.equal((await f.run('reloadPage')).ok,false);assert.equal(f.messages.filter(m=>m.type==='reload-page').length,1);f.d.window.close();
});

test('a late zoom response cannot bring back the HUD after meeting mode has ended',async()=>{
  const f=await fixture();await f.run('toggle');let finish;f.state.zoomReply=new Promise(resolve=>{finish=resolve;});
  const zoom=f.run('zoomIn');await f.run('toggle');await f.advance(3000);
  assert.equal(f.w.document.querySelector('#fmr-hud').hidden,true);
  finish({ok:true,zoom:1.2});await zoom;assert.equal(f.w.document.querySelector('#fmr-hud').hidden,true);f.d.window.close();
});
test('native volume leaves rapid and held keys to Chrome without preventing them or queuing zoom',async()=>{
  const f=await fixture({nativeBindings:{zoomIn:true,zoomOut:true}});await f.run('toggle');
  for(let i=0;i<12;i++){const e=f.volume(i>0,true,{metaKey:true});assert.equal(e.prevented,undefined);assert.equal(e.stopped,undefined);}
  assert.equal(f.messages.filter(m=>m.type==='zoom').length,0);f.d.window.close();
});
test('native browser zoom outside the custom range updates the HUD and supersedes a late custom reply',async()=>{
  const f=await fixture();await f.run('toggle');let finish;f.state.zoomReply=new Promise(resolve=>{finish=resolve;});const pending=f.run('zoomIn');
  await f.message({type:'meeting-zoom',zoom:3});assert.match(f.shadow.querySelector('.state').textContent,/300%/);
  finish({ok:true,zoom:1.1});await pending;assert.match(f.shadow.querySelector('.state').textContent,/300%/);f.d.window.close();
});
test('a meeting restored from back-forward cache registers Home and fullscreen again',async()=>{
  const f=await fixture();await f.run('toggle');
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide',{persisted:true}));await settle();
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));await settle();
  assert.deepEqual(f.messages.filter(m=>m.type==='presentation').map(m=>m.enabled),[true,false,true]);
  assert.equal((await f.message({type:'meeting-status'})).enabled,true);f.d.window.close();
});
test('restoring a paused page does not enter fullscreen',async()=>{
  const f=await fixture();f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));await settle();
  assert.equal(f.messages.filter(m=>m.type==='presentation').length,0);f.d.window.close();
});
test('blocked website session storage does not prevent entering or leaving a meeting',async()=>{
  const f=await fixture({},true);
  assert.equal((await f.run('toggle')).enabled,true);assert.ok(f.w.document.documentElement.hasAttribute('data-fmr-presentation'));
  assert.equal((await f.run('toggle')).enabled,false);assert.equal(f.w.document.documentElement.hasAttribute('data-fmr-presentation'),false);
  await f.advance(3000);assert.equal(f.w.document.querySelector('#fmr-hud').hidden,true);f.d.window.close();
});
test('late sidebar DOM mounts get one retry without undoing later manual sidebar changes',async()=>{
  const f=await fixture();f.state.sidebarReady=false;await f.run('toggle');assert.equal(f.state.sidebarAttempts,1);
  f.state.sidebarReady=true;f.w.document.querySelector('.suite-body').append('sidebar loaded');await f.advance(500);
  assert.equal(f.state.sidebarAttempts,2);
  f.w.document.querySelector('.suite-body').append('manual sidebar expansion');await f.advance(500);
  assert.equal(f.state.sidebarAttempts,2);f.d.window.close();
});
