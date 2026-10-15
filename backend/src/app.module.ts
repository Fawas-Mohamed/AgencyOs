import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './common/config';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { ClientHubModule } from './client-hub/client-hub.module';
@Module({ imports: [ConfigModule.forRoot({isGlobal:true, validate:validateEnvironment}), PrismaModule, CommonModule, ClientHubModule] })
export class AppModule {}
