// 고른 러닝의 경로 연출 A+(2026-11-19 확정, 지도 피드 프로토타입 v8 개선안). 지도 피드·내 피드가 같이 쓴다.
// 선이 1.1초에 그어지고(expo) → 도착점 번짐 → 겹 가닥 2줄 → 빛 머리와 꼬리가 경로를 2바퀴 돌며 가루를 떨어뜨리고
// 지나는 km 점마다 물결. km 점은 마지막에만 라벨. 내 러닝이면 집 근처 앞뒤는 점선 + 안내.
// 전역 map이 먼저 있어야 한다. 자기 pane 안의 SVG에 레이어 좌표로 그려 지도를 옮겨도 따라가고, 줌이 끝나면 다시 그린다.

/** WebView에 넘기는 색과 시각 */
export interface RouteFxOptions {
  col: string; // 경로 색(TOTAL Ice · HYPE Pearl · NEW 민트)
  bg: string; // 경로 테두리 · km 점 속
  glass: string;
  glassBorder: string;
  text: string;
  text2: string;
  /** 내 러닝의 점선 구간 안내(없으면 안 그린다) */
  label: string | null;
  /** 그리기 시작까지(ms). 카메라가 먼저 움직인다 */
  delay: number;
  /** true면 연출 없이 끝 상태로(테마만 바뀐 경우) */
  keep: boolean;
  seed: number;
}

