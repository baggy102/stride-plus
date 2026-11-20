import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';
import { LoginDto } from './login.dto';
import { LEGAL_VERSIONS } from '../legal-versions';

const VALID = {
  username: '하준',
  email: 'a@b.com',
  password: 'Password1!',
  termsVersion: LEGAL_VERSIONS.terms,
  privacyVersion: LEGAL_VERSIONS.privacy,
  locationVersion: LEGAL_VERSIONS.location,
};

const consentErrors = async (body: object) =>
  (await validate(plainToInstance(RegisterDto, body)))
    .filter((e) => Object.values(e.constraints ?? {}).includes('consent_required'))
    .map((e) => e.property);

describe('이메일 정규화', () => {
  it('가입: 앞뒤 공백을 빼고 소문자로', async () => {
    const dto = plainToInstance(RegisterDto, { ...VALID, email: '  Stride.Plus1@Gmail.COM ' });
    expect(dto.email).toBe('stride.plus1@gmail.com');
    expect(await validate(dto)).toHaveLength(0);
  });

  it('로그인도 같은 규칙 — 대문자로 쳐도 같은 계정', () => {
    expect(plainToInstance(LoginDto, { email: 'A@B.com', password: 'x' }).email).toBe('a@b.com');
  });
});

describe('RegisterDto 약관 동의', () => {
  it('필수 3종에 현재 버전으로 동의하면 통과', async () => {
    expect(await validate(plainToInstance(RegisterDto, VALID))).toHaveLength(0);
  });

  it('동의 항목이 빠지면 consent_required', async () => {
    expect(await consentErrors({ ...VALID, locationVersion: undefined })).toEqual(['locationVersion']);
  });

  it('지난 버전에 동의했으면 consent_required', async () => {
    expect(await consentErrors({ ...VALID, termsVersion: '2020-01-01' })).toEqual(['termsVersion']);
  });
});
