import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Actor, assertPermissions } from '../common/auth';
import { ApiError } from '../common/http';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService, fileSelect, pageArgs, pageResult, userSelect } from './access.service';
import {
  ClientQuery,
  CommunicationQuery,
  CreateClientDto,
  CreateCommunicationDto,
  CreateNoteDto,
  PageQuery,
  NoteQuery,
  UpdateClientDto,
} from './dto/hub.dto';
@Injectable()
export class ClientHubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}
  async clients(actor: Actor, query: ClientQuery) {
    assertPermissions(actor, 'client.read');
    const where: Prisma.ClientWhereInput = {
      agencyId: actor.agencyId,
      status: query.status,
      ...(query.q
        ? {
            OR: ['name', 'company', 'contactName', 'email'].map((key) => ({
              [key]: { contains: query.q, mode: 'insensitive' },
            })),
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        ...pageArgs(query),
        orderBy: [
          { updatedAt: query.sort === 'oldest' ? 'asc' : 'desc' },
          { id: query.sort === 'oldest' ? 'asc' : 'desc' },
        ],
      }),
      this.prisma.client.count({ where }),
    ]);
    return pageResult(items, total, query);
  }
  async createClient(actor: Actor, dto: CreateClientDto) {
    assertPermissions(actor, 'client.write');
    return this.prisma.$transaction(async (db) => {
      const client = await db.client.create({ data: { ...dto, agencyId: actor.agencyId } });
      await this.access.audit(
        db,
        actor,
        client.id,
        'CLIENT_CREATED',
        'client',
        client.id,
        'Client created',
      );
      return client;
    });
  }
  async updateClient(actor: Actor, id: string, dto: UpdateClientDto) {
    assertPermissions(actor, 'client.write');
    return this.prisma.$transaction(async (db) => {
      await this.access.client(actor, id, db);
      const client = await db.client.update({
        where: { id_agencyId: { id, agencyId: actor.agencyId } },
        data: dto,
      });
      await this.access.audit(
        db,
        actor,
        id,
        'CLIENT_UPDATED',
        'client',
        id,
        'Client details updated',
      );
      return client;
    });
  }
  async hub(actor: Actor, id: string) {
    assertPermissions(actor, 'client.read');
    return this.prisma.$transaction(
      async (db) => {
        const client = await this.access.client(actor, id, db);
        const where = { agencyId: actor.agencyId, clientId: id };
        const activeFiles = { ...where, archivedAt: null };
        const can = (key: string) => actor.permissions.includes(key);
        const [
          requirements,
          communications,
          files,
          notes,
          timeline,
          requirementCount,
          communicationCount,
          fileCount,
          noteCount,
          activityCount,
        ] = await Promise.all([
          can('requirement.read')
            ? db.clientRequirement.findMany({
                where,
                include: { preparedBy: { select: userSelect } },
                orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
                take: 10,
              })
            : null,
          can('communication.read')
            ? db.clientCommunication.findMany({
                where,
                include: { createdBy: { select: userSelect } },
                orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
                take: 10,
              })
            : null,
          can('file.read')
            ? db.clientFile.findMany({
                where: activeFiles,
                select: fileSelect,
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                take: 10,
              })
            : null,
          can('note.read')
            ? db.clientNote.findMany({
                where,
                include: { createdBy: { select: userSelect } },
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                take: 10,
              })
            : null,
          can('timeline.read')
            ? db.auditLog.findMany({
                where,
                include: { actor: { select: userSelect } },
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                take: 10,
              })
            : null,
          can('requirement.read') ? db.clientRequirement.count({ where }) : null,
          can('communication.read') ? db.clientCommunication.count({ where }) : null,
          can('file.read') ? db.clientFile.count({ where: activeFiles }) : null,
          can('note.read') ? db.clientNote.count({ where }) : null,
          can('timeline.read') ? db.auditLog.count({ where }) : null,
        ]);
        return {
          client,
          requirements,
          communications,
          files,
          notes,
          timeline,
          summaryLimit: 10,
          counts: {
            requirements: requirementCount,
            communications: communicationCount,
            files: fileCount,
            notes: noteCount,
            timeline: activityCount,
          },
          permissions: actor.permissions,
          relatedRecords: ['leads', 'deals', 'projects', 'campaigns', 'quotations', 'invoices'].map(
            (kind) => ({
              kind,
              available: false,
              reason: 'No shared provider is connected to this standalone module',
            }),
          ),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async communications(actor: Actor, clientId: string, query: CommunicationQuery) {
    assertPermissions(actor, 'communication.read');
    await this.access.client(actor, clientId);
    await this.access.linkedRequirement(actor, clientId, query.requirementId);
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to
      ? new Date(query.to.length === 10 ? query.to + 'T23:59:59.999Z' : query.to)
      : undefined;
    if (from && to && from > to)
      throw new ApiError(400, 'INVALID_DATE_RANGE', 'Start date must not follow end date');
    const where: Prisma.ClientCommunicationWhereInput = {
      agencyId: actor.agencyId,
      clientId,
      type: query.type,
      requirementId: query.requirementId,
      ...(query.from || query.to
        ? {
            occurredAt: {
              gte: from,
              lte: to,
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { subject: { contains: query.q, mode: 'insensitive' } },
              { summary: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.clientCommunication.findMany({
        where,
        ...pageArgs(query),
        include: { createdBy: { select: userSelect } },
        orderBy: [
          { occurredAt: query.sort === 'oldest' ? 'asc' : 'desc' },
          { id: query.sort === 'oldest' ? 'asc' : 'desc' },
        ],
      }),
      this.prisma.clientCommunication.count({ where }),
    ]);
    return pageResult(items, total, query);
  }
  async createCommunication(actor: Actor, clientId: string, dto: CreateCommunicationDto) {
    assertPermissions(actor, 'communication.write');
    return this.prisma.$transaction(async (db) => {
      await this.access.client(actor, clientId, db, true);
      await this.access.linkedRequirement(actor, clientId, dto.requirementId, db);
      const record = await db.clientCommunication.create({
        data: {
          ...dto,
          occurredAt: new Date(dto.occurredAt),
          agencyId: actor.agencyId,
          clientId,
          createdById: actor.userId,
        },
        include: { createdBy: { select: userSelect } },
      });
      await this.access.audit(
        db,
        actor,
        clientId,
        'COMMUNICATION_ADDED',
        'communication',
        record.id,
        'Client communication recorded',
        { type: dto.type, occurredAt: dto.occurredAt },
      );
      return record;
    });
  }
  async notes(actor: Actor, clientId: string, query: NoteQuery) {
    assertPermissions(actor, 'note.read');
    await this.access.client(actor, clientId);
    await this.access.linkedRequirement(actor, clientId, query.requirementId);
    const where = {
      agencyId: actor.agencyId,
      clientId,
      requirementId: query.requirementId,
      ...(query.q ? { body: { contains: query.q, mode: 'insensitive' as const } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.clientNote.findMany({
        where,
        ...pageArgs(query),
        include: { createdBy: { select: userSelect } },
        orderBy: [
          { createdAt: query.sort === 'oldest' ? 'asc' : 'desc' },
          { id: query.sort === 'oldest' ? 'asc' : 'desc' },
        ],
      }),
      this.prisma.clientNote.count({ where }),
    ]);
    return pageResult(items, total, query);
  }
  async createNote(actor: Actor, clientId: string, dto: CreateNoteDto) {
    assertPermissions(actor, 'note.write');
    return this.prisma.$transaction(async (db) => {
      await this.access.client(actor, clientId, db, true);
      await this.access.linkedRequirement(actor, clientId, dto.requirementId, db);
      const note = await db.clientNote.create({
        data: { ...dto, agencyId: actor.agencyId, clientId, createdById: actor.userId },
        include: { createdBy: { select: userSelect } },
      });
      await this.access.audit(
        db,
        actor,
        clientId,
        'NOTE_ADDED',
        'note',
        note.id,
        'Internal note added',
      );
      return note;
    });
  }
  async timeline(actor: Actor, clientId: string, query: PageQuery) {
    assertPermissions(actor, 'timeline.read');
    await this.access.client(actor, clientId);
    const where = {
      agencyId: actor.agencyId,
      clientId,
      ...(query.q
        ? {
            OR: [
              { eventType: { contains: query.q, mode: 'insensitive' as const } },
              { summary: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        ...pageArgs(query),
        include: { actor: { select: userSelect } },
        orderBy: [
          { createdAt: query.sort === 'oldest' ? 'asc' : 'desc' },
          { id: query.sort === 'oldest' ? 'asc' : 'desc' },
        ],
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return pageResult(items, total, query);
  }
}
