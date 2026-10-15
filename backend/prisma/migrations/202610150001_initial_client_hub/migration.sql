-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'CONFIRMED', 'CHANGES_REQUESTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ItemPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'MUST_HAVE');

-- CreateEnum
CREATE TYPE "CommunicationType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'WHATSAPP_MESSAGE', 'VIDEO_MEETING', 'OTHER');

-- CreateTable
CREATE TABLE "Agency" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" UUID NOT NULL,
    "permissionKey" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionKey")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientRequirement" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "services" TEXT[],
    "designPreferences" TEXT NOT NULL DEFAULT '',
    "referenceLinks" TEXT[],
    "constraints" TEXT NOT NULL DEFAULT '',
    "assumptions" TEXT NOT NULL DEFAULT '',
    "internalRecommendations" TEXT NOT NULL DEFAULT '',
    "clientNotes" TEXT NOT NULL DEFAULT '',
    "timeline" TEXT NOT NULL DEFAULT '',
    "targetDate" DATE,
    "budgetMin" DECIMAL(18,2),
    "budgetMax" DECIMAL(18,2),
    "currency" CHAR(3),
    "status" "RequirementStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "lockVersion" INTEGER NOT NULL DEFAULT 1,
    "preparedById" UUID NOT NULL,
    "confirmedById" UUID,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementItem" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "requirementId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "priority" "ItemPriority" NOT NULL DEFAULT 'MEDIUM',
    "notes" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequirementItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementRevision" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "requirementId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "confirmedById" UUID NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequirementRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientNote" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "requirementId" UUID,
    "body" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientCommunication" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "requirementId" UUID,
    "type" "CommunicationType" NOT NULL,
    "subject" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "participants" TEXT[],
    "followUp" TEXT NOT NULL DEFAULT '',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientCommunication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientFile" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "requirementId" UUID,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "storageKey" TEXT,
    "referenceUrl" TEXT,
    "uploadedById" UUID NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_id_agencyId_key" ON "Role"("id", "agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_agencyId_name_key" ON "Role"("agencyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_id_agencyId_key" ON "User"("id", "agencyId");

-- CreateIndex
CREATE INDEX "Client_agencyId_updatedAt_idx" ON "Client"("agencyId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Client_id_agencyId_key" ON "Client"("id", "agencyId");

-- CreateIndex
CREATE INDEX "ClientRequirement_agencyId_clientId_status_updatedAt_idx" ON "ClientRequirement"("agencyId", "clientId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClientRequirement_id_agencyId_key" ON "ClientRequirement"("id", "agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientRequirement_id_clientId_agencyId_key" ON "ClientRequirement"("id", "clientId", "agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementItem_requirementId_position_key" ON "RequirementItem"("requirementId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementRevision_requirementId_version_key" ON "RequirementRevision"("requirementId", "version");

-- CreateIndex
CREATE INDEX "ClientNote_agencyId_clientId_createdAt_idx" ON "ClientNote"("agencyId", "clientId", "createdAt");

-- CreateIndex
CREATE INDEX "ClientCommunication_agencyId_clientId_occurredAt_idx" ON "ClientCommunication"("agencyId", "clientId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClientFile_storageKey_key" ON "ClientFile"("storageKey");

-- CreateIndex
CREATE INDEX "ClientFile_agencyId_clientId_createdAt_idx" ON "ClientFile"("agencyId", "clientId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_agencyId_clientId_createdAt_idx" ON "AuditLog"("agencyId", "clientId", "createdAt");

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "Permission"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_agencyId_fkey" FOREIGN KEY ("roleId", "agencyId") REFERENCES "Role"("id", "agencyId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRequirement" ADD CONSTRAINT "ClientRequirement_clientId_agencyId_fkey" FOREIGN KEY ("clientId", "agencyId") REFERENCES "Client"("id", "agencyId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ClientRequirement" ADD CONSTRAINT "ClientRequirement_preparedById_agencyId_fkey" FOREIGN KEY ("preparedById", "agencyId") REFERENCES "User"("id", "agencyId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ClientRequirement" ADD CONSTRAINT "ClientRequirement_confirmedById_agencyId_fkey" FOREIGN KEY ("confirmedById", "agencyId") REFERENCES "User"("id", "agencyId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "RequirementItem" ADD CONSTRAINT "RequirementItem_requirementId_agencyId_fkey" FOREIGN KEY ("requirementId", "agencyId") REFERENCES "ClientRequirement"("id", "agencyId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "RequirementRevision" ADD CONSTRAINT "RequirementRevision_requirementId_agencyId_fkey" FOREIGN KEY ("requirementId", "agencyId") REFERENCES "ClientRequirement"("id", "agencyId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "RequirementRevision" ADD CONSTRAINT "RequirementRevision_confirmedById_agencyId_fkey" FOREIGN KEY ("confirmedById", "agencyId") REFERENCES "User"("id", "agencyId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_clientId_agencyId_fkey" FOREIGN KEY ("clientId", "agencyId") REFERENCES "Client"("id", "agencyId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_requirementId_clientId_agencyId_fkey" FOREIGN KEY ("requirementId", "clientId", "agencyId") REFERENCES "ClientRequirement"("id", "clientId", "agencyId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_createdById_agencyId_fkey" FOREIGN KEY ("createdById", "agencyId") REFERENCES "User"("id", "agencyId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ClientCommunication" ADD CONSTRAINT "ClientCommunication_clientId_agencyId_fkey" FOREIGN KEY ("clientId", "agencyId") REFERENCES "Client"("id", "agencyId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ClientCommunication" ADD CONSTRAINT "ClientCommunication_requirementId_clientId_agencyId_fkey" FOREIGN KEY ("requirementId", "clientId", "agencyId") REFERENCES "ClientRequirement"("id", "clientId", "agencyId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ClientCommunication" ADD CONSTRAINT "ClientCommunication_createdById_agencyId_fkey" FOREIGN KEY ("createdById", "agencyId") REFERENCES "User"("id", "agencyId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ClientFile" ADD CONSTRAINT "ClientFile_clientId_agencyId_fkey" FOREIGN KEY ("clientId", "agencyId") REFERENCES "Client"("id", "agencyId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ClientFile" ADD CONSTRAINT "ClientFile_requirementId_clientId_agencyId_fkey" FOREIGN KEY ("requirementId", "clientId", "agencyId") REFERENCES "ClientRequirement"("id", "clientId", "agencyId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ClientFile" ADD CONSTRAINT "ClientFile_uploadedById_agencyId_fkey" FOREIGN KEY ("uploadedById", "agencyId") REFERENCES "User"("id", "agencyId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_clientId_agencyId_fkey" FOREIGN KEY ("clientId", "agencyId") REFERENCES "Client"("id", "agencyId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_agencyId_fkey" FOREIGN KEY ("actorId", "agencyId") REFERENCES "User"("id", "agencyId") ON DELETE RESTRICT ON UPDATE NO ACTION;
