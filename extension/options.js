(() => {
  const M=globalThis.MeetingRemote,$=id=>document.getElementById(id);
  let config=M.config(),recording=null,testing=false,dirty=false,log=[];
  function feedback(text,error=false){$('feedback').textContent=text;$('feedback').classList.toggle('error',error);}
  async function copyValue(value){
    if(!value){feedback('当前没有可复制的快捷键',true);return;}
    try{await navigator.clipboard.writeText(value);feedback('已复制键值：'+value);}catch{feedback('复制失败，请重试或手动复制键值',true);}
  }
  function render(includeSettings=true){
    if(includeSettings){$('autoEnable').checked=config.autoEnable;$('showHud').checked=config.showHud;$('zoomStep').value=config.zoomStep;}
    $('bindings').replaceChildren();
    for(const a of M.ACTIONS){
      const row=document.createElement('tr');row.dataset.action=a.id;
      const name=document.createElement('td');name.textContent=a.label;
      const remote=document.createElement('td');remote.textContent=a.remote;
      const bind=document.createElement('td'),kbd=document.createElement('kbd');kbd.textContent=M.label(M.bindingFor(a.id,config));
      const copy=document.createElement('button');copy.className='copy-btn';copy.textContent='⧉';copy.title='复制键值';copy.setAttribute('aria-label','复制'+a.label+'的键值');copy.onclick=()=>copyValue(M.bindingFor(a.id,config));
      bind.append(kbd,copy);
      if(M.NATIVE[a.id]){
        const label=document.createElement('label'),native=document.createElement('input');label.className='native-option';native.type='checkbox';native.checked=config.nativeBindings[a.id];native.setAttribute('aria-label',a.label+'使用原生快捷键');
        native.onchange=()=>{const previous=config.nativeBindings[a.id];config.nativeBindings[a.id]=native.checked;try{M.config(config);}catch(e){config.nativeBindings[a.id]=previous;native.checked=previous;feedback(e.message,true);return;}dirty=true;recording=null;render(false);feedback(native.checked?'保存后使用飞书原生组合键；请同步设置遥控映射':'已恢复自定义组合键，保存后生效');};
        label.append(native,document.createTextNode('使用原生快捷键'));label.title=M.NATIVE[a.id].note;bind.append(label);
      }
      const controls=document.createElement('td'),button=document.createElement('button'),clear=document.createElement('button');
      button.className='record-btn';button.textContent='录入';button.setAttribute('aria-label','录入'+a.label);
      button.onclick=()=>{recording=recording===a.id?null:a.id;testing=false;$('testToggle').textContent='开始检测';paintRecording();feedback(recording?'请按组合键；Esc 也可以录入。再次点击「取消」退出。':'已取消录入');};
      clear.className='clear-btn';clear.textContent='清除';clear.onclick=()=>{config.bindings[a.id]='';if(M.NATIVE[a.id])config.nativeBindings[a.id]=false;dirty=true;recording=null;render(false);feedback('已清除，保存后生效');};
      controls.append(button,clear);row.append(name,remote,bind,controls);$('bindings').append(row);
    }
  }
  function paintRecording(){for(const row of $('bindings').children){const active=row.dataset.action===recording;row.classList.toggle('recording',active);row.querySelector('.record-btn').textContent=active?'取消':'录入';row.querySelector('kbd').textContent=active?'请按组合键…':M.label(M.bindingFor(row.dataset.action,config));}}
  function readForm(){return M.config({...config,autoEnable:$('autoEnable').checked,showHud:$('showHud').checked,zoomStep:Number($('zoomStep').value)});}
  document.addEventListener('keydown',e=>{
    if(!recording&&!testing)return;
    e.preventDefault();e.stopImmediatePropagation();
    const value=M.chord(e);if(!value)return;
    $('lastKey').textContent=M.label(value);
    const matched=M.actionFor(value,config);
    log.unshift(`${new Date().toLocaleTimeString()}  ${value}${e.repeat?'  [长按连发]':''}  ${matched?.label||'未绑定'}`);log=log.slice(0,15);$('keyLog').textContent=log.join('\n');
    if(!recording||e.repeat)return;
    if(!M.validateBinding(value)){feedback('暂不支持这组按键，请在映射软件中改用普通按键组合。',true);return;}
    const conflict=M.ACTIONS.find(a=>M.bindingConflict(a.id,recording)&&M.bindingFor(a.id,config)===value);
    if(conflict){feedback('与「'+conflict.label+'」冲突。请先清除它的绑定，或换一个组合键。',true);return;}
    config.bindings[recording]=value;if(M.NATIVE[recording])config.nativeBindings[recording]=false;recording=null;dirty=true;render(false);feedback('已录入 '+M.label(value)+'，保存后生效');
  },true);
  $('testToggle').onclick=()=>{testing=!testing;recording=null;paintRecording();$('testToggle').textContent=testing?'停止检测':'开始检测';feedback(testing?'检测中：按键仅显示，不执行动作':'检测已停止');};
  for(const id of ['autoEnable','showHud','zoomStep'])$(id).addEventListener('input',()=>{dirty=true;});
  $('save').onclick=async()=>{try{config=readForm();await chrome.storage.local.set({config});dirty=false;feedback('已保存，打开的飞书页面会立即应用新按键');}catch(e){feedback(e.message,true);}};
  $('restore').onclick=()=>{config.bindings={...M.DEFAULTS.bindings};config.nativeBindings={...M.DEFAULTS.nativeBindings};recording=null;dirty=true;render(false);feedback('已恢复默认按键，保存后生效');};
  $('export').onclick=()=>{try{const data=readForm();const url=URL.createObjectURL(new Blob([JSON.stringify({format:'feishu-meeting-remote',version:3,config:data},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='飞书会议遥控器-按键配置.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){feedback(e.message,true);}};
  $('import').onclick=()=>$('importFile').click();
  $('importFile').onchange=async()=>{const file=$('importFile').files[0];if(!file)return;try{if(file.size>64000)throw new Error('配置文件过大');const obj=JSON.parse(await file.text());if(obj.format!=='feishu-meeting-remote'||![1,2,3].includes(obj.version))throw new Error('不是此扩展的配置文件');config=M.config(obj.config);recording=null;dirty=true;render();feedback('已导入，请检查后保存');}catch(e){feedback('导入失败：'+e.message,true);}finally{$('importFile').value='';}};
  async function refreshGlobalShortcut(){
    try{const commands=await chrome.commands.getAll();const value=commands.find(c=>c.name==='return-to-meeting')?.shortcut||'';$('meetingShortcut').textContent=value||'未设置，请点击下方按钮';$('copyMeetingShortcut').disabled=!value;$('copyMeetingShortcut').onclick=()=>copyValue(value);}
    catch{$('meetingShortcut').textContent='请在 Chrome 扩展快捷键中设置';}
  }
  $('globalShortcut').onclick=()=>chrome.runtime.sendMessage({type:'open-keyboard-settings'}).catch(e=>feedback(e.message,true));
  window.addEventListener('focus',refreshGlobalShortcut);
  void refreshGlobalShortcut();
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  chrome.storage.local.get('config').then(data=>{try{config=M.config(data.config);}catch(e){feedback(e.message,true);}render();});
})();
