import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Model, mongo } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { RefreshToken, RefreshTokenDocument } from './auth.schema';
import { UsersService } from '../users/users.service';
import { toMeView } from '../users/me.view';
import { LEGAL_VERSIONS } from './legal-versions';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(username: string, email: string, password: string) {
    const existing = await this.usersService.findByEmail(email);
    if (existing) throw new ConflictException('Email already in use');
    const passwordHash = await bcrypt.hash(password, 10);
    // 동의 버전은 RegisterDto가 현재 버전과 같은지 검증했다
    const user = await this.usersService
      .create(email, passwordHash, username, { ...LEGAL_VERSIONS, agreedAt: new Date() })
      .catch((error: unknown) => {
        // 동시에 같은 이메일로 가입하면 위 검사를 둘 다 통과한다 — 유니크 인덱스 위반도 409로
        if (error instanceof mongo.MongoServerError && error.code === 11000) throw new ConflictException('Email already in use');
        throw error;
      });
    const tokens = await this.issueTokens(user._id.toString(), user.email);
    return {
      ...tokens,
      user: { _id: user._id, email: user.email, username: user.username },
    };
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    const tokens = await this.issueTokens(user._id.toString(), user.email);
    return {
      ...tokens,
      user: { _id: user._id, email: user.email, username: user.username },
    };
  }

  async refresh(token: string) {
    let payload: { sub: string };
    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const stored = await this.refreshTokenModel.findOne({ token });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired or revoked');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) throw new UnauthorizedException();

    await stored.deleteOne();
    const tokens = await this.issueTokens(payload.sub, user.email);
    // GET /users/me와 같은 모양의 user를 함께 돌려준다 — 앱이 갱신 뒤 /users/me를 한 번 더 부르지 않게.
    // 예전 앱은 accessToken·refreshToken만 읽으므로 필드를 더해도 호환된다.
    return { ...tokens, user: toMeView(user) };
  }

  // 이 기기의 refresh 토큰만 지운다. 없는 토큰이어도 성공(멱등) — 토큰 유효 여부를 드러내지 않는다.
  // 만료된 토큰도 지울 수 있게 JWT 검증은 하지 않는다.
  async logout(token: string) {
    await this.refreshTokenModel.deleteOne({ token });
  }

  private async issueTokens(userId: string, email: string) {
    const accessToken = this.jwtService.sign({ sub: userId, email });
    const refreshToken = this.jwtService.sign(
      { sub: userId },
      {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      },
    );
    await this.refreshTokenModel.create({
      userId,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    return { accessToken, refreshToken };
  }
}
