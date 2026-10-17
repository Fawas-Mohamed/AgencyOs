import { randomUUID } from 'node:crypto';
import { Prisma, RequirementStatus } from '@prisma/client';
import { RequirementsService } from './requirements.service';
import { AccessService } from './access.service';
import { PrismaService } from '../prisma/prisma.service';
import { Actor, PERMISSIONS } from '../common/auth';
import { ApiError } from '../common/http';
import {
  ChangeStatusDto,
  EditRequirementDto,
  RequirementContentDto,
  RequirementQuery,
} from './dto/hub.dto';

describe('requirement service security and conflict rules', () => {
  const id = randomUUID();
  const clientId = randomUUID();
  const actor: Actor = {
    userId: randomUUID(),
    agencyId: randomUUID(),
    displayName: 'Reviewer',
    email: 'service-test@example.com',
    role: 'Reviewer',
    permissions: [...PERMISSIONS],
  };
  const content = () =>
    Object.assign(new RequirementContentDto(), {
      title: 'Client intake',
      objective: 'Capture approved scope',
      items: [
        { title: 'Brief', description: '', category: 'Feature', priority: 'HIGH', notes: '' },
      ],
    });
  const record = (status: RequirementStatus = 'DRAFT') => ({
    id,
    clientId,
    agencyId: actor.agencyId,
    status,
    version: 1,
    lockVersion: 5,
  });
  let service: RequirementsService;
  let access: { requirement: jest.Mock; client: jest.Mock; audit: jest.Mock };
  let tx: { clientRequirement: { updateMany: jest.Mock } };
  let prisma: { $transaction: jest.Mock };
  beforeEach(() => {
    access = {
      requirement: jest.fn().mockResolvedValue(record()),
      client: jest.fn().mockResolvedValue({ id: clientId, status: 'ACTIVE' }),
      audit: jest.fn(),
    };
    tx = { clientRequirement: { updateMany: jest.fn() } };
    prisma = { $transaction: jest.fn(async (operation) => operation(tx)) };
    service = new RequirementsService(
      prisma as unknown as PrismaService,
      access as unknown as AccessService,
    );
  });
  const edit = (expectedVersion = 5) =>
    Object.assign(new EditRequirementDto(), content(), { expectedVersion });
  const status = (next: RequirementStatus, expectedVersion = 5, reason?: string) =>
    Object.assign(new ChangeStatusDto(), { status: next, expectedVersion, reason });
  const response = async (operation: Promise<unknown>) => {
    try {
      await operation;
      throw new Error('Expected a business error');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      return (error as ApiError).getResponse();
    }
  };

  it.each(['list', 'detail', 'create', 'edit', 'changeStatus', 'export'] as const)(
    'enforces permissions inside %s even without a controller',
    async (method) => {
      const denied = { ...actor, permissions: [] };
      const operations = {
        list: () => service.list(denied, clientId, new RequirementQuery()),
        detail: () => service.detail(denied, id),
        create: () => service.create(denied, clientId, content()),
        edit: () => service.edit(denied, id, edit()),
        changeStatus: () => service.changeStatus(denied, id, status('UNDER_REVIEW')),
        export: () => service.export(denied, id, 1),
      };
      await expect(operations[method]()).rejects.toMatchObject({ status: 403 });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  it('requires both client and requirement read permissions for the client list', async () => {
    await expect(
      service.list(
        { ...actor, permissions: ['requirement.read'] },
        clientId,
        new RequirementQuery(),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it.each([
    [{ budgetMin: '10.00' }, 'CURRENCY_REQUIRED'],
    [{ budgetMin: '20.00', budgetMax: '10.00', currency: 'LKR' }, 'INVALID_BUDGET'],
    [{ referenceLinks: ['https://user:password@example.com'] }, 'INVALID_URL'],
  ])('rejects invalid content before writing: %s', async (changes, code) => {
    expect(
      await response(service.create(actor, clientId, Object.assign(content(), changes))),
    ).toMatchObject({ code });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each(['UNDER_REVIEW', 'CONFIRMED', 'ARCHIVED'] as const)(
    'refuses direct content changes in %s',
    async (state) => {
      access.requirement.mockResolvedValue(record(state));
      expect(await response(service.edit(actor, id, edit()))).toMatchObject({
        code: 'CONTENT_LOCKED',
      });
      expect(tx.clientRequirement.updateMany).not.toHaveBeenCalled();
    },
  );
  it('rejects invalid transition edges without updating status', async () => {
    expect(await response(service.changeStatus(actor, id, status('CONFIRMED')))).toMatchObject({
      code: 'INVALID_TRANSITION',
    });
    expect(tx.clientRequirement.updateMany).not.toHaveBeenCalled();
  });
  it('requires a review reason before requesting changes', async () => {
    access.requirement.mockResolvedValue(record('UNDER_REVIEW'));
    expect(
      await response(service.changeStatus(actor, id, status('CHANGES_REQUESTED', 5, '   '))),
    ).toMatchObject({ code: 'REASON_REQUIRED' });
  });
  it('requires review permission inside the status service', async () => {
    access.requirement.mockResolvedValue(record('UNDER_REVIEW'));
    const writer = { ...actor, permissions: ['requirement.write'] };
    expect(await response(service.changeStatus(writer, id, status('CONFIRMED')))).toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(tx.clientRequirement.updateMany).not.toHaveBeenCalled();
  });
  it.each(['edit', 'status'] as const)(
    'returns current version/state for a stale %s',
    async (operation) => {
      access.requirement.mockResolvedValue(record('CONFIRMED'));
      const pending =
        operation === 'edit'
          ? service.edit(actor, id, edit(4))
          : service.changeStatus(actor, id, status('DRAFT', 4, 'Controlled revision'));
      expect(await response(pending)).toMatchObject({
        code: 'STALE_VERSION',
        details: {
          requirementId: id,
          expectedVersion: 4,
          currentVersion: 5,
          currentStatus: 'CONFIRMED',
          reloadRequired: true,
        },
      });
      expect(tx.clientRequirement.updateMany).not.toHaveBeenCalled();
    },
  );
  it('reloads scoped current metadata when the compare-and-swap loses a race', async () => {
    access.requirement
      .mockResolvedValueOnce(record())
      .mockResolvedValueOnce({ ...record(), lockVersion: 6 });
    tx.clientRequirement.updateMany.mockResolvedValue({ count: 0 });
    expect(await response(service.edit(actor, id, edit()))).toMatchObject({
      code: 'STALE_VERSION',
      details: { expectedVersion: 5, currentVersion: 6, reloadRequired: true },
    });
  });
  it('reports a serialization conflict after rollback without exposing database diagnostics', async () => {
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Private PostgreSQL serialization diagnostics', {
        code: 'P2034',
        clientVersion: '6.19.3',
      }),
    );
    access.requirement.mockResolvedValue({ ...record('UNDER_REVIEW'), lockVersion: 6 });
    const error = await response(service.edit(actor, id, edit()));
    expect(error).toMatchObject({
      code: 'CONFLICT',
      details: {
        requirementId: id,
        expectedVersion: 5,
        currentVersion: 6,
        currentStatus: 'UNDER_REVIEW',
        reloadRequired: true,
      },
    });
    expect(JSON.stringify(error)).not.toMatch(/PostgreSQL|P2034|diagnostics/);
  });
});
