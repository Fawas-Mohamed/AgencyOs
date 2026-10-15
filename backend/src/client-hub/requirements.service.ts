import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Actor } from '../common/auth';
import { ApiError } from '../common/http';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService, fileSelect, pageArgs, pageResult, userSelect } from './access.service';
import {
  ChangeStatusDto,
  EditRequirementDto,
  RequirementContentDto,
  RequirementQuery,
} from './dto/hub.dto';
import { assertEditable, assertTransition, TRANSITIONS, EDITABLE } from './workflow';
const requirementInclude = {
  items: { orderBy: { position: 'asc' as const } },
  preparedBy: { select: userSelect },
  confirmedBy: { select: userSelect },
};
@Injectable()
export class RequirementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}
  private content(dto: RequirementContentDto) {
    if (
      dto.referenceLinks.some((link) => {
        const url = new URL(link);
        return Boolean(url.username || url.password);
      })
    )
      throw new ApiError(400, 'INVALID_URL', 'Reference URLs must not include credentials');
    if ((dto.budgetMin != null || dto.budgetMax != null) && !dto.currency)
      throw new ApiError(400, 'CURRENCY_REQUIRED', 'A currency is required for a budget range');
    if (
      dto.budgetMin != null &&
      dto.budgetMax != null &&
      new Prisma.Decimal(dto.budgetMin).greaterThan(dto.budgetMax)
    )
      throw new ApiError(400, 'INVALID_BUDGET', 'Minimum budget must not exceed maximum budget');
    return {
      title: dto.title,
      objective: dto.objective,
      services: dto.services,
      designPreferences: dto.designPreferences,
      referenceLinks: dto.referenceLinks,
      constraints: dto.constraints,
      assumptions: dto.assumptions,
      internalRecommendations: dto.internalRecommendations,
      clientNotes: dto.clientNotes,
      timeline: dto.timeline,
      targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
      budgetMin: dto.budgetMin ?? null,
      budgetMax: dto.budgetMax ?? null,
      currency: dto.currency ?? null,
    };
  }
  async list(actor: Actor, clientId: string, query: RequirementQuery) {
    await this.access.client(actor, clientId);
    const where: Prisma.ClientRequirementWhereInput = {
      agencyId: actor.agencyId,
      clientId,
      status: query.status,
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { objective: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.clientRequirement.findMany({
        where,
        ...pageArgs(query),
        orderBy: [{ updatedAt: query.sort === 'oldest' ? 'asc' : 'desc' }, { id: 'asc' }],
        include: requirementInclude,
      }),
      this.prisma.clientRequirement.count({ where }),
    ]);
    return pageResult(items, total, query);
  }
  async detail(actor: Actor, id: string) {
    await this.access.requirement(actor, id);
    const requirement = await this.prisma.clientRequirement.findFirstOrThrow({
      where: { id, agencyId: actor.agencyId },
      include: {
        ...requirementInclude,
        revisions: {
          where: { agencyId: actor.agencyId },
          orderBy: { version: 'desc' },
          select: {
            id: true,
            version: true,
            confirmedAt: true,
            confirmedBy: { select: userSelect },
          },
        },
      },
    });
    const where = { agencyId: actor.agencyId, requirementId: id };
    const [files, notes, communications, history] = await Promise.all([
      actor.permissions.includes('file.read')
        ? this.prisma.clientFile.findMany({
            where: { ...where, archivedAt: null },
            select: fileSelect,
            orderBy: { createdAt: 'desc' },
            take: 100,
          })
        : null,
      actor.permissions.includes('note.read')
        ? this.prisma.clientNote.findMany({
            where,
            include: { createdBy: { select: userSelect } },
            orderBy: { createdAt: 'desc' },
            take: 100,
          })
        : null,
      actor.permissions.includes('communication.read')
        ? this.prisma.clientCommunication.findMany({
            where,
            include: { createdBy: { select: userSelect } },
            orderBy: { occurredAt: 'desc' },
            take: 100,
          })
        : null,
      actor.permissions.includes('timeline.read')
        ? this.prisma.auditLog.findMany({
            where: { agencyId: actor.agencyId, entityType: 'requirement', entityId: id },
            include: { actor: { select: userSelect } },
            orderBy: { createdAt: 'desc' },
            take: 100,
          })
        : null,
    ]);
    const client = await this.access.client(actor, requirement.clientId);
    const canWrite = actor.permissions.includes('requirement.write') && client.status === 'ACTIVE';
    const canReview = actor.permissions.includes('requirement.review');
    const allowedTransitions = canWrite
      ? TRANSITIONS[requirement.status].filter(
          (target) =>
            canReview ||
            !(
              requirement.status === 'CONFIRMED' ||
              requirement.status === 'UNDER_REVIEW' ||
              ['CONFIRMED', 'CHANGES_REQUESTED'].includes(target)
            ),
        )
      : [];
    return {
      ...requirement,
      files,
      notes,
      communications,
      history,
      allowedTransitions,
      editAllowed: canWrite && EDITABLE.includes(requirement.status),
    };
  }
  async create(actor: Actor, clientId: string, dto: RequirementContentDto) {
    const content = this.content(dto);
    return this.prisma.$transaction(
      async (db) => {
        await this.access.client(actor, clientId, db, true);
        const record = await db.clientRequirement.create({
          data: {
            ...content,
            agencyId: actor.agencyId,
            clientId,
            preparedById: actor.userId,
            items: { create: dto.items.map((item, position) => ({ ...item, position })) },
          },
          include: requirementInclude,
        });
        await this.access.audit(
          db,
          actor,
          clientId,
          'REQUIREMENT_CREATED',
          'requirement',
          record.id,
          'Requirement created',
        );
        return record;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async edit(actor: Actor, id: string, dto: EditRequirementDto) {
    const content = this.content(dto);
    return this.prisma.$transaction(
      async (db) => {
        const record = await this.access.requirement(actor, id, db);
        await this.access.client(actor, record.clientId, db, true);
        assertEditable(record.status);
        const changed = await db.clientRequirement.updateMany({
          where: {
            id,
            agencyId: actor.agencyId,
            lockVersion: dto.expectedVersion,
            status: record.status,
          },
          data: { ...content, lockVersion: { increment: 1 } },
        });
        if (changed.count !== 1)
          throw new ApiError(409, 'STALE_VERSION', 'Record changed; reload and retry');
        await db.requirementItem.deleteMany({
          where: { requirementId: id, agencyId: actor.agencyId },
        });
        await db.requirementItem.createMany({
          data: dto.items.map((item, position) => ({
            ...item,
            position,
            agencyId: actor.agencyId,
            requirementId: id,
          })),
        });
        await this.access.audit(
          db,
          actor,
          record.clientId,
          'REQUIREMENT_UPDATED',
          'requirement',
          id,
          'Requirement content updated',
          { version: record.version },
        );
        return db.clientRequirement.findFirstOrThrow({
          where: { id, agencyId: actor.agencyId },
          include: requirementInclude,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async changeStatus(actor: Actor, id: string, dto: ChangeStatusDto) {
    return this.prisma.$transaction(
      async (db) => {
        const record = await this.access.requirement(actor, id, db);
        await this.access.client(actor, record.clientId, db, true);
        assertTransition(record.status, dto.status, dto.reason);
        if (
          (record.status === 'CONFIRMED' ||
            record.status === 'UNDER_REVIEW' ||
            ['CONFIRMED', 'CHANGES_REQUESTED'].includes(dto.status)) &&
          !actor.permissions.includes('requirement.review')
        )
          throw new ApiError(403, 'FORBIDDEN', 'Review permission required');
        const reopening = record.status === 'CONFIRMED' && dto.status === 'DRAFT';
        const changed = await db.clientRequirement.updateMany({
          where: {
            id,
            agencyId: actor.agencyId,
            lockVersion: dto.expectedVersion,
            status: record.status,
          },
          data: {
            status: dto.status,
            lockVersion: { increment: 1 },
            ...(reopening
              ? { version: { increment: 1 }, confirmedAt: null, confirmedById: null }
              : {}),
            ...(dto.status === 'CONFIRMED'
              ? { confirmedAt: new Date(), confirmedById: actor.userId }
              : {}),
          },
        });
        if (changed.count !== 1)
          throw new ApiError(409, 'STALE_VERSION', 'Record changed; reload and retry');
        const updated = await db.clientRequirement.findFirstOrThrow({
          where: { id, agencyId: actor.agencyId },
          include: requirementInclude,
        });
        if (dto.status === 'CONFIRMED') {
          const references = await db.clientFile.findMany({
            where: {
              agencyId: actor.agencyId,
              requirementId: id,
              clientId: record.clientId,
              archivedAt: null,
            },
            select: fileSelect,
            orderBy: { createdAt: 'asc' },
          });
          const snapshot = JSON.parse(
            JSON.stringify({
              schemaVersion: 1,
              requirementId: id,
              clientId: record.clientId,
              version: updated.version,
              title: updated.title,
              objective: updated.objective,
              services: updated.services,
              items: updated.items,
              designPreferences: updated.designPreferences,
              referenceLinks: updated.referenceLinks,
              references,
              clientProvided: {
                budgetMin: updated.budgetMin,
                budgetMax: updated.budgetMax,
                currency: updated.currency,
                timeline: updated.timeline,
                targetDate: updated.targetDate,
                constraints: updated.constraints,
                notes: updated.clientNotes,
              },
              internal: {
                assumptions: updated.assumptions,
                recommendations: updated.internalRecommendations,
              },
              preparedBy: updated.preparedBy,
              confirmedBy: updated.confirmedBy,
              confirmedAt: updated.confirmedAt,
            }),
          ) as Prisma.InputJsonValue;
          await db.requirementRevision.create({
            data: {
              agencyId: actor.agencyId,
              requirementId: id,
              version: updated.version,
              snapshot,
              confirmedById: actor.userId,
              confirmedAt: updated.confirmedAt!,
            },
          });
        }
        await this.access.audit(
          db,
          actor,
          record.clientId,
          'REQUIREMENT_' + dto.status,
          'requirement',
          id,
          reopening
            ? 'Confirmed requirement reopened as a new draft version'
            : 'Requirement status changed to ' + dto.status,
          {
            from: record.status,
            to: dto.status,
            version: updated.version,
            reason: dto.reason ?? '',
          },
        );
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async export(actor: Actor, id: string, version?: number) {
    const record = await this.access.requirement(actor, id);
    if (!version && record.status !== 'CONFIRMED')
      throw new ApiError(
        409,
        'NOT_CONFIRMED',
        'Choose an explicitly confirmed version or confirm the current requirement',
      );
    const snapshot = await this.prisma.requirementRevision.findFirst({
      where: { agencyId: actor.agencyId, requirementId: id, version: version ?? record.version },
    });
    if (!snapshot) throw new ApiError(404, 'NOT_FOUND', 'Record not found');
    return snapshot.snapshot;
  }
}