export function routeFxScript(): string {
  return `
  (function(){
    var NS='http://www.w3.org/2000/svg';
    var pane=map.createPane('routeFx');pane.style.zIndex=450;pane.style.pointerEvents='none';
    var svg=document.createElementNS(NS,'svg');svg.setAttribute('style','position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible');pane.appendChild(svg);
    var cur=null;
    var reduced=function(){return window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;};
    function el(tag,attrs,parent){var e=document.createElementNS(NS,tag);for(var k in attrs)e.setAttribute(k,attrs[k]);(parent||svg).appendChild(e);return e;}
    function pts(list){return list.map(function(c){var p=map.latLngToLayerPoint([c[1],c[0]]);return [p.x,p.y];});}
    function pathD(ps){return ps.map(function(p,i){return (i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1);}).join('');}
    function sample(ps){var seg=[],L=0;for(var i=1;i<ps.length;i++){var l=Math.hypot(ps[i][0]-ps[i-1][0],ps[i][1]-ps[i-1][1]);seg.push(l);L+=l;}
      return {L:L,at:function(t){var x=t*L;for(var i=0;i<seg.length;i++){if(x<=seg[i]||i===seg.length-1){var f=seg[i]?Math.min(1,x/seg[i]):0;return [ps[i][0]+(ps[i+1][0]-ps[i][0])*f,ps[i][1]+(ps[i+1][1]-ps[i][1])*f];}x-=seg[i];}return ps[0];}};}
    function rng(seed){var s=(seed>>>0)||1;return function(){s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
    function place(e,p){e.setAttribute('cx',p[0].toFixed(1));e.setAttribute('cy',p[1].toFixed(1));}
    var ROUND={fill:'none','stroke-linecap':'round','stroke-linejoin':'round'};
    function merge(a,b){var o={};for(var k in a)o[k]=a[k];for(var k2 in b)o[k2]=b[k2];return o;}

    // 지금 줌의 레이어 좌표로 모두 다시 그린다(시계는 그대로)
    function render(){
      var g=cur.g,o=cur.o;svg.innerHTML='';cur.fx=null;
      var main=pts(g.main);if(main.length<2){cur.S=null;return;}
      var S=sample(main);cur.S=S;
      var dotted={fill:'none',stroke:o.col,'stroke-opacity':'.35','stroke-width':'1.6','stroke-dasharray':'1 5','stroke-linecap':'round'};
      if(g.head.length>1)el('path',merge(dotted,{d:pathD(pts(g.head))}));
      if(g.tail.length>1)el('path',merge(dotted,{d:pathD(pts(g.tail))}));
      var D=pathD(main);
      el('path',merge(ROUND,{d:D,stroke:o.bg,'stroke-opacity':'.55','stroke-width':'10'}));
      el('path',merge(ROUND,{d:D,stroke:o.col,'stroke-opacity':'.22','stroke-width':'16'}));
      cur.len=S.L+2;
      cur.lines=[el('path',merge(ROUND,{d:D,stroke:o.col,'stroke-width':'4.5'})),
        el('path',merge(ROUND,{d:D,stroke:'#fff','stroke-opacity':'.38','stroke-width':'1.1',transform:'translate(1.7 -1.4)'})),
        el('path',merge(ROUND,{d:D,stroke:o.col,'stroke-opacity':'.5','stroke-width':'1.1',transform:'translate(-1.6 1.5)'}))];
      cur.lines.forEach(function(l){l.style.strokeDasharray=cur.len;});
      cur.fades=[];var nodes=[];
      g.kms.forEach(function(k,i){
        var p=pts([k.at])[0],grp=el('g',{});cur.fades.push({el:grp,d:0.1+k.t*0.9});nodes.push({t:k.t,p:p});
        el('circle',{cx:p[0],cy:p[1],r:3,fill:o.bg,stroke:o.col,'stroke-width':2},grp);
        if(i===g.kms.length-1){var w=k.km>9?30:24;el('rect',{x:p[0]+7,y:p[1]-9,width:w,height:17,rx:5,fill:o.glass,stroke:o.glassBorder},grp);
          var tx=el('text',{x:p[0]+7+w/2,y:p[1]+3.5,'text-anchor':'middle','font-family':'ui-monospace,Menlo,monospace','font-size':10,'font-weight':500,fill:o.text},grp);tx.textContent=k.km+'K';}
      });
      var start=main[0],end=main[main.length-1];
      el('circle',{cx:start[0],cy:start[1],r:4.5,fill:o.bg,stroke:o.col,'stroke-width':2.5});
      el('circle',{cx:end[0],cy:end[1],r:5,fill:o.col,stroke:o.bg,'stroke-width':2.5});
      if(o.label&&g.head.length>1){var h0=pts([g.head[0]])[0],lg=el('g',{});cur.fades.push({el:lg,d:1.6});
        // 화면 밖으로 나가지 않게 가로로 민다(지도 가장자리에서 8px 안쪽)
        var cx=map.layerPointToContainerPoint(L.point(h0[0],h0[1])).x,vw=map.getSize().x,lx=h0[0]+Math.min(0,vw-8-(cx+62))+Math.max(0,8-(cx-62));
        el('rect',{x:lx-62,y:h0[1]+12,width:124,height:16,rx:5,fill:o.glass,stroke:o.glassBorder},lg);
        var lt=el('text',{x:lx,y:h0[1]+23,'text-anchor':'middle','font-family':'ui-monospace,Menlo,monospace','font-size':8.5,fill:o.text2},lg);lt.textContent=o.label;}
      if(cur.done){finish();return;}
      // 빛: 물결 · 번짐 · 가루 18 · 꼬리 24 · 머리
      var fg=el('g',{}),fx={rip:[],dust:[],trail:[],end:end};
      function dot(r,fill,op){return el('circle',{r:r,fill:fill,opacity:op},fg);}
      nodes.forEach(function(n){var c=dot(3,'none',0);c.setAttribute('stroke',o.col);c.setAttribute('stroke-width','1.6');fx.rip.push({el:c,t:n.t,p:n.p,start:-1});});
      fx.bloom=dot(4,'none',0);fx.bloom.setAttribute('stroke',o.col);fx.bloom.setAttribute('stroke-width','2');
      for(var i=0;i<18;i++)fx.dust.push({el:dot(1,i%3?o.col:'#fff',0),life:cur.dust[i]?cur.dust[i].life:0,x:0,y:0,vx:0,vy:0});
      for(var j=23;j>=0;j--)fx.trail[j]=dot((4.4*(1-j/24)+0.5).toFixed(2),j<3?'#fff':o.col,0);
      fx.glow=dot(15,o.col,0);fx.head=dot(5.2,'#fff',0);
      cur.fx=fx;cur.dust=fx.dust;
    }
    function finish(){
      cur.done=true;
      cur.lines.forEach(function(l){l.style.strokeDashoffset=0;});
      cur.fades.forEach(function(f){f.el.style.opacity=1;});
    }
    var DRAW=1100,LAP=2000,CYC=1.4,LAPS=2,COMET=1800;
    function step(now){
      if(!cur)return;
      var t=now-cur.t0;if(t<0){cur.raf=requestAnimationFrame(step);return;}
      var dt=Math.min(50,t-cur.last);cur.last=t;
      if(!cur.S){cur.raf=requestAnimationFrame(step);return;}
      var p=Math.min(1,Math.max(0,(t-100)/DRAW)),e=p>=1?1:1-Math.pow(2,-10*p);
      cur.lines.forEach(function(l){l.style.strokeDashoffset=cur.len*(1-e);});
      cur.fades.forEach(function(f){f.el.style.opacity=Math.min(1,Math.max(0,(t-f.d*1000)/280));});
      var fx=cur.fx;if(!fx){cur.raf=requestAnimationFrame(step);return;}
      var S=cur.S,hp=null;
      if(p>0&&p<1){hp=S.at(e);place(fx.head,hp);place(fx.glow,hp);fx.head.setAttribute('opacity',0.95);fx.glow.setAttribute('opacity',0.4);}
      if(p>=1&&!cur.bloomAt)cur.bloomAt=t+250;
      if(cur.bloomAt&&t>=cur.bloomAt){var q=(t-cur.bloomAt)/700;place(fx.bloom,fx.end);
        if(q<=1){fx.bloom.setAttribute('r',(4+q*22).toFixed(1));fx.bloom.setAttribute('opacity',(0.9*(1-q)).toFixed(2));}else fx.bloom.setAttribute('opacity',0);}
      var lap=t>=COMET?Math.floor((t-COMET)/LAP/CYC):0;
      if(t>=COMET&&lap<LAPS){var tt=((t-COMET)/LAP)%CYC;
        if(tt<=1){hp=S.at(tt);var fade=tt<0.06?tt/0.06:tt>0.94?(1-tt)/0.06:1;place(fx.head,hp);place(fx.glow,hp);
          fx.head.setAttribute('opacity',(0.95*fade).toFixed(2));fx.glow.setAttribute('opacity',(0.38*fade).toFixed(2));
          fx.trail.forEach(function(c,i){var ti=tt-i*0.011;if(ti<0){c.setAttribute('opacity',0);return;}place(c,S.at(ti));c.setAttribute('opacity',(fade*0.8*(1-i/24)).toFixed(2));});
          fx.rip.forEach(function(r){if(cur.prevTT>=0&&cur.prevTT<r.t&&tt>=r.t)r.start=t;});
        }else{fx.trail.forEach(function(c){c.setAttribute('opacity',0);});fx.head.setAttribute('opacity',0);fx.glow.setAttribute('opacity',0);hp=null;}
        cur.prevTT=tt;
      }else if(p>=1){fx.trail.forEach(function(c){c.setAttribute('opacity',0);});fx.head.setAttribute('opacity',0);fx.glow.setAttribute('opacity',0);}
      if(hp&&t>=COMET&&cur.rnd()<0.5){var d=fx.dust[cur.di++%fx.dust.length],a=cur.rnd()*6.28,s=0.15+cur.rnd()*0.45;d.x=hp[0];d.y=hp[1];d.vx=Math.cos(a)*s;d.vy=Math.sin(a)*s+0.12;d.life=1;}
      fx.dust.forEach(function(d){if(d.life<=0){d.el.setAttribute('opacity',0);return;}d.life-=dt/700;d.x+=d.vx*dt/16;d.y+=d.vy*dt/16;place(d.el,[d.x,d.y]);d.el.setAttribute('r',(0.5+d.life*1.3).toFixed(2));d.el.setAttribute('opacity',Math.max(0,d.life*0.85).toFixed(2));});
      fx.rip.forEach(function(r){if(r.start<0){r.el.setAttribute('opacity',0);return;}var k=(t-r.start)/650;if(k>1){r.el.setAttribute('opacity',0);r.start=-1;return;}place(r.el,r.p);r.el.setAttribute('r',(3.4+k*13).toFixed(1));r.el.setAttribute('opacity',(0.9*(1-k)).toFixed(2));});
      var over=t>=COMET&&lap>=LAPS&&fx.dust.every(function(d){return d.life<=0;});
      if(over){svg.removeChild(svg.lastChild);cur.fx=null;finish();return;}
      cur.raf=requestAnimationFrame(step);
    }
    map.on('zoomstart',function(){svg.style.visibility='hidden';});
    map.on('zoomend',function(){if(cur)render();svg.style.visibility='';});
    // 고른 러닝: 경로 전체가 헤더와 카드 사이 빈 곳에 들어오게 0.55초 동안 카메라를 옮긴다. coords: [lng,lat][], pad: [위, 아래]
    window.__fitRoute=function(coords,pad){
      var pts=coords.map(function(c){return [c[1],c[0]];});
      if(pts.length===0)return;
      if(pts.length===1){map.flyTo(pts[0],Math.max(map.getZoom(),15),{duration:0.55});return;}
      map.flyToBounds(L.latLngBounds(pts),{paddingTopLeft:[32,pad[0]],paddingBottomRight:[32,pad[1]],maxZoom:16,duration:0.55});
    };
    window.__routeFx={
      // g: RouteGeometry, o: RouteFxOptions
      show:function(g,o){
        if(cur)cancelAnimationFrame(cur.raf);
        svg.style.transition='';svg.style.opacity='';
        cur={g:g,o:o,t0:performance.now()+o.delay,last:0,done:o.keep||reduced(),dust:[],di:0,prevTT:-1,bloomAt:0,rnd:rng(o.seed)};
        render();
        if(!cur.done)cur.raf=requestAnimationFrame(step);
      },
      clear:function(){
        if(!cur)return;cancelAnimationFrame(cur.raf);cur=null;
        svg.style.transition='opacity .2s ease';svg.style.opacity='0';
        setTimeout(function(){if(!cur){svg.innerHTML='';svg.style.transition='';svg.style.opacity='';}},220);
      }
    };
  })();
`;
}
