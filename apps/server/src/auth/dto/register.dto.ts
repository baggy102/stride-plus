import { Equals, IsEmail, IsString, MinLength } from 'class-validator';
import { NoBannedWords } from '../../common/banned-words';
import { LEGAL_VERSIONS } from '../legal-versions';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @NoBannedWords()
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  // 필수 동의 3종 — 동의한 약관 버전. 없거나 현재 버전이 아니면 400 consent_required
  @Equals(LEGAL_VERSIONS.terms, { message: 'consent_required' })
  termsVersion: string;

  @Equals(LEGAL_VERSIONS.privacy, { message: 'consent_required' })
  privacyVersion: string;

  @Equals(LEGAL_VERSIONS.location, { message: 'consent_required' })
  locationVersion: string;
}
