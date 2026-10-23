(() => {
  'use strict';
  const M=globalThis.MeetingRemote;
  let config=M.DEFAULTS,enabled=false,ready=false,busy=false,changingMode=false,composing=false,compositionEnded=0,host,shadow,status,timer,seenDocument=null;
  const timings=new Map(),adapter=new M.FeishuAdapter(notify);
  let zoom=1,zoomRequest=0,pausedTimer,pausedHudVisible=false;
  const heldDeletes=new Set();
  // Keep the confirmed Base identity through transient DOM replacement during zoom.
  const scoped=()=>adapter.isBasePage()||!!(enabled&&seenDocument===modeKey()&&M.target(location.href));
  const modeKey=()=> 'fmr-enabled:'+location.pathname;
  function pausedNotice(){
    clearTimeout(pausedTimer);pausedHudVisible=true;
    pausedTimer=setTimeout(()=>{pausedHudVisible=false;update();},3000);
  }
  function syncPresentation(){
    const hide=enabled&&config.hideHeader&&scoped();
    if(document.documentElement.hasAttribute('data-fmr-presentation')===hide)return;
    document.documentElement.toggleAttribute('data-fmr-presentation',hide);
    window.dispatchEvent(new Event('resize'));
  }
  function notify(message,error=false){
    if(!enabled)pausedNotice();mount();update();if(!status)return;status.textContent=message;status.style.color=error?'#ffb4b4':'#fff';clearTimeout(timer);timer=setTimeout(()=>{timer=null;update();},4500);
  }
  function mount(){
    if(host?.isConnected||!document.documentElement)return;
    host=document.createElement('div');host.id='fmr-hud';host.dataset.fmrVersion=chrome.runtime.getManifest().version;host.style.cssText='position:fixed;z-index:2147483647;bottom:12px;left:50%;transform:translateX(-50%);max-width:calc(100vw - 24px);';
    shadow=host.attachShadow({mode:'closed'});
    shadow.innerHTML='<style>:host{all:initial;font:14px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}:host([hidden]){display:none!important}*{box-sizing:border-box}.bar{display:flex;align-items:center;gap:14px;background:#111e35f2;color:white;padding:11px 16px;border:1px solid #ffffff35;border-radius:14px;box-shadow:0 8px 26px #0003;white-space:nowrap;max-width:100%;}.dot{width:8px;height:8px;background:#4ade9c;border-radius:50%;flex:none}.state{font-weight:650}.help{font-size:12px;opacity:.75;overflow:hidden;text-overflow:ellipsis}button{background:#ffffff16;border:1px solid #ffffff32;border-radius:7px;color:white;padding:5px 8px;cursor:pointer;font:inherit;font-size:12px}.paused .dot{background:#a0acc0}@media(max-width:800px){.help{display:none}}</style><div class="bar"><span class="dot"></span><span class="state"></span><span class="help"></span><button class="toggle"></button><button class="settings">设置</button></div>';
    status=shadow.querySelector('.state');
    shadow.querySelector('.toggle').addEventListener('click',()=>run('toggle'));
    shadow.querySelector('.settings').addEventListener('click',()=>chrome.runtime.sendMessage({type:'open-settings'}));
    document.documentElement.append(host);update();
  }
  function update(){
    syncPresentation();if(!host)return;host.hidden=!scoped()||(enabled?!config.showHud:!pausedHudVisible);
    shadow.querySelector('.bar').classList.toggle('paused',!enabled);
    const setText=(el,text)=>{if(el.textContent!==text)el.textContent=text;};
    status.style.color='#fff';setText(status,enabled?adapter.state()+' · '+Math.round(zoom*100)+'%':'会议模式已关闭');
    setText(shadow.querySelector('.help'),enabled?`${adapter.card()?'上下浏览字段 · 左右换记录':'上下换记录 · 左右换视图'}　${M.label(config.bindings.confirm)} 确定　${M.label(config.bindings.deleteBackward)} 返回`:`按 ${M.label(config.bindings.toggle)} 进入全屏 · ${adapter.viewName()}`);
    setText(shadow.querySelector('.toggle'),enabled?'退出会议':'进入全屏');
  }
  async function zoomAction(direction){const request=++zoomRequest;const r=await chrome.runtime.sendMessage({type:'zoom',direction});if(!r?.ok)throw new Error(r?.error||'缩放失败');if(request!==zoomRequest)return;zoom=r.zoom;if(enabled)notify((direction>0&&zoom>=2.5?'已到最大缩放 ':direction<0&&zoom<=.5?'已到最小缩放 ':'缩放 ')+Math.round(zoom*100)+'%');}
  async function setEnabled(value,remember=true){
    adapter.cancelEmptyReturn();
    if(changingMode)return {ok:false,error:'正在切换会议模式'};
    changingMode=true;
    try {
      const r=await chrome.runtime.sendMessage({type:'presentation',enabled:value});
      if(!r?.ok)throw new Error(r?.error||'无法切换全屏状态');
      enabled=value;
      clearTimeout(timer);timer=null;clearTimeout(pausedTimer);pausedHudVisible=false;
      if(!enabled)pausedNotice();
      if(remember)M.pageSession(modeKey(),String(value));
      if(!enabled){adapter.restoreHidden();adapter.clearFieldFocus();}
      update();
      try{if(enabled)await adapter.collapseSidebarForMeeting();else await adapter.restoreMeetingSidebar();}catch(e){notify(e.message,true);}
      if(enabled&&!adapter.card()){try{await adapter.ensureSelection();}catch(e){notify(e.message,true);}}
      return {ok:true,enabled};
    }catch(e){notify(e.message,true);return {ok:false,error:e.message};}
    finally{changingMode=false;}
  }
  async function syncPage(){
    if(changingMode)return;
    if(!scoped()){
      if(enabled)await setEnabled(false,false);
      seenDocument=null;update();return;
    }
    const identity=modeKey();
    if(seenDocument===identity){
      if(enabled&&!adapter.meetingSidebar){try{await adapter.collapseSidebarForMeeting();}catch(e){notify(e.message,true);}}
      return;
    }
    seenDocument=identity;
    if(enabled)await setEnabled(false,false);
    const remembered=M.pageSession(identity);
    if(remembered==='true'||(remembered===null&&config.autoEnable))await setEnabled(true,false);
    update();
  }
  async function run(action){
    if(action!=='deleteBackward')adapter.cancelEmptyReturn();
    if(!ready||!scoped())return {ok:false,error:'请打开飞书多维表格。'};
    if(action==='toggle')return setEnabled(!enabled);
    if(action==='reloadPage'){
      try{adapter.guardDraft();const r=await chrome.runtime.sendMessage({type:'reload-page'});if(!r?.ok)throw new Error(r?.error||'重新加载失败');return {ok:true};}
      catch(e){notify(e.message,true);return {ok:false,error:e.message};}
    }
    if(!enabled)return {ok:false,error:'会议模式已关闭'};
    // Zoom has its own ordered queue. Navigation and earlier zooms must not drop it.
    if(M.isZoom(action)){
      try{await zoomAction(action==='zoomIn'?1:action==='zoomOut'?-1:0);return {ok:true};}
      catch(e){if(enabled)notify(e.message,true);return {ok:false,error:e.message};}
    }
    if(busy)return {ok:false,error:'上一项操作尚未完成'};
    busy=true;
    try{
      switch(action){
        case 'navigateUp':adapter.card()?adapter.moveField(-1):await adapter.moveRecord(-1);break;
        case 'navigateDown':adapter.card()?adapter.moveField(1):await adapter.moveRecord(1);break;
        case 'navigateLeft':adapter.card()?await adapter.moveRecord(-1):await adapter.switchView(-1);break;
        case 'navigateRight':adapter.card()?await adapter.moveRecord(1):await adapter.switchView(1);break;
        case 'previousRecord':await adapter.moveRecord(-1);break;
        case 'nextRecord':await adapter.moveRecord(1);break;
        case 'confirm':await adapter.confirm();break;
        case 'back':await adapter.back();break;
        case 'firstView':await adapter.firstView();break;
        case 'toggleSidebar':await adapter.toggleSidebar();break;
        case 'deleteBackward':await adapter.deleteBackward();break;
        case 'toggleComments':await adapter.toggleComments();break;
        case 'scrollDown':adapter.scroll(1);break;
        case 'scrollUp':adapter.scroll(-1);break;
        case 'openDetail':await adapter.openDetail();break;
        case 'closeDetail':await adapter.closeDetail();break;
        case 'openComments':await adapter.openComments();break;
        case 'closeComments':await adapter.closeComments();break;
        case 'sendComment':await adapter.send();break;
        default:throw new Error('未知动作');
      }
      if(!timer)update();return {ok:true,enabled,state:adapter.state()};
    }catch(error){notify(error.message,true);return {ok:false,error:error.message};}finally{busy=false;}
  }
  for(const type of ['input','beforeinput','focusin','focusout','pointerdown'])window.addEventListener(type,()=>adapter.cancelEmptyReturn(),true);
  window.addEventListener('blur',()=>{heldDeletes.clear();adapter.cancelEmptyReturn();});
  window.addEventListener('keyup',e=>{if(e.isTrusted)heldDeletes.delete(e.code);},true);
  window.addEventListener('compositionstart',()=>{composing=true;adapter.cancelEmptyReturn();},true);
  window.addEventListener('compositionend',()=>{composing=false;compositionEnded=Date.now();},true);
  window.addEventListener('keydown',e=>{
    if(!ready||!e.isTrusted)return;
    if(composing||e.isComposing||e.keyCode===229){adapter.cancelEmptyReturn();return;}
    const chord=M.chord(e),action=M.actionFor(chord,config);
    if(chord&&action?.id!=='deleteBackward')adapter.cancelEmptyReturn();
    if(!action||(!enabled&&!['toggle','reloadPage'].includes(action.id))||!scoped())return;
    // Volume keys bypass field/popup layout inspection and remain usable on HUD buttons.
    if(M.isZoom(action.id)){if(config.nativeBindings[action.id])return;e.preventDefault();e.stopImmediatePropagation();void run(action.id);return;}
    if(e.composedPath().includes(host))return;
    const context=adapter.inputContext(e);
    const emptyInput=action.id==='deleteBackward'&&adapter.inputIsEmpty();
    const repeat=e.repeat||(action.id==='deleteBackward'&&heldDeletes.has(e.code));
    if(action.id==='deleteBackward'){
      heldDeletes.add(e.code);
      if(!emptyInput||repeat)adapter.cancelEmptyReturn();
    }
    const policy=M.inputPolicy(action,chord,context,{native:config.nativeBindings[action.id],popup:adapter.editorPopupOpen(),emptyInput,repeat});
    if(policy==='pass'||policy==='native')return;
    if(context==='comment'&&Date.now()-compositionEnded<200&&['confirm','sendComment'].includes(action.id))return;
    if(policy==='caret'){e.preventDefault();e.stopImmediatePropagation();adapter.moveCaret(M.DIRECTIONS[action.id]);return;}
    e.preventDefault();e.stopImmediatePropagation();
    if(policy==='block')return;
    if(e.repeat&&!action.repeat)return;

    const time=Date.now(),last=timings.get(action.id)||0,delay=M.keyDelay(action,context);
    if(e.repeat&&time-last<delay)return;timings.set(action.id,time);void run(action.id);
  },true);
  chrome.runtime.onMessage.addListener((msg,_sender,respond)=>{
    if(msg?.type==='meeting-zoom'&&Number.isFinite(msg.zoom)&&msg.zoom>=.25&&msg.zoom<=5){++zoomRequest;adapter.cancelEmptyReturn();zoom=msg.zoom;if(enabled)notify('缩放 '+Math.round(zoom*100)+'%');respond({ok:true});return;}
    if(msg?.type==='meeting-status'){respond({ok:true,enabled,scoped:scoped(),state:adapter.state(),view:adapter.viewName(),draft:adapter.hasDraft(),version:chrome.runtime.getManifest().version});return;}
    if(msg?.type==='meeting-action'&&M.ACTIONS.some(a=>a.id===msg.action)){run(msg.action).then(respond);return true;}
  });
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local'&&changes.config){try{config=M.config(changes.config.newValue);adapter.cancelEmptyReturn();update();}catch(e){notify(e.message,true);}}
  });
  async function init(){
    try{config=M.config((await chrome.storage.local.get('config')).config);}catch{config=M.config();}
    ready=true;pausedNotice();mount();
    try{const r=await chrome.runtime.sendMessage({type:'get-zoom'});if(r.ok)zoom=r.zoom;}catch{}
    // Observe page transitions without repeatedly searching or touching application data.
    let scheduled=false;
    new MutationObserver(()=>{if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;if(!host?.isConnected)mount();void syncPage();if(!timer)update();},250);}).observe(document.body,{childList:true,subtree:true});
    window.addEventListener('popstate',()=>void syncPage());
    window.addEventListener('pagehide',()=>{
      heldDeletes.clear();adapter.cancelEmptyReturn();
      if(enabled)void chrome.runtime.sendMessage({type:'presentation',enabled:false}).catch(()=>{});
    });
    // A BFCache restore resumes the old script without rerunning init. Rejoin
    // the background meeting session that pagehide released, preserving drafts.
    window.addEventListener('pageshow',e=>{
      if(!e.persisted)return;
      heldDeletes.clear();adapter.cancelEmptyReturn();
      if(enabled&&scoped())void setEnabled(true,false);else void syncPage();
    });
    await syncPage();update();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
