import axios from 'axios';
import { errorText, knownServerMessage, type ApiErrorInfo } from './errorText';

// 오류 → 문구 계산에 쓰는 값. 응답 없는 axios 오류(오프라인 · 시간 초과)는 네트워크 오류로 본다
function infoOf(error: unknown): ApiErrorInfo {
  if (axios.isAxiosError(error)) return { network: !error.response, message: error.response?.data?.message };
  return { network: false };
}

/** 화면에 보여 줄 한국어 문구. 서버·axios의 영문 메시지는 그대로 내보내지 않는다. fallback = 모르는 서버 문구일 때 */
export function extractMessage(error: unknown, fallback?: string): string {
  return errorText(infoOf(error), fallback);
}

/** 서버가 보낸 메시지 중 앱이 아는 코드(banned_word 등). 화면이 분기할 때만 쓴다. 모르거나 응답이 없으면 null */
export function serverMessage(error: unknown): string | null {
  return knownServerMessage(infoOf(error).message);
}

/** 응답을 받지 못한 오류(오프라인 · 시간 초과) */
export function isNetworkError(error: unknown): boolean {
  return infoOf(error).network;
}
