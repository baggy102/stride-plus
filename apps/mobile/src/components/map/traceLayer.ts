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
    var newList=[],dim=false;
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
      if(dim&&newList.length){
        ctx.globalAlpha=0.9;ctx.fillStyle=col.fresh||col.mint;ctx.beginPath();
        newList.forEach(function(c){var p=map.latLngToLayerPoint([c.lat,c.lng]),x=p.x-origin.x,y=p.y-origin.y;
          if(x<-CELL||y<-CELL||x>pw+CELL||y>ph+CELL)return;ctx.moveTo(x+3.2,y);ctx.arc(x,y,3.2,0,6.2832);});
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
    map.on('zoomend',function(){build();redraw();});
    map.on('moveend resize',redraw);
    map.on('zoomstart',function(){cv.style.visibility='hidden';});
    map.on('zoomend',function(){cv.style.visibility='';});
    window.__trace={
      // runs: [{_id, t(ms), route:[lng,lat][]}]
      setRuns:function(next){runs=next.filter(function(r){return r.route&&r.route.length;});build();redraw();},
      // 지도 피드: 서버가 센 칸(서로 다른 러너 3명 이상)
      setCells:function(next){served=next;build();redraw();},
      setColors:function(next){col=next;redraw();},
      // 지도 피드 NEW: 「이번 주 새 길」 칸과 표시 여부(NEW 칸이 골라졌을 때만 on)
      setNew:function(list,on){newList=list||[];dim=!!on;redraw();},
      // 방금 저장한 러닝이 지도에 스며든다(동작 줄이기면 바로 끝 상태로)
      play:function(id){var r=runs.find(function(q){return q._id===id;});if(!r)return;
        var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
        play={id:id,t:r.t,t0:performance.now()-(reduce?2000:0),sent:false};build();redraw();}
    };
  })();
`;
}
