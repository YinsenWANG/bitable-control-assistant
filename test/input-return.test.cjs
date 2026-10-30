const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const read=n=>fs.readFileSync(path.join(__dirname,'../extension',n),'utf8');
const settle=()=>new Promise(r=>setImmediate(r));
async function fixture(binding='Backspace'){
  const d=new JSDOM(`<div class="faster-view" tabindex="-1"></div><div id="BASE_CARD_MODAL_CONTENT_FOCUS_ID" tabindex="-1">
    <div class="bitable-record-card-field-wrapper"><span class="bitable-card-field-label__name">说明</span><textarea></textarea></div>
    <button class="bitable-discussion-add-button">评论</button><button class="bitable-card-modal-header-v2-btn-close">关闭</button>
    <div class="record-discussion-container"><div data-placeholder="评论" contenteditable="true" tabindex="0"></div><button class="bitable-discussion__reply__send-btn-wrap_new_ui">发送</button></div>
  </div>`,{url:'https://test.feishu.cn/base/Test123',runScripts:'outside-only',pretendToBeVisual:true}),w=d.window;
  let now=1000;w.Date.now=()=>now;
  w.HTMLElement.prototype.getBoundingClientRect=function(){return {width:this.closest('[hidden]')?0:400,height:60};};w.HTMLElement.prototype.scrollIntoView=function(){};
  Object.defineProperty(w.HTMLElement.prototype,'isContentEditable',{get(){return this.closest('[contenteditable]')?.getAttribute('contenteditable')==='true';}});
  for(const name of ['shared.js','adapter.js','field-navigation.js'])w.eval(read(name));
  const A=w.MeetingRemote.FeishuAdapter.prototype;A.isBasePage=()=>true;A.collapseSidebarForMeeting=async()=>{};A.restoreMeetingSidebar=async()=>{};
  const editor=w.document.querySelector('[contenteditable]'),panel=editor.parentElement,card=w.document.getElementById('BASE_CARD_MODAL_CONTENT_FOCUS_ID');
  let closeComments=0,closeDetail=0,deletes=0,sends=0;
  card.querySelector('.bitable-discussion-add-button').onclick=()=>{
    if(panel.isConnected){panel.remove();closeComments++;}
    else {card.append(panel);editor.focus();} // Native comment opening may autofocus.
  };
  card.querySelector('.bitable-card-modal-header-v2-btn-close').onclick=()=>{card.remove();closeDetail++;};
  card.querySelector('.bitable-discussion__reply__send-btn-wrap_new_ui').onclick=()=>{sends++;editor.textContent='';};
  w.document.execCommand=command=>{
    assert.equal(command,'delete');deletes++;const active=w.document.activeElement;
    if(active.matches('textarea,input'))active.value=active.value.slice(0,-1);else active.textContent=active.textContent.slice(0,-1);
    active.dispatchEvent(new w.Event('input',{bubbles:true}));return true;
  };
  let message;
  w.chrome={storage:{local:{get:async()=>({config:{bindings:{deleteBackward:binding,toggleComments:'Meta+Backslash'}}})},onChanged:{addListener(){}}},runtime:{getManifest:()=>({version:'1.5.0'}),onMessage:{addListener(fn){message=fn;}},sendMessage:async()=>({ok:true,zoom:1})}};
  const listeners={},listen=w.addEventListener.bind(w);w.addEventListener=(type,fn,...args)=>{if(!listeners[type]&&['keydown','keyup'].includes(type))listeners[type]=fn;return listen(type,fn,...args);};
  w.eval(read('dictation-relay.js'));w.eval(read('content.js'));await settle();
  async function key(code='Backspace',{repeat=false,up=true,...mods}={}){
    const e={code,key:code,repeat,isTrusted:true,target:w.document.activeElement,composedPath:()=>[],preventDefault(){this.prevented=true;},stopImmediatePropagation(){},...mods};
    listeners.keydown(e);await settle();if(up)listeners.keyup({code,isTrusted:true});return e;
  }
  await key('Digit9',{ctrlKey:true,shiftKey:true});
  message({type:'meeting-status'},{},status=>assert.equal(status.enabled,true,'fixture must enter meeting mode'));
  await new Promise(resolve=>message({type:'meeting-action',action:'openComments'},{},resolve));
  // Each scenario starts after an intentional comment opening; native default
  // comments may have been collapsed during meeting startup.
  closeComments=0;closeDetail=0;deletes=0;sends=0;
  return {w,d,editor,panel,card,key,tick:ms=>{now+=ms;},counts:()=>({closeComments,closeDetail,deletes,sends})};
}
test('repeated and held native Backspace always stays in empty comment and field editors',async()=>{
  const f=await fixture();
  for(const editor of [f.editor,f.card.querySelector('textarea')]){
    editor.focus();
    for(const delay of [0,100,200,600,0]){
      f.tick(delay);assert.equal((await f.key()).prevented,undefined);assert.equal(f.w.document.activeElement,editor);
    }
    assert.equal((await f.key('Backspace',{repeat:true})).prevented,undefined);
    assert.equal(f.w.document.activeElement,editor);
  }
  assert.deepEqual(f.counts(),{closeComments:0,closeDetail:0,deletes:0,sends:0});f.w.close();
});
test('deleting the final character does not turn later Backspaces into navigation',async()=>{
  const f=await fixture();f.editor.textContent='字';assert.equal((await f.key()).prevented,undefined);
  f.editor.textContent='';f.editor.dispatchEvent(new f.w.Event('input',{bubbles:true}));
  for(let i=0;i<4;i++){f.tick(50);assert.equal((await f.key()).prevented,undefined);}
  assert.equal(f.w.document.activeElement,f.editor);assert.equal(f.panel.isConnected,true);assert.equal(f.card.isConnected,true);f.w.close();
});
test('custom deletion chords delete text but never leave an empty editor, even with a popup open',async()=>{
  const f=await fixture('Alt+KeyB');
  const popup=f.w.document.createElement('div');popup.setAttribute('role','listbox');f.card.append(popup);
  for(const editor of [f.editor,f.card.querySelector('textarea')]){
    editor.focus();if(editor.matches('textarea'))editor.value='字';else editor.textContent='字';
    assert.equal((await f.key('KeyB',{altKey:true})).prevented,true);
    for(let i=0;i<4;i++){f.tick(50);await f.key('KeyB',{altKey:true,repeat:i>1});}
    assert.equal(f.w.document.activeElement,editor);
    assert.equal(editor.matches('textarea')?editor.value:editor.textContent,'');
  }
  assert.deepEqual(f.counts(),{closeComments:0,closeDetail:0,deletes:2,sends:0});f.w.close();
});
test('outside input, distinct presses return one level; held or missing-keyup presses cannot cascade',async()=>{
  const f=await fixture();f.card.focus();await f.key('Backspace',{up:false});assert.equal(f.counts().closeComments,1);
  for(const repeat of [false,true,true]){await f.key('Backspace',{up:false,repeat});assert.equal(f.card.isConnected,true);}
  await f.key('Backspace',{repeat:true});await f.key();assert.equal(f.counts().closeDetail,1);f.w.close();
});
test('a held deletion cannot start navigating when focus moves out of an editor',async()=>{
  const f=await fixture();await f.key('Backspace',{up:false});f.card.focus();
  await f.key('Backspace',{up:false});assert.equal(f.counts().closeComments,0);
  await f.key('Backspace',{repeat:true});await f.key();assert.equal(f.counts().closeComments,1);f.w.close();
});
test('menu opens comments in browse mode, OK enters input, and a later OK sends',async()=>{
  const f=await fixture();f.panel.remove();f.card.focus();
  await f.key('ArrowDown');assert.equal(f.w.document.activeElement,f.card.querySelector('.bitable-record-card-field-wrapper'));
  await f.key('Backslash',{metaKey:true});assert.equal(f.panel.isConnected,true);
  assert.equal(f.w.document.activeElement,f.card.querySelector('.bitable-discussion-add-button'));
  assert.equal(f.counts().sends,0);await f.key('Enter');assert.equal(f.w.document.activeElement,f.editor);
  f.editor.textContent='虚构的测试评论';await f.key('Enter');assert.equal(f.counts().sends,1);f.w.close();
});
test('menu exits input and preserves the same draft; reopening does not reactivate input',async()=>{
  const f=await fixture();f.editor.textContent='保留草稿';await f.key('Backslash',{metaKey:true});
  assert.equal(f.panel.hidden,true);assert.notEqual(f.w.document.activeElement,f.editor);
  await f.key('Backslash',{metaKey:true});assert.equal(f.panel.hidden,false);assert.notEqual(f.w.document.activeElement,f.editor);
  assert.equal(f.editor.textContent,'保留草稿');await f.key('Enter');assert.equal(f.w.document.activeElement,f.editor);assert.equal(f.counts().sends,0);f.w.close();
});
test('the configurable voice-preparation action opens and focuses comments directly',async()=>{
  const f=await fixture();f.panel.remove();f.card.focus();await f.key('KeyC',{ctrlKey:true,shiftKey:true});
  assert.equal(f.panel.isConnected,true);assert.equal(f.w.document.activeElement,f.editor);
  f.editor.textContent='尚未发送';await f.key('KeyC',{ctrlKey:true,shiftKey:true});assert.equal(f.editor.textContent,'尚未发送');assert.equal(f.counts().sends,0);f.w.close();
});
test('Escape remains an explicit way to leave input; Backspace returns only after that',async()=>{
  const f=await fixture();await f.key('Escape');assert.notEqual(f.w.document.activeElement,f.editor);assert.equal(f.counts().closeComments,0);
  await f.key();assert.equal(f.counts().closeComments,1);await f.key();assert.equal(f.counts().closeDetail,1);f.w.close();
});
test('native arrows and IME composition remain with the input method',async()=>{
  const f=await fixture();
  for(const code of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'])assert.equal((await f.key(code)).prevented,undefined);
  f.editor.dispatchEvent(new f.w.Event('compositionstart',{bubbles:true}));
  assert.equal((await f.key()).prevented,undefined);assert.equal((await f.key('Enter',{isComposing:true})).prevented,undefined);
  f.editor.dispatchEvent(new f.w.Event('compositionend',{bubbles:true}));assert.equal((await f.key('Enter')).prevented,undefined);
  assert.equal(f.w.document.activeElement,f.editor);assert.equal(f.counts().sends,0);f.w.close();
});
