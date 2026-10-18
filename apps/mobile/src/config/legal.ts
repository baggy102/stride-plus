// 가입 시 동의하는 약관 버전 — 서버 apps/server/src/auth/legal-versions.ts 와 같은 값이어야 한다.
// 다르면 서버가 가입을 400 consent_required로 거절한다.
export const LEGAL_VERSIONS = {
  terms: '2026-11-01',
  privacy: '2026-11-01',
  location: '2026-11-01',
} as const;

export const LEGAL_DOCS = [
  { key: 'terms', label: '이용약관', sub: '서비스 이용 조건' },
  { key: 'privacy', label: '개인정보처리방침', sub: '수집 항목과 보관 기간' },
  { key: 'location', label: '개인위치정보 이용약관', sub: '위치기반서비스 · 별도 동의' },
] as const;

export type LegalKey = (typeof LEGAL_DOCS)[number]['key'];
