const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../extension'),read=n=>fs.readFileSync(path.join(root,n),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(config={}){
  const d=new JSDOM('<main class="app-main"><header class="navigation-bar-wrapper">文档路径、分享和自动化</header><section class="suite-body">表格</section></main>',{url:'https://example.feishu.cn/base/ExampleBase',runScripts:'outside-only',pretendToBeVisual:true}),w=d.window;
  let now=0,next=1,keydown,listener,shadow;const timers=new Map(),messages=[],state={base:true,draft:false};
  w.setTimeout=(fn,delay=0)=>{const id=next++;timers.set(id,{fn,at:now+delay});return id;};w.clearTimeout=id=>timers.delete(id);
  async function advance(ms){const end=now+ms;while(true){await settle();const entry=[...timers].sort((a,b)=>a[1].at-b[1].at).find(([,t])=>t.at<=end);if(!entry)break;now=entry[1].at;timers.delete(entry[0]);entry[1].fn();}now=end;await settle();}
  const listen=w.addEventListener.bind(w);w.addEventListener=(type,fn,...args)=>{if(type==='keydown'&&!keydown)keydown=fn;return listen(type,fn,...args);};
  const attach=w.HTMLElement.prototype.attachShadow;w.HTMLElement.prototype.attachShadow=function(options){const result=attach.call(this,options);if(this.id==='fmr-hud')shadow=result;return result;};
  w.eval(read('shared.js'));
  w.MeetingRemote.FeishuAdapter=class {
    isBasePage(){return state.base;}card(){return null;}state(){return '记录列表';}viewName(){return '示例视图';}hasDraft(){return state.draft;}
    guardDraft(){if(state.draft)throw new Error('请先处理评论草稿');}async ensureSelection(){}restoreHidden(){}clearFieldFocus(){}async collapseSidebarForMeeting(){}async restoreMeetingSidebar(){}
    inputContext(){throw new Error('Volume keys must not inspect editor layout');}editorPopupOpen(){throw new Error('Volume keys must not inspect popup layout');}
  };
  w.chrome={storage:{local:{get:async()=>({config:w.MeetingRemote.config(config)})},onChanged:{addListener(){}}},runtime:{getManifest:()=>({version:'1.2.0'}),onMessage:{addListener(fn){listener=fn;}},sendMessage:async msg=>{messages.push(msg);if(msg.type==='zoom'&&state.zoomReply)return state.zoomReply;return {ok:true,zoom:1.5};}}};
  w.eval(read('content.js'));await settle();
  const run=action=>new Promise(resolve=>listener({type:'meeting-action',action},{},resolve));
  function volume(repeat=false,onHud=false){const e={isTrusted:true,code:'Equal',ctrlKey:true,shiftKey:true,repeat,composedPath:()=>onHud?[shadow.querySelector('button'),w.document.querySelector('#fmr-hud')]:[],preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};keydown(e);return e;}
  return {d,w,state,messages,advance,run,volume,get shadow(){return shadow;}};
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
