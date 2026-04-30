import axios from 'axios';

export function extractMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const msg = error.response?.data?.message;
    if (Array.isArray(msg)) return msg[0] as string;
    if (typeof msg === 'string') return msg;
    return error.message ?? '서버 오류가 발생했습니다.';
  }
  if (error instanceof Error) return error.message;
  return '알 수 없는 오류가 발생했습니다.';
}
