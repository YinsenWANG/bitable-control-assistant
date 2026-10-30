const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../extension');
const M=require(path.join(root,'shared.js'));
const script=name=>fs.readFileSync(path.join(root,name),'utf8');
const TEST_URL='https://acme.feishu.cn/base/Base123?table=tblOne&view=viewOne';
function dom(html=''){const d=new JSDOM(html,{url:TEST_URL,runScripts:'outside-only',pretendToBeVisual:true});const w=d.window;w.HTMLElement.prototype.getBoundingClientRect=function(){if(this.hidden||this.style.display==='none'||this.closest('[hidden]'))return {x:0,y:0,width:0,height:0};return {x:0,y:0,left:0,top:0,right:500,bottom:200,width:500,height:200};};w.HTMLElement.prototype.scrollIntoView=function(){};Object.defineProperty(w.HTMLElement.prototype,'isContentEditable',{get(){return this.closest('[contenteditable]')?.getAttribute('contenteditable')==='true';}});w.eval(script('shared.js'));return d;}
test('meeting actions expose menu comments and leave Home to the browser command',()=>{const c=M.config();assert.equal(M.ACTIONS.length,24);assert.equal(Object.keys(c.bindings).length,24);assert.equal(c.bindings.back,'Escape');assert.equal(c.bindings.deleteBackward,'Backspace');assert.equal(c.bindings.toggleComments,'PageDown');assert.equal(c.bindings.toggleSidebar,'');assert.equal(c.bindings.home,undefined);assert.equal(c.bindings.toggle,'Control+Shift+Digit9');assert.equal(c.defaultUrl,undefined);});
test('physical key code keeps Option / Shift chords stable across keyboard layouts',()=>{assert.equal(M.chord({code:'KeyE',key:'´',altKey:true}),'Alt+KeyE');assert.equal(M.chord({code:'Digit9',key:'(',ctrlKey:true,shiftKey:true}),'Control+Shift+Digit9');assert.equal(M.chord({code:'MetaLeft',metaKey:true}),'');});
test('invalid imported chords and duplicate bindings are rejected',()=>{assert.throws(()=>M.config({bindings:{nextRecord:'Escape'}}),/冲突|相同/);assert.throws(()=>M.config({bindings:{nextRecord:'Control+javascript:alert(1)'}}));assert.equal(M.validateBinding('Meta+Shift+KeyE'),false);assert.equal(M.validateBinding('Shift+Meta+KeyE'),true);});
test('scope allows any Feishu base, wiki base and shared base without predefined IDs',()=>{
  for(const url of [TEST_URL,'https://other.feishu.cn/base/AnotherBase','https://feishu.cn/base/PersonalBase','https://team.feishu.cn/wiki/Wiki123','https://team.feishu.cn/share/base/view/Shared123'])assert.ok(M.target(url),url);
  for(const url of ['https://feishu.cn.evil.example/base/Base123','https://fakefeishu.cn/base/Base123','http://acme.feishu.cn/base/Base123','https://acme.feishu.cn/docx/Doc123','https://acme.feishu.cn/base/Base123/delete','https://acme.feishu.cn:8443/base/Base123','https://user:password@acme.feishu.cn/base/Base123'])assert.equal(M.target(url),null,url);
  assert.equal(M.sameDocument(TEST_URL,TEST_URL.replace('viewOne','viewTwo')),true);
  assert.equal(M.sameDocument(TEST_URL,TEST_URL.replace('Base123','Base456')),false);
});
test('old config migrates the menu key and discards fixed links without losing custom keys',()=>{
  const old={defaultUrl:TEST_URL,bindings:{...M.DEFAULTS.bindings,scrollDown:'Alt+KeyM',zoomIn:'Alt+KeyZ'}};
  delete old.bindings.toggleSidebar;
  delete old.bindings.toggleComments;
  const c=M.config(old);
  assert.equal(c.defaultUrl,undefined);assert.equal(c.bindings.toggleComments,'Alt+KeyM');assert.equal(c.bindings.toggleSidebar,'');assert.equal(c.bindings.scrollDown,'');assert.equal(c.bindings.zoomIn,'Alt+KeyZ');assert.deepEqual(M.config(c),c);
});
test('legacy shared Backspace is migrated into deletion only; new conflicts are rejected',()=>{
  const c=M.config({schemaVersion:2,bindings:{back:'Backspace',deleteBackward:'Backspace',home:'Alt+KeyH',previousRecord:'Alt+KeyU'}});
  assert.equal(c.bindings.back,'');assert.equal(c.bindings.home,undefined);assert.equal(c.bindings.navigateUp,'Alt+KeyU');assert.equal(c.bindings.previousRecord,'');
  assert.equal(M.actionFor('Backspace',c).id,'deleteBackward');assert.deepEqual(M.config(c),c);
  assert.throws(()=>M.config({...c,bindings:{...c.bindings,back:'Backspace'}}),/相同/);
});
test('zoom key presses have no debounce and repeat can accumulate',()=>{
  for(const id of ['zoomIn','zoomOut','resetZoom'])assert.equal(M.keyDelay(M.ACTIONS.find(a=>a.id===id),'none'),0);
  assert.equal(M.keyDelay(M.ACTIONS.find(a=>a.id==='deleteBackward'),'comment'),0);
});
test('zoom settings and complete action maps survive a config round trip',()=>{const c=M.config({zoomStep:15,showHud:false,bindings:{nextRecord:'Alt+KeyN',previousRecord:'Alt+KeyP'}});assert.deepEqual(M.config(JSON.parse(JSON.stringify(c))),c);assert.throws(()=>M.config({zoomStep:99}));});
test('auto-close preferences default to one second and preserve legacy shortcuts and exported values',()=>{
  const legacy=M.config({schemaVersion:6,voiceRelay:true,bindings:{toggleComments:'Meta+Backslash'}});
  assert.equal(legacy.autoCloseComments,true);assert.equal(legacy.commentCloseDelay,1);assert.equal(legacy.bindings.toggleComments,'Meta+Backslash');
  const custom=M.config({...legacy,autoCloseComments:false,commentCloseDelay:2.5});assert.deepEqual(M.config(JSON.parse(JSON.stringify(custom))),custom);
  for(const value of [-1,61,NaN,Infinity,'2',null])assert.throws(()=>M.config({commentCloseDelay:value}));
  for(const value of ['false',1,null])assert.throws(()=>M.config({autoCloseComments:value}));
  assert.equal(M.config({commentCloseDelay:0}).commentCloseDelay,0);assert.equal(M.config({commentCloseDelay:60}).commentCloseDelay,60);
});
test('auto-close settings can be edited, disabled, saved and re-enabled without losing the delay',async()=>{
  const d=dom(script('options.html')),w=d.window;let saved;
  w.chrome={commands:{getAll:async()=>[]},runtime:{sendMessage:async()=>({ok:true})},storage:{local:{get:async()=>({}),set:async value=>{saved=value.config;}}}};
  w.eval(script('options.js'));await new Promise(resolve=>setImmediate(resolve));
  const checkbox=w.document.getElementById('autoCloseComments'),delay=w.document.getElementById('commentCloseDelay');
  assert.equal(checkbox.checked,true);assert.equal(delay.value,'1');assert.equal(delay.disabled,false);
  delay.value='2.5';checkbox.checked=false;checkbox.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(delay.disabled,true);
  w.document.querySelector('.clear-btn').click();await w.document.getElementById('save').onclick();assert.equal(saved.autoCloseComments,false);assert.equal(saved.commentCloseDelay,2.5);
  checkbox.checked=true;checkbox.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(delay.disabled,false);assert.equal(delay.value,'2.5');
  delay.value='';await w.document.getElementById('save').onclick();assert.match(w.document.getElementById('feedback').textContent,/时间|秒/);assert.equal(saved.autoCloseComments,false);
  checkbox.checked=false;checkbox.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(delay.value,'2.5');await w.document.getElementById('save').onclick();assert.equal(saved.commentCloseDelay,2.5);
  checkbox.checked=true;checkbox.dispatchEvent(new w.Event('input',{bubbles:true}));
  delay.value='1.5';await w.document.getElementById('save').onclick();assert.equal(saved.autoCloseComments,true);assert.equal(saved.commentCloseDelay,1.5);d.window.close();
});
test('changing bindings does not erase unsaved general settings',async()=>{
  const d=dom(script('options.html')),w=d.window;let saved;
  w.chrome={storage:{local:{get:async()=>({}),set:async value=>{saved=value.config;}}}};
  w.eval(script('options.js'));
  await new Promise(resolve=>setImmediate(resolve));
  const doc=w.document;
  doc.getElementById('zoomStep').value='15';
  doc.getElementById('autoEnable').checked=true;
  assert.equal(doc.getElementById('defaultUrl'),null);
  doc.querySelector('.clear-btn').click();
  doc.getElementById('restore').click();
  await doc.getElementById('save').onclick();
  assert.equal(saved.zoomStep,15);assert.equal(saved.autoEnable,true);
  d.window.close();
});
test('browser shortcuts display and copy Chrome assignments, and refresh after returning from settings',async()=>{
  const d=dom(script('options.html')),w=d.window;let copied='',commands=[{name:'return-to-meeting',shortcut:'Ctrl+Shift+0'},{name:'reload-current-tab',shortcut:'Ctrl+Shift+8'}];
  w.chrome={commands:{getAll:async()=>commands},storage:{local:{get:async()=>({})}},runtime:{sendMessage:async()=>({ok:true})}};
  Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text=>{copied=text;}}});
  w.eval(script('options.js'));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(w.document.getElementById('reloadShortcut').textContent,'Ctrl+Shift+8');
  await w.document.getElementById('copyReloadShortcut').onclick();assert.equal(copied,'Ctrl+Shift+8');
  commands=[{name:'return-to-meeting',shortcut:'Ctrl+Shift+0'},{name:'reload-current-tab',shortcut:''}];
  w.dispatchEvent(new w.Event('focus'));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(w.document.getElementById('copyReloadShortcut').disabled,true);
  assert.match(w.document.getElementById('reloadShortcut').textContent,/未设置/);
  assert.equal(w.document.getElementById('copyMeetingShortcut').disabled,false);
  d.window.close();
});
test('renamed extension imports an old-name configuration without losing custom keys or zoom preferences',async()=>{
  const d=dom(script('options.html')),w=d.window;let saved;
  w.chrome={commands:{getAll:async()=>[]},storage:{local:{get:async()=>({}),set:async value=>{saved=value.config;}}},runtime:{sendMessage:async()=>({ok:true})}};
  w.eval(script('options.js'));await new Promise(resolve=>setImmediate(resolve));
  const old={format:'feishu-meeting-remote',version:5,config:{schemaVersion:5,zoomStep:15,bindings:{toggleComments:'Meta+Backslash',zoomIn:'Alt+KeyZ'}}};
  const input=w.document.getElementById('importFile');Object.defineProperty(input,'files',{value:[{size:1000,text:async()=>JSON.stringify(old)}]});
  await input.onchange();await w.document.getElementById('save').onclick();
  assert.equal(saved.bindings.toggleComments,'Meta+Backslash');assert.equal(saved.bindings.zoomIn,'Alt+KeyZ');assert.equal(saved.zoomStep,15);assert.equal(saved.nativeBindings.zoomIn,false);assert.equal(saved.schemaVersion,7);d.window.close();
});
function canvasDom(){const d=dom('<canvas role="faster" width="2080" height="1014"></canvas>'),w=d.window;
  function Ctx(canvas){this.canvas=canvas;this.font='14px sans-serif';this.textAlign='left';this.textBaseline='alphabetic';this.globalAlpha=1;this.fillStyle='#fff';this.scale=2;}
  Object.assign(Ctx.prototype,{getTransform(){return {a:this.scale,b:0,c:0,d:this.scale,e:0,f:0}},measureText(s){return {width:s.length*8,actualBoundingBoxAscent:11,actualBoundingBoxDescent:3}},fillText(){},clearRect(){},fillRect(){},drawImage(){},reset(){}});
  w.CanvasRenderingContext2D=Ctx;
  const canvas=w.document.querySelector('canvas');canvas.getBoundingClientRect=()=>({x:240,y:148,left:240,top:148,width:1040,height:507,right:1280,bottom:655});
  w.eval(script('canvas-bridge.js'));
  const context=new Ctx(canvas);
  function snapshot(){let response;const fn=e=>{response=JSON.parse(e.detail)};w.document.addEventListener('fmr:canvas-result',fn);w.document.dispatchEvent(new w.CustomEvent('fmr:canvas-query',{detail:JSON.stringify({id:'test'})}));w.document.removeEventListener('fmr:canvas-result',fn);return response;}
  return {d,w,canvas,context,Ctx,snapshot};
}
test('painted rows exclude group headers and counts and scale to screen coordinates',()=>{const {d,context:c,snapshot}=canvasDom();c.fillText('BUG',45,65);c.fillText('7',600,65);c.fillText('条记录',620,65);c.fillText('P1',70,100);c.fillText('1',74,164);c.fillText('[Bug] 第一条记录',106,164);c.fillText('2',74,196);c.fillText('下一条记录',106,196);const s=snapshot();assert.equal(s.rows.length,2);assert.equal(s.rows[0].number,'1');assert.equal(s.rows[0].y,308);assert.equal(s.rows[1].title,'下一条记录');d.window.close();});
test('partial canvas repaint drops stale rows and preserves untouched rows',()=>{const {d,context:c,snapshot}=canvasDom();c.fillText('1',74,164);c.fillText('旧记录',106,164);c.fillText('2',74,196);c.fillText('保留记录',106,196);c.clearRect(0,140,1040,40);c.fillText('1',74,164);c.fillText('新记录',106,164);const s=snapshot();assert.deepEqual(s.rows.map(x=>x.title),['新记录','保留记录']);d.window.close();});
test('offscreen canvas text is carried through drawImage',()=>{const {d,w,context:c,Ctx,snapshot}=canvasDom();const off=w.document.createElement('canvas');off.width=2080;off.height=1014;const src=new Ctx(off);src.fillText('1',74,164);src.fillText('离屏记录',106,164);c.scale=1;c.drawImage(off,0,0);assert.equal(snapshot().rows[0].title,'离屏记录');d.window.close();});
test('malformed MAIN-world canvas replies are ignored and cannot select invalid coordinates',async()=>{
  const d=dom('<canvas role="faster"></canvas>'),w=d.window;w.eval(script('adapter.js'));
  const a=new w.MeetingRemote.FeishuAdapter(()=>{});
  w.document.addEventListener('fmr:canvas-query',e=>{
    const {id}=JSON.parse(e.detail),row={number:'1',title:'记录',x:100,y:100};
    for(const data of [{id,rows:null,paintCount:1},{id,rows:[{...row,x:null}],paintCount:1},{id,rows:[{...row,title:{}}],paintCount:1},{id,rows:[row],paintCount:-1}])w.document.dispatchEvent(new w.CustomEvent('fmr:canvas-result',{detail:JSON.stringify(data)}));
    w.document.dispatchEvent(new w.CustomEvent('fmr:canvas-result',{detail:JSON.stringify({id,rows:[row],paintCount:2})}));
  });
  const data=await a.rows();assert.equal(data.rows[0].title,'记录');assert.equal(data.paintCount,2);
  for(const row of [{x:NaN,y:100},{x:100,y:Infinity},{x:1000,y:100}])await assert.rejects(()=>a.selectRow(row),/布局已变化/);
  d.window.close();
});
test('session preference updates survive a website storage write failure',()=>{
  const d=dom(),w=d.window;
  Object.defineProperty(w,'sessionStorage',{value:{getItem:()=> 'stale',setItem(){throw new Error('quota');},removeItem(){throw new Error('blocked');}}});
  const session=w.MeetingRemote.pageSession;session('fmr-test','true');assert.equal(session('fmr-test'),'true');session('fmr-test',null);assert.equal(session('fmr-test'),null);d.window.close();
});
function commentDom(text='待发送的语音文字'){const d=dom(`<div id="BASE_CARD_MODAL_CONTENT_FOCUS_ID" tabindex="0"><button class="bitable-discussion-add-button">评论</button><button class="bitable-card-modal-header-v2-btn-next"></button><button class="bitable-card-modal-header-v2-btn-close"></button><div class="record-discussion-container-horizontal"><div class="record-discussion-container"><div data-placeholder="添加新的评论..." contenteditable="true">${text}</div><div class="bitable-discussion__reply__send-btn-wrap_new_ui"></div></div></div></div>`);d.window.eval(script('adapter.js'));d.window.eval(script('field-navigation.js'));return {d,adapter:new d.window.MeetingRemote.FeishuAdapter(()=>{}),editor:d.window.document.querySelector('[contenteditable]')};}
test('collapsing a draft retains the exact editor node and restores it',async()=>{const {d,adapter:a,editor}=commentDom();await a.closeComments();assert.equal(a.commentsOpen(),false);assert.equal(a.hasDraft(),true);assert.equal(a.editor(),editor);await a.openComments();assert.equal(a.commentsOpen(),true);assert.equal(a.editor(),editor);assert.equal(editor.textContent,'待发送的语音文字');d.window.close();});
test('menu restores a draft in browse mode and OK starts input without sending',async()=>{
  const {d,adapter:a,editor}=commentDom('未发送的草稿');editor.focus();await a.toggleComments();
  assert.equal(a.commentsOpen(),false);assert.equal(editor.textContent,'未发送的草稿');
  await a.toggleComments();assert.equal(a.commentsOpen(),true);assert.notEqual(d.window.document.activeElement,editor);assert.equal(a.state(),'评论浏览');assert.equal(editor.textContent,'未发送的草稿');
  await a.confirm();assert.equal(d.window.document.activeElement,editor);assert.equal(a.state(),'评论输入');assert.equal(editor.textContent,'未发送的草稿');d.window.close();
});
test('opening comments for dictation preserves an existing caret and otherwise places it at the end',async()=>{
  const {d,adapter:a,editor}=commentDom('已有的文字'),selection=d.window.getSelection();
  a.card().focus();selection.removeAllRanges();await a.openComments();assert.equal(selection.anchorNode,editor);assert.equal(selection.anchorOffset,editor.childNodes.length);
  const range=d.window.document.createRange();range.setStart(editor.firstChild,2);range.collapse(true);selection.removeAllRanges();selection.addRange(range);
  await a.openComments();assert.equal(selection.anchorNode,editor.firstChild);assert.equal(selection.anchorOffset,2);assert.equal(editor.textContent,'已有的文字');d.window.close();
});
test('a hidden draft blocks switching record, switching view and closing detail',async()=>{const {d,adapter:a}=commentDom();await a.closeComments();await assert.rejects(()=>a.moveRecord(1),/未发送/);await assert.rejects(()=>a.switchView(1),/未发送/);await assert.rejects(()=>a.closeDetail(),/未发送/);d.window.close();});
test('comment send rejects disabled controls and ignores a concurrent duplicate',async()=>{const {d,adapter:a,editor}=commentDom();const button=d.window.document.querySelector('.bitable-discussion__reply__send-btn-wrap_new_ui');button.classList.add('disabled');await assert.rejects(()=>a.send(),/不能发送/);button.classList.remove('disabled');let clicks=0;button.addEventListener('click',()=>{clicks++;setTimeout(()=>{editor.textContent='';},60);});await Promise.all([a.send(),a.send()]);assert.equal(clicks,1);assert.equal(a.hasDraft(),false);d.window.close();});
test('explicit return exits comment editing then collapses a draft; deletion of nonempty text preserves editing',async()=>{
  const {d,adapter:a,editor}=commentDom('测试草稿');let deletes=0;
  d.window.document.execCommand=command=>{assert.equal(command,'delete');deletes++;editor.textContent=editor.textContent.slice(0,-1);return true;};
  editor.focus();await a.deleteBackward();assert.equal(deletes,1);assert.equal(a.commentsOpen(),true);
  await a.back();assert.equal(a.commentsOpen(),true);assert.equal(d.window.document.activeElement,a.card());
  await a.deleteBackward();assert.equal(deletes,1);assert.equal(a.commentsOpen(),false);assert.equal(editor.textContent,'测试草');
  await assert.rejects(()=>a.back(),/未发送/);d.window.close();
});
test('sidebar toggles use Feishu controls and preserve unrelated page content',async()=>{
  const d=dom('<div class="bitable-sidebar-container"><div id="bitable-sidebar-wrapper"><div class="bitable-sidebar-close-icon-wrap"></div></div></div><div class="bitable-sidebar-opener invisible"></div><input value="untouched">');
  d.window.eval(script('adapter.js'));d.window.eval(script('field-navigation.js'));const a=new d.window.MeetingRemote.FeishuAdapter(()=>{}),doc=d.window.document;
  doc.querySelector('.bitable-sidebar-close-icon-wrap').onclick=()=>{doc.getElementById('bitable-sidebar-wrapper').classList.add('fold');doc.querySelector('.bitable-sidebar-opener').className='bitable-sidebar-opener visible';};
  doc.querySelector('.bitable-sidebar-opener').onclick=()=>{doc.getElementById('bitable-sidebar-wrapper').classList.remove('fold');doc.querySelector('.bitable-sidebar-opener').className='bitable-sidebar-opener invisible';};
  assert.equal(a.isBasePage(),true);await a.toggleSidebar();assert.equal(a.sidebarExpanded(),false);await a.toggleSidebar();assert.equal(a.sidebarExpanded(),true);assert.equal(doc.querySelector('input').value,'untouched');
  await a.collapseSidebarForMeeting();assert.equal(a.sidebarExpanded(),false);await a.collapseSidebarForMeeting();assert.equal(a.sidebarExpanded(),false);
  await a.restoreMeetingSidebar();assert.equal(a.sidebarExpanded(),true);
  await a.toggleSidebar();await a.collapseSidebarForMeeting();await a.toggleSidebar();await a.restoreMeetingSidebar();assert.equal(a.sidebarExpanded(),false);
  doc.body.replaceChildren();d.reconfigure({url:'https://acme.feishu.cn/wiki/OrdinaryDoc'});assert.equal(a.isBasePage(),false);
  d.window.close();
});
test('refreshing during a meeting preserves the original expanded sidebar state',async()=>{
  const d=dom('<div id="bitable-sidebar-wrapper"></div><button class="bitable-sidebar-close-icon-wrap"></button><button class="bitable-sidebar-opener"></button>'),w=d.window;
  w.eval(script('adapter.js'));const doc=w.document;
  doc.querySelector('.bitable-sidebar-close-icon-wrap').onclick=()=>doc.getElementById('bitable-sidebar-wrapper').classList.add('fold');
  doc.querySelector('.bitable-sidebar-opener').onclick=()=>doc.getElementById('bitable-sidebar-wrapper').classList.remove('fold');
  const before=new w.MeetingRemote.FeishuAdapter(()=>{});await before.collapseSidebarForMeeting();
  const after=new w.MeetingRemote.FeishuAdapter(()=>{});await after.collapseSidebarForMeeting();await after.restoreMeetingSidebar();
  assert.equal(after.sidebarExpanded(),true);
  doc.getElementById('bitable-sidebar-wrapper').classList.add('fold');
  const next=new w.MeetingRemote.FeishuAdapter(()=>{});await next.collapseSidebarForMeeting();await next.toggleSidebar();await next.restoreMeetingSidebar();
  assert.equal(next.sidebarExpanded(),false);d.window.close();
});
test('a sidebar mounted after Base detection can still collapse and restore its initial state',async()=>{
  const d=dom('<div class="faster-view"></div>'),w=d.window;w.eval(script('adapter.js'));
  const a=new w.MeetingRemote.FeishuAdapter(()=>{});await a.collapseSidebarForMeeting();
  w.document.body.insertAdjacentHTML('beforeend','<div id="bitable-sidebar-wrapper"></div><button class="bitable-sidebar-close-icon-wrap"></button><button class="bitable-sidebar-opener"></button>');
  const doc=w.document;doc.querySelector('.bitable-sidebar-close-icon-wrap').onclick=()=>doc.getElementById('bitable-sidebar-wrapper').classList.add('fold');
  doc.querySelector('.bitable-sidebar-opener').onclick=()=>doc.getElementById('bitable-sidebar-wrapper').classList.remove('fold');
  await a.collapseSidebarForMeeting();assert.equal(a.sidebarExpanded(),false);
  await a.restoreMeetingSidebar();assert.equal(a.sidebarExpanded(),true);d.window.close();
});

