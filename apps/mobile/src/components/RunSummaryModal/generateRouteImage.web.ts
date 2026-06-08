const CANVAS_W = 600;
const CANVAS_H = 300;
const TILE_SIZE = 256;
const TILE_URL = 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';

function lngLatToTileFloat(lng: number, lat: number, z: number) {
  const n = Math.pow(2, z);
  const x = (lng + 180) / 360 * n;
  const latRad = lat * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
  return { x, y };
}

function loadTile(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export async function generateRouteImage(coordinates: [number, number][]): Promise<File | null> {
  if (coordinates.length < 2) return null;

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const lngs = coordinates.map((c) => c[0]);
  const lats = coordinates.map((c) => c[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  // 경로 주변 여백 추가
  const padLng = (maxLng - minLng) * 0.4 || 0.003;
  const padLat = (maxLat - minLat) * 0.4 || 0.003;
  const bMinLng = minLng - padLng;
  const bMaxLng = maxLng + padLng;
  const bMinLat = minLat - padLat;
  const bMaxLat = maxLat + padLat;

  // 캔버스에 맞는 줌 레벨 계산
  let zoom = 17;
  while (zoom > 1) {
    const tl = lngLatToTileFloat(bMinLng, bMaxLat, zoom);
    const br = lngLatToTileFloat(bMaxLng, bMinLat, zoom);
    if ((br.x - tl.x) * TILE_SIZE <= CANVAS_W && (br.y - tl.y) * TILE_SIZE <= CANVAS_H) break;
    zoom--;
  }

  const tl = lngLatToTileFloat(bMinLng, bMaxLat, zoom);
  const br = lngLatToTileFloat(bMaxLng, bMinLat, zoom);

  // 경로를 캔버스 중앙에 배치하기 위한 오프셋
  const routeW = (br.x - tl.x) * TILE_SIZE;
  const routeH = (br.y - tl.y) * TILE_SIZE;
  const offsetX = (CANVAS_W - routeW) / 2;
  const offsetY = (CANVAS_H - routeH) / 2;

  // 타일 범위
  const txStart = Math.floor(tl.x);
  const tyStart = Math.floor(tl.y);
  const txEnd = Math.floor(br.x);
  const tyEnd = Math.floor(br.y);

  // 지도 타일 병렬 로드 & 렌더링
  const tileJobs: Promise<void>[] = [];
  for (let tx = txStart; tx <= txEnd; tx++) {
    for (let ty = tyStart; ty <= tyEnd; ty++) {
      const url = TILE_URL
        .replace('{z}', String(zoom))
        .replace('{x}', String(tx))
        .replace('{y}', String(ty));
      const px = offsetX + (tx - tl.x) * TILE_SIZE;
      const py = offsetY + (ty - tl.y) * TILE_SIZE;
      tileJobs.push(
        loadTile(url)
          .then((img) => ctx.drawImage(img, px, py, TILE_SIZE, TILE_SIZE))
          .catch(() => {
            ctx.fillStyle = '#e8e8e8';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          }),
      );
    }
  }
  await Promise.all(tileJobs);

  // lng/lat → 캔버스 픽셀 변환
  const toPixel = ([lng, lat]: [number, number]) => {
    const tf = lngLatToTileFloat(lng, lat, zoom);
    return {
      x: offsetX + (tf.x - tl.x) * TILE_SIZE,
      y: offsetY + (tf.y - tl.y) * TILE_SIZE,
    };
  };

  const pts = coordinates.map(toPixel);

  // 경로 글로우 (반투명 두꺼운 선)
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(229,57,53,0.35)';
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.stroke();

  // 경로 메인 선
  ctx.beginPath();
  ctx.strokeStyle = '#e53935';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.stroke();

  // 시작점 (초록)
  ctx.beginPath();
  ctx.fillStyle = '#22c55e';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.5;
  ctx.arc(pts[0].x, pts[0].y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 종료점 (빨강)
  const last = pts[pts.length - 1];
  ctx.beginPath();
  ctx.fillStyle = '#e53935';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.5;
  ctx.arc(last.x, last.y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) { resolve(null); return; }
      resolve(new File([blob], 'route.png', { type: 'image/png' }));
    }, 'image/png');
  });
}
