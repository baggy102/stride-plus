// D3 점 격자 레이어(2026-11-19 확정): 화면 11px 칸마다 점 하나. 모든 칸에 아주 작은 바탕 점을 깔고,
// 데이터가 있는 칸은 수(3 · 10 · 30)에 따라 점이 커진다. 지도 피드(서버가 센 서로 다른 러너 수)와
// 내 피드 「내 흔적」(내 러닝이 지난 칸, 앱이 센다)이 같이 쓴다. 마커·경로 아래(pane z 350)에 캔버스로 그린다.
// 전역 map이 먼저 있어야 한다.

/** 칸 색. base는 바탕 점, ice는 데이터 칸, mint는 「새 길」(7일 안에 처음 지난 칸), fresh는 지도 피드 NEW의 「이번 주 새 길」 칸 */
export interface TraceColors {
  base: string;
  ice: string;
  mint: string;
  fresh?: string;
}

/** 「내 흔적」 재생이 끝나면 앱으로 보내는 메시지 */
export interface TraceMessage {
  type: 'trace';
  /** 이번 러닝으로 처음 지난 칸 수 · 이번 러닝이 지난 칸 수 */
  fresh: number;
  total: number;
}

export function traceLayerScript(): string {
  return `
  (function(){
    var CELL=11,NEW_MS=7*24*3600*1000,PAD=0.5;
    var pane=map.createPane('trace');pane.style.zIndex=350;pane.style.pointerEvents='none';
    var cv=document.createElement('canvas');cv.style.position='absolute';pane.appendChild(cv);
    var ctx=cv.getContext('2d');
    var col={base:'#8E9BA8',ice:'#9DBFE0',mint:'#5CF0C2'},runs=[],cells=null,play=null,raf=0;
    // 지도 피드 NEW: 서버가 준 「이번 주 새 길」 칸(고정 지리 칸 중심 lng·lat). on이면 데이터 칸을 흐리게 하고 이 칸만 민트로
    var newList=[],dim=false,newM=50,newKeys=null;
    // 경로 선 v2 「빛 둘레 격자」: 고른 경로의 도착(빛 머리) 둘레 LIFT_R px 안의 바탕 점만 바탕색 그대로 조금 밝힌다(데이터 점 · 수는 그대로)
    var lift=null,LIFT_R=64;
    function rgba(h,a){h=h.replace('#','');var n=parseInt(h.length===3?h.replace(/./g,'$&$&'):h.slice(0,6),16);return 'rgba('+(n>>16&255)+','+(n>>8&255)+','+(n&255)+','+a+')';}
    // NEW 칸 → 화면 칸: 서버 칸(newM 미터, 기준 위도 37.5 — 서버 new-cells와 같다)이 서로 붙어 있으면(같은 러닝) 두 중심을 이어
    // 지나는 화면 칸을 모두 켠다. 줌을 당겨도 내 흔적처럼 끊기지 않는 점 줄이 된다. 대각선은 사이 칸이 없을 때만 잇는다
    function buildNew(){
      newKeys=new Map();
      var dLat=newM/111320,dLng=newM/(111320*Math.cos(37.5*Math.PI/180)),geo=new Map();
      newList.forEach(function(c){geo.set(Math.floor(c.lng/dLng)+','+Math.floor(c.lat/dLat),c);});
      function mark(x,y){var k=key(x,y);if(!newKeys.has(k))newKeys.set(k,{i:Math.floor(x/CELL),j:Math.floor(y/CELL)});}
      function link(a,b){var p=map.latLngToLayerPoint([a.lat,a.lng]),q=map.latLngToLayerPoint([b.lat,b.lng]),steps=Math.max(1,Math.ceil(Math.hypot(q.x-p.x,q.y-p.y)/4));
        for(var s=0;s<=steps;s++)mark(p.x+(q.x-p.x)*s/steps,p.y+(q.y-p.y)*s/steps);}
      geo.forEach(function(c,k){
        var ij=k.split(','),i=+ij[0],j=+ij[1];
        var p=map.latLngToLayerPoint([c.lat,c.lng]);mark(p.x,p.y);
        function at(di,dj){var n=geo.get((i+di)+','+(j+dj));return n&&n.runId===c.runId?n:null;}
        [[1,0],[0,1]].forEach(function(d){var n=at(d[0],d[1]);if(n)link(c,n);});
        [[1,1],[1,-1]].forEach(function(d){var n=at(d[0],d[1]);if(n&&!at(d[0],0)&&!at(0,d[1]))link(c,n);});
      });
    }
    // 수 → 점 반지름(px). 1~2는 작게, 3 · 10 · 30부터 한 단계씩
    function radius(n){return n>=30?4.4:n>=10?3.6:n>=3?2.7:1.7;}
    function key(x,y){return Math.floor(x/CELL)+','+Math.floor(y/CELL);}
    // 지금 줌의 레이어 좌표로 칸을 센다: 칸마다 지난 러닝 수(같은 러닝은 한 번), 처음 지난 시각, 재생 러닝의 진행 비율
    var served=null; // 서버가 센 칸 [{lng,lat,n}](지도 피드). 있으면 runs 대신 쓴다
    function build(){
      cells=new Map();
      if(served){
        served.forEach(function(s){var p=map.latLngToLayerPoint([s.lat,s.lng]),k=key(p.x,p.y),c=cells.get(k);
          if(!c){c={i:Math.floor(p.x/CELL),j:Math.floor(p.y/CELL),n:0,first:Infinity,f:-1};cells.set(k,c);}
          if(s.n>c.n)c.n=s.n;});
        return;
      }
      runs.forEach(function(r){
        var seen={},ps=r.route.map(function(c){var p=map.latLngToLayerPoint([c[1],c[0]]);return [p.x,p.y];});
        var L=0,seg=[];for(var i=1;i<ps.length;i++){var l=Math.hypot(ps[i][0]-ps[i-1][0],ps[i][1]-ps[i-1][1]);seg.push(l);L+=l;}
        var walked=0;
        function visit(x,y,f){var k=key(x,y);if(seen[k])return;seen[k]=1;
          var c=cells.get(k);if(!c){c={i:Math.floor(x/CELL),j:Math.floor(y/CELL),n:0,first:Infinity,f:-1};cells.set(k,c);}
          c.n++;if(r.t<c.first)c.first=r.t;if(play&&r._id===play.id)c.f=f;}
        if(ps.length===1)visit(ps[0][0],ps[0][1],0);
        for(var s=0;s<seg.length;s++){var a=ps[s],b=ps[s+1],steps=Math.max(1,Math.ceil(seg[s]/4));
          for(var q=0;q<=steps;q++){var u=q/steps;visit(a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u,L?(walked+seg[s]*u)/L:0);}
          walked+=seg[s];}
      });
    }
    function draw(now){
      var size=map.getSize(),pw=Math.round(size.x*(1+PAD*2)),ph=Math.round(size.y*(1+PAD*2)),dpr=window.devicePixelRatio||1;
      var origin=map.containerPointToLayerPoint([-size.x*PAD,-size.y*PAD]);
      if(cv.width!==pw*dpr||cv.height!==ph*dpr){cv.width=pw*dpr;cv.height=ph*dpr;cv.style.width=pw+'px';cv.style.height=ph+'px';}
      L.DomUtil.setPosition(cv,origin);
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,pw,ph);
      // 바탕 점: 데이터와 무관한 고정 격자
      ctx.fillStyle=col.base;ctx.globalAlpha=0.22;
      var i0=Math.floor(origin.x/CELL),j0=Math.floor(origin.y/CELL),i1=Math.ceil((origin.x+pw)/CELL),j1=Math.ceil((origin.y+ph)/CELL);
      ctx.beginPath();
      for(var i=i0;i<=i1;i++)for(var j=j0;j<=j1;j++){var x=(i+0.5)*CELL-origin.x,y=(j+0.5)*CELL-origin.y;ctx.moveTo(x+0.85,y);ctx.arc(x,y,0.85,0,6.2832);}
      ctx.fill();
      if(lift){var lp=map.latLngToLayerPoint(lift),hx=lp.x-origin.x,hy=lp.y-origin.y,gr=ctx.createRadialGradient(hx,hy,0,hx,hy,LIFT_R);
        gr.addColorStop(0,rgba(col.base,0.5));gr.addColorStop(1,rgba(col.base,0));
        ctx.globalAlpha=1;ctx.fillStyle=gr;ctx.beginPath();
        for(var li=Math.floor((lp.x-LIFT_R)/CELL);li<=Math.ceil((lp.x+LIFT_R)/CELL);li++)for(var lj=Math.floor((lp.y-LIFT_R)/CELL);lj<=Math.ceil((lp.y+LIFT_R)/CELL);lj++){
          var lx=(li+0.5)*CELL-origin.x,ly=(lj+0.5)*CELL-origin.y;ctx.moveTo(lx+1,ly);ctx.arc(lx,ly,1,0,6.2832);}
        ctx.fill();}
      var t=play?now-play.t0:0,today=Date.now(),fade=dim?0.3:1;
      if(cells)cells.forEach(function(c){
        var x=(c.i+0.5)*CELL-origin.x,y=(c.j+0.5)*CELL-origin.y;
        if(x<-CELL||y<-CELL||x>pw+CELL||y>ph+CELL)return;
        var fresh=today-c.first<NEW_MS,k=1;
        // 「내 흔적」: 재생 러닝의 칸은 경로를 따라 0.3~1.5초에 스며든다(이번에 처음 연 칸은 민트로 한 번 부풀었다 앉는다)
        if(play&&c.f>=0){var at=300+c.f*1200,q=Math.min(1,Math.max(0,(t-at)/450));
          if(c.n===1&&q<=0)return;
          k=c.n===1?q:1;
          if(c.first===play.t&&q>0&&q<1){ctx.globalAlpha=0.35*(1-q);ctx.fillStyle=col.mint;ctx.beginPath();ctx.arc(x,y,radius(c.n)+6*q,0,6.2832);ctx.fill();}}
        ctx.globalAlpha=(fresh?0.85:0.6)*k*fade;ctx.fillStyle=fresh?col.mint:col.ice;
        ctx.beginPath();ctx.arc(x,y,radius(c.n)*(0.6+0.4*k),0,6.2832);ctx.fill();
      });
      // NEW 칸도 내 흔적과 같은 화면 칸에 같은 크기로(칸 중심 · radius(그 칸의 수) · 0.85)
      if(dim&&newKeys&&newKeys.size){
        ctx.globalAlpha=0.85;ctx.fillStyle=col.fresh||col.mint;ctx.beginPath();
        newKeys.forEach(function(c,k){var x=(c.i+0.5)*CELL-origin.x,y=(c.j+0.5)*CELL-origin.y;
          if(x<-CELL||y<-CELL||x>pw+CELL||y>ph+CELL)return;
          var d=cells&&cells.get(k),r=radius(d?d.n:1);ctx.moveTo(x+r,y);ctx.arc(x,y,r,0,6.2832);});
        ctx.fill();
      }
      ctx.globalAlpha=1;
    }
    function frame(now){
      draw(now);
      if(play&&now-play.t0<2000){raf=requestAnimationFrame(frame);return;}
      if(play&&!play.sent){play.sent=true;var fresh=0,total=0;cells.forEach(function(c){if(c.f>=0){total++;if(c.first===play.t)fresh++;}});
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'trace',fresh:fresh,total:total}));}
    }
    function redraw(){cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);}
    map.on('zoomend',function(){build();buildNew();redraw();});
    map.on('moveend resize',redraw);
    map.on('zoomstart',function(){cv.style.visibility='hidden';});
    map.on('zoomend',function(){cv.style.visibility='';});
    window.__trace={
      // runs: [{_id, t(ms), route:[lng,lat][]}]
      setRuns:function(next){runs=next.filter(function(r){return r.route&&r.route.length;});build();redraw();},
      // 지도 피드: 서버가 센 칸(서로 다른 러너 3명 이상)
      setCells:function(next){served=next;build();redraw();},
      setColors:function(next){col=next;redraw();},
      // 고른 경로의 도착 [lat,lng](경로 연출이 선을 다 그은 뒤 켠다), null이면 끈다
      lift:function(ll){lift=ll;redraw();},
      // 새 러닝: 7일 안에 이 러닝이 처음 지난 칸(민트 점)이 하나라도 있으면 true — 고른 경로를 처음부터 민트로 그린다
      opened:function(id){var r=runs.find(function(q){return q._id===id;});
        if(!r||!cells||Date.now()-r.t>=NEW_MS)return false;
        var hit=false;cells.forEach(function(c){if(c.first===r.t)hit=true;});return hit;},
      // 지도 피드 NEW: 「이번 주 새 길」 칸과 표시 여부(NEW 칸이 골라졌을 때만 on), 칸 한 변(미터, 바뀔 때만)
      setNew:function(list,on,m){newList=list||[];dim=!!on;if(m)newM=m;buildNew();redraw();},
      // 방금 저장한 러닝이 지도에 스며든다(동작 줄이기면 바로 끝 상태로)
      play:function(id){var r=runs.find(function(q){return q._id===id;});if(!r)return;
        var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
        play={id:id,t:r.t,t0:performance.now()-(reduce?2000:0),sent:false};build();redraw();}
    };
  })();
`;
}
