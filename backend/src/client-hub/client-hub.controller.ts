import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Actor, CurrentActor, JwtPermissionGuard, Permissions } from '../common/auth';
import { ClientHubService } from './client-hub.service';
import { RequirementsService } from './requirements.service';
import { FilesService } from './files.service';
import {
  ChangeStatusDto,
  ClientQuery,
  CommunicationQuery,
  CreateClientDto,
  CreateCommunicationDto,
  CreateNoteDto,
  EditRequirementDto,
  ExportQuery,
  FileLinkDto,
  FileQuery,
  FileUploadDto,
  PageQuery,
  RequirementContentDto,
  RequirementQuery,
  UpdateClientDto,
} from './dto/hub.dto';
@Controller()
@UseGuards(JwtPermissionGuard)
export class ClientHubController {
  constructor(
    private readonly hub: ClientHubService,
    private readonly requirements: RequirementsService,
    private readonly files: FilesService,
  ) {}
  @Get('clients')
  @Permissions('client.read')
  clients(@CurrentActor() actor: Actor, @Query() query: ClientQuery) {
    return this.hub.clients(actor, query);
  }
  @Post('clients')
  @Permissions('client.write')
  createClient(@CurrentActor() actor: Actor, @Body() dto: CreateClientDto) {
    return this.hub.createClient(actor, dto);
  }
  @Patch('clients/:id')
  @Permissions('client.write')
  updateClient(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.hub.updateClient(actor, id, dto);
  }
  @Get('clients/:id/hub')
  @Permissions('client.read')
  clientHub(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.hub.hub(actor, id);
  }
  @Get('clients/:id/requirements')
  @Permissions('client.read', 'requirement.read')
  listRequirements(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: RequirementQuery,
  ) {
    return this.requirements.list(actor, id, query);
  }
  @Post('clients/:id/requirements')
  @Permissions('requirement.write')
  createRequirement(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequirementContentDto,
  ) {
    return this.requirements.create(actor, id, dto);
  }
  @Get('requirements/:id')
  @Permissions('requirement.read')
  requirement(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.requirements.detail(actor, id);
  }
  @Patch('requirements/:id')
  @Permissions('requirement.write')
  editRequirement(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditRequirementDto,
  ) {
    return this.requirements.edit(actor, id, dto);
  }
  @Patch('requirements/:id/status')
  @Permissions('requirement.write')
  status(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStatusDto,
  ) {
    return this.requirements.changeStatus(actor, id, dto);
  }
  @Get('requirements/:id/export')
  @Permissions('requirement.read', 'file.read')
  export(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ExportQuery,
  ) {
    return this.requirements.export(actor, id, query.version);
  }
  @Get('clients/:id/communications')
  @Permissions('communication.read')
  communications(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CommunicationQuery,
  ) {
    return this.hub.communications(actor, id, query);
  }
  @Post('clients/:id/communications')
  @Permissions('communication.write')
  addCommunication(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCommunicationDto,
  ) {
    return this.hub.createCommunication(actor, id, dto);
  }
  @Get('clients/:id/notes')
  @Permissions('note.read')
  notes(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PageQuery,
  ) {
    return this.hub.notes(actor, id, query);
  }
  @Post('clients/:id/notes')
  @Permissions('note.write')
  addNote(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateNoteDto,
  ) {
    return this.hub.createNote(actor, id, dto);
  }
  @Get('clients/:id/timeline')
  @Permissions('timeline.read')
  timeline(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PageQuery,
  ) {
    return this.hub.timeline(actor, id, query);
  }
  @Get('clients/:id/files')
  @Permissions('file.read')
  listFiles(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: FileQuery,
  ) {
    return this.files.list(actor, id, query);
  }
  @Post('clients/:id/files')
  @Permissions('file.write')
  linkFile(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FileLinkDto,
  ) {
    return this.files.createLink(actor, id, dto);
  }
  @Post('clients/:id/files/upload')
  @Permissions('file.write')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FileUploadDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.files.upload(actor, id, dto, file);
  }
  @Get('files/:id/download')
  @Permissions('file.read')
  downloadFile(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.files.download(actor, id);
  }
  @Delete('files/:id')
  @Permissions('file.write')
  archiveFile(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.files.archive(actor, id);
  }
}
