import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Actor, CurrentActor, JwtPermissionGuard } from './auth';
import { verifyPassword, hashPassword } from './password';
import { ApiError } from './http';
class LoginDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @MinLength(1) @MaxLength(200) password: string;
}
@Controller('auth')
export class AuthController {
  private readonly attempts = new Map<string, {count: number; until: number}>();
  private readonly dummy = hashPassword('unused-' + Math.random());
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly jwt: JwtService) {}
  @Post('login')
  async login(@Body() dto: LoginDto) {
    if (this.config.get('DEMO_AUTH_ENABLED') !== 'true' || this.config.get('NODE_ENV') === 'production') throw new ApiError(404, 'NOT_FOUND', 'Record not found');
    const key = dto.email.toLowerCase();
    const now = Date.now();
    for (const [email, entry] of this.attempts) if (entry.until < now) this.attempts.delete(email);
    if (this.attempts.size > 1000) throw new ApiError(429, 'RATE_LIMITED', 'Please retry later');
    const prior = this.attempts.get(key);
    if (prior && prior.count >= 8) throw new ApiError(429, 'RATE_LIMITED', 'Please retry later');
    this.attempts.set(key, {count: (prior?.count ?? 0) + 1, until: prior?.until ?? now + 15 * 60 * 1000});
    const user = await this.prisma.user.findUnique({ where: { email: key } });
    const valid = verifyPassword(dto.password, user?.passwordHash ?? this.dummy);
    if (!user?.active || !user.passwordHash || !valid) throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid credentials');
    this.attempts.delete(key);
    const accessToken = await this.jwt.signAsync({ sub: user.id }, {
      secret: this.config.getOrThrow('JWT_SECRET'), algorithm: 'HS256', expiresIn: '1h',
      issuer: this.config.getOrThrow('JWT_ISSUER'), audience: this.config.getOrThrow('JWT_AUDIENCE'),
    });
    return { accessToken, expiresIn: 3600, user: { displayName: user.displayName, email: user.email } };
  }
  @Get('me') @UseGuards(JwtPermissionGuard)
  me(@CurrentActor() actor: Actor) { return actor; }
}
