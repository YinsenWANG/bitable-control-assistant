(() => {
  'use strict';
  // Keep every key press, but combine pending steps while Chrome applies a zoom.
  class ZoomQueue {
    constructor(tabs,{flushDelay=40,retryDelay=50,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){this.tabs=tabs;this.queues=new Map();this.flushDelay=flushDelay;this.retryDelay=retryDelay;this.wait=wait;}
    async browserCall(fn){
      for(let attempt=0;;attempt++){
        try{return await fn();}catch(error){
          // Chrome can briefly reject tab changes while its UI is busy. Retry the
          // same absolute target, preserving all queued steps and their order.
          if(attempt>=2||!/Tabs cannot be edited|dragging a tab|temporarily unavailable/i.test(error.message||''))throw error;
          await this.wait(this.retryDelay);
        }
      }
    }
    enqueue(tabId,direction,step){
      return new Promise((resolve,reject)=>{
        let queue=this.queues.get(tabId);
        if(!queue){queue={pending:[]};this.queues.set(tabId,queue);}
        queue.pending.push({direction,step,resolve,reject});
        if(!queue.running){queue.running=true;void this.drain(tabId,queue);}
      });
    }
    async drain(tabId,queue){
      let batch=[];
      try {
        const settings=await this.browserCall(()=>this.tabs.getZoomSettings(tabId));
        if(settings.mode!=='automatic'||settings.scope!=='per-tab')await this.browserCall(()=>this.tabs.setZoomSettings(tabId,{mode:'automatic',scope:'per-tab'}));
        let current=await this.browserCall(()=>this.tabs.getZoom(tabId));
        while(queue.pending.length){
          // A short batch window reduces expensive full-page relayouts. This is
          // batching, not key debounce: every increment/decrement is retained.
          await this.wait(this.flushDelay);
          batch=queue.pending.splice(0);
          let target=current;
          for(const op of batch)target=op.direction===0?1:Math.min(2.5,Math.max(.5,Math.round((target+op.direction*op.step/100)*100)/100));
          if(Math.abs(target-current)>.0001)await this.browserCall(()=>this.tabs.setZoom(tabId,target));
          current=target;
          for(const op of batch)op.resolve({ok:true,zoom:current});
          batch=[];
        }
      }catch(error){for(const op of [...batch,...queue.pending.splice(0)])op.reject(error);}
      finally {this.queues.delete(tabId);}
    }
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=ZoomQueue;
  else globalThis.MeetingRemote.ZoomQueue=ZoomQueue;
})();
