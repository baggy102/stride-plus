// 지도 검색 반경 하한(m) — GET /runs(마커)·/runs/density·/runs/new-cells 공통.
// 앱(MapFeed)은 화면 중심에서 모서리까지 거리를 보낸다. 최대 줌 18에서 가장 작은 폰(320×568pt)도 약 150m라 이보다 작게 보내지 않는다.
// 아주 작은 반경으로 여러 번 물어 남의 경로를 점처럼 짚어 보는 것을 막는다(가린 구간 자체는 서비스가 검색 뒤에 거른다)
export const MIN_SEARCH_RADIUS_M = 50;
export const MAX_SEARCH_RADIUS_M = 300000;
