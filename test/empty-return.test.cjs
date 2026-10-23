const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const read=n=>fs.readFileSync(path.join(__dirname,'../extension',n),'utf8');
const settle=()=>new Promise(r=>setImmediate(r));
async function fixture(binding='Backspace'){
  const d=new JSDOM('<div id="BASE_CARD_MODAL_CONTENT_FOCUS_ID" tabindex="-1"><div class="record-discussion-container"><div data-placeholder="评论" contenteditable="true" tabindex="0"></div></div><textarea></textarea></div>',{url:'https://test.feishu.cn/base/Test123',runScripts:'outside-only',pretendToBeVisual:true}),w=d.window;
  let now=1000;w.Date.now=()=>now;
  w.HTMLElement.prototype.getBoundingClientRect=()=>({width:400,height:60});w.HTMLElement.prototype.scrollIntoView=function(){};
  Object.defineProperty(w.HTMLElement.prototype,'isContentEditable',{get(){return this.closest('[contenteditable]')?.getAttribute('contenteditable')==='true';}});
  const listeners={},listen=w.addEventListener.bind(w);w.addEventListener=(type,fn,...args)=>{if(!listeners[type]&&['keydown','keyup'].includes(type))listeners[type]=fn;return listen(type,fn,...args);};
  for(const name of ['shared.js','adapter.js','field-navigation.js'])w.eval(read(name));
  const A=w.MeetingRemote.FeishuAdapter.prototype;A.isBasePage=()=>true;A.collapseSidebarForMeeting=async()=>{};A.restoreMeetingSidebar=async()=>{};
  let closeComments=0,closeDetail=0;A.closeComments=async function(){closeComments++;this.editor().parentElement.remove();};A.closeDetail=async function(){closeDetail++;this.card().remove();};
  w.chrome={storage:{local:{get:async()=>({config:{bindings:{deleteBackward:binding}}})},onChanged:{addListener(){}}},runtime:{getManifest:()=>({version:'1.4.1'}),onMessage:{addListener(){}},sendMessage:async()=>({ok:true,zoom:1})}};
  w.eval(read('content.js'));await settle();
  const editor=w.document.querySelector('[contenteditable]');
  async function key(code='Backspace',{repeat=false,up=true,...mods}={}){
    const e={code,key:code,repeat,isTrusted:true,target:w.document.activeElement,composedPath:()=>[],preventDefault(){this.prevented=true;},stopImmediatePropagation(){},...mods};
    listeners.keydown(e);await settle();if(up)listeners.keyup({code,isTrusted:true});return e;
  }
  await key('Digit9',{ctrlKey:true,shiftKey:true});editor.focus();
  return {w,d,editor,key,tick:ms=>{now+=ms;},counts:()=>({closeComments,closeDetail})};
}
test('one empty Backspace keeps input; two released presses within 500ms leave exactly one level',async()=>{
  const f=await fixture();await f.key();assert.equal(f.w.document.activeElement,f.editor);
  f.tick(300);await f.key();assert.notEqual(f.w.document.activeElement,f.editor);assert.deepEqual(f.counts(),{closeComments:0,closeDetail:0});
  await f.key();assert.equal(f.counts().closeComments,1);await f.key();assert.equal(f.counts().closeDetail,1);f.w.close();
});
test('a slow second press starts a new confirmation window',async()=>{
  const f=await fixture();await f.key();f.tick(501);await f.key();assert.equal(f.w.document.activeElement,f.editor);
  f.tick(100);await f.key();assert.notEqual(f.w.document.activeElement,f.editor);f.w.close();
});
test('deleting the last character does not count as the first empty confirmation',async()=>{
  const f=await fixture();f.editor.textContent='字';const e=await f.key();assert.equal(e.prevented,undefined);
  f.editor.textContent='';f.editor.dispatchEvent(new f.w.Event('input',{bubbles:true}));await f.key();assert.equal(f.w.document.activeElement,f.editor);
  f.tick(100);await f.key();assert.notEqual(f.w.document.activeElement,f.editor);f.w.close();
});
test('holding delete or missing keyup cannot confirm or cascade through return levels',async()=>{
  const f=await fixture();await f.key('Backspace',{up:false});
  for(let i=0;i<3;i++){f.tick(30);await f.key('Backspace',{up:false,repeat:i!==0});assert.equal(f.w.document.activeElement,f.editor);}
  await f.key('Backspace',{repeat:true});await f.key();assert.equal(f.w.document.activeElement,f.editor);await f.key();assert.notEqual(f.w.document.activeElement,f.editor);
  await f.key('Backspace',{repeat:true});assert.deepEqual(f.counts(),{closeComments:0,closeDetail:0});f.w.close();
});
test('focus changes, input, pointer, composition, blur and another key cancel the first confirmation',async()=>{
  for(const trigger of ['focus','input','pointerdown','compositionstart','blur','otherKey']){
    const f=await fixture();await f.key();
    if(trigger==='focus'){f.w.document.querySelector('textarea').focus();f.editor.focus();}
    else if(trigger==='otherKey')await f.key('ArrowLeft');
    else {f.editor.dispatchEvent(new f.w.Event(trigger,{bubbles:true}));if(trigger==='compositionstart')f.editor.dispatchEvent(new f.w.Event('compositionend',{bubbles:true}));}
    await f.key();assert.equal(f.w.document.activeElement,f.editor,trigger);await f.key();assert.notEqual(f.w.document.activeElement,f.editor,trigger);f.w.close();
  }
});
test('custom Backspace chord uses the same two-press rule in a normal textarea',async()=>{
  const f=await fixture('Alt+KeyB'),e=f.w.document.querySelector('textarea');e.focus();
  await f.key('KeyB',{altKey:true});assert.equal(f.w.document.activeElement,e);f.tick(200);await f.key('KeyB',{altKey:true});assert.notEqual(f.w.document.activeElement,e);f.w.close();
});
