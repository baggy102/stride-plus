import { IsEmail, IsString, MinLength } from 'class-validator';
import { NoBannedWords } from '../../common/banned-words';

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
}
