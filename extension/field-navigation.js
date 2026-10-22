(() => {
  'use strict';
  const M=globalThis.MeetingRemote, A=M.FeishuAdapter.prototype;
  const FIELD='.bitable-record-card-field-wrapper, .card-field-editor';
  const EDITOR='[contenteditable="true"], textarea, input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"])';
  const shown=e=>M.visible(e)&&!e.closest('[hidden],[aria-hidden="true"]');
  const usable=e=>shown(e)&&!e.disabled&&!e.readOnly&&getComputedStyle(e).opacity!=='0';
  const label=field=>field.querySelector('.bitable-card-field-label__name')?.textContent.trim()||'字段';
  const arrow={up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'};

  A.clearFieldFocus=function(){
    if(this.fieldFocus){
      const {field,element,tabindex}=this.fieldFocus;
      field.removeAttribute('data-fmr-focused');element.removeAttribute('data-fmr-target');
      if(tabindex===null)element.removeAttribute('tabindex');else element.setAttribute('tabindex',tabindex);
    }
    this.fieldFocus=null;
  };
  A.fieldStops=function(){
    const card=this.card();if(!card)return [];
    const fields=[...card.querySelectorAll(FIELD)].filter(shown).filter(e=>!e.parentElement.closest(FIELD));
    const stops=[];
    for(const field of fields){
      const links=[...field.querySelectorAll('a[href]')].filter(e=>shown(e)&&/^https?:\/\//i.test(e.href));
      // A URL field has one stop per link. Rich text retains a field stop for reading/editing.
      if(!field.querySelector('.bitable-card-edit-cell-editor-Url')||!links.length)stops.push({field,element:field,kind:'field'});
      for(const element of links)stops.push({field,element,kind:'link'});
    }
    const button=card.querySelector('.bitable-discussion-add-button');
    if(shown(button))stops.push({field:button,element:button,kind:'comment'});
    return stops;
  };
  A.currentFieldStop=function(){
    const f=this.fieldFocus;
    if(f&&f.element.isConnected&&this.card()?.contains(f.element)&&f.record===this.cardRecordId())return f;
    this.clearFieldFocus();return null;
  };
  A.focusStop=function(stop){
    this.clearFieldFocus();
    this.fieldFocus={...stop,tabindex:stop.element.getAttribute('tabindex'),record:this.cardRecordId()};
    stop.element.setAttribute('tabindex','-1');
    stop.field.setAttribute('data-fmr-focused','');stop.element.setAttribute('data-fmr-target','');
    stop.element.focus({preventScroll:true});
    stop.element.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    this.notify(stop.kind==='comment'?'评论 · 按确定开始输入':label(stop.field)+(stop.kind==='link'?' · 按确定在新标签页打开':' · 按确定操作'));
  };
  A.moveField=function(direction){
    const stops=this.fieldStops();if(!stops.length){this.scroll(direction);return;}
    const current=this.currentFieldStop();
    if(current?.kind==='field'){
      const area=[...current.field.querySelectorAll('*')].find(e=>shown(e)&&e.clientHeight>80&&e.scrollHeight>e.clientHeight+4&&/(auto|scroll)/.test(getComputedStyle(e).overflowY));
      if(area&&((direction>0&&area.scrollTop+area.clientHeight<area.scrollHeight-2)||(direction<0&&area.scrollTop>2))){
        area.scrollBy({top:direction*Math.max(80,area.clientHeight*.7),behavior:'instant'});return;
      }
    }
    const index=current?stops.findIndex(s=>s.element===current.element):-1;
    const next=index<0?(direction>0?0:stops.length-1):index+direction;
    if(next<0||next>=stops.length){this.notify(direction<0?'已经是第一个字段':'已经是最后一个字段');return;}
    this.focusStop(stops[next]);
  };
  A.activateField=async function(){
    const stop=this.currentFieldStop();if(!stop)return false;
    if(stop.kind==='comment'){await this.openComments();return true;}
    if(stop.kind==='link'){
      const response=await chrome.runtime.sendMessage({type:'open-field-link',url:stop.element.href});
      if(!response?.ok)throw new Error(response?.error||'链接未能打开');
      return true;
    }
    const editor=[...stop.field.querySelectorAll(EDITOR)].find(usable);
    if(editor){editor.focus({preventScroll:true});editor.click();return true;}
    const control=[...stop.field.querySelectorAll('button,[role="combobox"],[role="button"],input[type="checkbox"]')].find(e=>usable(e)&&e.getAttribute('aria-disabled')!=='true');
    if(control){control.click();return true;}
    const container=stop.field.querySelector('.b-field-label__editor');
    if(container&&!stop.field.matches('[aria-readonly="true"],[aria-disabled="true"]')){container.click();return true;}
    this.notify('此字段只读，可继续上下浏览');return true;
  };
  A.leaveInput=function(){
    const active=document.activeElement,context=this.inputContext({target:active});
    if(!['comment','other','grid-edit'].includes(context))return false;
    // Blurring leaves the editor without bubbling Escape into a dialog's close handler.
    active.blur();
    const field=active.closest(FIELD);
    if(field&&this.card()?.contains(field))this.focusStop({field,element:field,kind:'field'});
    else if(this.card())this.card().focus({preventScroll:true});
    else this.focusGrid();
    this.notify('已退出输入状态');return true;
  };
  A.focusGrid=function(){
    const root=document.querySelector('.faster-view')||this.canvas();if(!root)return;
    if(!root.hasAttribute('tabindex'))root.setAttribute('tabindex','-1');root.focus({preventScroll:true});
  };
  A.moveCaret=function(direction){
    const e=document.activeElement;if(!e)return;
    if(this.editorPopupOpen()){
      e.dispatchEvent(new KeyboardEvent('keydown',{key:arrow[direction],code:arrow[direction],bubbles:true,cancelable:true}));return;
    }
    if(e.isContentEditable){
      const selection=getSelection();
      if(selection&&e.contains(selection.anchorNode)&&typeof selection.modify==='function')selection.modify('move',direction==='up'?'backward':direction==='down'?'forward':direction,direction==='up'||direction==='down'?'line':'character');
      return;
    }
    if(typeof e.selectionStart!=='number')return;
    const text=e.value,start=e.selectionStart,end=e.selectionEnd;
    let pos=direction==='left'||direction==='up'?start:end;
    if(direction==='left'||direction==='right'){
      if(start===end){
        const boundaries=[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(s=>s.index);boundaries.push(text.length);
        pos=direction==='left'?(boundaries.filter(i=>i<pos).at(-1)??0):(boundaries.find(i=>i>pos)??text.length);
      }
    }else{
      const lineStart=text.lastIndexOf('\n',Math.max(-1,pos-1))+1,column=pos-lineStart,lineEnd=text.indexOf('\n',pos);
      if(direction==='up'){
        const previousStart=text.lastIndexOf('\n',lineStart-2)+1;
        pos=lineStart===0?0:Math.min(previousStart+column,lineStart-1);
      }else pos=lineEnd<0?text.length:Math.min(lineEnd+1+column,text.indexOf('\n',lineEnd+1)<0?text.length:text.indexOf('\n',lineEnd+1));
    }
    e.setSelectionRange(pos,pos);
  };
  A.editorPopupOpen=function(){return [...document.querySelectorAll('[role="listbox"], [class*="mention-panel"]')].some(shown);};
})();
