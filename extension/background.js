importScripts('shared.js','zoom-queue.js');
const M=globalThis.MeetingRemote;
const zoomQueue=new M.ZoomQueue(chrome.tabs);
let configReady=chrome.storage.local.get('config').then(x=>M.config(x.config)).catch(()=>M.config());
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area==='local'&&changes.config)configReady=Promise.resolve().then(()=>M.config(changes.config.newValue)).catch(()=>M.config());
});

// Serial session changes prevent two meeting tabs from overwriting each other.
// Session storage survives worker restarts and clears when Chrome closes.
let sessionWork=Promise.resolve();
function withSession(fn){const next=sessionWork.then(fn);sessionWork=next.catch(()=>{});return next;}
async function readSessions(){return (await chrome.storage.session.get('meetingWindows')).meetingWindows||{};}
async function releaseTab(tabId){
  const sessions=await readSessions();
  for(const [id,session] of Object.entries(sessions)){
    if(!session.tabs.includes(tabId))continue;
    session.tabs=session.tabs.filter(value=>value!==tabId);
    if(session.tabs.length)continue;
    if(session.owned){
      try {
        const current=await chrome.windows.get(Number(id));
        if(current.state==='fullscreen')await chrome.windows.update(Number(id),{state:session.previousState});
      }catch{} // The window may have closed along with its final tab.
    }
    delete sessions[id];
  }
  await chrome.storage.session.set({meetingWindows:sessions});
}
async function presentation(sender,enabled){
  if(!enabled){await releaseTab(sender.tab.id);return {ok:true,fullscreen:false};}
  const tabId=sender.tab.id,windowId=sender.tab.windowId;
  const current=await chrome.windows.get(windowId),sessions=await readSessions();
  const session=sessions[windowId]||{
    previousState:current.state==='maximized'?'maximized':'normal',
    owned:current.state!=='fullscreen',tabs:[]
  };
  if(!session.tabs.includes(tabId))session.tabs.push(tabId);
  if(current.state!=='fullscreen')await chrome.windows.update(windowId,{state:'fullscreen'});
  sessions[windowId]=session;
  await chrome.storage.session.set({
    meetingWindows:sessions,
    lastMeeting:{tabId,windowId,url:sender.url||sender.tab.url}
  });
  await chrome.action.setBadgeText({text:''});
  return {ok:true,fullscreen:true};
}
async function returnToMeeting(){
  const {lastMeeting:last}=await chrome.storage.session.get('lastMeeting');
  const sessions=await readSessions(),active=Object.values(sessions).flatMap(session=>session.tabs);
  const candidates=[...new Set([last?.tabId,...active.slice().reverse()])].filter(id=>active.includes(id));
  for(const id of candidates){
    let tab;try{tab=await chrome.tabs.get(id);}catch{continue;}
    const url=tab.pendingUrl||tab.url;
    if(!M.target(url)||(id===last?.tabId&&!M.sameDocument(url,last.url)))continue;
    await chrome.tabs.update(tab.id,{active:true});
    await chrome.windows.update(tab.windowId,{focused:true});
    await chrome.storage.session.set({lastMeeting:{tabId:tab.id,windowId:tab.windowId,url}});
    await chrome.action.setBadgeText({text:''});return {ok:true};
  }
  throw new Error('请先在一个多维表格中开启会议模式。');
}
chrome.runtime.onInstalled.addListener(async ({reason})=>{
  const stored=await chrome.storage.local.get('config');
  try {await chrome.storage.local.set({config:M.config(stored.config)});}catch{}
  if(reason==='install')await chrome.runtime.openOptionsPage();
});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  (async()=>{
    if(message?.type==='open-settings'){await chrome.runtime.openOptionsPage();return {ok:true};}
    if(message?.type==='open-keyboard-settings'){await chrome.tabs.create({url:'chrome://extensions/shortcuts'});return {ok:true};}
    if(message?.type==='return-to-meeting')return withSession(returnToMeeting);
    if(message?.type==='presentation'&&message.enabled===false&&sender.tab?.id)return withSession(()=>presentation(sender,false));
    if(!sender.tab?.id||!M.target(sender.url||sender.tab.url))throw new Error('请在飞书多维表格中操作。');
    const tabId=sender.tab.id;
    if(message?.type==='presentation'){
      if(typeof message.enabled!=='boolean')throw new Error('无效的会议模式状态');
      return withSession(()=>presentation(sender,message.enabled));
    }
    if(message?.type==='open-field-link'){
      const url=new URL(message.url);
      if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('仅支持打开 HTTP 或 HTTPS 网页链接。');
      await chrome.tabs.create({url:url.href,active:true,openerTabId:tabId});return {ok:true};
    }
    if(message?.type==='get-zoom')return {ok:true,zoom:await chrome.tabs.getZoom(tabId)};
    if(message?.type==='zoom'){
      if(![-1,0,1].includes(message.direction))throw new Error('无效的缩放动作');
      const config=await configReady;
      return zoomQueue.enqueue(tabId,message.direction,config.zoomStep);
    }
    throw new Error('未知操作');
  })().then(respond,error=>respond({ok:false,error:error.message}));
  return true;
});
chrome.commands.onCommand.addListener(async command=>{
  try {
    if(command==='return-to-meeting'){await withSession(returnToMeeting);return;}
    if(command!=='toggle-meeting')return;
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id)throw new Error('请先打开一个多维表格。');
    const response=await chrome.tabs.sendMessage(tab.id,{type:'meeting-action',action:'toggle'});
    if(!response?.ok)throw new Error(response?.error||'请刷新多维表格页面。');
  }catch(error){
    await chrome.action.setBadgeText({text:'!'});
    await chrome.action.setTitle({title:error.message});
  }
});
chrome.tabs.onRemoved.addListener(tabId=>{void withSession(()=>releaseTab(tabId));});
chrome.tabs.onUpdated.addListener((tabId,change)=>{
  if(change.url&&!M.target(change.url))void withSession(()=>releaseTab(tabId));
});
