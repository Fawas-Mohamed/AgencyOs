import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { memoryStorage } from 'multer';
import { ClientHubController } from './client-hub.controller';
import { ClientHubService } from './client-hub.service';
import { RequirementsService } from './requirements.service';
import { AccessService } from './access.service';
import { FilesService } from './files.service';
import { PrivateStorageService } from './private-storage.service';
@Module({
  imports:[MulterModule.registerAsync({inject:[ConfigService],useFactory:(config:ConfigService)=>({storage:memoryStorage(),limits:{fileSize:config.getOrThrow<number>('MAX_FILE_BYTES'),files:1,fields:1,parts:2,fieldSize:200}})})],
  controllers:[ClientHubController],
  providers:[ClientHubService,RequirementsService,AccessService,FilesService,PrivateStorageService],
  exports:[ClientHubService,RequirementsService,FilesService],
})
export class ClientHubModule {}
