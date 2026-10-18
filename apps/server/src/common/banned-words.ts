import { ValidationOptions, registerDecorator } from 'class-validator';

// 초안 목록 — 출시 전 사람이 확정한다(C2 EXEC_PLAN). 정규화한 형태(소문자, 글자만)로 적는다.
export const BANNED_WORDS = [
  '시발', '씨발', '씨빨', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '개새끼', '좆', '느금마', '니애미',
  'fuck', 'shit', 'bitch', 'asshole', 'nigger', 'faggot',
];

// 공백·숫자·특수문자로 끊어 쓰는 우회(「시 발」, 「F.u.c.k」)를 막기 위해 글자만 남긴다.
export function normalizeForBannedWords(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}]/gu, '');
}

export function containsBannedWord(text: string): boolean {
  const normalized = normalizeForBannedWords(text);
  return BANNED_WORDS.some((word) => normalized.includes(word));
}

// 금칙어가 있으면 400 — 메시지 `banned_word`로 앱이 분기한다.
export function NoBannedWords(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'noBannedWords',
      target: object.constructor,
      propertyName,
      options: { message: 'banned_word', ...options },
      validator: {
        validate: (value: unknown) => typeof value !== 'string' || !containsBannedWord(value),
      },
    });
}
