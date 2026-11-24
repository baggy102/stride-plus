// JWT 페이로드를 서명 검증 없이 읽는다. 만료가 가까운 토큰을 미리 갱신하고, 시작 화면에서 내 _id를 알아내는 데만 쓴다.
// 토큰을 믿을지는 서버가 정한다. 런타임마다 atob 유무가 달라도 되도록 base64url 디코더를 직접 둔다(jwt.test.mjs).

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// base64url → UTF-8 문자열. 형식이 틀리면 null
function decodeBase64Url(input: string): string | null {
  let bits = 0;
  let buffer = 0;
  let percent = '';
  for (const ch of input.replace(/=+$/, '')) {
    const index = ALPHABET.indexOf(ch === '+' ? '-' : ch === '/' ? '_' : ch);
    if (index < 0) return null;
    buffer = ((buffer << 6) | index) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      percent += '%' + ((buffer >> bits) & 0xff).toString(16).padStart(2, '0');
    }
  }
  try {
    return decodeURIComponent(percent);
  } catch {
    return null; // UTF-8이 아니다
  }
}

/** 페이로드(가운데 부분)를 객체로. 형식이 틀리면 null */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const json = decodeBase64Url(parts[1]);
  if (json === null) return null;
  try {
    const payload: unknown = JSON.parse(json);
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** 만료 시각(ms). exp가 없거나 읽을 수 없으면 null */
export function jwtExpiresAt(token: string): number | null {
  const exp = decodeJwtPayload(token)?.exp;
  return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null;
}

/** nowMs부터 windowMs 안에 만료되거나 이미 만료됐다. 만료 시각을 읽을 수 없으면 true(갱신해서 새 토큰을 받는 편이 안전하다) */
export function expiresWithin(token: string, nowMs: number, windowMs: number): boolean {
  const expiresAt = jwtExpiresAt(token);
  return expiresAt === null || expiresAt - nowMs <= windowMs;
}
