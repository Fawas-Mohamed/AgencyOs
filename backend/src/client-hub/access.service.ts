import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Actor } from '../common/auth';
import { ApiError } from '../common/http';
export const userSelect = { id: true, displayName: true } satisfies Prisma.UserSelect;
export const fileSelect = { id:true, clientId:true, requirementId:true, originalName:true, mimeType:true, size:true, referenceUrl:true, archivedAt:true, createdAt:true, updatedAt:true, uploadedBy:{select:userSelect} } satisfies Prisma.ClientFileSelect;
export function pageResult<T>(items: T[], total: number, query: {page:number;limit:number}) {
  return { items, total, page:query.page, limit:query.limit, totalPages:Math.ceil(total/query.limit) };
}
export function pageArgs(query: {page:number;limit:number}) { return {skip:(query.page-1)*query.limit,take:query.limit}; }
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}
  async client(actor: Actor, id: string, db: Prisma.TransactionClient = this.prisma, editable = false) {
    const client = await db.client.findFirst({where:{id,agencyId:actor.agencyId}});
    if (!client) throw new ApiError(404,'NOT_FOUND','Record not found');
    if (editable && client.status === 'ARCHIVED') throw new ApiError(409,'CLIENT_ARCHIVED','Archived clients are read-only');
    return client;
  }
  async requirement(actor: Actor, id: string, db: Prisma.TransactionClient = this.prisma) {
    const requirement = await db.clientRequirement.findFirst({where:{id,agencyId:actor.agencyId}});
    if (!requirement) throw new ApiError(404,'NOT_FOUND','Record not found');
    return requirement;
  }
  async linkedRequirement(actor: Actor, clientId: string, id?: string | null, db: Prisma.TransactionClient = this.prisma) {
    if (!id) return null;
    const record = await this.requirement(actor,id,db);
    if (record.clientId !== clientId) throw new ApiError(404,'NOT_FOUND','Record not found');
    return record;
  }
  audit(db: Prisma.TransactionClient, actor: Actor, clientId: string, eventType: string, entityType: string, entityId: string, summary: string, metadata?: Prisma.InputJsonValue) {
    return db.auditLog.create({data:{agencyId:actor.agencyId,clientId,actorId:actor.userId,eventType,entityType,entityId,summary,...(metadata ? {metadata} : {})}});
  }
}