test('an early opener is not mistaken for a finished collapsed sidebar',async()=>{
  const d=dom('<button class="bitable-sidebar-opener visible"></button>'),w=d.window;
  w.eval(script('adapter.js'));const a=new w.MeetingRemote.FeishuAdapter(()=>{});
  await a.collapseSidebarForMeeting();assert.equal(a.meetingSidebar,undefined);
  assert.equal(w.MeetingRemote.pageSession('fmr-sidebar:'+w.location.pathname),null);d.window.close();
});
test('sidebar hydration after a successful collapse is reconciled before setup finishes',async()=>{
  const d=dom('<div id="bitable-sidebar-wrapper"></div><button class="bitable-sidebar-close-icon-wrap"></button><button class="bitable-sidebar-opener"></button>'),w=d.window,doc=w.document;
  w.eval(script('adapter.js'));const a=new w.MeetingRemote.FeishuAdapter(()=>{});let clicks=0;
  doc.querySelector('.bitable-sidebar-close-icon-wrap').onclick=()=>{clicks++;doc.getElementById('bitable-sidebar-wrapper').classList.add('fold');};
  doc.querySelector('.bitable-sidebar-opener').onclick=()=>doc.getElementById('bitable-sidebar-wrapper').classList.remove('fold');
  const pending=a.collapseSidebarForMeeting();
  await new Promise(resolve=>setTimeout(resolve,200));
  const replacement=doc.createElement('div');replacement.id='bitable-sidebar-wrapper';doc.getElementById('bitable-sidebar-wrapper').replaceWith(replacement);
  await pending;assert.equal(a.sidebarExpanded(),false);assert.equal(clicks,2);
  await a.restoreMeetingSidebar();assert.equal(a.sidebarExpanded(),true);d.window.close();
});
test('leaving the meeting cancels pending sidebar reconciliation',async()=>{
  const d=dom('<div id="bitable-sidebar-wrapper"></div><button class="bitable-sidebar-close-icon-wrap"></button><button class="bitable-sidebar-opener"></button>'),w=d.window,doc=w.document;
  w.eval(script('adapter.js'));const a=new w.MeetingRemote.FeishuAdapter(()=>{});
  doc.querySelector('.bitable-sidebar-close-icon-wrap').onclick=()=>doc.getElementById('bitable-sidebar-wrapper').classList.add('fold');
  doc.querySelector('.bitable-sidebar-opener').onclick=()=>doc.getElementById('bitable-sidebar-wrapper').classList.remove('fold');
  const pending=a.collapseSidebarForMeeting();await a.restoreMeetingSidebar();await pending;
  assert.equal(a.sidebarExpanded(),true);assert.equal(a.meetingSidebar,null);d.window.close();
});
test('optional first-view action chooses the first view of the current table, without a configured URL',async()=>{
  const d=dom('<div class="bitable-view-menu-item" data-view-id="first"></div><div class="bitable-view-menu-item bitable-view-menu-item--tab-active" data-view-id="second"></div>');
  d.window.eval(script('adapter.js'));d.window.eval(script('field-navigation.js'));const a=new d.window.MeetingRemote.FeishuAdapter(()=>{});let selections=0;
  a.ensureSelection=async()=>{selections++;};
  d.window.document.querySelector('[data-view-id="first"]').onclick=()=>{for(const e of a.views())e.classList.toggle('bitable-view-menu-item--tab-active',e.dataset.viewId==='first');};
  await a.firstView();assert.equal(a.viewId(),'first');assert.equal(selections,1);d.window.close();
});
test('content script forwards every zoom press even while record navigation is busy',async()=>{
  const d=dom(),w=d.window;let listener,finishNavigation,zoomMessages=0;
  w.MeetingRemote.FeishuAdapter=class {
    isBasePage(){return true;}card(){return null;}state(){return '记录列表';}viewName(){return '表格';}hasDraft(){return false;}
    async ensureSelection(){}restoreHidden(){}moveRecord(){return new Promise(resolve=>{finishNavigation=resolve;});}
  };
  w.chrome={
    storage:{local:{get:async()=>({config:M.config()})},onChanged:{addListener(){}}},
    runtime:{getManifest:()=>({version:'0.2.0'}),onMessage:{addListener(fn){listener=fn;}},sendMessage:async msg=>{
      if(msg.type==='zoom'){zoomMessages++;await new Promise(resolve=>setTimeout(resolve,10));return {ok:true,zoom:1+zoomMessages*.1};}
      return {ok:true,zoom:1};
    }}
  };
  w.eval(script('dictation-relay.js'));w.eval(script('content.js'));await new Promise(resolve=>setImmediate(resolve));
  const run=action=>new Promise(resolve=>listener({type:'meeting-action',action},{},resolve));
  assert.equal((await run('toggle')).ok,true);
  const navigation=run('nextRecord');
  const zoomResults=await Promise.all(Array.from({length:8},()=>run('zoomIn')));
  assert.equal(zoomMessages,8);assert.ok(zoomResults.every(x=>x.ok));
  finishNavigation();await navigation;d.window.close();
});
