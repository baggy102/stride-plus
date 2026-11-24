// 고른 러닝의 경로 연출 A+(2026-11-19 확정, 지도 피드 프로토타입 v8 개선안). 지도 피드·내 피드가 같이 쓴다.
// 선이 1.1초에 그어지고(expo) → 도착점 번짐 → 빛 머리와 꼬리가 경로를 2바퀴 돌며 가루를 떨어뜨리고
// 지나는 km 점마다 물결. km 점은 마지막에만 라벨. 내 러닝이면 집 근처 앞뒤는 점선 + 안내.
// 선은 경로 선 v2(2026-11-24): 앱이 매끈하게 한 사본(smoothGeometry)을 받아, 선 아래 지도(D3 점 · 길)를 지우고
// 띠 8개 × 바깥 빛 · 안쪽 빛 · 선 몸 + 도착 쪽 속선으로 그린다(도착 쪽이 밝다). 고정 방향 겹 가닥 · 고른 띠 번짐은 없앴다.
// 연출 시각(그리기 1.1초 · 번짐 · 2바퀴)은 그대로이고 모양만 바꿨다. SVG Path는 띠 24 + 속선 6 + 꼬리 6.
// 전역 map이 먼저 있어야 한다. 자기 pane 안의 SVG에 레이어 좌표로 그려 지도를 옮겨도 따라가고, 줌이 끝나면 다시 그린다.
import type { Palette } from '@/theme/colors';
import { bandStyles, coreSteps, knockWidth, LINE_V2, lineLook, SEAM } from '@/utils/routeLine';

// 선 몸 굵기 · 빛 머리 번짐 반지름(px)
const BODY = 4;
const BLOOM = 18;

