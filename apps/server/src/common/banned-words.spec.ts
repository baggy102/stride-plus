import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { containsBannedWord } from './banned-words';
import { RegisterDto } from '../auth/dto/register.dto';
import { CreateRunDto } from '../runs/dto/create-run.dto';

describe('containsBannedWord', () => {
  it('정상 문장은 통과', () => {
    expect(containsBannedWord('강변을 따라 평탄한 길, 해 질 무렵 추천')).toBe(false);
    expect(containsBannedWord('Sunset river run')).toBe(false);
  });

  it('금칙어가 들어 있으면 걸린다', () => {
    expect(containsBannedWord('이 길 시발 좋다')).toBe(true);
    expect(containsBannedWord('what the fuck')).toBe(true);
  });

  it('대소문자·공백·특수문자·숫자 변형도 걸린다', () => {
    expect(containsBannedWord('FuCk')).toBe(true);
    expect(containsBannedWord('f u c k')).toBe(true);
    expect(containsBannedWord('F.u_c-k!')).toBe(true);
    expect(containsBannedWord('시 1 발')).toBe(true);
    expect(containsBannedWord('ㅅ ㅂ')).toBe(true);
  });
});

describe('@NoBannedWords 적용 DTO', () => {
  const messagesOf = async (cls: new () => object, body: object, property: string) =>
    (await validate(plainToInstance(cls, body)))
      .filter((e) => e.property === property)
      .flatMap((e) => Object.values(e.constraints ?? {}));

  it('RegisterDto.username — 금칙어면 banned_word, 정상이면 통과', async () => {
    const base = { email: 'a@b.com', password: 'Password1!' };
    expect(await messagesOf(RegisterDto, { ...base, username: 'B i t c h' }, 'username')).toEqual(['banned_word']);
    expect(await messagesOf(RegisterDto, { ...base, username: '하준' }, 'username')).toEqual([]);
  });

  it('CreateRunDto.description — 금칙어면 banned_word, 비어 있으면 통과', async () => {
    const base = { coordinates: [[127, 37.5]], distanceKm: 1, paceSecPerKm: 300 };
    expect(await messagesOf(CreateRunDto, { ...base, description: '병신 같은 코스' }, 'description')).toEqual(['banned_word']);
    expect(await messagesOf(CreateRunDto, base, 'description')).toEqual([]);
  });
});
