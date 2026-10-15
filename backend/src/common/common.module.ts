import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtPermissionGuard } from './auth';
import { AuthController } from './auth.controller';
@Global()
@Module({ imports: [JwtModule.register({})], controllers: [AuthController], providers: [JwtPermissionGuard], exports: [JwtPermissionGuard, JwtModule] })
export class CommonModule {}
