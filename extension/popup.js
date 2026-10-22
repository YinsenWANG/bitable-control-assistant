let tabId,enabled=false;
const status=document.getElementById('status'),toggle=document.getElementById('toggle');
document.getElementById('settings').onclick=()=>chrome.runtime.openOptionsPage();
document.getElementById('returnMeeting').onclick=async()=>{try{const r=await chrome.runtime.sendMessage({type:'return-to-meeting'});if(!r.ok)throw new Error(r.error);window.close();}catch(e){status.textContent=e.message;}};
async function refresh(){try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});tabId=tab?.id;const r=await chrome.tabs.sendMessage(tabId,{type:'meeting-status'});if(!r.scoped)throw new Error('请打开飞书多维表格。');enabled=r.enabled;status.textContent=r.view+' · '+(enabled?r.state:'会议模式已关闭');toggle.disabled=false;toggle.textContent=enabled?'退出会议并恢复窗口':'进入全屏会议模式';}catch(e){status.textContent='请打开飞书多维表格；安装或更新后需要刷新页面。';toggle.disabled=true;}}
toggle.onclick=async()=>{toggle.disabled=true;try{const r=await chrome.tabs.sendMessage(tabId,{type:'meeting-action',action:'toggle'});if(!r.ok)status.textContent=r.error;}finally{await refresh();}};
refresh();
