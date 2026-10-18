import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';
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
