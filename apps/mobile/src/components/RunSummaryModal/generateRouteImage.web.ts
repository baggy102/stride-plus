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

  const padLng = (maxLng - minLng) * 0.4 || 0.003;
  const padLat = (maxLat - minLat) * 0.4 || 0.003;
  const bMinLng = minLng - padLng;
  const bMaxLng = maxLng + padLng;
  const bMinLat = minLat - padLat;
  const bMaxLat = maxLat + padLat;

  let zoom = 17;
  while (zoom > 1) {
    const tl = lngLatToTileFloat(bMinLng, bMaxLat, zoom);
    const br = lngLatToTileFloat(bMaxLng, bMinLat, zoom);
    if ((br.x - tl.x) * TILE_SIZE <= CANVAS_W && (br.y - tl.y) * TILE_SIZE <= CANVAS_H) break;
    zoom--;
  }

  const tl = lngLatToTileFloat(bMinLng, bMaxLat, zoom);
  const br = lngLatToTileFloat(bMaxLng, bMinLat, zoom);

  const routeW = (br.x - tl.x) * TILE_SIZE;
  const routeH = (br.y - tl.y) * TILE_SIZE;
  const offsetX = (CANVAS_W - routeW) / 2;
  const offsetY = (CANVAS_H - routeH) / 2;

  const txStart = Math.floor(tl.x);
  const tyStart = Math.floor(tl.y);
  const txEnd = Math.floor(br.x);
  const tyEnd = Math.floor(br.y);

  // 라이트 타일을 grayscale + invert + brightness로 다크맵처럼 렌더링
  ctx.filter = 'invert(1) hue-rotate(180deg) brightness(1.6) contrast(0.8) saturate(0.5)';
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
            ctx.fillStyle = '#141414';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          }),
      );
    }
  }
  await Promise.all(tileJobs);

  // 타일 필터 리셋 후 경로 그리기
  ctx.filter = 'none';

  const toPixel = ([lng, lat]: [number, number]) => {
    const tf = lngLatToTileFloat(lng, lat, zoom);
    return {
      x: offsetX + (tf.x - tl.x) * TILE_SIZE,
      y: offsetY + (tf.y - tl.y) * TILE_SIZE,
    };
  };

  const pts = coordinates.map(toPixel);

  // 경로 글로우 (Frost Blue 반투명)
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(179,229,252,0.3)';
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.stroke();

  // 경로 메인 선 (Frost Blue)
  ctx.beginPath();
  ctx.strokeStyle = '#B3E5FC';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.stroke();

  // 시작점 (Frost Blue secondary)
  ctx.beginPath();
  ctx.fillStyle = '#81D4FA';
  ctx.strokeStyle = '#0A0A0A';
  ctx.lineWidth = 2.5;
  ctx.arc(pts[0].x, pts[0].y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 종료점 (Frost Blue primary)
  const last = pts[pts.length - 1];
  ctx.beginPath();
  ctx.fillStyle = '#B3E5FC';
  ctx.strokeStyle = '#0A0A0A';
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
