import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Actor } from '../common/auth';
import { ApiError } from '../common/http';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService, fileSelect, pageArgs, pageResult, userSelect } from './access.service';
import { ClientQuery, CommunicationQuery, CreateClientDto, CreateCommunicationDto, CreateNoteDto, PageQuery, UpdateClientDto } from './dto/hub.dto';
@Injectable()
export class ClientHubService {
  constructor(private readonly prisma: PrismaService, private readonly access: AccessService) {}
  async clients(actor: Actor, query: ClientQuery) {
    const where: Prisma.ClientWhereInput = {agencyId:actor.agencyId,status:query.status,...(query.q ? {OR:['name','company','contactName','email'].map(key => ({[key]:{contains:query.q,mode:'insensitive'}}))} : {})};
    const [items,total] = await this.prisma.$transaction([this.prisma.client.findMany({where,...pageArgs(query),orderBy:[{updatedAt:query.sort === 'oldest' ? 'asc' : 'desc'},{id:'asc'}]}),this.prisma.client.count({where})]);
    return pageResult(items,total,query);
  }
  async createClient(actor: Actor, dto: CreateClientDto) {
    return this.prisma.$transaction(async db => {
      const client = await db.client.create({data:{...dto,agencyId:actor.agencyId}});
      await this.access.audit(db,actor,client.id,'CLIENT_CREATED','client',client.id,'Client created');
      return client;
    });
  }
  async updateClient(actor: Actor, id: string, dto: UpdateClientDto) {
    return this.prisma.$transaction(async db => {
      await this.access.client(actor,id,db);
      const client = await db.client.update({where:{id_agencyId:{id,agencyId:actor.agencyId}},data:dto});
      await this.access.audit(db,actor,id,'CLIENT_UPDATED','client',id,'Client details updated');
      return client;
    });
  }
  async hub(actor: Actor, id: string) {
    const client = await this.access.client(actor,id);
    const where = {agencyId:actor.agencyId,clientId:id};
    const can = (key: string) => actor.permissions.includes(key);
    const [requirements,communications,files,notes,timeline] = await Promise.all([
      can('requirement.read') ? this.prisma.clientRequirement.findMany({where,include:{preparedBy:{select:userSelect}},orderBy:{updatedAt:'desc'},take:10}) : null,
      can('communication.read') ? this.prisma.clientCommunication.findMany({where,include:{createdBy:{select:userSelect}},orderBy:{occurredAt:'desc'},take:10}) : null,
      can('file.read') ? this.prisma.clientFile.findMany({where:{...where,archivedAt:null},select:fileSelect,orderBy:{createdAt:'desc'},take:10}) : null,
      can('note.read') ? this.prisma.clientNote.findMany({where,include:{createdBy:{select:userSelect}},orderBy:{createdAt:'desc'},take:10}) : null,
      can('timeline.read') ? this.prisma.auditLog.findMany({where,include:{actor:{select:userSelect}},orderBy:[{createdAt:'desc'},{id:'desc'}],take:10}) : null,
    ]);
    return {client,requirements,communications,files,notes,timeline,permissions:actor.permissions,relatedRecords:['leads','deals','projects','campaigns','quotations','invoices'].map(kind=>({kind,available:false,reason:'No shared provider is connected to this standalone module'}))};
  }
  async communications(actor: Actor, clientId: string, query: CommunicationQuery) {
    await this.access.client(actor,clientId);
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) throw new ApiError(400,'INVALID_DATE_RANGE','Start date must not follow end date');
    const where: Prisma.ClientCommunicationWhereInput = {
      agencyId:actor.agencyId,clientId,type:query.type,
      ...(query.from || query.to ? {occurredAt:{gte:query.from ? new Date(query.from) : undefined,lte:query.to ? new Date(query.to) : undefined}} : {}),
      ...(query.q ? {OR:[{subject:{contains:query.q,mode:'insensitive'}},{summary:{contains:query.q,mode:'insensitive'}}]} : {}),
    };
    const [items,total] = await this.prisma.$transaction([this.prisma.clientCommunication.findMany({where,...pageArgs(query),include:{createdBy:{select:userSelect}},orderBy:[{occurredAt:query.sort === 'oldest' ? 'asc' : 'desc'},{id:'asc'}]}),this.prisma.clientCommunication.count({where})]);
    return pageResult(items,total,query);
  }
  async createCommunication(actor: Actor, clientId: string, dto: CreateCommunicationDto) {
    return this.prisma.$transaction(async db => {
      await this.access.client(actor,clientId,db,true);
      await this.access.linkedRequirement(actor,clientId,dto.requirementId,db);
      const record = await db.clientCommunication.create({data:{...dto,occurredAt:new Date(dto.occurredAt),agencyId:actor.agencyId,clientId,createdById:actor.userId},include:{createdBy:{select:userSelect}}});
      await this.access.audit(db,actor,clientId,'COMMUNICATION_ADDED','communication',record.id,'Client communication recorded',{type:dto.type,occurredAt:dto.occurredAt});
      return record;
    });
  }
  async notes(actor: Actor, clientId: string, query: PageQuery) {
    await this.access.client(actor,clientId);
    const where = {agencyId:actor.agencyId,clientId,...(query.q ? {body:{contains:query.q,mode:'insensitive' as const}} : {})};
    const [items,total] = await this.prisma.$transaction([this.prisma.clientNote.findMany({where,...pageArgs(query),include:{createdBy:{select:userSelect}},orderBy:[{createdAt:query.sort === 'oldest' ? 'asc' : 'desc'},{id:'asc'}]}),this.prisma.clientNote.count({where})]);
    return pageResult(items,total,query);
  }
  async createNote(actor: Actor, clientId: string, dto: CreateNoteDto) {
    return this.prisma.$transaction(async db => {
      await this.access.client(actor,clientId,db,true);
      await this.access.linkedRequirement(actor,clientId,dto.requirementId,db);
      const note = await db.clientNote.create({data:{...dto,agencyId:actor.agencyId,clientId,createdById:actor.userId},include:{createdBy:{select:userSelect}}});
      await this.access.audit(db,actor,clientId,'NOTE_ADDED','note',note.id,'Internal note added');
      return note;
    });
  }
  async timeline(actor: Actor, clientId: string, query: PageQuery) {
    await this.access.client(actor,clientId);
    const where = {agencyId:actor.agencyId,clientId,...(query.q ? {OR:[{eventType:{contains:query.q,mode:'insensitive' as const}},{summary:{contains:query.q,mode:'insensitive' as const}}]} : {})};
    const [items,total] = await this.prisma.$transaction([this.prisma.auditLog.findMany({where,...pageArgs(query),include:{actor:{select:userSelect}},orderBy:[{createdAt:query.sort === 'oldest' ? 'asc' : 'desc'},{id:'asc'}]}),this.prisma.auditLog.count({where})]);
    return pageResult(items,total,query);
  }
}