/** WebView에 넘기는 색과 시각 */
export interface RouteFxOptions {
  col: string; // 경로 색(TOTAL Ice · HYPE Pearl · NEW 민트)
  /** 바깥 빛(Ice면 Signal Blue, 민트 · Pearl은 제 색) · 속선과 km 알갱이 · 머리 속 */
  glow: string;
  core: string;
  head: string;
  /** 지도 바탕(땅) 색: 선 아래를 지우고 출발 표시 속을 채운다 */
  land: string;
  /** 띠별 선 몸 · 속선 조각의 불투명 색(땅 위에 쌓은 것과 같은 색 — 띠 이음매가 비치지 않게) */
  bodies: string[];
  cores: string[];
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

/** 경로 색 한 벌(RouteFxOptions에 펼쳐 넣는다). col = 맥락의 경로 색 */
export function routeFxTone(p: Palette, col: string): Pick<RouteFxOptions, 'col' | 'glow' | 'core' | 'head' | 'land' | 'bodies' | 'cores'> {
  const t = lineLook(p, col);
  return { col, glow: t.outer, core: t.core, head: t.head, land: p.map.bg, bodies: t.bodies, cores: t.cores };
}

export function routeFxScript(): string {
  return `
  (function(){
    var NS='http://www.w3.org/2000/svg';
    var LV2=${JSON.stringify(LINE_V2)},BANDS=${JSON.stringify(bandStyles(BODY))},CORE=${JSON.stringify(coreSteps())},B=${BODY},KNOCK=${knockWidth(BODY)},BLOOM=${BLOOM},SEAM=${SEAM};
    var pane=map.createPane('routeFx');pane.style.zIndex=450;pane.style.pointerEvents='none';
    var svg=document.createElementNS(NS,'svg');svg.setAttribute('style','position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible');pane.appendChild(svg);
    var cur=null;
    var reduced=function(){return window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;};
    function el(tag,attrs,parent){var e=document.createElementNS(NS,tag);for(var k in attrs)e.setAttribute(k,attrs[k]);(parent||svg).appendChild(e);return e;}
    function pts(list){return list.map(function(c){var p=map.latLngToLayerPoint([c[1],c[0]]);return [p.x,p.y];});}
    function pathD(ps){return ps.map(function(p,i){return (i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1);}).join('');}
    function sample(ps){var seg=[],L=0;for(var i=1;i<ps.length;i++){var l=Math.hypot(ps[i][0]-ps[i-1][0],ps[i][1]-ps[i-1][1]);seg.push(l);L+=l;}
      return {L:L,at:function(t){var x=t*L;for(var i=0;i<seg.length;i++){if(x<=seg[i]||i===seg.length-1){var f=seg[i]?Math.min(1,x/seg[i]):0;return [ps[i][0]+(ps[i+1][0]-ps[i][0])*f,ps[i][1]+(ps[i+1][1]-ps[i][1])*f];}x-=seg[i];}return ps[0];}};}
    // 길이 a~b 구간의 점(누적 길이 c, 양 끝 보간)
    function cum(ps){var c=[0];for(var i=1;i<ps.length;i++)c.push(c[i-1]+Math.hypot(ps[i][0]-ps[i-1][0],ps[i][1]-ps[i-1][1]));return c;}
    function find(c,L){var n=c.length-1;if(L<=0)return [0,0];if(L>=c[n])return [n-1,1];var lo=0,hi=n;while(hi-lo>1){var m=(lo+hi)>>1;if(c[m]<=L)lo=m;else hi=m;}var s=c[hi]-c[lo];return [lo,s>0?(L-c[lo])/s:0];}
    function mix(a,b,f){return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];}
    function slice(ps,c,a,b){var A=find(c,a),Z=find(c,b),out=[mix(ps[A[0]],ps[A[0]+1],A[1])];for(var i=A[0]+1;i<=Z[0];i++)out.push(ps[i]);out.push(mix(ps[Z[0]],ps[Z[0]+1],Z[1]));return out;}
    function rng(seed){var s=(seed>>>0)||1;return function(){s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
    function place(e,p){e.setAttribute('cx',p[0].toFixed(1));e.setAttribute('cy',p[1].toFixed(1));}
    function merge(a,b){var o={};for(var k in a)o[k]=a[k];for(var k2 in b)o[k2]=b[k2];return o;}
    // 도착(빛 머리) 둘레 바탕 점을 밝힌다(D3 점 레이어가 있을 때만, 데이터 점은 그대로)
    function lift(on){if(window.__trace&&window.__trace.lift)window.__trace.lift(on&&cur?[cur.g.main[cur.g.main.length-1][1],cur.g.main[cur.g.main.length-1][0]]:null);}

    // 지금 줌의 레이어 좌표로 모두 다시 그린다(시계는 그대로)
    function render(){
      var g=cur.g,o=cur.o;svg.innerHTML='';cur.fx=null;
      var main=pts(g.main);if(main.length<2){cur.S=null;return;}
      var S=sample(main);cur.S=S;
      var c=cum(main),T=c[c.length-1];cur.main=main;cur.c=c;cur.T=T;
      // 0 선 아래 지도(D3 점 · 길)를 땅 색으로 지운다
      el('path',{d:pathD(main),fill:'none',stroke:o.land,'stroke-opacity':LV2.knock.op,'stroke-width':KNOCK,'stroke-linecap':'round','stroke-linejoin':'round'});
      var dotted={fill:'none',stroke:o.col,'stroke-opacity':'.35','stroke-width':'1.6','stroke-dasharray':'1 5','stroke-linecap':'round'};
      if(g.head.length>1)el('path',merge(dotted,{d:pathD(pts(g.head))}));
      if(g.tail.length>1)el('path',merge(dotted,{d:pathD(pts(g.tail))}));
      // 1 바깥 빛 · 2 안쪽 빛 · 3 선 몸(띠마다 한 Path, 맞댄 끝) · 4 속선(도착 쪽 30 px). 그리기 연출은 띠마다 점선 오프셋.
      // 선 몸 · 속선은 불투명하게 섞은 색으로 다음 띠 밑까지 SEAM px 늘려 이음매 틈이 없다
      cur.strokes=[];
      function stroke(a,b,col,w,op){var len=Math.max(0,b-a),e=el('path',{d:pathD(slice(main,c,a,b)),fill:'none',stroke:col,'stroke-width':w.toFixed(2),'stroke-opacity':op.toFixed(3),'stroke-linecap':'butt','stroke-linejoin':'round'});
        e.style.strokeDasharray=(len+1)+' '+(len+1);cur.strokes.push({el:e,a:a,len:len});}
      BANDS.forEach(function(s){stroke(T*s.t0,T*s.t1,o.glow,s.outerW,s.outerOp);});
      BANDS.forEach(function(s){stroke(T*s.t0,T*s.t1,o.col,s.innerW,s.innerOp);});
      BANDS.forEach(function(s,i){stroke(T*s.t0,Math.min(T,T*s.t1+SEAM),o.bodies[i],s.bodyW,1);});
      var tl=Math.min(T,LV2.core.len);
      CORE.forEach(function(k,j){stroke(T-tl+tl*k.f0,Math.min(T,T-tl+tl*k.f1+SEAM),o.cores[j],B*LV2.core.mul,1);});
      // km: 선 위 작은 빛 알갱이(선을 끊지 않는다), 마지막 km만 라벨
      cur.fades=[];var nodes=[];
      g.kms.forEach(function(k,i){
        var p=pts([k.at])[0],grp=el('g',{});cur.fades.push({el:grp,d:0.1+k.t*0.9});nodes.push({t:k.t,p:p});
        el('circle',{cx:p[0].toFixed(1),cy:p[1].toFixed(1),r:LV2.km.r,fill:o.core,'fill-opacity':LV2.km.op},grp);
        if(i===g.kms.length-1){var w=k.km>9?30:24;el('rect',{x:p[0]+7,y:p[1]-9,width:w,height:17,rx:5,fill:o.glass,stroke:o.glassBorder},grp);
          var tx=el('text',{x:p[0]+7+w/2,y:p[1]+3.5,'text-anchor':'middle','font-family':'ui-monospace,Menlo,monospace','font-size':10,'font-weight':500,fill:o.text},grp);tx.textContent=k.km+'K';}
      });
      // 출발: 조용한 작은 고리. 도착: 빛 머리(반지름 그라데이션 번짐 + 테 + 속)
      var start=main[0],end=main[main.length-1];
      el('circle',{cx:start[0],cy:start[1],r:LV2.start.r,fill:o.land,stroke:o.col,'stroke-opacity':LV2.start.op,'stroke-width':LV2.start.w});
      var gr=el('radialGradient',{id:'lv2fx'},el('defs',{}));
      el('stop',{offset:0,'stop-color':o.col,'stop-opacity':LV2.head.bloomIn},gr);
      el('stop',{offset:LV2.head.bloomMid,'stop-color':o.glow,'stop-opacity':LV2.head.bloomMidOp},gr);
      el('stop',{offset:1,'stop-color':o.glow,'stop-opacity':0},gr);
      el('circle',{cx:end[0],cy:end[1],r:BLOOM,fill:'url(#lv2fx)'});
      el('circle',{cx:end[0],cy:end[1],r:LV2.head.ring,fill:'none',stroke:o.col,'stroke-opacity':LV2.head.ringOp,'stroke-width':LV2.head.ringW});
      el('circle',{cx:end[0],cy:end[1],r:LV2.head.core,fill:o.head});
      if(o.label&&g.head.length>1){var h0=pts([g.head[0]])[0],lg=el('g',{});cur.fades.push({el:lg,d:1.6});
        // 화면 밖으로 나가지 않게 가로로 민다(지도 가장자리에서 8px 안쪽)
        var cx=map.layerPointToContainerPoint(L.point(h0[0],h0[1])).x,vw=map.getSize().x,lx=h0[0]+Math.min(0,vw-8-(cx+62))+Math.max(0,8-(cx-62));
        el('rect',{x:lx-62,y:h0[1]+12,width:124,height:16,rx:5,fill:o.glass,stroke:o.glassBorder},lg);
        var lt=el('text',{x:lx,y:h0[1]+23,'text-anchor':'middle','font-family':'ui-monospace,Menlo,monospace','font-size':8.5,fill:o.text2},lg);lt.textContent=o.label;}
      if(cur.done){finish();return;}
      // 그리기 전에는 선(띠 · 속선)과 km 점 · 라벨 · 안내를 숨긴다. 카메라가 먼저 움직이는 delay 동안 step()이 아무것도 안 하므로
      // 여기서 숨겨야 경로 전체가 먼저 보였다 사라지지 않는다. 그리는 중에 다시 그리면 다음 step()이 그 자리로 되돌린다.
      // 출발 고리 · 도착 빛 머리는 그리기 첫 100ms에도 보이므로 그대로 둔다
      reveal(0);cur.fades.forEach(function(f){f.el.style.opacity=0;});
      // 빛: 물결 · 번짐 · 가루 18 · 꼬리(속선 6조각) · 머리(번짐 + 속)
      var fg=el('g',{}),fx={rip:[],dust:[],trail:[],end:end};
      function dot(r,fill,op){return el('circle',{r:r,fill:fill,opacity:op},fg);}
      nodes.forEach(function(n){var c2=dot(3,'none',0);c2.setAttribute('stroke',o.col);c2.setAttribute('stroke-width','1.6');fx.rip.push({el:c2,t:n.t,p:n.p,start:-1});});
      fx.bloom=dot(4,'none',0);fx.bloom.setAttribute('stroke',o.col);fx.bloom.setAttribute('stroke-width','2');
      for(var i=0;i<18;i++)fx.dust.push({el:dot(1,i%3?o.col:o.core,0),life:cur.dust[i]?cur.dust[i].life:0,x:0,y:0,vx:0,vy:0});
      for(var j=0;j<6;j++)fx.trail.push(el('path',{fill:'none',stroke:o.core,'stroke-width':(B*(0.45+0.35*(j+1)/6)).toFixed(2),'stroke-linecap':'butt','stroke-linejoin':'round',opacity:0},fg));
      fx.glow=el('circle',{r:BLOOM,fill:'url(#lv2fx)',opacity:0},fg);fx.head=dot(LV2.head.core,o.head,0);
      cur.fx=fx;cur.dust=fx.dust;
    }
    function reveal(L){cur.strokes.forEach(function(s){s.el.style.strokeDashoffset=s.len+1-Math.max(0,Math.min(s.len,L-s.a));});}
    function finish(){
      cur.done=true;
      reveal(Infinity);
      cur.fades.forEach(function(f){f.el.style.opacity=1;});
      lift(true);
    }
    // 꼬리: 머리 뒤 경로의 TRAIL만큼(예전 꼬리 원 24개와 같은 길이)을 6조각, 머리 쪽으로 진하게
    var TRAIL=0.264;
    function trail(fx,tt,fade){var T=cur.T;fx.trail.forEach(function(e,j){var a=Math.max(0,tt-TRAIL+TRAIL*j/6),b=tt-TRAIL+TRAIL*(j+1)/6;
      if(b<=a){e.setAttribute('opacity',0);return;}e.setAttribute('d',pathD(slice(cur.main,cur.c,a*T,b*T)));e.setAttribute('opacity',(fade*0.85*(j+1)/6).toFixed(2));});}
    function hideTrail(fx){fx.trail.forEach(function(e){e.setAttribute('opacity',0);});}
    var DRAW=1100,LAP=2000,CYC=1.4,LAPS=2,COMET=1800;
    function step(now){
      if(!cur)return;
      var t=now-cur.t0;if(t<0){cur.raf=requestAnimationFrame(step);return;}
      var dt=Math.min(50,t-cur.last);cur.last=t;
      if(!cur.S){cur.raf=requestAnimationFrame(step);return;}
      var p=Math.min(1,Math.max(0,(t-100)/DRAW)),e=p>=1?1:1-Math.pow(2,-10*p);
      reveal(cur.T*e);
      cur.fades.forEach(function(f){f.el.style.opacity=Math.min(1,Math.max(0,(t-f.d*1000)/280));});
      var fx=cur.fx;if(!fx){cur.raf=requestAnimationFrame(step);return;}
      var S=cur.S,hp=null;
      if(p>0&&p<1){hp=S.at(e);place(fx.head,hp);place(fx.glow,hp);fx.head.setAttribute('opacity',0.95);fx.glow.setAttribute('opacity',0.9);}
      if(p>=1&&!cur.bloomAt){cur.bloomAt=t+250;lift(true);}
      if(cur.bloomAt&&t>=cur.bloomAt){var q=(t-cur.bloomAt)/700;place(fx.bloom,fx.end);
        if(q<=1){fx.bloom.setAttribute('r',(4+q*22).toFixed(1));fx.bloom.setAttribute('opacity',(0.9*(1-q)).toFixed(2));}else fx.bloom.setAttribute('opacity',0);}
      var lap=t>=COMET?Math.floor((t-COMET)/LAP/CYC):0;
      if(t>=COMET&&lap<LAPS){var tt=((t-COMET)/LAP)%CYC;
        if(tt<=1){hp=S.at(tt);var fade=tt<0.06?tt/0.06:tt>0.94?(1-tt)/0.06:1;place(fx.head,hp);place(fx.glow,hp);
          fx.head.setAttribute('opacity',(0.95*fade).toFixed(2));fx.glow.setAttribute('opacity',(0.9*fade).toFixed(2));
          trail(fx,tt,fade);
          fx.rip.forEach(function(r){if(cur.prevTT>=0&&cur.prevTT<r.t&&tt>=r.t)r.start=t;});
        }else{hideTrail(fx);fx.head.setAttribute('opacity',0);fx.glow.setAttribute('opacity',0);hp=null;}
        cur.prevTT=tt;
      }else if(p>=1){hideTrail(fx);fx.head.setAttribute('opacity',0);fx.glow.setAttribute('opacity',0);}
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
      // g: RouteGeometry(매끈하게 한 사본), o: RouteFxOptions
      show:function(g,o){
        if(cur)cancelAnimationFrame(cur.raf);
        svg.style.transition='';svg.style.opacity='';
        cur={g:g,o:o,t0:performance.now()+o.delay,last:0,done:o.keep||reduced(),dust:[],di:0,prevTT:-1,bloomAt:0,rnd:rng(o.seed)};
        if(!cur.done)lift(false);
        render();
        if(!cur.done)cur.raf=requestAnimationFrame(step);
      },
      clear:function(){
        if(!cur)return;cancelAnimationFrame(cur.raf);cur=null;lift(false);
        svg.style.transition='opacity .2s ease';svg.style.opacity='0';
        setTimeout(function(){if(!cur){svg.innerHTML='';svg.style.transition='';svg.style.opacity='';}},220);
      }
    };
  })();
`;
}
