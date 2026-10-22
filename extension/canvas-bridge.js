/* Records only text actually painted onto canvases; no Feishu application state or APIs. */
(() => {
  'use strict';
  if(window.__fmrPaintInstalled)return;
  window.__fmrPaintInstalled=true;
  const frames=new WeakMap();
  function entries(canvas){let a=frames.get(canvas);if(!a){a=[];frames.set(canvas,a);}return a;}
  function point(m,x,y){return {x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f};}
  function bounds(ctx,x,y,w,h){const m=ctx.getTransform(),p=point(m,x,y),q=point(m,x+w,y+h);return {x:Math.min(p.x,q.x),y:Math.min(p.y,q.y),w:Math.abs(q.x-p.x),h:Math.abs(q.y-p.y)};}
  function clear(canvas,r){const a=frames.get(canvas);if(!a)return;frames.set(canvas,a.filter(t=>!(t.x+t.w>r.x&&t.x<r.x+r.w&&t.y+t.h>r.y&&t.y<r.y+r.h)));}
  function put(canvas,item){const a=entries(canvas);a.push(item);if(a.length>9000)a.splice(0,a.length-7000);}
  function wrap(proto,name,after){const original=proto?.[name];if(!original)return;proto[name]=function(...args){const result=Reflect.apply(original,this,args);try{after(this,args);}catch{}return result;};}
  for(const proto of [window.CanvasRenderingContext2D?.prototype,window.OffscreenCanvasRenderingContext2D?.prototype].filter(Boolean)){
    wrap(proto,'clearRect',(ctx,[x,y,w,h])=>clear(ctx.canvas,bounds(ctx,x,y,w,h)));
    wrap(proto,'reset',(ctx)=>frames.delete(ctx.canvas));
    wrap(proto,'fillRect',(ctx,[x,y,w,h])=>{
      // Solid background paints remove stale text when the grid repaints only a region.
      const s=String(ctx.fillStyle);if(ctx.globalAlpha===1&&!/rgba\([^)]*,\s*0?\.\d+\)|#[0-9a-f]{8}$/i.test(s))clear(ctx.canvas,bounds(ctx,x,y,w,h));
    });
    wrap(proto,'fillText',(ctx,[raw,x,y,maxWidth])=>{
      const text=String(raw).trim();if(!text||text.length>1500||!Number.isFinite(x)||!Number.isFinite(y))return;
      const metrics=ctx.measureText(String(raw)),size=parseFloat(ctx.font.match(/([\d.]+)px/)?.[1]||'14');
      const ascent=metrics.actualBoundingBoxAscent||size*.8,descent=metrics.actualBoundingBoxDescent||size*.2;
      let w=Math.min(metrics.width,Number.isFinite(maxWidth)?maxWidth:Infinity),left=x;
      if(ctx.textAlign==='center')left-=w/2;else if(ctx.textAlign==='right'||ctx.textAlign==='end')left-=w;
      let top=y-ascent;
      if(ctx.textBaseline==='top'||ctx.textBaseline==='hanging')top=y;
      if(ctx.textBaseline==='middle')top=y-(ascent+descent)/2;
      const r=bounds(ctx,left,top,w,ascent+descent);
      if(r.w>0&&r.h>0)put(ctx.canvas,{text,...r});
    });
    wrap(proto,'drawImage',(ctx,args)=>{
      const src=args[0],texts=frames.get(src);if(!texts?.length||src===ctx.canvas)return;
      let sx=0,sy=0,sw=src.width,sh=src.height,dx,dy,dw,dh;
      if(args.length===3){[,dx,dy]=args;dw=sw;dh=sh;}
      else if(args.length===5){[,dx,dy,dw,dh]=args;}
      else if(args.length===9){[,sx,sy,sw,sh,dx,dy,dw,dh]=args;}else return;
      if(!sw||!sh)return;
      clear(ctx.canvas,bounds(ctx,dx,dy,dw,dh));
      for(const t of texts){if(t.x+t.w<sx||t.x>sx+sw||t.y+t.h<sy||t.y>sy+sh)continue;put(ctx.canvas,{text:t.text,...bounds(ctx,dx+(t.x-sx)*dw/sw,dy+(t.y-sy)*dh/sh,t.w*dw/sw,t.h*dh/sh)});}
    });
  }
  function snapshot(){
    const canvas=[...document.querySelectorAll('canvas[role="faster"]')].find(e=>e.getBoundingClientRect().width>0);
    if(!canvas)return {rows:[],paintCount:0};
    const rect=canvas.getBoundingClientRect(),scaleX=rect.width/canvas.width,scaleY=rect.height/canvas.height;
    const raw=frames.get(canvas)||[],seen=new Map();
    for(const t of raw){const item={text:t.text,x:t.x*scaleX,y:t.y*scaleY,w:t.w*scaleX,h:t.h*scaleY};if(item.y>=28&&item.y<rect.height-20&&item.x>=0&&item.x<rect.width)seen.set(Math.round(item.x)+'/'+Math.round(item.y)+'/'+item.text,item);}
    const texts=[...seen.values()];
    // The row number is the leftmost small integer on a record's baseline.
    const numbered=texts.filter(t=>/^\d{1,6}$/.test(t.text)&&t.x>=12&&t.x<200&&t.w<55&&t.h<35);
    const rows=[];
    for(const n of numbered){
      const sameLine=texts.filter(t=>t.x>n.x+n.w+6&&Math.abs(t.y+t.h/2-n.y-n.h/2)<8).sort((a,b)=>a.x-b.x);
      const title=sameLine[0];if(!title||title.x-n.x>160||/^条记录$/.test(title.text))continue;
      const y=rect.top+n.y+n.h/2;
      if(rows.some(r=>Math.abs(r.y-y)<9))continue;
      rows.push({number:n.text,title:title.text,x:rect.left+title.x+Math.min(title.w/2,70),y});
    }
    rows.sort((a,b)=>a.y-b.y);
    return {rows,paintCount:raw.length,canvas:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}};
  }
  document.addEventListener('fmr:canvas-query',e=>{
    if(typeof e.detail!=='string')return;
    try {const {id}=JSON.parse(e.detail);if(typeof id!=='string'||id.length>80)return;document.dispatchEvent(new CustomEvent('fmr:canvas-result',{detail:JSON.stringify({id,...snapshot()})}));}catch{}
  });
})();
