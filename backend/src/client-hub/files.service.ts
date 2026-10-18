import { Injectable, StreamableFile } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Actor, assertPermissions } from '../common/auth';
import { ApiError } from '../common/http';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService, fileSelect, pageArgs, pageResult } from './access.service';
import { FileLinkDto, FileQuery, FileUploadDto } from './dto/hub.dto';
import { PrivateStorage } from './private-storage';
import { assertEditable } from './workflow';
@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly storage: PrivateStorage,
  ) {}
  async list(actor: Actor, clientId: string, query: FileQuery) {
    assertPermissions(actor, 'file.read');
    await this.access.client(actor, clientId);
    await this.access.linkedRequirement(actor, clientId, query.requirementId);
    const where: Prisma.ClientFileWhereInput = {
      agencyId: actor.agencyId,
      clientId,
      requirementId: query.requirementId,
      ...(!query.includeArchived ? { archivedAt: null } : {}),
      ...(query.q ? { originalName: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.clientFile.findMany({
        where,
        ...pageArgs(query),
        select: fileSelect,
        orderBy: [{ createdAt: query.sort === 'oldest' ? 'asc' : 'desc' }, { id: 'asc' }],
      }),
      this.prisma.clientFile.count({ where }),
    ]);
    return pageResult(items, total, query);
  }
  private async checkLink(
    actor: Actor,
    clientId: string,
    requirementId: string | undefined,
    db: Prisma.TransactionClient,
  ) {
    await this.access.client(actor, clientId, db, true);
    const requirement = await this.access.linkedRequirement(actor, clientId, requirementId, db);
    if (requirement) assertEditable(requirement.status);
  }
  async createLink(actor: Actor, clientId: string, dto: FileLinkDto) {
    assertPermissions(actor, 'file.write');
    const url = new URL(dto.referenceUrl);
    if (url.username || url.password)
      throw new ApiError(400, 'INVALID_URL', 'Reference URLs must not include credentials');
    return this.prisma.$transaction(
      async (db) => {
        await this.checkLink(actor, clientId, dto.requirementId, db);
        const file = await db.clientFile.create({
          data: { ...dto, agencyId: actor.agencyId, clientId, uploadedById: actor.userId },
          select: fileSelect,
        });
        await this.access.audit(
          db,
          actor,
          clientId,
          'REFERENCE_ADDED',
          'file',
          file.id,
          'Reference link added',
        );
        return file;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async upload(actor: Actor, clientId: string, dto: FileUploadDto, file?: Express.Multer.File) {
    assertPermissions(actor, 'file.write');
    if (!file) throw new ApiError(400, 'FILE_REQUIRED', 'Select a file');
    await this.access.client(actor, clientId, undefined, true);
    const linked = await this.access.linkedRequirement(actor, clientId, dto.requirementId);
    if (linked) assertEditable(linked.status);
    const storageKey = await this.storage.put(file);
    try {
      return await this.prisma.$transaction(
        async (db) => {
          await this.checkLink(actor, clientId, dto.requirementId, db);
          const record = await db.clientFile.create({
            data: {
              agencyId: actor.agencyId,
              clientId,
              requirementId: dto.requirementId,
              uploadedById: actor.userId,
              originalName:
                file.originalname
                  .replace(/[\\/\x00-\x1F\x7F]/g, '_')
                  .trim()
                  .slice(0, 200) || 'file',
              mimeType: file.mimetype,
              size: file.size,
              storageKey,
            },
            select: fileSelect,
          });
          await this.access.audit(
            db,
            actor,
            clientId,
            'FILE_ADDED',
            'file',
            record.id,
            'Private file uploaded',
          );
          return record;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      await this.storage.removeUncommitted(storageKey);
      throw error;
    }
  }
  async download(actor: Actor, id: string) {
    assertPermissions(actor, 'file.read');
    const file = await this.prisma.clientFile.findFirst({
      where: { id, agencyId: actor.agencyId },
    });
    if (!file) throw new ApiError(404, 'NOT_FOUND', 'Record not found');
    if (!file.storageKey)
      throw new ApiError(409, 'REFERENCE_ONLY', 'This record is a reference link');
    const bytes = await this.storage.read(file.storageKey);
    return new StreamableFile(bytes, {
      type: file.mimeType ?? 'application/octet-stream',
      disposition:
        "attachment; filename*=UTF-8''" +
        encodeURIComponent(file.originalName).replace(
          /['()*]/g,
          (character) => '%' + character.charCodeAt(0).toString(16).toUpperCase(),
        ),
      length: bytes.length,
    });
  }
  async archive(actor: Actor, id: string) {
    assertPermissions(actor, 'file.write');
    return this.prisma.$transaction(
      async (db) => {
        const file = await db.clientFile.findFirst({ where: { id, agencyId: actor.agencyId } });
        if (!file) throw new ApiError(404, 'NOT_FOUND', 'Record not found');
        await this.checkLink(actor, file.clientId, file.requirementId ?? undefined, db);
        if (file.archivedAt) return { id, archived: true };
        await db.clientFile.updateMany({
          where: { id, agencyId: actor.agencyId },
          data: { archivedAt: new Date() },
        });
        await this.access.audit(
          db,
          actor,
          file.clientId,
          'FILE_ARCHIVED',
          'file',
          id,
          'File/reference archived; private history retained',
        );
        return { id, archived: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
