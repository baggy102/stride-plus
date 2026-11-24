// 서버·네트워크 오류 → 화면 문구. 영문 서버 문구나 axios 메시지(Network Error 등)는 화면에 내보내지 않는다(TERMS #18~#20).
// axios 없이 테스트할 수 있게 errors.ts와 나눴다(errorText.test.mjs).

export const NETWORK_ERROR_TEXT = '네트워크 연결을 확인하고 다시 시도해 주세요.';
export const UNKNOWN_ERROR_TEXT = '문제가 생겼어요. 다시 시도해 주세요.';

// apps/server가 보내는 메시지(Nest 예외 · class-validator 기본 문구 · 직접 정한 코드) → 한국어
const SERVER_TEXT: Record<string, string> = {
  // auth.service.ts
  'Invalid credentials': '이메일 또는 비밀번호가 맞지 않아요.',
  'Email already in use': '이미 가입된 이메일이에요.',
  // auth/dto(class-validator 기본 문구)
  'email must be an email': '이메일 형식을 확인해 주세요.',
  'username must be longer than or equal to 2 characters': '닉네임은 2자 이상이어야 해요.',
  'password must be longer than or equal to 8 characters': '비밀번호는 8자 이상이어야 해요.',
  // register.dto.ts · common/banned-words.ts
  consent_required: '약관 동의가 필요해요. 앱을 최신 버전으로 업데이트해 주세요.',
  banned_word: '사용할 수 없는 단어가 있어요.',
  // users · runs · posts
  user_not_found: '사용자를 찾을 수 없어요.',
  cannot_block_self: '나 자신은 차단할 수 없어요.',
  run_not_found: '러닝을 찾을 수 없어요.',
  post_not_found: '러닝을 찾을 수 없어요.',
  own_run: '내 러닝은 응원할 수 없어요.',
};

export interface ApiErrorInfo {
  /** 응답이 없었다(오프라인 · 시간 초과 · 서버에 닿지 못함) */
  network: boolean;
  /** 서버가 보낸 message(ValidationPipe는 배열) */
  message?: unknown;
}

// 서버 message에서 아는 문구를 찾는다(배열이면 앞에서부터). 없으면 null
export function knownServerMessage(message: unknown): string | null {
  const list = Array.isArray(message) ? message : [message];
  // in 대신 자기 속성만 본다('toString' 같은 이름이 걸리지 않게)
  const hit = list.find((m): m is string => typeof m === 'string' && Object.prototype.hasOwnProperty.call(SERVER_TEXT, m));
  return hit ?? null;
}

// 화면 문구. 모르는 서버 문구는 fallback(기본은 「문제가 생겼어요…」)
export function errorText(info: ApiErrorInfo, fallback = UNKNOWN_ERROR_TEXT): string {
  if (info.network) return NETWORK_ERROR_TEXT;
  const known = knownServerMessage(info.message);
  return known ? SERVER_TEXT[known] : fallback;
}
