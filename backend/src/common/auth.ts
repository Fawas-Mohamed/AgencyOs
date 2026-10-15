import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException, ForbiddenException, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
export const PERMISSIONS = ['client.read','client.write','requirement.read','requirement.write','requirement.review','communication.read','communication.write','file.read','file.write','note.read','note.write','timeline.read'] as const;
export interface Actor { userId: string; agencyId: string; displayName: string; email: string; role: string; permissions: string[]; }
export const Permissions = (...keys: string[]) => SetMetadata('permissions', keys);
export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => ctx.switchToHttp().getRequest().actor);
@Injectable()
export class JwtPermissionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService, private readonly config: ConfigService, private readonly reflector: Reflector) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const match = /^Bearer ([^ ]+)$/.exec(req.headers.authorization ?? '');
    if (!match) throw new UnauthorizedException();
    let subject: string;
    try {
      const claims = await this.jwt.verifyAsync(match[1], { secret: this.config.getOrThrow('JWT_SECRET'), algorithms: ['HS256'], issuer: this.config.getOrThrow('JWT_ISSUER'), audience: this.config.getOrThrow('JWT_AUDIENCE') });
      if (typeof claims.sub !== 'string' || !/^[0-9a-f-]{36}$/i.test(claims.sub) || typeof claims.exp !== 'number') throw new Error('Invalid subject');
      subject = claims.sub;
    } catch { throw new UnauthorizedException(); }
    const user = await this.prisma.user.findUnique({ where: { id: subject }, include: { role: { include: { permissions: true } } } });
    if (!user?.active || user.role.agencyId !== user.agencyId) throw new UnauthorizedException();
    const actor: Actor = { userId: user.id, agencyId: user.agencyId, displayName: user.displayName, email: user.email, role: user.role.name, permissions: user.role.permissions.map(p => p.permissionKey) };
    req.actor = actor;
    const keys = this.reflector.getAllAndOverride<string[]>('permissions', [context.getHandler(), context.getClass()]) ?? [];
    if (!keys.every(key => actor.permissions.includes(key))) throw new ForbiddenException();
    return true;
  }
}
