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
test('OK enters a field, Home returns focus to that field without modifying its content',async()=>{
  const {d,a}=fixture();a.moveField(1);await a.confirm();const editor=d.window.document.activeElement;assert.equal(editor.getAttribute('contenteditable'),'true');
  await a.back();assert.equal(d.window.document.activeElement,a.currentFieldStop().field);assert.equal(editor.textContent,'示例');d.window.close();
});
test('raw arrows including selection chords remain native in all text editors',()=>{
  for(const context of ['comment','other','grid-edit'])for(const id of ['navigateUp','navigateDown','navigateLeft','navigateRight'])for(const prefix of ['','Shift+','Control+Shift+'])assert.equal(M.inputPolicy(action(id),prefix+'ArrowDown',context),'pass');
});
test('custom direction chords move the caret; Home and deletion remain separate in input mode',()=>{
  for(const context of ['comment','other','grid-edit']){
    assert.equal(M.inputPolicy(action('navigateLeft'),'Alt+KeyH',context),'caret');
    assert.equal(M.inputPolicy(action('home'),'Control+Shift+Digit0',context),'run');
    assert.equal(M.inputPolicy(action('home'),'Control+Shift+Digit0',context,{popup:true}),'run');
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
  const c=M.config({schemaVersion:3,bindings:{toggleSidebar:'Alt+KeyB'},nativeBindings:{toggleSidebar:true}});
  assert.equal(M.bindingFor('toggleSidebar',c),M.nativeBinding('toggleSidebar'));
  assert.equal(M.actionFor('Alt+KeyB',c),undefined);
  assert.equal(M.inputPolicy(action('toggleSidebar'),M.nativeBinding('toggleSidebar'),'none',{native:true}),'native');
  c.nativeBindings.toggleSidebar=false;assert.equal(M.bindingFor('toggleSidebar',M.config(c)),'Alt+KeyB');
  assert.throws(()=>M.config({schemaVersion:3,bindings:{home:M.nativeBinding('toggleSidebar')},nativeBindings:{toggleSidebar:true}}),/相同/);
});
test('every shortcut can be copied and native toggle preserves unsaved settings',async()=>{
  const d=new JSDOM(read('options.html'),{url:'https://example.org',runScripts:'outside-only'}),w=d.window;let copied,saved;
  Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async value=>{copied=value;}}});
  w.chrome={storage:{local:{get:async()=>({}),set:async x=>{saved=x.config;}}},commands:{getAll:async()=>[{name:'return-to-meeting',shortcut:'Ctrl+Shift+8'}]}};
  w.eval(read('shared.js'));w.eval(read('options.js'));await new Promise(r=>setImmediate(r));
  assert.equal(w.document.querySelectorAll('#bindings .copy-btn').length,M.ACTIONS.length);
  w.document.querySelector('[data-action="home"] .copy-btn').click();await new Promise(r=>setImmediate(r));assert.equal(copied,'Control+Shift+Digit0');
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
  assert.equal(a.inputContext({target:e}),'grid-edit');a.deleteBackward();assert.equal(deletes,1);d.window.close();
});
