import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { AppState } from 'react-native';
import type { WebViewHandle } from './mapHtml';

/** 지도 페이지 공용 메시지(mapHtml baseMapScript): 핑 답 · 타일 주소 없음 */
export type MapPageMessage = { type: 'pong' } | { type: 'tileUrlMissing' };

// 앱이 다시 보일 때 지도 페이지에 핑을 보내고, 이 시간 안에 답이 없으면 WebView를 새로 만든다
const PING_TIMEOUT_MS = 1500;

// 타일 주소 경고는 앱 실행마다 한 번(지도 WebView가 여럿이다)
let warnedTileUrl = false;

/**
 * 지도 WebView 복구. WebView 콘텐츠 프로세스가 죽거나(iOS onContentProcessDidTerminate · Android onRenderProcessGone)
 * 포그라운드 복귀 핑에 답이 없으면 key(mapKey)를 바꿔 WebView를 다시 마운트한다 — 앱은 살아 있는데 지도 영역만 비는 것을 막는다.
 * loadedRef: 화면이 onLoadStart·onLoadEnd에서 고치는 「페이지 로드 끝남」 표시(로드 중에는 핑하지 않는다. 다시 마운트하면 false로).
 * onRemount: 다시 마운트하기 직전에 부른다(화면이 로드 뒤 복원할 상태를 잡아 둔다)
 */
export function useMapRecovery(webViewRef: RefObject<WebViewHandle | null>, loadedRef: { current: boolean }, onRemount?: () => void) {
  const [mapKey, setMapKey] = useState(0);
  const pingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRemountRef = useRef(onRemount);
  onRemountRef.current = onRemount;

  const clearPing = useCallback(() => {
    if (pingTimer.current) clearTimeout(pingTimer.current);
    pingTimer.current = null;
  }, []);

  const remount = useCallback(() => {
    clearPing();
    loadedRef.current = false;
    onRemountRef.current?.();
    setMapKey((k) => k + 1);
  }, [clearPing, loadedRef]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !loadedRef.current || !webViewRef.current || pingTimer.current) return;
      pingTimer.current = setTimeout(remount, PING_TIMEOUT_MS);
      webViewRef.current.injectJavaScript('window.__mapPing&&window.__mapPing();true;');
    });
    return () => {
      sub.remove();
      clearPing();
    };
  }, [webViewRef, loadedRef, remount, clearPing]);

  /** 지도 페이지 공용 메시지면 처리하고 true. 화면별 onMessage 처리보다 먼저 부른다 */
  const handleMapMessage = useCallback((message: object) => {
    const type = 'type' in message ? message.type : undefined;
    if (type === 'pong') {
      clearPing();
      return true;
    }
    if (type === 'tileUrlMissing') {
      if (!warnedTileUrl) {
        warnedTileUrl = true;
        // 개발 빌드에서는 LogBox로 화면에도 뜬다
        // eslint-disable-next-line no-console -- 운영 빌드에서 지도 바탕이 빈 원인을 기기 로그로 바로 알 수 있게
        console.warn('[map] 지도 타일 주소(EXPO_PUBLIC_MAP_TILE_URL)가 비어 있어요. 바탕 지도 없이 마커만 보여요. .env.local 또는 EAS 환경 변수를 확인해 주세요.');
      }
      return true;
    }
    return false;
  }, [clearPing]);

  // WebView에 펼쳐 넣는다: 콘텐츠 프로세스가 죽으면 다시 마운트
  const crashProps = useMemo(() => ({ onContentProcessDidTerminate: remount, onRenderProcessGone: remount }), [remount]);

  return { mapKey, handleMapMessage, crashProps };
}
