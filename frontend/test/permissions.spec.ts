import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../backend/node_modules/@prisma/client';
import { hashPassword } from '../../backend/src/common/password';

let prisma: PrismaClient;
let agencyId: string | undefined;
let clientId: string;
let requirementId: string;
const email = 'browser-reader-' + randomUUID() + '@example.com';
const password = randomUUID() + randomUUID();

test.beforeAll(async () => {
  if (
    !process.env.TEST_DATABASE_URL ||
    !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')
  )
    throw new Error('Dedicated test database required');
  prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const created = await prisma.$transaction(async (db) => {
    const agency = await db.agency.create({
      data: { name: 'Isolated browser permission fixture ' + randomUUID() },
    });
    const role = await db.role.create({
      data: {
        agencyId: agency.id,
        name: 'Read-only browser fixture',
        permissions: {
          create: [
            'client.read',
            'requirement.read',
            'communication.read',
            'note.read',
            'file.read',
            'timeline.read',
          ].map((permissionKey) => ({ permissionKey })),
        },
      },
    });
    const user = await db.user.create({
      data: {
        agencyId: agency.id,
        roleId: role.id,
        email,
        displayName: 'Browser reader',
        passwordHash: hashPassword(password),
      },
    });
    const client = await db.client.create({
      data: {
        agencyId: agency.id,
        name: 'Read-only client',
        company: 'Permission fixture',
        contactName: 'Read contact',
      },
    });
    const requirement = await db.clientRequirement.create({
      data: {
        agencyId: agency.id,
        clientId: client.id,
        preparedById: user.id,
        title: 'Read-only brief',
        objective: 'Inspect real permissions',
        services: [],
        referenceLinks: [],
      },
    });
    return { agencyId: agency.id, clientId: client.id, requirementId: requirement.id };
  });
  ({ agencyId, clientId, requirementId } = created);
});
test.afterAll(async () => {
  // Delete only the isolated fixture created by this file, never demo or pre-existing agencies.
  if (prisma && agencyId)
    await prisma.$transaction(async (db) => {
      await db.clientRequirement.deleteMany({ where: { agencyId } });
      await db.client.deleteMany({ where: { agencyId } });
      await db.user.deleteMany({ where: { agencyId } });
      const roles = await db.role.findMany({ where: { agencyId }, select: { id: true } });
      await db.rolePermission.deleteMany({
        where: { roleId: { in: roles.map((role) => role.id) } },
      });
      await db.role.deleteMany({ where: { agencyId } });
      await db.agency.delete({ where: { id: agencyId } });
    });
  await prisma?.$disconnect();
});
test('database-derived read-only permissions hide writes and server rejects bypasses', async ({
  page,
  context,
}) => {
  const login = await context.request.post('/api/auth/login', {
    headers: { Origin: process.env.UI_ORIGIN! },
    data: { email, password },
  });
  expect(login.status()).toBe(201);
  await page.goto('/client-hub');
  await expect(page.getByRole('link', { name: 'New client', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Read-only client', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Edit client', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Requirements', exact: true }).click();
  await expect(page.getByRole('link', { name: 'New requirement', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Read-only brief', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Edit requirement', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Review requirement', exact: true })).toHaveCount(0);
  await page.goto('/client-hub/clients/' + clientId + '/requirements/' + requirementId + '/review');
  await expect(page.getByLabel('Reason / review note', { exact: true })).toBeDisabled();
  await page.goto('/client-hub/clients/' + clientId + '/requirements/' + requirementId + '/edit');
  await expect(
    page.getByRole('heading', { name: 'This requirement cannot be edited', exact: true }),
  ).toBeVisible();
  for (const [tab, button] of [
    ['communications', 'Log communication'],
    ['files', 'Upload file'],
    ['notes', 'Add internal note'],
  ]) {
    await page.goto('/client-hub/clients/' + clientId + '?tab=' + tab);
    await expect(page.getByRole('button', { name: button, exact: true })).toHaveCount(0);
  }
  const denied = await context.request.patch('/api/requirements/' + requirementId + '/status', {
    headers: { Origin: process.env.UI_ORIGIN! },
    data: { status: 'UNDER_REVIEW', expectedVersion: 1 },
  });
  expect(denied.status()).toBe(403);
  const otherLogin = await context.request.post('/api/auth/login', {
    headers: { Origin: process.env.UI_ORIGIN! },
    data: { email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD },
  });
  expect(otherLogin.status()).toBe(201);
  expect((await context.request.get('/api/clients/' + clientId + '/hub')).status()).toBe(404);
});
