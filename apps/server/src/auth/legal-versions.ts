// 현재 시행 중인 약관 버전 — docs/legal/*.md 머리의 버전과 같아야 한다(C3).
// 약관을 고치면 여기 값을 올린다. 앱은 가입 시 동의한 버전을 그대로 보낸다.
export const LEGAL_VERSIONS = {
  terms: '2026-11-01',
  privacy: '2026-11-01',
  location: '2026-11-01',
} as const;

export interface Consents {
  terms: string;
  privacy: string;
  location: string;
  agreedAt: Date;
}
