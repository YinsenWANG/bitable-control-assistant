(() => {
  'use strict';
  // Receive the input method's committed text. This does not observe Fn,
  // request microphone access, or start speech recognition.
  class DictationRelay {
    constructor({context,deliver,notify}){
      this.context=context;this.deliver=deliver;this.notify=notify;
      this.proxy=null;this.bound=null;this.buffer='';this.composing=false;this.compositionTrustedInput=false;this.transferring=false;this.version=0;this.failed=false;this.queued=false;
      window.addEventListener('focus',()=>this.sync());
      document.addEventListener('focusin',()=>this.queueSync(),true);
      document.addEventListener('visibilitychange',()=>{if(document.hidden)this.park();else this.sync();});
      window.addEventListener('blur',()=>this.park());
      window.addEventListener('pagehide',()=>this.park());
    }
    hasPending(){return !!(this.buffer||this.composing||this.transferring);}
    same(a,b){return !!a&&!!b&&a.card===b.card&&a.key===b.key;}
    ownsEvent(e){return !!this.recovery&&e.composedPath().includes(this.recovery);}
    queueSync(){if(this.queued)return;this.queued=true;queueMicrotask(()=>{this.queued=false;this.sync();});}
    clearTimer(){clearTimeout(this.timer);this.timer=null;}
    park(){this.clearTimer();if(this.hasPending()&&!this.transferring)this.recover('语音文字保留在当前页面，请回到原记录处理。');}
    mount(ctx){
      if(!this.proxy){
        const proxy=this.proxy=document.createElement('textarea');
        proxy.id='fmr-voice-receiver';proxy.dataset.fmrDictation='';proxy.tabIndex=-1;
        proxy.setAttribute('aria-label','会议语音接收');proxy.autocomplete='off';proxy.spellcheck=false;
        // It must remain a real, accessible text destination for the macOS input
        // method. Mount inside the record so the native modal's focus trap allows it.
        proxy.style.cssText='position:fixed;left:12px;bottom:12px;width:2px;height:18px;opacity:.03;pointer-events:none;border:0;padding:0;resize:none;z-index:2147483646;';
        proxy.addEventListener('beforeinput',e=>e.stopPropagation());
        proxy.addEventListener('compositionstart',e=>{if(!e.isTrusted)return;e.stopPropagation();this.clearTimer();this.composing=true;this.compositionTrustedInput=false;this.failed=false;this.notify('正在接收语音，结束识别后自动进入评论');});
        proxy.addEventListener('compositionend',e=>{
          // Some input setups produce an untrusted end event alongside trusted
          // text input. It may only close an existing session; it must not
          // supply or replace text.
          if(!e.isTrusted&&(!this.composing||!this.compositionTrustedInput||!this.buffer||proxy.value!==this.buffer))return;
          e.stopPropagation();this.composing=false;this.compositionTrustedInput=false;
          if(e.isTrusted)this.capture();this.schedule();
        });
        proxy.addEventListener('input',e=>{
          if(!e.isTrusted)return;e.stopPropagation();
          // If an early synthetic end was followed by more IME updates, wait
          // for the next end instead of committing a partial transcript.
          if(e.isComposing){this.composing=true;this.compositionTrustedInput=true;}
          this.capture();this.clearTimer();if(!this.composing&&!e.isComposing)this.schedule();
        });
      }
      if(!this.proxy.isConnected||!ctx.card.contains(this.proxy))ctx.card.append(this.proxy);
    }
    capture(){this.buffer=this.proxy.value;this.version++;if(!this.buffer&&!this.composing){this.failed=false;this.recovery?.remove();this.recovery=null;}}
    schedule(){this.clearTimer();if(!this.buffer||this.composing||this.transferring||this.failed)return;this.timer=setTimeout(()=>{this.timer=null;void this.flush();},350);}
    sync(){
      if(this.transferring)return;
      const ctx=this.context();
      if(this.hasPending()){
        if(!this.same(ctx,this.bound))this.recover('语音文字尚未写入。请返回原记录，或复制后自行处理。');
        else if(ctx.canDeliver&&!document.hidden&&document.hasFocus()&&!this.composing&&!this.failed&&!this.timer)this.schedule();
        return;
      }
      if(!ctx){
        if(document.activeElement===this.proxy)this.proxy.blur();
        this.proxy?.remove();this.bound=null;return;
      }
      if(!ctx.canArm||document.hidden||!document.hasFocus())return;
      if(this.proxy&&!this.same(ctx,this.bound))this.proxy.value='';
      this.bound=ctx;this.mount(ctx);
      if(document.activeElement!==this.proxy)this.proxy.focus({preventScroll:true});
    }
    async flush(manual=false){
      this.clearTimer();
      if(!this.buffer||this.composing||this.transferring||(this.failed&&!manual))return;
      const ctx=this.context();
      if(!this.same(ctx,this.bound)||!ctx.canDeliver||document.hidden||!document.hasFocus()){
        this.recover('语音文字保留在当前页面，请返回原记录后重试。');return;
      }
      const text=this.buffer,version=this.version,bound=this.bound;
      this.transferring=true;
      try{
        await this.deliver(text,bound,()=>version===this.version&&this.same(this.context(),bound));
        if(version!==this.version){this.failed=true;this.recover('输入法又更新了文字。原文已保留，请核对评论后再处理。');return;}
        this.buffer='';this.proxy.value='';this.bound=null;this.failed=false;this.recovery?.remove();this.recovery=null;
        this.notify('语音文字已进入评论草稿，确认后按确定发送');
      }catch(error){this.failed=true;this.recover(error.message||'语音文字尚未写入评论，原文已保留。');}
      finally{this.transferring=false;this.sync();}
    }
    recover(message){
      if(!this.hasPending()||this.composing)return;
      if(!this.recovery?.isConnected){
        const host=this.recovery=document.createElement('div');host.dataset.fmrRelayRecovery='';
        host.style.cssText='position:fixed;right:20px;bottom:72px;z-index:2147483647;max-width:calc(100vw - 40px);';
        const shadow=host.attachShadow({mode:'closed'});
        shadow.innerHTML='<style>:host{font:14px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#26354d}.box{width:360px;max-width:calc(100vw - 40px);background:white;padding:16px;border:1px solid #bfcef0;border-radius:12px;box-shadow:0 8px 28px #20305026}p{margin:0 0 10px;line-height:1.6}textarea{box-sizing:border-box;width:100%;height:90px;font:inherit}button{margin:10px 8px 0 0;border:0;padding:7px 10px;border-radius:6px;cursor:pointer;background:#eaf0ff;color:#245de4}</style><div class="box"><p></p><textarea readonly aria-label="保留的语音文字"></textarea><div></div></div>';
        this.recoveryText=shadow.querySelector('textarea');this.recoveryMessage=shadow.querySelector('p');
        const actions=shadow.querySelector('.box>div');
        for(const [label,action] of [
          ['复制文字',async()=>{try{await navigator.clipboard.writeText(this.buffer);this.notify('已复制语音文字');}catch{this.recoveryText.focus();this.recoveryText.select();this.notify('请选择并复制保留的文字');}}],
          ['重试写入',()=>void this.flush(true)],
          ['清空接收草稿',()=>{this.clearTimer();this.buffer='';if(this.proxy)this.proxy.value='';this.composing=false;this.failed=false;this.bound=null;host.remove();this.recovery=null;this.sync();}]
        ]){const button=document.createElement('button');button.textContent=label;button.onclick=action;actions.append(button);}
        document.documentElement.append(host);
      }
      this.recoveryMessage.textContent=message;this.recoveryText.value=this.buffer;
    }
  }
  globalThis.MeetingRemote.DictationRelay=DictationRelay;
})();
