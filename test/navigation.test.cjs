const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../extension');
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
const M=require(path.join(root,'shared.js'));
const action=id=>M.ACTIONS.find(a=>a.id===id);
function fixture(){
  const d=new JSDOM(`<div id="BASE_CARD_MODAL_CONTENT_FOCUS_ID" tabindex="-1">
    <label class="bitable-record-card-field-wrapper"><span class="bitable-card-field-label__name">标题</span><div class="b-field-label__editor"><div contenteditable="true" tabindex="0">示例</div></div></label>
    <label class="bitable-record-card-field-wrapper"><span class="bitable-card-field-label__name">说明</span><div class="editor-component" style="overflow-y:auto"><div contenteditable="true">长文本</div></div></label>
    <label class="bitable-record-card-field-wrapper"><span class="bitable-card-field-label__name">链接</span><div class="bitable-card-edit-cell-editor-Url"><a href="https://example.org/help">示例链接</a><a href="https://example.org/guide">第二个链接</a></div></label>
    <label class="bitable-record-card-field-wrapper" hidden>隐藏字段</label>
    <button class="bitable-discussion-add-button">评论</button><button class="bitable-card-modal-header-v2-btn-close">关闭</button>
    <div class="record-discussion-container"><div contenteditable="true" data-placeholder="评论" tabindex="0"></div></div>
  </div>`,{url:'https://example.feishu.cn/base/ExampleBase',runScripts:'outside-only',pretendToBeVisual:true});
  const w=d.window;w.HTMLElement.prototype.getBoundingClientRect=function(){return {width:this.closest('[hidden]')?0:500,height:120,x:0,y:0};};
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLElement.prototype.scrollBy=function({top}){this.scrollTop=Math.min(Math.max(0,this.scrollTop+top),this.scrollHeight-this.clientHeight);};
  Object.defineProperty(w.HTMLElement.prototype,'isContentEditable',{get(){return this.closest('[contenteditable]')?.getAttribute('contenteditable')==='true';}});
  for(const name of ['shared.js','adapter.js','field-navigation.js'])w.eval(read(name));
  const messages=[];w.chrome={runtime:{sendMessage:async m=>{messages.push(m);return {ok:true};}}};
  return {d,w,a:new w.MeetingRemote.FeishuAdapter(()=>{}),messages};
}
test('each visible field and each URL is a separate stop; OK opens only the focused link',async()=>{
  const {d,a,messages}=fixture();assert.equal(a.fieldStops().length,5);
  a.moveField(1);assert.equal(d.window.document.activeElement,a.fieldStops()[0].element);
  a.moveField(1);a.moveField(1);assert.equal(a.currentFieldStop().kind,'link');
  await a.confirm();assert.equal(messages.length,1);assert.equal(messages[0].url,'https://example.org/help');
  a.moveField(1);await a.confirm();assert.equal(messages[1].url,'https://example.org/guide');
  a.clearFieldFocus();assert.equal(d.window.document.querySelector('[data-fmr-focused]'),null);d.window.close();
});
test('long field text scrolls to its boundary before moving to the next field',()=>{
  const {d,a}=fixture(),area=d.window.document.querySelector('.editor-component');
  Object.defineProperties(area,{clientHeight:{value:100},scrollHeight:{value:300}});
  a.moveField(1);a.moveField(1);const long=a.currentFieldStop().field;
  a.moveField(1);assert.equal(area.scrollTop,80);assert.equal(a.currentFieldStop().field,long);
  a.moveField(1);a.moveField(1);assert.equal(area.scrollTop,200);assert.equal(a.currentFieldStop().field,long);
  a.moveField(1);assert.equal(a.currentFieldStop().kind,'link');a.moveField(-1);a.moveField(-1);assert.equal(area.scrollTop,120);d.window.close();
});
test('OK enters a field, Back exits input to that field without modifying its content',async()=>{
  const {d,a}=fixture();a.moveField(1);await a.confirm();const editor=d.window.document.activeElement;assert.equal(editor.getAttribute('contenteditable'),'true');
  await a.back();assert.equal(d.window.document.activeElement,a.currentFieldStop().field);assert.equal(editor.textContent,'示例');d.window.close();
});
test('raw arrows including selection chords remain native in all text editors',()=>{
  for(const context of ['comment','other','grid-edit'])for(const id of ['navigateUp','navigateDown','navigateLeft','navigateRight'])for(const prefix of ['','Shift+','Control+Shift+'])assert.equal(M.inputPolicy(action(id),prefix+'ArrowDown',context),'pass');
});
test('custom direction chords move the caret; explicit return and context-sensitive deletion work in input mode',()=>{
  for(const context of ['comment','other','grid-edit']){
    assert.equal(M.inputPolicy(action('navigateLeft'),'Alt+KeyH',context),'caret');
    assert.equal(M.inputPolicy(action('back'),'Escape',context),'run');
    assert.equal(M.inputPolicy(action('back'),'Escape',context,{popup:true}),'run');
    assert.equal(M.inputPolicy(action('deleteBackward'),'Backspace',context),'pass');
    assert.equal(M.inputPolicy(action('previousRecord'),'Alt+KeyP',context),'pass');
  }
  assert.equal(M.inputPolicy(action('confirm'),'Enter','other'),'pass');
  assert.equal(M.inputPolicy(action('confirm'),'Enter','comment',{popup:true}),'pass');
});
test('custom cursor motion in textarea supports lines, emoji and existing selections',()=>{
  const {d,a}=fixture(),e=d.window.document.createElement('textarea');e.value='ab🙂cd\n12345';d.window.document.body.append(e);e.focus();e.setSelectionRange(4,4);
  a.moveCaret('left');assert.equal(e.selectionStart,2);a.moveCaret('right');assert.equal(e.selectionStart,4);
  a.moveCaret('down');assert.equal(e.selectionStart,11);a.moveCaret('up');assert.equal(e.selectionStart,4);
  e.setSelectionRange(0,4);a.moveCaret('right');assert.equal(e.selectionStart,4);d.window.close();
});
test('native opt-in uses the documented key and restores the custom binding when disabled',()=>{
  const c=M.config({schemaVersion:4,bindings:{toggleSidebar:'Alt+KeyB'},nativeBindings:{toggleSidebar:true}});
  assert.equal(M.bindingFor('toggleSidebar',c),M.nativeBinding('toggleSidebar'));
  assert.equal(M.actionFor('Alt+KeyB',c),undefined);
  assert.equal(M.inputPolicy(action('toggleSidebar'),M.nativeBinding('toggleSidebar'),'none',{native:true}),'native');
  c.nativeBindings.toggleSidebar=false;assert.equal(M.bindingFor('toggleSidebar',M.config(c)),'Alt+KeyB');
  assert.throws(()=>M.config({schemaVersion:4,bindings:{back:M.nativeBinding('toggleSidebar')},nativeBindings:{toggleSidebar:true}}),/相同/);
});
test('every shortcut can be copied and native toggle preserves unsaved settings',async()=>{
  const d=new JSDOM(read('options.html'),{url:'https://example.org',runScripts:'outside-only'}),w=d.window;let copied,saved;
  Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async value=>{copied=value;}}});
  w.chrome={storage:{local:{get:async()=>({}),set:async x=>{saved=x.config;}}},commands:{getAll:async()=>[{name:'return-to-meeting',shortcut:'Ctrl+Shift+8'}]}};
  w.eval(read('shared.js'));w.eval(read('options.js'));await new Promise(r=>setImmediate(r));
  assert.equal(w.document.querySelectorAll('#bindings .copy-btn').length,M.ACTIONS.length);
  w.document.querySelector('[data-action="toggleComments"] .copy-btn').click();await new Promise(r=>setImmediate(r));assert.equal(copied,'PageDown');
  w.document.getElementById('zoomStep').value='15';w.document.querySelector('[data-action="toggleSidebar"] input').click();
  w.document.querySelector('[data-action="toggleSidebar"] .copy-btn').click();await new Promise(r=>setImmediate(r));assert.equal(copied,w.MeetingRemote.nativeBinding('toggleSidebar'));
  await w.document.getElementById('save').onclick();assert.equal(saved.zoomStep,15);assert.equal(saved.nativeBindings.toggleSidebar,true);
  w.document.getElementById('copyMeetingShortcut').click();await new Promise(r=>setImmediate(r));assert.equal(copied,'Ctrl+Shift+8');d.window.close();
});
test('leaving input does not bubble Escape and accidentally close the native record dialog',async()=>{
  const {d,a}=fixture();let escapes=0;d.window.document.addEventListener('keydown',e=>{if(e.key==='Escape')escapes++;});
  a.moveField(1);await a.confirm();await a.back();assert.equal(escapes,0);assert.ok(a.card());assert.equal(d.window.document.activeElement,a.currentFieldStop().field);d.window.close();
});
test('Feishu grid ghost editor is not text input; Backspace never clears a selected cell',()=>{
  const {d,w,a}=fixture();w.document.querySelector('#BASE_CARD_MODAL_CONTENT_FOCUS_ID').remove();
  const grid=w.document.createElement('div');grid.className='faster-overlay';grid.innerHTML='<div class="editor-component"><div contenteditable="true" tabindex="0">\u200b</div></div>';w.document.body.append(grid);
  const e=grid.querySelector('[contenteditable]');e.getBoundingClientRect=()=>({width:16,height:10});e.focus();let deletes=0;w.document.execCommand=()=>{deletes++;};
  assert.equal(a.inputContext({target:e}),'grid');a.deleteBackward();assert.equal(deletes,0);
  assert.equal(M.inputPolicy(action('deleteBackward'),'Backspace','grid'),'run');
  grid.firstElementChild.classList.add('editor-component--with-input-toolbar');e.getBoundingClientRect=()=>({width:554,height:50});
  e.textContent='正在编辑';assert.equal(a.inputContext({target:e}),'grid-edit');a.deleteBackward();assert.equal(deletes,1);d.window.close();
});
test('a focused field link inside Feishu rich text is navigation, while its editor remains editable',async()=>{
  const {d,w,a,messages}=fixture(),url=d.window.document.querySelector('.bitable-card-edit-cell-editor-Url');
  const editor=w.document.createElement('div');editor.contentEditable='true';editor.setAttribute('contenteditable','true');editor.tabIndex=0;
  editor.append(...url.childNodes);url.append(editor);
  a.moveField(1);a.moveField(1);a.moveField(1);const link=a.currentFieldStop().element;
  assert.equal(w.document.activeElement,a.currentFieldStop().field);
  assert.equal(link.tagName,'A');assert.equal(link.isContentEditable,true);
  assert.equal(a.inputContext({target:link}),'none');
  assert.equal(M.inputPolicy(action('confirm'),'Enter',a.inputContext({target:link})),'run');
  let deletes=0,backs=0;w.document.execCommand=()=>{deletes++;};a.back=async()=>{backs++;};await a.deleteBackward();assert.equal(deletes,0);assert.equal(backs,1);
  await a.confirm();assert.equal(messages[0].url,'https://example.org/help');
  a.clearFieldFocus();assert.equal(link.getAttribute('tabindex'),null);assert.equal(url.closest('label').getAttribute('tabindex'),null);
  editor.focus();assert.equal(a.inputContext({target:editor}),'other');d.window.close();
});
function clippedOptions(w){
  const box=w.document.createElement('div');box.className='b-select-dropdown-content';box.style.overflowY='hidden';box.style.overflowX='hidden';box.style.height='0px';
  box.getBoundingClientRect=()=>({width:168,height:0,x:0,y:0});
  box.innerHTML='<input aria-label="隐藏选项搜索"><div class="b-select-list" style="overflow-y:auto">隐藏选项</div>';
  Object.defineProperties(box.lastElementChild,{clientHeight:{value:127},scrollHeight:{value:456}});
  w.document.querySelector('.b-field-label__editor').prepend(box);return box;
}
test('collapsed native option lists do not consume field navigation keys',()=>{
  const {d,w,a}=fixture(),box=clippedOptions(w);a.moveField(1);a.moveField(1);
  assert.equal(a.currentFieldStop().field,a.fieldStops()[1].field);assert.equal(box.lastElementChild.scrollTop,0);d.window.close();
});
test('prose with many embedded links is one field stop; only typed URL fields create link stops',()=>{
  const {d,w,a}=fixture(),editor=w.document.querySelector('[contenteditable]');
  for(let i=0;i<20;i++){const link=w.document.createElement('a');link.href='https://example.org/item/'+i;link.textContent='reference '+i;editor.append(link);}
  const stops=a.fieldStops();assert.equal(stops.length,5);
  assert.equal(stops.filter(s=>s.kind==='link').length,2);
  assert.ok(stops.filter(s=>s.kind==='link').every(s=>s.element.closest('.bitable-card-edit-cell-editor-Url')));
  a.moveField(1);a.moveField(1);assert.equal(a.currentFieldStop().field,stops[1].field);d.window.close();
});
test('schema 4 settings retain custom keys and add native page reload without conflicts',()=>{
  const c=M.config({schemaVersion:4,bindings:{toggleComments:'Alt+KeyM',zoomIn:'Alt+KeyZ'}});
  assert.equal(c.schemaVersion,5);assert.equal(c.hideHeader,true);assert.equal(c.bindings.toggleComments,'Alt+KeyM');assert.equal(c.bindings.zoomIn,'Alt+KeyZ');
  assert.equal(M.bindingFor('reloadPage',c),M.nativeBinding('reloadPage'));assert.equal(c.nativeBindings.reloadPage,true);assert.deepEqual(M.config(c),c);
  const conflict=M.config({schemaVersion:4,bindings:{toggleComments:M.nativeBinding('reloadPage')}});
  assert.equal(conflict.bindings.reloadPage,'');assert.equal(conflict.nativeBindings.reloadPage,false);
});
test('volume keys work in open editor popups and reload can use the browser native shortcut',()=>{
  for(const context of ['comment','other','grid-edit','none'])for(const id of ['zoomIn','zoomOut','resetZoom'])assert.equal(M.inputPolicy(action(id),'Alt+KeyZ',context,{popup:true}),'run');
  assert.equal(M.inputPolicy(action('reloadPage'),'Meta+KeyR','comment',{native:true,popup:true}),'native');
  assert.equal(M.inputPolicy(action('reloadPage'),'Alt+KeyR','comment',{popup:true}),'run');
});
test('OK skips controls clipped by a collapsed ancestor and focuses the visible editor',async()=>{
  const {d,w,a}=fixture();clippedOptions(w);a.moveField(1);await a.confirm();
  assert.equal(w.document.activeElement.getAttribute('contenteditable'),'true');d.window.close();
});
test('empty input returns once per press, while holding deletion cannot exit multiple layers',()=>{
  for(const context of ['comment','other','grid-edit']){
    assert.equal(M.inputPolicy(action('deleteBackward'),'Backspace',context,{emptyInput:false,repeat:true}),'pass');
    assert.equal(M.inputPolicy(action('deleteBackward'),'Backspace',context,{emptyInput:true}),'run');
    assert.equal(M.inputPolicy(action('deleteBackward'),'Backspace',context,{emptyInput:true,repeat:true}),'block');
    assert.equal(M.inputPolicy(action('toggleComments'),'PageDown',context,{popup:true}),'run');
  }
  assert.equal(M.inputPolicy(action('deleteBackward'),'Backspace','none',{repeat:true}),'block');
});
test('empty native editors return without deleting, and spaces or attachments remain input',async()=>{
  const {d,w,a}=fixture(),editor=w.document.querySelector('[contenteditable]');
  editor.textContent='\u200b';editor.focus();let deletes=0;w.document.execCommand=()=>{deletes++;};
  assert.equal(a.inputIsEmpty(),true);await a.deleteBackward();assert.equal(deletes,0);
  assert.equal(w.document.activeElement,a.currentFieldStop().field);assert.ok(a.card());
  editor.textContent=' ';editor.focus();assert.equal(a.inputIsEmpty(),false);await a.deleteBackward();assert.equal(deletes,1);
  editor.innerHTML='<img alt="attachment">';assert.equal(a.inputIsEmpty(),false);
  const input=w.document.createElement('textarea');w.document.body.append(input);input.focus();assert.equal(a.inputIsEmpty(),true);
  input.value='\n';assert.equal(a.inputIsEmpty(),false);d.window.close();
});
test('schema 3 menu key migrates to comments and Home is removed from page-local shortcuts',()=>{
  const c=M.config({schemaVersion:3,bindings:{toggleSidebar:'Alt+KeyM',home:'Control+Shift+Digit0',zoomIn:'Alt+KeyZ'}});
  assert.equal(c.schemaVersion,5);assert.equal(c.bindings.toggleComments,'Alt+KeyM');assert.equal(c.bindings.toggleSidebar,'');assert.equal(c.bindings.home,undefined);assert.equal(c.bindings.zoomIn,'Alt+KeyZ');
  assert.deepEqual(M.config(c),c);
  const native=M.config({schemaVersion:3,bindings:{toggleSidebar:'Alt+KeyS'},nativeBindings:{toggleSidebar:true}});
  assert.equal(native.bindings.toggleComments,M.nativeBinding('toggleSidebar'));assert.equal(native.nativeBindings.toggleSidebar,false);
});
