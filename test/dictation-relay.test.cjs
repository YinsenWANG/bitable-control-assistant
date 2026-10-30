const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),M=require('../extension/shared.js');
const read=n=>fs.readFileSync(path.join(__dirname,'../extension',n),'utf8'),settle=()=>new Promise(r=>setImmediate(r));
async function fixture({voiceRelay=true,meeting=true,drawer=false,counter=false,autoCloseComments=true,commentCloseDelay=1}={}){
  const d=new JSDOM(`<div class="faster-view" tabindex="-1"></div>${drawer?'<div role="dialog" aria-modal="true" tabindex="-1">':''}<div id="BASE_CARD_MODAL_CONTENT_FOCUS_ID" tabindex="-1">
    <div class="bitable-record-card-field-wrapper"><span class="bitable-card-field-label__name">说明</span><div id="BITABLE_TEXT_EDITOR_CONTAINER_ID_PREFIX_recVoice1_fldTitle"><textarea>字段原文</textarea></div></div>
    <button class="bitable-discussion-add-button">评论</button><button class="bitable-card-modal-header-v2-btn-close">关闭</button>
    <div class="record-discussion-container" hidden>${counter?'<span class="record-discussion-header-text">评论 (2)</span>':''}<div contenteditable="true" tabindex="0" data-placeholder="评论"></div><button class="bitable-discussion__reply__send-btn-wrap_new_ui">发送</button></div>
  </div>${drawer?'</div>':''}`,{url:'https://test.feishu.cn/base/Test123',runScripts:'outside-only',pretendToBeVisual:true}),w=d.window;
  let now=1000,next=1,message,storageChanged;const timers=new Map(),keys={},receiverEvents=new Map(),state={visible:true,focused:true,base:true,inserts:0,sends:0,failInsert:false,commentCount:2};
  w.Date.now=()=>now;w.setTimeout=(fn,delay=0)=>{const id=next++;timers.set(id,{fn,at:now+delay});return id;};w.clearTimeout=id=>timers.delete(id);
  Object.defineProperty(w.document,'hidden',{get:()=>!state.visible});w.document.hasFocus=()=>state.focused;
  w.HTMLElement.prototype.getBoundingClientRect=function(){return {width:this.closest('[hidden]')?0:400,height:this.closest('[hidden]')?0:80};};w.HTMLElement.prototype.scrollIntoView=function(){};
  Object.defineProperty(w.HTMLElement.prototype,'isContentEditable',{get(){return this.closest('[contenteditable]')?.getAttribute('contenteditable')==='true';}});
  for(const name of ['shared.js','adapter.js','field-navigation.js','dictation-relay.js'])w.eval(read(name));
  const A=w.MeetingRemote.FeishuAdapter.prototype;A.isBasePage=()=>state.base;A.collapseSidebarForMeeting=async()=>{};A.restoreMeetingSidebar=async()=>{};A.ensureSelection=async()=>{};
  const card=w.document.getElementById('BASE_CARD_MODAL_CONTENT_FOCUS_ID'),panel=card.querySelector('.record-discussion-container'),editor=panel.querySelector('[contenteditable]');
  card.querySelector('.bitable-discussion-add-button').onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden)editor.focus();};
  card.querySelector('.bitable-card-modal-header-v2-btn-close').onclick=()=>{card.hidden=true;};
  panel.querySelector('button').onclick=()=>{
    state.sends++;if(state.failSend)return;editor.textContent='';
    const header=panel.querySelector('.record-discussion-header-text');
    if(header&&!state.suppressConfirmation){const confirm=()=>{header.textContent='评论 ('+(++state.commentCount)+')';};if(state.confirmDelay)w.setTimeout(confirm,state.confirmDelay);else confirm();}
  };
  w.document.execCommand=(command,_ui,text)=>{assert.equal(command,'insertText');state.inserts++;if(state.failInsert)return false;const before=editor.textContent;editor.textContent+=text;if(state.resetAfterInsert)w.setTimeout(()=>{editor.textContent=before;},0);editor.dispatchEvent(new w.Event('input',{bubbles:true}));return true;};
  w.chrome={storage:{local:{get:async()=>({config:{schemaVersion:7,voiceRelay,autoCloseComments,commentCloseDelay}})},onChanged:{addListener(fn){storageChanged=fn;}}},runtime:{getManifest:()=>({version:'1.5.0'}),onMessage:{addListener(fn){message=fn;}},sendMessage:async msg=>msg.type==='presentation'&&state.presentationReply?state.presentationReply:({ok:true,zoom:1})}};
  let commentPointer;const listenDocument=w.document.addEventListener.bind(w.document);
  w.document.addEventListener=(type,fn,...args)=>{if(type==='pointerdown'&&!commentPointer)commentPointer=fn;return listenDocument(type,fn,...args);};
  const listen=w.addEventListener.bind(w);w.addEventListener=(type,fn,...args)=>{if(['keydown','keyup'].includes(type)&&!keys[type])keys[type]=fn;return listen(type,fn,...args);};
  const add=w.EventTarget.prototype.addEventListener;w.EventTarget.prototype.addEventListener=function(type,fn,...args){if(this.hasAttribute?.('data-fmr-dictation')){if(!receiverEvents.has(this))receiverEvents.set(this,{});receiverEvents.get(this)[type]=fn;}return add.call(this,type,fn,...args);};
  w.eval(read('content.js'));await settle();
  const run=action=>new Promise(resolve=>message({type:'meeting-action',action},{},resolve));
  async function advance(ms){const end=now+ms;while(true){await settle();const entry=[...timers].sort((a,b)=>a[1].at-b[1].at).find(([,t])=>t.at<=end);if(!entry)break;now=entry[1].at;timers.delete(entry[0]);entry[1].fn();}now=end;await settle();}
  const proxy=()=>w.document.querySelector('[data-fmr-dictation]');
  async function input(type,text,{trusted=true,isComposing=false}={}){
    const p=proxy();assert.ok(p,'receiver must be armed');if(text!==undefined)p.value=text;
    p.dispatchEvent(new w.Event(type,{bubbles:true}));
    receiverEvents.get(p)[type]?.({isTrusted:trusted,isComposing,target:p,type,stopPropagation(){}});await settle();
  }
  async function utter(text){await input('compositionstart');await input('input',text,{isComposing:true});await input('compositionend');await advance(350);}
  async function key(code,mods={}){const e={code,key:code,isTrusted:true,target:w.document.activeElement,composedPath:()=>[],preventDefault(){this.prevented=true;},stopImmediatePropagation(){},...mods};keys.keydown(e);await settle();keys.keyup({code,isTrusted:true});return e;}
  if(drawer)card.closest('[role="dialog"]').focus();
  if(meeting)await run('toggle');
  return {d,w,card,panel,editor,state,proxy,input,utter,key,run,advance,
    nativeComments(){const button=card.querySelector('.bitable-discussion-add-button');commentPointer({isTrusted:true,target:button});button.click();},
    changeConfig(value){storageChanged({config:{newValue:{schemaVersion:7,voiceRelay:value,autoCloseComments,commentCloseDelay}}},'local');},
    changeSettings(changes){storageChanged({config:{newValue:{schemaVersion:7,voiceRelay,autoCloseComments,commentCloseDelay,...changes}}},'local');}
  };
}
async function openFreshDetail(f,{comments=false,draft=''}={}){
  f.card.remove();await settle();f.panel.hidden=!comments;f.editor.textContent=draft;
  f.w.document.body.append(f.card);await settle();
}
test('the relay is opt-in and old custom shortcuts survive the new configuration',()=>{
  const old=M.config({schemaVersion:6,bindings:{toggleComments:'Meta+Backslash'}});assert.equal(old.voiceRelay,false);assert.equal(old.bindings.toggleComments,'Meta+Backslash');
  const c=M.config({...old,voiceRelay:true});assert.deepEqual(M.config(c),c);
});
test('entering a detail collapses Feishu default comments and still accepts voice',async()=>{
  const f=await fixture();await openFreshDetail(f,{comments:true});
  assert.equal(f.panel.hidden,true);assert.equal(f.w.document.activeElement,f.proxy());
  await f.utter('重新展开并输入语音');assert.equal(f.panel.hidden,false);assert.equal(f.editor.textContent,'重新展开并输入语音');assert.equal(f.state.sends,0);f.w.close();
});
test('late native comments stay collapsed even after field browsing or a later redraw',async()=>{
  const f=await fixture();await openFreshDetail(f);f.panel.hidden=false;f.panel.append(f.w.document.createElement('span'));await settle();
  assert.equal(f.panel.hidden,true);await f.key('ArrowDown');await f.advance(5000);f.panel.hidden=false;await settle();
  assert.equal(f.panel.hidden,true);f.w.close();
});
test('the first detail opened during meeting startup is collapsed after fullscreen is ready',async()=>{
  const f=await fixture({meeting:false});f.card.remove();await settle();let finish;
  f.state.presentationReply=new Promise(resolve=>{finish=resolve;});const entering=f.run('toggle');await settle();
  f.panel.hidden=false;f.w.document.body.append(f.card);await settle();assert.equal(f.panel.hidden,false);
  finish({ok:true});await entering;await settle();assert.equal(f.panel.hidden,true);f.w.close();
});
test('native autofocus on an empty comment is not mistaken for an intentional comment action',async()=>{
  const f=await fixture();f.card.remove();await settle();f.panel.hidden=false;f.w.document.body.append(f.card);f.editor.focus();await settle();
  assert.equal(f.panel.hidden,true);assert.equal(f.w.document.activeElement,f.proxy());f.w.close();
});
test('a native comment button click keeps the panel open and preserves its input focus',async()=>{
  const f=await fixture();await openFreshDetail(f);f.nativeComments();await settle();
  assert.equal(f.panel.hidden,false);assert.equal(f.w.document.activeElement,f.editor);
  f.panel.append(f.w.document.createElement('span'));await f.advance(5000);assert.equal(f.panel.hidden,false);f.w.close();
});
test('opening comments manually after entering detail is never undone by late changes',async()=>{
  const f=await fixture();await openFreshDetail(f);await f.run('toggleComments');
  assert.equal(f.panel.hidden,false);f.panel.append(f.w.document.createElement('span'));await settle();assert.equal(f.panel.hidden,false);f.w.close();
});
test('opening comments directly from the record list keeps them open',async()=>{
  for(const action of ['toggleComments','openComments']){
    const f=await fixture();f.card.remove();await settle();
    f.w.MeetingRemote.FeishuAdapter.prototype.openDetail=async()=>{f.w.document.body.append(f.card);await settle();};
    assert.equal((await f.run(action)).ok,true);assert.equal(f.panel.hidden,false,action);
    f.panel.append(f.w.document.createElement('span'));await settle();assert.equal(f.panel.hidden,false,action);f.w.close();
  }
});
test('existing drafts are preserved while empty native comments are collapsed on meeting entry',async()=>{
  const draft=await fixture();await openFreshDetail(draft,{comments:true,draft:'原有草稿'});
  assert.equal(draft.panel.hidden,false);assert.equal(draft.editor.textContent,'原有草稿');draft.w.close();
  const paused=await fixture({meeting:false});await openFreshDetail(paused,{comments:true});assert.equal(paused.panel.hidden,false);
  await paused.run('toggle');await settle();assert.equal(paused.panel.hidden,true);paused.w.close();
});
test('entering meeting mode preserves an empty comment editor the user is already using',async()=>{
  const f=await fixture({meeting:false});f.panel.hidden=false;f.editor.focus();await settle();
  await f.run('toggle');await settle();assert.equal(f.panel.hidden,false);assert.equal(f.w.document.activeElement,f.editor);
  assert.equal((await f.key('Backspace')).prevented,undefined);assert.equal(f.w.document.activeElement,f.editor);f.w.close();
});
test('replacing an open card during record navigation keeps its comment state',async()=>{
  const f=await fixture();await f.run('toggleComments');const replacement=f.card.cloneNode(true);
  f.card.replaceWith(replacement);await settle();assert.equal(replacement.querySelector('.record-discussion-container').hidden,false);f.w.close();
});
test('voice is ready when Feishu initially focuses the outer record drawer',async()=>{
  const f=await fixture({drawer:true});assert.ok(f.proxy());assert.equal(f.w.document.activeElement,f.proxy());
  const other=f.w.document.createElement('div');other.setAttribute('role','dialog');other.setAttribute('aria-modal','true');other.tabIndex=-1;f.w.document.body.append(other);other.focus();await settle();
  assert.equal(f.w.document.activeElement,other,'an unrelated dialog must keep its focus');
  f.card.closest('[role="dialog"]').focus();await settle();assert.equal(f.w.document.activeElement,f.proxy());
  await f.utter('详情外层也能接入');assert.equal(f.editor.textContent,'详情外层也能接入');assert.equal(f.state.sends,0);f.w.close();
});
test('a native-style dictation session opens comments once with the final corrected transcript',async()=>{
  const f=await fixture();assert.equal(f.w.document.activeElement,f.proxy());assert.equal(f.panel.hidden,true);
  await f.input('compositionstart');await f.input('input','初稿',{isComposing:true});await f.advance(900);assert.equal(f.panel.hidden,true);
  await f.input('input','最后修正的语音文字。',{isComposing:true});await f.input('compositionend');await f.advance(349);assert.equal(f.panel.hidden,true);await f.advance(1);
  assert.equal(f.editor.textContent,'最后修正的语音文字。');assert.equal(f.w.document.activeElement,f.editor);assert.equal(f.state.inserts,1);assert.equal(f.state.sends,0);assert.equal(f.proxy().value,'');f.w.close();
});
test('a synthetic composition end can finish text received from a trusted input method',async()=>{
  const f=await fixture();await f.input('compositionstart');await f.input('input','语音识别完成',{isComposing:true});
  await f.input('compositionend',undefined,{trusted:false});await f.advance(350);
  assert.equal(f.editor.textContent,'语音识别完成');assert.equal(f.state.inserts,1);assert.equal(f.state.sends,0);f.w.close();
});
test('a synthetic composition end cannot inject or replace trusted speech text',async()=>{
  const f=await fixture();await f.input('compositionend','页面伪造',{trusted:false});await f.advance(400);
  assert.equal(f.state.inserts,0);f.proxy().value='';
  await f.input('compositionstart');await f.input('input','原始语音',{isComposing:true});
  await f.input('compositionend','页面替换',{trusted:false});await f.advance(400);
  assert.equal(f.state.inserts,0);assert.equal(f.editor.textContent,'');f.w.close();
});
test('new trusted composing input postpones an early synthetic composition end',async()=>{
  const f=await fixture();await f.input('compositionstart');await f.input('input','前半句',{isComposing:true});
  await f.input('compositionend',undefined,{trusted:false});await f.advance(100);
  await f.input('input','前半句和后半句',{isComposing:true});await f.advance(600);assert.equal(f.state.inserts,0);
  await f.input('compositionend',undefined,{trusted:false});await f.advance(350);
  assert.equal(f.editor.textContent,'前半句和后半句');assert.equal(f.state.inserts,1);f.w.close();
});
test('pauses during composition do not commit interim text or duplicate the final revision',async()=>{
  const f=await fixture();await f.input('compositionstart');
  for(const text of ['第一句','第一句，第二句','第一句，第二句修正。']){await f.input('input',text,{isComposing:true});await f.advance(1000);assert.equal(f.state.inserts,0);}
  await f.input('compositionend');await f.advance(350);assert.equal(f.editor.textContent,'第一句，第二句修正。');assert.equal(f.state.inserts,1);f.w.close();
});
test('menu retains a hidden draft and the next dictation appends instead of replacing it',async()=>{
  const f=await fixture();await f.utter('已有草稿。');await f.key('PageDown');assert.equal(f.panel.hidden,true);assert.equal(f.w.document.activeElement,f.proxy());
  await f.utter('下一段🙂\n第二行');assert.equal(f.editor.textContent,'已有草稿。下一段🙂\n第二行');assert.equal(f.state.inserts,2);assert.equal(f.state.sends,0);f.w.close();
});
test('browse arrows and OK keep field operations while the passive receiver is armed',async()=>{
  const f=await fixture();await f.key('ArrowDown');assert.ok(f.card.querySelector('[data-fmr-focused]'));assert.equal(f.w.document.activeElement,f.proxy());
  await f.key('Enter');assert.equal(f.w.document.activeElement,f.card.querySelector('textarea'));assert.equal(f.panel.hidden,true);assert.equal(f.card.querySelector('textarea').value,'字段原文');f.w.close();
});
test('menu opens comments without activating its editor; browse Backspace closes one level',async()=>{
  const f=await fixture();await f.key('PageDown');assert.equal(f.panel.hidden,false);assert.equal(f.w.document.activeElement,f.proxy());
  await f.key('Backspace');assert.equal(f.panel.hidden,true);assert.equal(f.card.hidden,false);
  await f.key('Backspace');assert.equal(f.card.hidden,true);f.w.close();
});
test('an explicit comment editor stays active and its empty Backspace remains native',async()=>{
  const f=await fixture();await f.run('openComments');assert.equal(f.w.document.activeElement,f.editor);
  for(let i=0;i<3;i++){const e=await f.key('Backspace');assert.equal(e.prevented,undefined);assert.equal(f.w.document.activeElement,f.editor);}
  assert.equal(f.panel.hidden,false);assert.equal(f.state.inserts,0);f.w.close();
});
test('a confirmed OK send closes comments one second after the comment is confirmed',async()=>{
  const f=await fixture({counter:true});await f.utter('一条评论');f.state.confirmDelay=400;
  await f.key('Enter');assert.equal(f.state.sends,1);assert.equal(f.panel.hidden,false);
  await f.advance(399);assert.equal(f.panel.hidden,false);await f.advance(1);
  await f.advance(999);assert.equal(f.panel.hidden,false);await f.advance(1);
  assert.equal(f.panel.hidden,true);assert.equal(f.card.hidden,false);assert.equal(f.state.commentCount,3);f.w.close();
});
test('automatic close can be turned off without affecting sending',async()=>{
  const f=await fixture({autoCloseComments:false});await f.utter('保留评论面板');await f.key('Enter');await f.advance(3000);
  assert.equal(f.state.sends,1);assert.equal(f.panel.hidden,false);assert.equal(f.editor.textContent,'');f.w.close();
});
test('configured delays include immediate, fractional-second and maximum closing times',async()=>{
  for(const delay of [0,0.5,2.5,60]){
    const f=await fixture({commentCloseDelay:delay});await f.utter('可配置间隔');await f.key('Enter');
    if(delay){await f.advance(delay*1000-1);assert.equal(f.panel.hidden,false);await f.advance(1);}
    else await f.advance(0);
    assert.equal(f.panel.hidden,true,`${delay} 秒后应收起`);f.w.close();
  }
});
test('disabling or changing the delay cancels an already pending close; the next send uses new settings',async()=>{
  for(const change of [{autoCloseComments:false,commentCloseDelay:2},{autoCloseComments:true,commentCloseDelay:3}]){
    const f=await fixture({commentCloseDelay:2});await f.utter('第一条');await f.key('Enter');await f.advance(200);
    f.changeSettings(change);await f.advance(3000);assert.equal(f.panel.hidden,false);
    f.changeSettings({autoCloseComments:true,commentCloseDelay:0.5});f.editor.focus();f.editor.textContent='第二条';await f.key('Enter');
    await f.advance(499);assert.equal(f.panel.hidden,false);await f.advance(1);assert.equal(f.panel.hidden,true);f.w.close();
  }
});
test('unrelated settings updates do not cancel a pending close',async()=>{
  const f=await fixture();await f.utter('保持计划');await f.key('Enter');f.changeSettings({showHud:false});await f.advance(1000);
  assert.equal(f.panel.hidden,true);f.w.close();
});
test('disabling automatic close before the send is confirmed prevents scheduling it',async()=>{
  const f=await fixture({counter:true});await f.utter('慢速发送');f.state.confirmDelay=400;await f.key('Enter');await f.advance(100);
  f.changeSettings({autoCloseComments:false});await f.advance(2000);assert.equal(f.state.commentCount,3);assert.equal(f.panel.hidden,false);f.w.close();
});
test('an unsuccessful send retains the draft and keeps comments open',async()=>{
  const f=await fixture();await f.utter('待发送草稿');f.state.failSend=true;const sending=f.run('confirm');await f.advance(5000);
  assert.equal((await sending).ok,false);assert.equal(f.state.sends,1);assert.equal(f.editor.textContent,'待发送草稿');assert.equal(f.panel.hidden,false);f.w.close();
});
test('an emptied editor without an updated native comment count is not treated as a confirmed send',async()=>{
  const f=await fixture({counter:true});await f.utter('尚未确认');f.state.suppressConfirmation=true;const sending=f.run('confirm');await f.advance(5000);
  assert.equal((await sending).ok,false);assert.equal(f.state.sends,1);assert.equal(f.state.commentCount,2);assert.equal(f.panel.hidden,false);f.w.close();
});
test('new input or composition during the one-second delay prevents automatic closure',async()=>{
  for(const mode of ['new-draft','composition']){
    const f=await fixture();await f.utter('第一条');await f.key('Enter');
    if(mode==='new-draft'){f.editor.textContent='下一条草稿';f.editor.dispatchEvent(new f.w.InputEvent('beforeinput',{bubbles:true}));}
    else f.editor.dispatchEvent(new f.w.CompositionEvent('compositionstart',{bubbles:true}));
    await f.advance(1200);assert.equal(f.panel.hidden,false);if(mode==='new-draft')assert.equal(f.editor.textContent,'下一条草稿');f.w.close();
  }
});
test('manually reopening comments or switching records cancels the previous auto-close',async()=>{
  for(const mode of ['reopen','record']){
    const f=await fixture();await f.utter('已发送');await f.key('Enter');
    if(mode==='reopen'){await f.key('PageDown');assert.equal(f.panel.hidden,true);await f.key('PageDown');assert.equal(f.panel.hidden,false);}
    else f.card.querySelector('[id^="BITABLE_TEXT_EDITOR_CONTAINER_ID_PREFIX_"]').id='BITABLE_TEXT_EDITOR_CONTAINER_ID_PREFIX_recVoice2_fldTitle';
    await f.advance(1200);assert.equal(f.panel.hidden,false);f.w.close();
  }
});
test('leaving meeting mode cancels a pending auto-close',async()=>{
  const f=await fixture();await f.utter('发出后退出');await f.key('Enter');await f.run('toggle');await f.advance(1200);
  assert.equal(f.state.sends,1);assert.equal(f.panel.hidden,false);f.w.close();
});
test('disabling or pausing removes an empty receiver without stealing a real field editor',async()=>{
  for(const scenario of ['disabled','paused','field']){
    const f=await fixture();
    if(scenario==='disabled')f.changeConfig(false);
    if(scenario==='paused')await f.run('toggle');
    if(scenario==='field'){await f.key('ArrowDown');await f.key('Enter');f.w.document.dispatchEvent(new f.w.Event('focusin',{bubbles:true}));await settle();}
    if(scenario==='field')assert.equal(f.w.document.activeElement,f.card.querySelector('textarea'));else assert.equal(f.proxy(),null);
    assert.equal(f.panel.hidden,true);f.w.close();
  }
});
test('pending dictation protects navigation and cannot be sent prematurely',async()=>{
  const f=await fixture();await f.input('compositionstart');await f.input('input','仍在识别',{isComposing:true});
  for(const action of ['nextRecord','firstView','closeDetail','confirm','sendComment'])assert.equal((await f.run(action)).ok,false,action);
  assert.equal(f.state.sends,0);assert.equal(f.state.inserts,0);assert.equal(f.card.hidden,false);f.w.close();
});
test('a forced record change preserves the transcript and never writes it into another record',async()=>{
  const f=await fixture();await f.input('compositionstart');await f.input('input','只属于原记录',{isComposing:true});await f.input('compositionend');
  f.card.querySelector('[id^="BITABLE_TEXT_EDITOR_CONTAINER_ID_PREFIX_"]').id='BITABLE_TEXT_EDITOR_CONTAINER_ID_PREFIX_recVoice2_fldTitle';await f.advance(350);
  assert.equal(f.editor.textContent,'');assert.equal(f.proxy().value,'只属于原记录');assert.ok(f.w.document.querySelector('[data-fmr-relay-recovery]'));assert.equal(f.state.inserts,0);f.w.close();
});
test('a failed insertion keeps the complete source and does not automatically retry',async()=>{
  const f=await fixture();f.state.failInsert=true;await f.utter('不可丢失的语音');assert.equal(f.editor.textContent,'');assert.equal(f.proxy().value,'不可丢失的语音');assert.equal(f.state.inserts,1);
  await f.advance(5000);assert.equal(f.state.inserts,1);assert.ok(f.w.document.querySelector('[data-fmr-relay-recovery]'));f.w.close();
});
test('a native editor that rejects the DOM insertion does not cause the backup transcript to be cleared',async()=>{
  const f=await fixture();f.state.resetAfterInsert=true;await f.utter('需要原生编辑器确认的文字');
  assert.equal(f.editor.textContent,'');assert.equal(f.proxy().value,'需要原生编辑器确认的文字');assert.ok(f.w.document.querySelector('[data-fmr-relay-recovery]'));f.w.close();
});
test('moving to another field before delivery preserves the source without modifying that field',async()=>{
  const f=await fixture();await f.input('input','先保留');f.card.querySelector('textarea').focus();await f.advance(350);
  assert.equal(f.card.querySelector('textarea').value,'字段原文');assert.equal(f.editor.textContent,'');assert.equal(f.proxy().value,'先保留');f.w.close();
});
test('a brief window focus change resumes a settled transcript only on its original record',async()=>{
  const f=await fixture();await f.input('compositionstart');await f.input('input','切换焦点后仍须接入',{isComposing:true});await f.input('compositionend');
  f.state.focused=false;f.w.dispatchEvent(new f.w.Event('blur'));await f.advance(500);
  assert.equal(f.state.inserts,0);assert.equal(f.proxy().value,'切换焦点后仍须接入');
  f.state.focused=true;f.w.dispatchEvent(new f.w.Event('focus'));await f.advance(350);
  assert.equal(f.editor.textContent,'切换焦点后仍须接入');assert.equal(f.state.inserts,1);assert.equal(f.state.sends,0);f.w.close();
});
test('an empty or cancelled composition produces no comment and releases the navigation guard',async()=>{
  const f=await fixture();await f.input('compositionstart');await f.input('input','',{isComposing:true});await f.input('compositionend');await f.advance(400);
  assert.equal(f.panel.hidden,true);assert.equal((await f.run('closeDetail')).ok,true);f.w.close();
});
test('non-composing input is accumulated until quiet and pasted text stays exact',async()=>{
  const f=await fixture();await f.input('input','甲');await f.advance(200);await f.input('input','甲乙🙂\n末行');await f.advance(349);assert.equal(f.state.inserts,0);
  await f.advance(1);assert.equal(f.editor.textContent,'甲乙🙂\n末行');assert.equal(f.state.inserts,1);f.w.close();
});
test('disabled relay and paused pages do not prepare a receiving input',async()=>{
  for(const options of [{voiceRelay:false},{meeting:false}]){const f=await fixture(options);assert.equal(f.proxy(),null);assert.equal(f.panel.hidden,true);f.w.close();}
});
test('untrusted events cannot transfer page-authored text into comments',async()=>{
  const f=await fixture();await f.input('input','伪造输入',{trusted:false});await f.advance(1000);assert.equal(f.editor.textContent,'');assert.equal(f.state.inserts,0);f.w.close();
});
