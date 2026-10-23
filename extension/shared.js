(() => {
  'use strict';
  const ACTIONS = [
    ['navigateUp','上：上一条记录 / 上一字段','方向上','ArrowUp',true],
    ['navigateDown','下：下一条记录 / 下一字段','方向下','ArrowDown',true],
    ['navigateLeft','左：上一视图 / 上一条记录','方向左','ArrowLeft',false],
    ['navigateRight','右：下一视图 / 下一条记录','方向右','ArrowRight',false],
    ['confirm','确定 / 操作字段 / 发送评论','中间确定','Enter',false],
    ['deleteBackward','删除左侧文字 / 空输入框逐层返回','返回','Backspace',true],
    ['toggle','进入 / 退出全屏会议模式','TV','Control+Shift+Digit9',false],
    ['reloadPage','重新加载当前页面','电源','Meta+KeyR',false],
    ['toggleComments','展开并聚焦 / 收起评论','菜单','PageDown',false],
    ['toggleSidebar','展开 / 折叠侧边栏','可选独立动作','',false],
    ['zoomIn','放大','音量＋','Control+Shift+Equal',true],
    ['zoomOut','缩小','音量－','Control+Shift+Minus',true],
    ['back','逐层返回（备用）','可选独立动作','Escape',false],
    ['scrollDown','向下翻页','可选独立动作','',true],
    ['scrollUp','向上翻页','可选独立动作','PageUp',true],
    ['openDetail','展开记录详情','可选独立动作','Meta+KeyE',false],
    ['closeDetail','关闭记录详情','可选独立动作','',false],
    ['openComments','展开评论并聚焦','可选独立动作','Control+Shift+KeyC',false],
    ['closeComments','收起评论','可选独立动作','',false],
    ['sendComment','发送评论','可选独立动作','',false],
    ['firstView','回到首个视图','可选独立动作','',false],
    ['previousRecord','上一条记录（独立）','可选独立动作','',true],
    ['nextRecord','下一条记录（独立）','可选独立动作','',true],
    ['resetZoom','恢复 100%','可选独立动作','',false]
  ].map(([id,label,remote,binding,repeat])=>({id,label,remote,binding,repeat}));
  const isMac=()=>typeof navigator==='undefined'||/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent);
  const NATIVE={
    openDetail:{mac:'Meta+KeyE',win:'Control+KeyE',note:'飞书原生：展开记录详情'},
    toggleSidebar:{mac:'Meta+Backslash',win:'Control+Backslash',note:'飞书原生：展开 / 折叠侧边栏'},
    reloadPage:{mac:'Meta+KeyR',win:'Control+KeyR',note:'Chrome 原生：重新加载当前页面；也适用于其他标签页'}
  };
  const nativeBinding=id=>NATIVE[id]?.[isMac()?'mac':'win']||'';
  const bindingFor=(id,c)=>c.nativeBindings?.[id]?nativeBinding(id):c.bindings[id];
  ACTIONS.find(a=>a.id==='openDetail').binding=nativeBinding('openDetail');
  ACTIONS.find(a=>a.id==='reloadPage').binding=nativeBinding('reloadPage');
  const DEFAULTS={schemaVersion:5,nativeBindings:{openDetail:false,toggleSidebar:false,reloadPage:true},autoEnable:false,showHud:true,hideHeader:true,zoomStep:10,bindings:Object.fromEntries(ACTIONS.map(a=>[a.id,a.binding]))};
  const MODIFIERS=['Control','Alt','Shift','Meta'];
  function chord(e) {
    if (!e.code || /^(Control|Alt|Shift|Meta)(Left|Right)$/.test(e.code)) return '';
    return [...MODIFIERS.filter(m=>e[({Control:'ctrlKey',Alt:'altKey',Shift:'shiftKey',Meta:'metaKey'})[m]]), e.code].join('+');
  }
  function label(value) {
    if (!value) return '未设置';
    const names={Control:'⌃',Alt:'⌥',Shift:'⇧',Meta:'⌘',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Escape:'Esc',Enter:'Enter',NumpadEnter:'小键盘 Enter',Backspace:'⌫',Delete:'Delete',Equal:'=',Minus:'−',Space:'Space',PageDown:'Page Down',PageUp:'Page Up',Backslash:'\\'};
    return value.split('+').map(k=>names[k]||k.replace(/^Key/,'').replace(/^Digit/,'')).join(' + ');
  }
  function validateBinding(value) {
    if(value==='') return true;
    if(typeof value!=='string'||value.length>100) return false;
    const p=value.split('+'),code=p.pop();
    return /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|F([1-9]|1[0-9]|2[0-4])|Enter|NumpadEnter|Escape|Backspace|Delete|Space|Tab|Home|End|PageUp|PageDown|Insert|Equal|Minus|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote|Numpad[0-9]|Numpad(Add|Subtract|Multiply|Divide|Decimal))$/.test(code) && p.every(m=>MODIFIERS.includes(m)) && new Set(p).size===p.length && p.join('+')===MODIFIERS.filter(m=>p.includes(m)).join('+');
  }
  function target(value) {
    try {
      const u=new URL(value);
      if(u.protocol!=='https:'||u.port||!(u.hostname==='feishu.cn'||u.hostname.endsWith('.feishu.cn')))return null;
      const match=u.pathname.match(/^\/(base|wiki)\/([a-zA-Z0-9]+)\/?$/)||u.pathname.match(/^\/(share\/base\/(?:view|record))\/([a-zA-Z0-9]+)\/?$/);
      if(!match)return null;
      return {origin:u.origin,kind:match[1],id:match[2],table:u.searchParams.get('table'),view:u.searchParams.get('view')};
    }catch{return null;}
  }
  function sameDocument(a,b){const x=target(a),y=target(b);return !!x&&!!y&&x.origin===y.origin&&x.kind===y.kind&&x.id===y.id;}
  function bindingConflict(a,b){return a!==b;}
  function config(input={}) {
    if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('配置格式无效。');
    const incoming={...(input.bindings||{})};
    if(![3,4,5].includes(input.schemaVersion)&&input.bindings){
      for(const [old,id] of Object.entries({previousRecord:'navigateUp',nextRecord:'navigateDown',previousView:'navigateLeft',nextView:'navigateRight'})){
        if(Object.hasOwn(incoming,old)){if(!Object.hasOwn(incoming,id))incoming[id]=incoming[old];delete incoming[old];}
      }
      if(input.schemaVersion!==2&&Object.hasOwn(incoming,'scrollDown')&&!Object.hasOwn(incoming,'toggleSidebar')){incoming.toggleSidebar=incoming.scrollDown||'';incoming.scrollDown='';}
      // Retire the old duplicate Backspace binding; the deletion action now handles returning.
      if(incoming.back&&incoming.back===(incoming.deleteBackward??DEFAULTS.bindings.deleteBackward))incoming.back='';
      if(!Object.hasOwn(incoming,'openComments')&&Object.values(incoming).includes(DEFAULTS.bindings.openComments))incoming.openComments='';
    }
    const nativeBindings=Object.fromEntries(Object.keys(NATIVE).map(id=>[id,input.nativeBindings?.[id]??DEFAULTS.nativeBindings[id]]).map(([id,value])=>[id,value===true]));
    if(![4,5].includes(input.schemaVersion)&&input.bindings){
      if(!Object.hasOwn(incoming,'toggleComments')){
        incoming.toggleComments=nativeBindings.toggleSidebar?nativeBinding('toggleSidebar'):(incoming.toggleSidebar??DEFAULTS.bindings.toggleComments);
        incoming.toggleSidebar='';nativeBindings.toggleSidebar=false;
      }
      delete incoming.home; // Home is a browser command so it also works on other websites.
    }
    // Adding a new default must not invalidate an existing custom Cmd/Ctrl+R binding.
    if(!Object.hasOwn(incoming,'reloadPage')&&Object.values(incoming).includes(nativeBinding('reloadPage'))){incoming.reloadPage='';nativeBindings.reloadPage=false;}
    const c={...DEFAULTS,...input,bindings:{...DEFAULTS.bindings,...incoming},nativeBindings};
    if(!Number.isFinite(c.zoomStep)||c.zoomStep<5||c.zoomStep>25)throw new Error('缩放步长需要在 5–25 之间。');
    const used=new Map();
    for(const a of ACTIONS){
      if(!validateBinding(c.bindings[a.id]))throw new Error(a.label+' 的快捷键格式无效。');
      const v=bindingFor(a.id,c);
      if(v&&used.has(v))throw new Error(a.label+' 与「'+used.get(v).label+'」使用了相同快捷键。');
      if(v)used.set(v,a);
    }
    return {schemaVersion:5,autoEnable:!!c.autoEnable,showHud:!!c.showHud,hideHeader:!!c.hideHeader,zoomStep:c.zoomStep,nativeBindings:c.nativeBindings,bindings:Object.fromEntries(ACTIONS.map(a=>[a.id,c.bindings[a.id]]))};
  }
  function actionFor(value,c){return ACTIONS.find(a=>bindingFor(a.id,c)&&bindingFor(a.id,c)===value);}
  const DIRECTIONS={navigateUp:'up',navigateDown:'down',navigateLeft:'left',navigateRight:'right'};
  const isZoom=id=>['zoomIn','zoomOut','resetZoom'].includes(id);
  function inputPolicy(action,chord,context,{native=false,popup=false,emptyInput=false,repeat=false}={}){
    if(isZoom(action.id))return 'run';
    if(action.id==='reloadPage')return native?'native':'run';
    const editing=['comment','other','grid-edit'].includes(context);
    // Holding delete may erase text, but must never cascade through return levels.
    if(action.id==='deleteBackward'&&repeat&&(!editing||emptyInput))return 'block';
    if(editing&&/^((Control|Alt|Shift|Meta)\+)*Arrow(Up|Down|Left|Right)$/.test(chord))return 'pass';
    if(editing&&DIRECTIONS[action.id])return 'caret';
    if(editing&&action.id==='deleteBackward'&&chord==='Backspace'&&!emptyInput)return 'pass';
    if(editing&&!['toggle','zoomIn','zoomOut','resetZoom','deleteBackward','back','toggleComments','closeComments','openComments','confirm','sendComment'].includes(action.id))return 'pass';
    if(editing&&context!=='comment'&&['confirm','sendComment'].includes(action.id))return 'pass';
    if(popup&&editing&&!['back','toggle','toggleComments'].includes(action.id)&&!(action.id==='deleteBackward'&&emptyInput))return 'pass';
    if(native)return editing?'pass':'native';
    return 'run';
  }
  function keyDelay(action,context){if(['zoomIn','zoomOut','resetZoom'].includes(action.id))return 0;if(action.id==='deleteBackward')return 0;return action.repeat?160:350;}
  const api={ACTIONS,DEFAULTS,NATIVE,DIRECTIONS,isZoom,nativeBinding,bindingFor,inputPolicy,chord,label,validateBinding,target,sameDocument,bindingConflict,config,actionFor,keyDelay};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else globalThis.MeetingRemote=api;
})();
