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
    const listener=e=>{try{
      // MAIN-world events are page-controlled input, even on a supported host.
      if(typeof e.detail!=='string'||e.detail.length>2000000)return;
      const data=JSON.parse(e.detail);
      if(data?.id!==id||!Array.isArray(data.rows)||data.rows.length>1000||!Number.isSafeInteger(data.paintCount)||data.paintCount<0||data.paintCount>9000)return;
      if(!data.rows.every(r=>r&&typeof r.number==='string'&&/^\d{1,6}$/.test(r.number)&&typeof r.title==='string'&&r.title.length>0&&r.title.length<=1500&&Number.isFinite(r.x)&&Number.isFinite(r.y)))return;
      clearTimeout(timer);document.removeEventListener('fmr:canvas-result',listener);
      resolve({rows:data.rows.map(({number,title,x,y})=>({number,title,x,y})),paintCount:data.paintCount});
    }catch{}};
    document.addEventListener('fmr:canvas-result',listener);
    timer=setTimeout(()=>{document.removeEventListener('fmr:canvas-result',listener);resolve({rows:[],paintCount:0});},300);
    document.dispatchEvent(new CustomEvent('fmr:canvas-query',{detail:JSON.stringify({id})}));
  });}
  class FeishuAdapter {
    constructor(notify,getConfig=()=>M.DEFAULTS){this.notify=notify;this.getConfig=getConfig;this.memory=new Map();this.hiddenPanel=null;this.sending=false;this.commentCloseTimer=null;this.commentCloseCleanup=null;this.commentCloseEpoch=0;}
    isBasePage(){return !!M.target(location.href)&&!!document.querySelector('.bitable-view-menu-item[data-view-id], .faster-view, .bitable-sidebar-container, #BASE_CARD_MODAL_CONTENT_FOCUS_ID');}
    card(){return [...document.querySelectorAll('#BASE_CARD_MODAL_CONTENT_FOCUS_ID')].find(visible)||null;}
    views(){return [...document.querySelectorAll('.bitable-view-menu-item[data-view-id]')].filter(e=>!e.closest('[aria-hidden="true"]'));}
    view(){return this.views().find(e=>e.classList.contains('bitable-view-menu-item--tab-active'));}
    viewId(){return this.view()?.getAttribute('data-view-id')||new URL(location.href).searchParams.get('view');}
    viewName(){return this.view()?.querySelector('.bitable-view-menu-item__content__text')?.textContent||'当前视图';}
    editor(){return this.card()?.querySelector('.record-discussion-container [contenteditable="true"][data-placeholder], .record-discussion-content [contenteditable="true"]')||null;}
    commentsOpen(){return visible(this.editor())&&!this.hiddenPanel;}
    hasDraft(){const e=this.editor();return !!e&&(!!clean(e.textContent)||!!e.querySelector('img,[data-mention-id],video,[data-file-token]'));}
    commentCount(){
      const text=clean(this.card()?.querySelector('.record-discussion-header-text')?.textContent);
      const match=text.match(/[（(]\s*(\d+)\s*[）)]/);
      return match?Number(match[1]):/^(?:评论|comments?)$/i.test(text)?0:null;
    }
    cancelCommentAutoClose(){
      this.commentCloseEpoch++;
      if(this.commentCloseTimer!==null)clearTimeout(this.commentCloseTimer);
      this.commentCloseTimer=null;this.commentCloseCleanup?.();this.commentCloseCleanup=null;
    }
    scheduleCommentAutoClose(card,recordId,epoch,delaySeconds){
      const context=location.pathname+'|'+new URL(location.href).searchParams.get('table');
      const sameRecord=()=>this.card()===card&&this.cardRecordId()===recordId&&context===location.pathname+'|'+new URL(location.href).searchParams.get('table');
      const interrupt=e=>{
        const target=e.target;
        if(!target?.closest||!card.contains(target))return;
        const comment=target.closest('.record-discussion-container, .record-discussion-container-horizontal, [data-fmr-dictation]');
        if(comment||(e.type==='pointerdown'&&target.closest('.bitable-discussion-add-button')))this.cancelCommentAutoClose();
      };
      for(const type of ['beforeinput','compositionstart','pointerdown'])document.addEventListener(type,interrupt,true);
      this.commentCloseCleanup=()=>{for(const type of ['beforeinput','compositionstart','pointerdown'])document.removeEventListener(type,interrupt,true);};
      this.commentCloseTimer=setTimeout(()=>{
        this.commentCloseTimer=null;this.commentCloseCleanup?.();this.commentCloseCleanup=null;
        if(this.commentCloseEpoch!==epoch||!sameRecord()||!this.commentsOpen()||this.hasDraft()||this.dictationRelay?.hasPending())return;
        void this.closeComments().then(()=>this.notify('评论已发送 · 已收起')).catch(error=>this.notify(error.message||'评论未能自动收起。',true));
      },Math.round(delaySeconds*1000));
    }
    guardDraft(){if(this.dictationRelay?.hasPending())throw new Error('正在接收或保留语音文字，请先处理后再切换。');if(this.hasDraft())throw new Error('当前记录有未发送的评论。请先发送或清空，再切换。');}
    selected(){
      const root=document.querySelector('.faster-overlay');
      const node=root?.querySelector('[id^="BITABLE_TEXT_EDITOR_CONTAINER_ID_PREFIX_rec"], [id^="BITABLE_URL_EDITOR_CONTAINER_rec"]');
      const id=node?.id.match(/(?:PREFIX_|CONTAINER_)(rec[^_]+)_/)?.[1];
      if(!id)return null;
      const rect=node.getBoundingClientRect();
      return {id,node,x:rect.x,y:rect.y+rect.height/2,title:clean(node.textContent),rect};
    }
    cardRecordId(){return this.card()?.querySelector('[id^="BITABLE_TEXT_EDITOR_CONTAINER_ID_PREFIX_rec"], [id^="BITABLE_URL_EDITOR_CONTAINER_rec"]')?.id.match(/(?:PREFIX_|CONTAINER_)(rec[^_]+)_/)?.[1]||null;}
    state(){return this.commentsOpen()?(this.inputContext({target:document.activeElement})==='comment'?'评论输入':'评论浏览'):this.card()?'详情浏览':'记录列表';}
    remember(){const s=this.selected();if(s)this.memory.set(this.viewId(),{id:s.id,title:s.title,y:s.y});}
    async rows(){let data=await paint();if(!data.rows.length){await sleep(160);data=await paint();}return data;}
    canvas(){return [...document.querySelectorAll('canvas[role="faster"]')].find(visible);}
    async selectRow(row){
      const canvas=this.canvas();if(!canvas)throw new Error('当前视图不是支持的表格视图。');
      const r=canvas.getBoundingClientRect();
      if(!Number.isFinite(row?.x)||!Number.isFinite(row?.y)||row.x<r.left||row.x>r.right||row.y<r.top||row.y>r.bottom)throw new Error('表格布局已变化，请再按一次。');
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
        const old=this.cardRecordId();button.click();
        if(!await waitFor(()=>this.cardRecordId()&&this.cardRecordId()!==old))throw new Error('记录未完成切换，请稍后再试。');
        this.clearFieldFocus?.();this.card()?.focus({preventScroll:true});
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
    async toggleComments(){
      this.cancelCommentAutoClose();
      if(this.commentsOpen())return this.closeComments();
      await this.openComments({focus:false});
      // Keep the next OK on comments instead of activating a previously selected field.
      const stop=this.fieldStops().find(s=>s.kind==='comment');
      if(stop)this.focusStop(stop);
      else {this.clearFieldFocus();this.notify('评论已展开 · 按确定开始输入');}
    }
    async openComments({focus=true}={}){
      this.onCommentsIntent?.();
      this.cancelCommentAutoClose();
      if(!this.card())await this.openDetail();
      this.onCommentsIntent?.();
      this.restoreHidden();
      if(!visible(this.editor())){
        const button=this.card().querySelector('.bitable-discussion-add-button');
        if(!button)throw new Error('没有找到评论入口。');button.click();
      }
      const editor=await waitFor(()=>visible(this.editor())&&this.editor());
      if(!editor)throw new Error('评论输入框不可用，请检查评论权限。');
      if(!focus){this.card()?.focus({preventScroll:true});return;}
      const selection=getSelection(),keepCaret=editor.contains(document.activeElement)&&editor.contains(selection?.anchorNode);
      editor.focus({preventScroll:false});
      if(!editor.contains(document.activeElement)&&document.activeElement!==editor)throw new Error('未能聚焦评论输入框。');
      // Preserve the cursor if already inside this editor; otherwise append dictation.
      if(selection&&!keepCaret){const r=document.createRange();r.selectNodeContents(editor);r.collapse(false);selection.removeAllRanges();selection.addRange(r);}
      this.notify('评论输入 · 可使用语音输入，菜单键收起评论');
    }
    async closeComments(){
      this.onCommentsIntent?.(false);
      this.cancelCommentAutoClose();
      if(!this.commentsOpen())return;
      if(this.hasDraft()){
        const panel=this.editor().closest('.record-discussion-container-horizontal')||this.editor().closest('.record-discussion-container');
        if(!panel)throw new Error('草稿已保留，请先发送或清空后收起。');
        panel.style.display='none';panel.hidden=true;this.hiddenPanel=panel;
        this.card().focus({preventScroll:true});this.notify('评论已收起，草稿保留在当前记录');return;
      }
      this.card().querySelector('.bitable-discussion-add-button')?.click();
      if(!await waitFor(()=>!visible(this.editor()),600))throw new Error('评论未能收起，请稍后再试。');
      this.card()?.focus({preventScroll:true});
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
    async collapseSidebarForMeeting(){
      if(this.meetingSidebar)return;
      // An opener can be rendered before the real sidebar. Its temporary state
      // must not be treated as the completed sidebar's initial state.
      if(!document.querySelector('#bitable-sidebar-wrapper'))return;
      const expanded=this.sidebarExpanded(),key='fmr-sidebar:'+location.pathname,remembered=M.pageSession(key);
      // Base can render its grid before the sidebar controls. Leave setup
      // pending until those controls mount instead of remembering "no sidebar".
      if(expanded===null||(expanded&&!document.querySelector('.bitable-sidebar-close-icon-wrap')))return;
      const original=this.meetingSidebar={path:location.pathname,expanded:remembered==='true'?true:remembered==='false'?false:expanded};
      M.pageSession(key,String(original.expanded));
      // Hydration can replace the sidebar or restore its saved open state after
      // a successful first click. Require a short stable collapse, with a bound
      // on retries. A real user's interaction ends this startup reconciliation.
      let interrupted=false,stableSince=0,lastRoot=null;
      const interrupt=e=>{if(e.isTrusted)interrupted=true;};
      window.addEventListener('pointerdown',interrupt,true);
      window.addEventListener('keydown',interrupt,true);
      try{
        const end=Date.now()+4000;
        while(Date.now()<end&&this.meetingSidebar===original&&!interrupted){
          const root=document.querySelector('#bitable-sidebar-wrapper');
          if(root&&this.sidebarExpanded()===false){
            if(root!==lastRoot||!stableSince)stableSince=Date.now();
            if(Date.now()-stableSince>=500)return;
          }else{
            stableSince=0;
            const close=root&&document.querySelector('.bitable-sidebar-close-icon-wrap');
            close?.click();
          }
          lastRoot=root;await sleep(100);
        }
        if(!interrupted&&this.meetingSidebar===original&&this.sidebarExpanded()!==false)
          throw new Error('侧边栏尚未完成加载，可用侧边栏快捷键收起。');
      }finally{
        window.removeEventListener('pointerdown',interrupt,true);
        window.removeEventListener('keydown',interrupt,true);
      }
    }
    async restoreMeetingSidebar(){
      const original=this.meetingSidebar;this.meetingSidebar=null;
      if(original?.path!==location.pathname)return;
      const current=this.sidebarExpanded();
      if(typeof original.expanded==='boolean'&&typeof current==='boolean'&&current!==original.expanded)await this.toggleSidebar();
      M.pageSession('fmr-sidebar:'+original.path,null);
    }
    async send(){
      if(this.dictationRelay?.hasPending())throw new Error('语音文字尚未完成接入，请稍候再发送。');
      if(this.sending)return;
      this.cancelCommentAutoClose();
      const editor=this.editor();if(!visible(editor))throw new Error('请先打开评论输入框。');
      if(!this.hasDraft()){this.notify('评论还没有内容');editor.focus();return;}
      const card=this.card(),recordId=this.cardRecordId(),beforeCount=this.commentCount(),epoch=this.commentCloseEpoch;
      const button=card.querySelector('.bitable-discussion__reply__send-btn-wrap_new_ui');
      if(!button||/disabled/.test(button.className)||button.getAttribute('aria-disabled')==='true')throw new Error('评论暂时不能发送，请稍候。');
      this.sending=true;this.notify('正在发送评论…');
      try {
        button.click();
        if(!await waitFor(()=>{
          if(this.card()!==card||this.cardRecordId()!==recordId||!this.editor()||this.hasDraft())return false;
          const afterCount=this.commentCount();return beforeCount===null||(afterCount!==null&&afterCount>beforeCount);
        },4500))throw new Error('未确认评论发送成功，请检查飞书中的结果后再试。');
        const config=this.getConfig(),willClose=this.commentCloseEpoch===epoch&&config.autoCloseComments;
        this.notify(willClose?(config.commentCloseDelay===0?'评论已发送，即将收起':`评论已发送，${config.commentCloseDelay} 秒后收起`):'评论已发送');
        if(willClose)this.scheduleCommentAutoClose(card,recordId,epoch,config.commentCloseDelay);
      }finally{this.sending=false;}
    }
    async confirm(){if(this.dictationRelay?.hasPending())throw new Error('语音文字尚未完成接入，请稍候再操作。');if(!this.card())return this.openDetail();if(this.inputContext({target:document.activeElement})==='comment')return this.send();if(await this.activateField())return;return this.openComments();}
    async appendDictation(text,bound,isCurrent){
      if(!isCurrent()||this.card()!==bound.card)throw new Error('记录已变化，语音文字已保留。');
      await this.openComments();
      if(!isCurrent()||this.card()!==bound.card)throw new Error('输入法或记录已变化，语音文字已保留。');
      const editor=this.editor(),before=editor.textContent||'',selection=getSelection(),range=document.createRange();
      range.selectNodeContents(editor);range.collapse(false);selection.removeAllRanges();selection.addRange(range);
      document.execCommand('insertText',false,text);
      // Allow the native editor to reconcile its input state before releasing
      // our backup; a DOM insertion alone must not be mistaken for a saved draft.
      await sleep(0);
      // Native contenteditable may represent line breaks as block boundaries.
      const plain=s=>s.replace(/[\r\n\u200b\ufeff]/g,'').replace(/\u00a0/g,' ');
      const current=this.editor();
      if(!isCurrent()||!current||plain(current.textContent||'')!==plain(before+text))throw new Error('未能确认语音文字完整写入，原文已保留；请先核对评论，避免重复。');
      if(current!==editor){current.focus({preventScroll:true});range.selectNodeContents(current);range.collapse(false);selection.removeAllRanges();selection.addRange(range);}
    }
    scroll(direction){
      const root=this.commentsOpen()?this.editor()?.closest('.record-discussion-container'):this.card();
      if(!root){const canvas=this.canvas();canvas?.dispatchEvent(new WheelEvent('wheel',{deltaY:direction*400,bubbles:true,cancelable:true}));return;}
      const areas=[root,...root.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+20&&e.clientHeight>80&&/(auto|scroll)/.test(getComputedStyle(e).overflowY));
      const area=areas.sort((a,b)=>b.clientHeight-a.clientHeight)[0];
      if(!area){this.notify('内容已完整显示');return;}area.scrollBy({top:direction*area.clientHeight*.8,behavior:'smooth'});
    }
    inputIsEmpty(){
      const active=document.activeElement;
      if(!['comment','other','grid-edit'].includes(this.inputContext({target:active})))return false;
      const editor=active?.closest('input,textarea,[contenteditable="true"]');if(!editor)return false;
      if(editor.matches('input,textarea'))return editor.value.length===0;
      return !(editor.textContent||'').replace(/[\u200b\ufeff]/g,'')&&!editor.querySelector('img,video,audio,[data-mention-id],[data-file-token]');
    }
    async deleteBackward(){
      const e=document.activeElement;if(!e)return;
      const editable=e.isContentEditable||e.matches('textarea,input:not([type="button"]):not([type="checkbox"])');
      if(!editable||!['comment','other','grid-edit'].includes(this.inputContext({target:e})))return this.back();
      // Empty editors stay active, even after repeated or held deletion.
      if(this.inputIsEmpty())return;
      // Browser editing commands preserve the editor's input events and undo stack.
      document.execCommand('delete',false);
    }
    inputContext(e){
      const node=e.target?.nodeType===1?e.target:document.activeElement;
      if(node?.closest('[data-fmr-dictation]'))return 'relay';
      // URL field links inherit contenteditable from Feishu's rich-text wrapper.
      // A link explicitly focused by field navigation is still an action, not a caret.
      if(this.fieldFocus?.element===node&&node.hasAttribute('data-fmr-target'))return 'none';
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
