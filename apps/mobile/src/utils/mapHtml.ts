import { LEAFLET_JS, LEAFLET_CSS, CLUSTER_JS, CLUSTER_CSS } from '@/assets/leafletBundle';

/** 이미지 배열로 캐러셀 HTML 생성 */
function carouselHtml(photos: string[], baseUrl: string, runId: string): string {
  if (photos.length === 0) return '';
  const id = runId.replace(/[^a-z0-9]/gi, '_');

  const slides = photos
    .map(
      (p, i) =>
        `<img src="${baseUrl}${p}" style="position:absolute;top:0;left:${i * 100}%;width:100%;height:140px;object-fit:cover;transition:left .25s;" class="sl_${id}"/>`,
    )
    .join('');

  const dots =
    photos.length > 1
      ? `<div style="position:absolute;bottom:6px;right:8px;display:flex;gap:4px;">
          ${photos.map((_, i) => `<div id="dt_${id}_${i}" onclick="go_${id}(${i})" style="width:6px;height:6px;border-radius:3px;cursor:pointer;background:${i === 0 ? '#fff' : 'rgba(255,255,255,.5)'}"></div>`).join('')}
        </div>`
      : '';

  const script =
    photos.length > 1
      ? `<script>
          function go_${id}(idx){
            document.querySelectorAll('.sl_${id}').forEach(function(el,i){el.style.left=(i-idx)*100+'%';});
            document.querySelectorAll('[id^="dt_${id}_"]').forEach(function(el,i){el.style.background=i===idx?'#fff':'rgba(255,255,255,.5)';});
          }
        </script>`
      : '';

  return `<div style="position:relative;width:100%;height:140px;overflow:hidden;border-radius:10px;margin-bottom:12px;">${slides}${dots}</div>${script}`;
}

/** 팝업 카드 내부 HTML (공통) */
export function popupInnerHtml(run: {
  _id: string;
  userId?: { _id?: string; username?: string };
  distanceKm: number;
  paceSecPerKm: number;
  routeImageUrl?: string | null;
  thumbnailUrl?: string | null;
  photoUrls?: string[];
  createdAt: string;
}, baseUrl: string, showUser = true): string {
  const photos = [
    run.routeImageUrl || null,
    ...(run.photoUrls ?? []),
  ].filter(Boolean) as string[];

  const imgHtml = carouselHtml(photos, baseUrl, run._id);

  const pace = run.paceSecPerKm
    ? `${Math.floor(run.paceSecPerKm / 60)}'${String(Math.round(run.paceSecPerKm % 60)).padStart(2, '0')}"`
    : `0'00"`;

  const d = new Date(run.createdAt);
  const date = `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;

  const userHtml = showUser
    ? `<div onclick="window.ReactNativeWebView.postMessage(JSON.stringify({type:'profile',userId:'${run.userId?._id ?? ''}'}))" style="display:flex;align-items:center;gap:8px;margin-bottom:10px;cursor:pointer;">
        <div style="width:28px;height:28px;border-radius:14px;background:#B3E5FC;color:#01579B;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">
          ${(run.userId?.username || '?')[0].toUpperCase()}
        </div>
        <span style="font-weight:600;font-size:13px;color:#F5F5F5;">${run.userId?.username || '알 수 없음'}</span>
      </div>`
    : '';

  return `<div style="padding:4px 2px;font-family:system-ui,sans-serif;">
    ${imgHtml}
    ${userHtml}
    <div style="display:flex;gap:16px;margin-bottom:6px;">
      <div>
        <div style="font-size:10px;color:#404040;text-transform:uppercase;letter-spacing:1px;">거리</div>
        <div style="font-size:16px;font-weight:700;color:#B3E5FC;">${run.distanceKm.toFixed(2)} <span style="font-size:11px;color:#808080;">km</span></div>
      </div>
      <div>
        <div style="font-size:10px;color:#404040;text-transform:uppercase;letter-spacing:1px;">페이스</div>
        <div style="font-size:16px;font-weight:700;color:#F5F5F5;">${pace} <span style="font-size:11px;color:#808080;">/km</span></div>
      </div>
    </div>
    <div style="font-size:11px;color:#808080;">${date}</div>
  </div>`;
}

/** CDN 없이 Leaflet을 인라인 번들로 포함하는 HTML head */
export const LEAFLET_HEAD = `
<style>${LEAFLET_CSS}${CLUSTER_CSS}*{margin:0;padding:0;}#map{width:100vw;height:100vh;}</style>
<script>${LEAFLET_JS}</script>
<script>${CLUSTER_JS}</script>`;
