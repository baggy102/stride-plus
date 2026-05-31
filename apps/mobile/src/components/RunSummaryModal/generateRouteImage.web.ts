const W = 400;
const H = 220;
const PAD = 24;

export async function generateRouteImage(coordinates: [number, number][]): Promise<File | null> {
  if (coordinates.length < 2) return null;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Background
  ctx.fillStyle = '#18181b';
  ctx.fillRect(0, 0, W, H);

  const lngs = coordinates.map((c) => c[0]);
  const lats = coordinates.map((c) => c[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const rangeX = maxLng - minLng || 0.001;
  const rangeY = maxLat - minLat || 0.001;

  // 종횡비 유지해서 중앙 정렬
  const drawW = W - PAD * 2;
  const drawH = H - PAD * 2;
  const scaleX = drawW / rangeX;
  const scaleY = drawH / rangeY;
  const scale = Math.min(scaleX, scaleY);
  const offsetX = PAD + (drawW - rangeX * scale) / 2;
  const offsetY = PAD + (drawH - rangeY * scale) / 2;

  const toXY = ([lng, lat]: [number, number]) => ({
    x: offsetX + (lng - minLng) * scale,
    y: offsetY + rangeY * scale - (lat - minLat) * scale,
  });

  const pts = coordinates.map(toXY);

  // 경로 라인
  ctx.beginPath();
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.stroke();

  // 시작점 (초록)
  ctx.beginPath();
  ctx.fillStyle = '#22c55e';
  ctx.arc(pts[0].x, pts[0].y, 6, 0, Math.PI * 2);
  ctx.fill();

  // 종료점 (빨강)
  const last = pts[pts.length - 1];
  ctx.beginPath();
  ctx.fillStyle = '#ef4444';
  ctx.arc(last.x, last.y, 6, 0, Math.PI * 2);
  ctx.fill();

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) { resolve(null); return; }
      resolve(new File([blob], 'route.png', { type: 'image/png' }));
    }, 'image/png');
  });
}
