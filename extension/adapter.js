(() => {
  'use strict';
  const M=globalThis.MeetingRemote;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const visible=e=>!!e&&e.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none';
  const clean=s=>(s||'').replace(/[\u200b-\u200f\ufeff]/g,'').trim();
  async function waitFor(fn,ms=1800){const end=Date.now()+ms;do{const value=fn();if(value)return value;await sleep(50);}while(Date.now()<end);return null;}
  function key(target,key,code=key,extra={}){
    const number={ArrowUp:38,ArrowDown:40,Escape:27,Enter:13,KeyE:69}[code]||0;
    for(const type of ['keydown','keyup'])target.dispatchEvent(new KeyboardEvent(type,{key,code,keyCode:number,which:number,bubbles:true,cancelable:true,...extra}));
  }
  function pointer(target,x,y,right=false){
    const opts={bubbles:true,cancelable:true,clientX:x,clientY:y,button:right?2:0,buttons:right?2:1,view:window};
    target.dispatchEvent(new MouseEvent('mousemove',opts));
    target.dispatchEvent(new PointerEvent('pointerdown',{...opts,pointerId:1,pointerType:'mouse',isPrimary:true}));
    target.dispatchEvent(new MouseEvent('mousedown',opts));
    target.dispatchEvent(new PointerEvent('pointerup',{...opts,buttons:0,pointerId:1,pointerType:'mouse',isPrimary:true}));
    target.dispatchEvent(new MouseEvent('mouseup',{...opts,buttons:0}));
    target.dispatchEvent(new MouseEvent(right?'contextmenu':'click',{...opts,buttons:0}));
  }
  function paint(){return new Promise(resolve=>{
    const id=crypto.randomUUID();let timer;
    const listener=e=>{try{const data=JSON.parse(e.detail);if(data.id!==id)return;clearTimeout(timer);document.removeEventListener('fmr:canvas-result',listener);resolve(data);}catch{}};
    document.addEventListener('fmr:canvas-result',listener);
    timer=setTimeout(()=>{document.removeEventListener('fmr:canvas-result',listener);resolve({rows:[],paintCount:0});},300);
    document.dispatchEvent(new CustomEvent('fmr:canvas-query',{detail:JSON.stringify({id})}));
  });}
  class FeishuAdapter {
    constructor(notify){this.notify=notify;this.memory=new Map();this.hiddenPanel=null;this.sending=false;}
    isBasePage(){return !!M.target(location.href)&&!!document.querySelector('.bitable-view-menu-item[data-view-id], .faster-view, .bitable-sidebar-container, #BASE_CARD_MODAL_CONTENT_FOCUS_ID');}
    card(){return [...document.querySelectorAll('#BASE_CARD_MODAL_CONTENT_FOCUS_ID')].find(visible)||null;}
    views(){return [...document.querySelectorAll('.bitable-view-menu-item[data-view-id]')].filter(e=>!e.closest('[aria-hidden="true"]'));}
    view(){return this.views().find(e=>e.classList.contains('bitable-view-menu-item--tab-active'));}
    viewId(){return this.view()?.getAttribute('data-view-id')||new URL(location.href).searchParams.get('view');}
    viewName(){return this.view()?.querySelector('.bitable-view-menu-item__content__text')?.textContent||'当前视图';}
    editor(){return this.card()?.querySelector('.record-discussion-container [contenteditable="true"][data-placeholder], .record-discussion-content [contenteditable="true"]')||null;}
    commentsOpen(){return visible(this.editor())&&!this.hiddenPanel;}
    hasDraft(){const e=this.editor();return !!e&&(!!clean(e.textContent)||!!e.querySelector('img,[data-mention-id],video,[data-file-token]'));}
    guardDraft(){if(this.hasDraft())throw new Error('当前记录有未发送的评论。请先发送或清空，再切换。');}
    selected(){
      const root=document.querySelector('.faster-overlay');
      const node=root?.querySelector('[id^="BITABLE_TEXT_EDITOR_CONTAINER_ID_PREFIX_rec"], [id^="BITABLE_URL_EDITOR_CONTAINER_rec"]');
      const id=node?.id.match(/(?:PREFIX_|CONTAINER_)(rec[^_]+)_/)?.[1];
      if(!id)return null;
      const rect=node.getBoundingClientRect();
      return {id,node,x:rect.x,y:rect.y+rect.height/2,title:clean(node.textContent),rect};
    }
    cardRecordId(){return this.card()?.querySelector('[id^="BITABLE_TEXT_EDITOR_CONTAINER_ID_PREFIX_rec"]')?.id.match(/PREFIX_(rec[^_]+)_/)?.[1]||null;}
    state(){return this.commentsOpen()?'评论输入':this.card()?'详情浏览':'记录列表';}
    remember(){const s=this.selected();if(s)this.memory.set(this.viewId(),{id:s.id,title:s.title,y:s.y});}
    async rows(){let data=await paint();if(!data.rows.length){await sleep(160);data=await paint();}return data;}
    canvas(){return [...document.querySelectorAll('canvas[role="faster"]')].find(visible);}
    async selectRow(row){
      const canvas=this.canvas();if(!canvas)throw new Error('当前视图不是支持的表格视图。');
      const r=canvas.getBoundingClientRect();
      if(row.x<r.left||row.x>r.right||row.y<r.top||row.y>r.bottom)throw new Error('表格布局已变化，请再按一次。');
      const before=this.selected()?.id;pointer(canvas,row.x,row.y);
      const selected=await waitFor(()=>{const s=this.selected();return s&&(s.id!==before||Math.abs(s.y-row.y)<24)?s:null;},700);
      if(!selected)throw new Error('未能选中记录；请刷新飞书页面后重试。');
      this.remember();return selected;
    }
    async ensureSelection(){
      if(this.selected())return this.selected();
      const data=await this.rows();
      if(!data.rows.length)throw new Error(data.paintCount?'当前没有可识别的记录。请展开分组，或检查视图是否为空。':'尚未获取表格绘制信息。安装扩展后请刷新飞书页面。');
      const saved=this.memory.get(this.viewId());
      const row=data.rows.find(r=>saved?.title&&saved.title.startsWith(r.title))||data.rows[0];
      return this.selectRow(row);
    }
    async moveRecord(direction){
      this.guardDraft();
      const card=this.card();
      if(card){
        const button=card.querySelector(direction<0?'.bitable-card-modal-header-v2-btn-prev':'.bitable-card-modal-header-v2-btn-next');
        if(!button||button.disabled||button.classList.contains('disabled')||button.getAttribute('aria-disabled')==='true'){this.notify(direction<0?'已经是第一条记录':'已经是最后一条记录');return;}
        const old=this.cardRecordId(),comments=this.commentsOpen();button.click();
        if(!await waitFor(()=>this.cardRecordId()&&this.cardRecordId()!==old))throw new Error('记录未完成切换，请稍后再试。');
        this.clearFieldFocus?.();if(comments)await this.openComments();this.card()?.focus({preventScroll:true});
        this.remember();return;
      }
      const initial=this.selected();if(!initial){await this.ensureSelection();return;}
      const editable=initial.node.querySelector('[contenteditable="true"]')||initial.node;
      editable.focus({preventScroll:true});
      key(editable,direction<0?'ArrowUp':'ArrowDown');
      if(await waitFor(()=>this.selected()?.id&&this.selected().id!==initial.id,250)){this.remember();return;}
      // If the native grid ignores synthetic keys, use fresh rendered row positions.
      let data=await this.rows();let row=data.rows.find(r=>direction>0?r.y>initial.y+10:false);
      if(direction<0)row=data.rows.filter(r=>r.y<initial.y-10).at(-1);
      if(row){await this.selectRow(row);return;}
      const canvas=this.canvas();if(!canvas)throw new Error('没有找到记录表格。');
      canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:direction*200,deltaMode:0,bubbles:true,cancelable:true}));
      await sleep(200);data=await this.rows();const current=this.selected();
      row=direction>0?data.rows.find(r=>r.y>(current?.y||initial.y)+10):data.rows.filter(r=>r.y<(current?.y||initial.y)-10).at(-1);
      if(row){await this.selectRow(row);return;}
      this.notify(direction<0?'已到当前可浏览记录的开头':'已到当前可浏览记录的末尾');
    }
    async openDetail(){
      if(this.card())return;
      const s=await this.ensureSelection(),editable=s.node.querySelector('[contenteditable="true"]')||s.node;
      editable.focus({preventScroll:true});key(editable,'e','KeyE',M.nativeBinding('openDetail').startsWith('Meta')?{metaKey:true}:{ctrlKey:true});
      if(await waitFor(()=>this.card(),400))return;
      const data=await this.rows(),row=data.rows.find(r=>Math.abs(r.y-s.y)<22);
      if(!row)throw new Error('当前选中记录不在可见区域，请先重新选择记录。');
      pointer(this.canvas(),row.x,row.y,true);
      const menu=await waitFor(()=>[...document.querySelectorAll('[role="menu"] li')].find(e=>visible(e)&&clean(e.textContent)==='查看详情'),600);
      if(!menu)throw new Error('没有找到查看详情入口。');
      menu.click();if(!await waitFor(()=>this.card()))throw new Error('详情未能展开。');
    }
    restoreHidden(){if(this.hiddenPanel){this.hiddenPanel.hidden=false;this.hiddenPanel.style.removeProperty('display');this.hiddenPanel=null;}}
    async openComments(){
      if(!this.card())await this.openDetail();
      this.restoreHidden();
      if(!visible(this.editor())){
        const button=this.card().querySelector('.bitable-discussion-add-button');
        if(!button)throw new Error('没有找到评论入口。');button.click();
      }
      const editor=await waitFor(()=>visible(this.editor())&&this.editor());
      if(!editor)throw new Error('评论输入框不可用，请检查评论权限。');
      editor.focus({preventScroll:false});
      if(!editor.contains(document.activeElement)&&document.activeElement!==editor)throw new Error('未能聚焦评论输入框。');
      // Preserve the cursor if already inside this editor; otherwise append dictation.
      const selection=getSelection();if(!selection?.anchorNode||!editor.contains(selection.anchorNode)){const r=document.createRange();r.selectNodeContents(editor);r.collapse(false);selection.removeAllRanges();selection.addRange(r);}
    }
    async closeComments(){
      if(!this.commentsOpen())return;
      if(this.hasDraft()){
        const panel=this.editor().closest('.record-discussion-container-horizontal')||this.editor().closest('.record-discussion-container');
        if(!panel)throw new Error('草稿已保留，请先发送或清空后收起。');
        panel.style.display='none';panel.hidden=true;this.hiddenPanel=panel;
        this.card().focus({preventScroll:true});this.notify('评论已收起，草稿保留在当前记录');return;
      }
      this.card().querySelector('.bitable-discussion-add-button')?.click();
      await waitFor(()=>!visible(this.editor()),600);this.card()?.focus({preventScroll:true});
    }
    async closeDetail(){
      this.guardDraft();if(!this.card())return;this.remember();
      this.card().querySelector('.bitable-card-modal-header-v2-btn-close')?.click();
      if(!await waitFor(()=>!this.card()))throw new Error('详情未能关闭。');
      this.clearFieldFocus?.();this.focusGrid();
    }
    async back(){if(this.leaveInput())return;if(this.commentsOpen())return this.closeComments();if(this.card())return this.closeDetail();this.notify('已经回到记录列表');}
    async switchView(direction,requestedId){
      this.guardDraft();this.remember();await this.closeDetail();
      const views=this.views(),current=views.indexOf(this.view()),target=requestedId?views.find(e=>e.getAttribute('data-view-id')===requestedId):views[current+direction];
      if(!target){this.notify(requestedId?'默认视图不在当前数据表中':direction<0?'已经是第一个视图':'已经是最后一个视图');return;}
      const id=target.getAttribute('data-view-id');if(id===this.viewId()){await this.ensureSelection();return;}
      target.scrollIntoView({block:'nearest',inline:'nearest'});target.click();
      if(!await waitFor(()=>this.viewId()===id))throw new Error('视图未完成切换。');
      await sleep(300);await this.ensureSelection();this.notify('已切换到 '+this.viewName());
    }
    async firstView(){
      const first=this.views()[0]?.getAttribute('data-view-id');
      if(!first){this.guardDraft();await this.closeDetail();this.notify('当前页面没有可切换的视图');return;}
      return this.switchView(0,first);
    }
    sidebarExpanded(){
      const root=document.querySelector('#bitable-sidebar-wrapper');
      if(root)return !root.classList.contains('fold');
      const opener=document.querySelector('.bitable-sidebar-opener');
      if(opener)return !opener.classList.contains('visible');
      return null;
    }
    async toggleSidebar(){
      const expanded=this.sidebarExpanded();
      if(expanded===null)throw new Error('当前页面没有可切换的多维表格侧边栏。');
      const button=document.querySelector(expanded?'.bitable-sidebar-close-icon-wrap':'.bitable-sidebar-opener');
      if(!button)throw new Error('没有找到侧边栏开关。');
      button.click();
      if(!await waitFor(()=>this.sidebarExpanded()===!expanded))throw new Error('侧边栏尚未完成切换，请稍后再试。');
      this.notify(expanded?'侧边栏已折叠':'侧边栏已展开');
    }
    async send(){
      if(this.sending)return;
      const editor=this.editor();if(!visible(editor))throw new Error('请先打开评论输入框。');
      if(!this.hasDraft()){this.notify('评论还没有内容');editor.focus();return;}
      const button=this.card().querySelector('.bitable-discussion__reply__send-btn-wrap_new_ui');
      if(!button||/disabled/.test(button.className)||button.getAttribute('aria-disabled')==='true')throw new Error('评论暂时不能发送，请稍候。');
      this.sending=true;this.notify('正在发送评论…');
      try {button.click();if(!await waitFor(()=>!this.hasDraft(),4500))throw new Error('未确认评论发送成功，请检查飞书中的结果后再试。');this.notify('评论已发送');this.editor()?.focus({preventScroll:true});}finally{this.sending=false;}
    }
    async confirm(){if(!this.card())return this.openDetail();if(this.inputContext({target:document.activeElement})==='comment')return this.send();if(await this.activateField())return;if(!this.commentsOpen())return this.openComments();return this.openComments();}
    scroll(direction){
      const root=this.commentsOpen()?this.editor()?.closest('.record-discussion-container'):this.card();
      if(!root){const canvas=this.canvas();canvas?.dispatchEvent(new WheelEvent('wheel',{deltaY:direction*400,bubbles:true,cancelable:true}));return;}
      const areas=[root,...root.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+20&&e.clientHeight>80&&/(auto|scroll)/.test(getComputedStyle(e).overflowY));
      const area=areas.sort((a,b)=>b.clientHeight-a.clientHeight)[0];
      if(!area){this.notify('内容已完整显示');return;}area.scrollBy({top:direction*area.clientHeight*.8,behavior:'smooth'});
    }
    deleteBackward(){
      const e=document.activeElement;if(!e)return;
      const inComment=this.editor()?.contains(e)||e===this.editor();
      const editable=e.isContentEditable||e.matches('textarea,input:not([type="button"]):not([type="checkbox"])');
      if(!editable||!['comment','other','grid-edit'].includes(this.inputContext({target:e})))return;
      // Browser editing commands preserve the editor's input events and undo stack.
      document.execCommand('delete',false);
    }
    inputContext(e){
      const node=e.target?.nodeType===1?e.target:document.activeElement;
      const editable=node?.closest('input,textarea,[contenteditable="true"]');
      if(!editable||!visible(editable)||getComputedStyle(editable).opacity==='0'||editable.disabled||editable.readOnly||editable.matches('input[type="button"],input[type="checkbox"],input[type="radio"],input[type="submit"],input[type="range"],input[type="file"],input[type="color"]'))return 'none';if(this.editor()?.contains(editable)||editable===this.editor())return 'comment';
      if(editable.closest('.faster-overlay')){
        // Feishu focuses a tiny empty contenteditable even when a cell is only selected.
        // Only the expanded editor or an actual visible form control is text input.
        const expanded=editable.closest('.editor-component--with-input-toolbar, .bitable-text-editor-container--with-input-toolbar, .bitable-text-editor-container--voice-cell-edit');
        const r=editable.getBoundingClientRect();
        const textControl=editable.matches('input,textarea')&&!editable.classList.contains('hidden-input');
        return expanded||((textControl||editable.isContentEditable)&&r.width>32&&r.height>16)?'grid-edit':'grid';
      }
      return 'other';
    }
  }
  M.FeishuAdapter=FeishuAdapter;M.visible=visible;
})();
