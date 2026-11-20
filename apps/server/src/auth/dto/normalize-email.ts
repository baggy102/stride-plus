import { Transform } from 'class-transformer';

// 이메일은 앞뒤 공백을 빼고 소문자로 비교·저장한다(대소문자만 다른 중복 가입 방지)
export const NormalizeEmail = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));
