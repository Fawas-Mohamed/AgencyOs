import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { PERMISSIONS } from '../src/common/auth';
import { configureApp } from '../src/bootstrap';

import { hashPassword } from '../src/common/password';
import { AccessService } from '../src/client-hub/access.service';
import { PrivateStorageService } from '../src/client-hub/private-storage.service';
describe('client hub HTTP + PostgreSQL integration', () => {
  let app: INestApplication;
  let db: PrismaService;
  let jwt: JwtService;
  const ids: string[] = [];
  const roles: string[] = [];
  let tokenA: string, tokenB: string, tokenViewer: string, tokenWriter: string;
  let userWriter: string,
    userA: string,
    clientA: string,
    clientA2: string,
    clientB: string,
    reqB: string,
    fileB: string;
  const key = randomBytes(48).toString('hex');
  const suffix = randomUUID();
  const testPassword = randomBytes(18).toString('hex');
  const testEmail = 'integration-' + suffix + '@example.com';
  const storageBase = path.resolve('.data/integration');
  const storageRoot = path.join(storageBase, suffix);
  const content = {
    title: 'Portal requirement',
    objective: 'Collect and approve client requirements',
    services: ['Web app'],
    items: [
      {
        title: 'Brief form',
        description: 'Structured inputs',
        category: 'Feature',
        priority: 'HIGH',
        notes: '',
      },
      {
        title: 'Review workflow',
        description: 'Record approvals',
        category: 'Feature',
        priority: 'MUST_HAVE',
        notes: '',
      },
    ],
    budgetMin: '100.10',
    budgetMax: '900.25',
    currency: 'LKR',
    referenceLinks: ['https://example.com'],
  };
  const get = (url: string, token = tokenA) =>
    request(app.getHttpServer())
      .get('/api' + url)
      .set('Authorization', 'Bearer ' + token);
  const post = (url: string, body: object, token = tokenA) =>
    request(app.getHttpServer())
      .post('/api' + url)
      .set('Authorization', 'Bearer ' + token)
      .send(body);
  const patch = (url: string, body: object, token = tokenA) =>
    request(app.getHttpServer())
      .patch('/api' + url)
      .set('Authorization', 'Bearer ' + token)
      .send(body);
  const create = async () => {
    const result = await post('/clients/' + clientA + '/requirements', content);
    expect(result.status).toBe(201);
    return result.body.data;
  };
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !new URL(url).pathname.endsWith('_test'))
      throw new Error('A dedicated TEST_DATABASE_URL ending in _test is required');
    process.env.DATABASE_URL = url;
    process.env.JWT_SECRET = key;
    process.env.JWT_ISSUER = 'agencyos-integration';
    process.env.JWT_AUDIENCE = 'agencyos-integration';
    process.env.FRONTEND_URL = 'http://localhost:3000';
    process.env.NODE_ENV = 'test';
    process.env.DEMO_AUTH_ENABLED = 'true';
    process.env.MAX_FILE_BYTES = '1024';
    process.env.STORAGE_ROOT = storageRoot;
    const { AppModule } = await import('../src/app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    jwt = app.get(JwtService);
    for (const permission of PERMISSIONS)
      await db.permission.upsert({
        where: { key: permission },
        update: {},
        create: { key: permission, description: permission },
      });
    const makeUser = async (label: string, permissions: readonly string[], email?: string) => {
      const agency = await db.agency.create({
        data: { name: 'Integration ' + label + ' ' + suffix },
      });
      ids.push(agency.id);
      const role = await db.role.create({
        data: {
          agencyId: agency.id,
          name: 'Test ' + label,
          permissions: { create: permissions.map((permissionKey) => ({ permissionKey })) },
        },
      });
      roles.push(role.id);
      const user = await db.user.create({
        data: {
          agencyId: agency.id,
          roleId: role.id,
          email: email ?? label + '-' + suffix + '@example.com',
          displayName: label,
          passwordHash: hashPassword(testPassword),
        },
      });
      const token = await jwt.signAsync(
        { sub: user.id },
        {
          secret: key,
          algorithm: 'HS256',
          expiresIn: '5m',
          issuer: 'agencyos-integration',
          audience: 'agencyos-integration',
        },
      );
      return { token, user };
    };
    const a = await makeUser('A', PERMISSIONS, testEmail);
    tokenA = a.token;
    userA = a.user.id;
    const b = await makeUser('B', PERMISSIONS);
    tokenB = b.token;
    const viewerRole = await db.role.create({
      data: {
        agencyId: a.user.agencyId,
        name: 'Restricted viewer',
        permissions: { create: [{ permissionKey: 'client.read' }] },
      },
    });
    roles.push(viewerRole.id);
    const viewer = await db.user.create({
      data: {
        agencyId: a.user.agencyId,
        roleId: viewerRole.id,
        email: 'viewer-' + suffix + '@example.com',
        displayName: 'Viewer',
      },
    });
    tokenViewer = await jwt.signAsync(
      { sub: viewer.id },
      {
        secret: key,
        expiresIn: '5m',
        issuer: 'agencyos-integration',
        audience: 'agencyos-integration',
      },
    );
    const writerRole = await db.role.create({
      data: {
        agencyId: a.user.agencyId,
        name: 'Requirement writer',
        permissions: {
          create: ['client.read', 'requirement.read', 'requirement.write', 'file.read'].map(
            (permissionKey) => ({ permissionKey }),
          ),
        },
      },
    });
    roles.push(writerRole.id);
    const writer = await db.user.create({
      data: {
        agencyId: a.user.agencyId,
        roleId: writerRole.id,
        email: 'writer-' + suffix + '@example.com',
        displayName: 'Writer',
      },
    });
    userWriter = writer.id;
    tokenWriter = await jwt.signAsync(
      { sub: writer.id },
      {
        secret: key,
        expiresIn: '5m',
        issuer: 'agencyos-integration',
        audience: 'agencyos-integration',
      },
    );
    const firstClient = await post('/clients', {
      name: 'Agency A client',
      company: 'A Company',
      contactName: 'A contact',
    });
    expect({ status: firstClient.status, body: firstClient.body }).toMatchObject({
      status: 201,
      body: { success: true },
    });
    clientA = firstClient.body.data.id;
    clientA2 = (
      await post('/clients', {
        name: 'Other A client',
        company: 'A Other',
        contactName: 'Other contact',
      })
    ).body.data.id;
    clientB = (
      await post(
        '/clients',
        { name: 'Private B client', company: 'B Company', contactName: 'B contact' },
        tokenB,
      )
    ).body.data.id;
    const foreignRequirement = await post('/clients/' + clientB + '/requirements', content, tokenB);
    expect({ status: foreignRequirement.status, body: foreignRequirement.body }).toMatchObject({
      status: 201,
      body: { success: true },
    });
    reqB = foreignRequirement.body.data.id;
    fileB = (
      await post(
        '/clients/' + clientB + '/files',
        { originalName: 'B reference', referenceUrl: 'https://example.com', requirementId: reqB },
        tokenB,
      )
    ).body.data.id;
  });
  afterAll(async () => {
    if (db && ids.length)
      await db.$transaction(async (tx) => {
        const where = { agencyId: { in: ids } };
        await tx.auditLog.deleteMany({ where });
        await tx.clientFile.deleteMany({ where });
        await tx.clientCommunication.deleteMany({ where });
        await tx.clientNote.deleteMany({ where });
        await tx.requirementRevision.deleteMany({ where });
        await tx.requirementItem.deleteMany({ where });
        await tx.clientRequirement.deleteMany({ where });
        await tx.client.deleteMany({ where });
        await tx.user.deleteMany({ where });
        await tx.rolePermission.deleteMany({ where: { roleId: { in: roles } } });
        await tx.role.deleteMany({ where });
        await tx.agency.deleteMany({ where: { id: { in: ids } } });
      });
    if (app) await app.close();
    if (path.dirname(storageRoot) !== storageBase) throw new Error('Unsafe test cleanup path');
    rmSync(storageRoot, { recursive: true, force: true });
  });
  it('returns exact success and safe error envelopes', async () => {
    const ok = await get('/clients');
    expect(Object.keys(ok.body).sort()).toEqual(['data', 'message', 'success']);
    expect(ok.body.success).toBe(true);
    const bad = await get('/clients/' + randomUUID() + '/hub');
    expect(bad.status).toBe(404);
    expect(Object.keys(bad.body).sort()).toEqual(['code', 'details', 'message', 'success']);
    expect(JSON.stringify(bad.body)).not.toMatch(/Prisma|stack|passwordHash/);
  });
  it('requires authentication and rejects forged tokens', async () => {
    expect((await request(app.getHttpServer()).get('/api/clients')).status).toBe(401);
    const forged = await jwt.signAsync(
      { sub: userA },
      { secret: randomBytes(48).toString('hex'), expiresIn: '5m' },
    );
    expect((await get('/clients', forged)).status).toBe(401);
  });
  it('rejects expired and wrong-audience JWTs', async () => {
    for (const options of [
      { expiresIn: -1, audience: 'agencyos-integration' },
      { expiresIn: 300, audience: 'wrong' },
    ]) {
      const token = await jwt.signAsync(
        { sub: userA },
        { secret: key, issuer: 'agencyos-integration', ...options },
      );
      expect((await get('/clients', token)).status).toBe(401);
    }
  });
  it('rejects signed JWTs with an invalid UUID subject', async () => {
    const token = await jwt.signAsync(
      { sub: '-'.repeat(36) },
      {
        secret: key,
        issuer: 'agencyos-integration',
        audience: 'agencyos-integration',
        expiresIn: '5m',
      },
    );
    expect((await get('/clients', token)).status).toBe(401);
  });
  it('rejects URL credentials and unknown communication dates', async () => {
    expect(
      (
        await post('/clients', {
          name: 'Bad URL',
          company: 'Bad URL',
          contactName: 'Contact',
          website: 'https://user:pass@example.com',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post('/clients/' + clientA + '/communications', {
          type: 'CALL',
          subject: 'Bad date',
          summary: 'Bad date',
          occurredAt: 'yesterday',
        })
      ).status,
    ).toBe(400);
  });
  it('loads tenant and permissions from the database, ignoring JWT claims', async () => {
    const foreign = await db.client.findUniqueOrThrow({ where: { id: clientB } });
    const token = await jwt.signAsync(
      { sub: userA, agencyId: foreign.agencyId, permissions: [] },
      {
        secret: key,
        expiresIn: '5m',
        issuer: 'agencyos-integration',
        audience: 'agencyos-integration',
      },
    );
    expect((await get('/clients/' + clientA + '/hub', token)).status).toBe(200);
    expect((await get('/clients/' + clientB + '/hub', token)).status).toBe(404);
  });
  it('rejects disabled users immediately', async () => {
    await db.user.update({ where: { id: userA }, data: { active: false } });
    expect((await get('/clients')).status).toBe(401);
    await db.user.update({ where: { id: userA }, data: { active: true } });
  });
  it('enforces permission guards and omits forbidden hub sections', async () => {
    expect(
      (
        await post(
          '/clients',
          { name: 'Blocked', company: 'Blocked', contactName: 'Blocked' },
          tokenViewer,
        )
      ).status,
    ).toBe(403);
    expect((await get('/clients/' + clientA + '/requirements', tokenViewer)).status).toBe(403);
    const hub = (await get('/clients/' + clientA + '/hub', tokenViewer)).body.data;
    for (const key of ['requirements', 'communications', 'notes', 'files', 'timeline'])
      expect(hub[key]).toBeNull();
  });
  it('allows writers to submit but reserves review and confirmation for reviewers', async () => {
    const r = await create();
    expect(
      (
        await patch(
          '/requirements/' + r.id + '/status',
          { status: 'UNDER_REVIEW', expectedVersion: r.lockVersion },
          tokenWriter,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await patch(
          '/requirements/' + r.id + '/status',
          { status: 'CONFIRMED', expectedVersion: 2 },
          tokenWriter,
        )
      ).status,
    ).toBe(403);
    const detail = (await get('/requirements/' + r.id, tokenWriter)).body.data;
    expect(detail.allowedTransitions).toEqual([]);
    expect(detail.history).toBeNull();
    expect(detail.notes).toBeNull();
    expect(detail.communications).toBeNull();
  });
  it('supports seeded login without returning a password hash', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: testEmail, password: testPassword });
    expect(response.status).toBe(201);
    expect(typeof response.body.data.accessToken).toBe('string');
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    const wrong = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: testEmail, password: randomBytes(12).toString('hex') });
    expect(wrong.status).toBe(401);
  });
  it('searches and paginates without cross-tenant leakage', async () => {
    const result = await get('/clients?q=Company&limit=1&page=1');
    expect(result.body.data.items).toHaveLength(1);
    expect(result.body.data.total).toBe(1);
    expect((await get('/clients?q=Private%20B')).body.data.total).toBe(0);
    expect((await get('/clients?limit=101')).status).toBe(400);
    expect((await get('/clients?agencyId=' + ids[1])).status).toBe(400);
  });
  it('rejects browser tenant fields and unknown nested properties', async () => {
    expect(
      (await post('/clients/' + clientA + '/requirements', { ...content, agencyId: ids[1] }))
        .status,
    ).toBe(400);
    expect(
      (
        await post('/clients/' + clientA + '/requirements', {
          ...content,
          items: [{ title: 'Item', agencyId: ids[1] }],
        })
      ).status,
    ).toBe(400);
  });
  it('validates money, dates, URLs and required structured items', async () => {
    for (const changes of [
      { budgetMin: '900.26' },
      { budgetMin: 1.25 },
      { currency: null },
      { targetDate: '2026-02-30' },
      { referenceLinks: ['javascript:alert(1)'] },
      { items: [] },
      { title: '   ' },
    ])
      expect(
        (await post('/clients/' + clientA + '/requirements', { ...content, ...changes })).status,
      ).toBe(400);
  });
  it('creates, reads, edits and reorders multiple requirement items', async () => {
    const created = await create();
    const result = await patch('/requirements/' + created.id, {
      ...content,
      title: 'Updated portal',
      items: [content.items[1], { ...content.items[0], notes: 'Clarified' }],
      expectedVersion: created.lockVersion,
    });
    expect(result.status).toBe(200);
    expect(result.body.data.items.map((i: { title: string }) => i.title)).toEqual([
      'Review workflow',
      'Brief form',
    ]);
    expect(result.body.data.budgetMin).toBe('100.1');
    const read = await get('/requirements/' + created.id);
    expect(read.body.data.title).toBe('Updated portal');
    expect(read.body.data.preparedBy.id).toBe(userA);
  });
  it('adds and removes items while preserving contiguous order', async () => {
    const r = await create();
    const edited = await patch('/requirements/' + r.id, {
      ...content,
      items: [content.items[1], { title: 'Added feature', priority: 'LOW' }],
      expectedVersion: r.lockVersion,
    });
    expect(edited.status).toBe(200);
    expect(
      edited.body.data.items.map((item: { title: string; position: number }) => [
        item.title,
        item.position,
      ]),
    ).toEqual([
      ['Review workflow', 0],
      ['Added feature', 1],
    ]);
  });
  it('makes archived clients read-only while retaining their history', async () => {
    const client = (
      await post('/clients', {
        name: 'Archived test client',
        company: 'Archived test company',
        contactName: 'Contact',
      })
    ).body.data;
    expect(
      (
        await patch('/clients/' + client.id, {
          name: client.name,
          company: client.company,
          contactName: client.contactName,
          status: 'ARCHIVED',
        })
      ).status,
    ).toBe(200);
    expect((await get('/clients/' + client.id + '/hub')).status).toBe(200);
    expect((await post('/clients/' + client.id + '/requirements', content)).status).toBe(409);
    expect((await post('/clients/' + client.id + '/notes', { body: 'Attempt' })).status).toBe(409);
  });
  it('prevents stale/concurrent edits and preserves item consistency', async () => {
    const r = await create();
    const results = await Promise.all([
      patch('/requirements/' + r.id, { ...content, title: 'First editor', expectedVersion: 1 }),
      patch('/requirements/' + r.id, { ...content, title: 'Second editor', expectedVersion: 1 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const record = (await get('/requirements/' + r.id)).body.data;
    expect(record.items).toHaveLength(2);
    expect(record.lockVersion).toBe(2);
  });
  it('controls confirmation, preserves snapshots across revisions and archives history', async () => {
    let r = await create();
    expect(
      (
        await patch('/requirements/' + r.id + '/status', {
          status: 'CONFIRMED',
          expectedVersion: 1,
        })
      ).status,
    ).toBe(409);
    expect((await get('/requirements/' + r.id + '/export')).status).toBe(409);
    r = (
      await patch('/requirements/' + r.id + '/status', {
        status: 'UNDER_REVIEW',
        expectedVersion: r.lockVersion,
      })
    ).body.data;
    expect(
      (await patch('/requirements/' + r.id, { ...content, expectedVersion: r.lockVersion })).status,
    ).toBe(409);
    r = (
      await patch('/requirements/' + r.id + '/status', {
        status: 'CONFIRMED',
        expectedVersion: r.lockVersion,
      })
    ).body.data;
    expect(r.confirmedById).toBe(userA);
    expect(r.confirmedAt).toBeTruthy();
    const snapshot = (await get('/requirements/' + r.id + '/export')).body.data;
    expect(snapshot.version).toBe(1);
    expect(snapshot.items).toHaveLength(2);
    expect(
      (await patch('/requirements/' + r.id, { ...content, expectedVersion: r.lockVersion })).status,
    ).toBe(409);
    expect(
      (
        await patch('/requirements/' + r.id + '/status', {
          status: 'DRAFT',
          expectedVersion: r.lockVersion,
        })
      ).status,
    ).toBe(400);
    r = (
      await patch('/requirements/' + r.id + '/status', {
        status: 'DRAFT',
        reason: 'Client requested a revision',
        expectedVersion: r.lockVersion,
      })
    ).body.data;
    expect(r.version).toBe(2);
    expect(r.confirmedAt).toBeNull();
    expect((await get('/requirements/' + r.id + '/export')).status).toBe(409);
    expect((await get('/requirements/' + r.id + '/export?version=1')).body.data).toEqual(snapshot);
    r = (
      await patch('/requirements/' + r.id, {
        ...content,
        title: 'Revision two',
        expectedVersion: r.lockVersion,
      })
    ).body.data;
    r = (
      await patch('/requirements/' + r.id + '/status', {
        status: 'UNDER_REVIEW',
        expectedVersion: r.lockVersion,
      })
    ).body.data;
    r = (
      await patch('/requirements/' + r.id + '/status', {
        status: 'CONFIRMED',
        expectedVersion: r.lockVersion,
      })
    ).body.data;
    expect((await get('/requirements/' + r.id + '/export')).body.data.title).toBe('Revision two');
    expect((await get('/requirements/' + r.id + '/export?version=1')).body.data).toEqual(snapshot);
    const detail = (await get('/requirements/' + r.id)).body.data;
    expect(detail.revisions).toHaveLength(2);
    r = (
      await patch('/requirements/' + r.id + '/status', {
        status: 'ARCHIVED',
        reason: 'Initiative ended',
        expectedVersion: r.lockVersion,
      })
    ).body.data;
    expect((await get('/requirements/' + r.id)).status).toBe(200);
    expect((await get('/requirements/' + r.id + '/export?version=2')).status).toBe(200);
    expect(
      (
        await patch('/requirements/' + r.id + '/status', {
          status: 'DRAFT',
          reason: 'Attempt',
          expectedVersion: r.lockVersion,
        })
      ).status,
    ).toBe(409);
  });
  it('supports change requests and resubmission', async () => {
    let r = await create();
    r = (
      await patch('/requirements/' + r.id + '/status', {
        status: 'UNDER_REVIEW',
        expectedVersion: r.lockVersion,
      })
    ).body.data;
    r = (
      await patch('/requirements/' + r.id + '/status', {
        status: 'CHANGES_REQUESTED',
        expectedVersion: r.lockVersion,
        reason: 'Clarify scope',
      })
    ).body.data;
    expect(r.status).toBe('CHANGES_REQUESTED');
    expect(
      (await patch('/requirements/' + r.id, { ...content, expectedVersion: r.lockVersion })).status,
    ).toBe(200);
  });
  it.each(['hub', 'requirements', 'communications', 'files', 'timeline', 'notes'])(
    'rejects foreign client %s reads',
    async (resource) => {
      const response = await get('/clients/' + clientB + '/' + resource);
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('NOT_FOUND');
    },
  );
  it.each(['', '/export'])('rejects foreign requirement reads %s', async (sub) =>
    expect((await get('/requirements/' + reqB + sub)).status).toBe(404),
  );
  it.each([
    ['notes', { body: 'Foreign note' }],
    [
      'communications',
      {
        type: 'CALL',
        subject: 'Foreign call',
        summary: 'Foreign call',
        occurredAt: new Date().toISOString(),
      },
    ],
    ['files', { originalName: 'Foreign reference', referenceUrl: 'https://example.com' }],
  ])('rejects creating %s on a foreign client', async (resource, body) =>
    expect((await post('/clients/' + clientB + '/' + resource, body)).status).toBe(404),
  );
  it('rejects foreign mutations, file access and deletion', async () => {
    expect((await post('/clients/' + clientB + '/requirements', content)).status).toBe(404);
    expect((await patch('/requirements/' + reqB, { ...content, expectedVersion: 1 })).status).toBe(
      404,
    );
    expect(
      (
        await patch('/requirements/' + reqB + '/status', {
          status: 'UNDER_REVIEW',
          expectedVersion: 1,
        })
      ).status,
    ).toBe(404);
    expect((await get('/files/' + fileB + '/download')).status).toBe(404);
    expect(
      (
        await request(app.getHttpServer())
          .delete('/api/files/' + fileB)
          .set('Authorization', 'Bearer ' + tokenA)
      ).status,
    ).toBe(404);
  });
  it('validates related client/requirement consistency for notes, communications and references', async () => {
    for (const id of [reqB, (await create()).id]) {
      const client = id === reqB ? clientA : clientA2;
      expect(
        (await post('/clients/' + client + '/notes', { body: 'Wrong link', requirementId: id }))
          .status,
      ).toBe(404);
      expect(
        (
          await post('/clients/' + client + '/communications', {
            type: 'CALL',
            subject: 'Wrong',
            summary: 'Wrong',
            occurredAt: new Date().toISOString(),
            requirementId: id,
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await post('/clients/' + client + '/files', {
            originalName: 'Wrong',
            referenceUrl: 'https://example.com',
            requirementId: id,
          })
        ).status,
      ).toBe(404);
    }
  });
  it('records and filters manual communication occurrence time separately from creation', async () => {
    const r = await create();
    const occurredAt = '2024-01-02T10:00:00.000Z';
    const result = await post('/clients/' + clientA + '/communications', {
      type: 'CALL',
      subject: 'Historic discovery call',
      summary: 'Discussed scope',
      occurredAt,
      participants: ['Client'],
      followUp: 'Send brief',
      requirementId: r.id,
    });
    expect(result.status).toBe(201);
    expect(result.body.data.occurredAt).toBe(occurredAt);
    expect(result.body.data.createdAt).not.toBe(occurredAt);
    const list = await get(
      '/clients/' + clientA + '/communications?type=CALL&from=2024-01-01&to=2024-02-01&q=Historic',
    );
    expect(list.body.data.total).toBe(1);
    expect((await get('/clients/' + clientA2 + '/communications')).body.data.total).toBe(0);
    expect(
      (await get('/clients/' + clientA + '/communications?from=2025-01-01&to=2024-01-01')).status,
    ).toBe(400);
  });
  it('uploads private bytes, rejects spoofing, archives metadata and keeps history private', async () => {
    const r = await create();
    const upload = await request(app.getHttpServer())
      .post('/api/clients/' + clientA + '/files/upload')
      .set('Authorization', 'Bearer ' + tokenA)
      .field('requirementId', r.id)
      .attach('file', Buffer.from('Client brief'), {
        filename: 'brief.txt',
        contentType: 'text/plain',
      });
    expect(upload.status).toBe(201);
    expect(upload.body.data.storageKey).toBeUndefined();
    const id = upload.body.data.id;
    const download = await get('/files/' + id + '/download');
    expect(download.status).toBe(200);
    expect(download.text).toBe('Client brief');
    expect(download.headers['content-disposition']).toContain('attachment');
    expect((await get('/files/' + id + '/download', tokenB)).status).toBe(404);
    const spoof = await request(app.getHttpServer())
      .post('/api/clients/' + clientA + '/files/upload')
      .set('Authorization', 'Bearer ' + tokenA)
      .attach('file', Buffer.from('<html>bad</html>'), {
        filename: 'fake.pdf',
        contentType: 'application/pdf',
      });
    expect(spoof.status).toBe(400);
    const huge = await request(app.getHttpServer())
      .post('/api/clients/' + clientA + '/files/upload')
      .set('Authorization', 'Bearer ' + tokenA)
      .attach('file', Buffer.alloc(1025, 65), { filename: 'huge.txt', contentType: 'text/plain' });
    expect(huge.status).toBe(413);
    const archived = await request(app.getHttpServer())
      .delete('/api/files/' + id)
      .set('Authorization', 'Bearer ' + tokenA);
    expect(archived.status).toBe(200);
    const list = await get('/clients/' + clientA + '/files');
    expect(list.body.data.items.some((f: { id: string }) => f.id === id)).toBe(false);
    expect(
      (await get('/clients/' + clientA + '/files?includeArchived=true')).body.data.items.some(
        (f: { id: string }) => f.id === id,
      ),
    ).toBe(true);
  });
  it('prevents modifying references attached to confirmed content', async () => {
    let r = await create();
    const file = (
      await post('/clients/' + clientA + '/files', {
        originalName: 'Agreed reference',
        referenceUrl: 'https://example.com',
        requirementId: r.id,
      })
    ).body.data;
    r = (
      await patch('/requirements/' + r.id + '/status', {
        status: 'UNDER_REVIEW',
        expectedVersion: r.lockVersion,
      })
    ).body.data;
    r = (
      await patch('/requirements/' + r.id + '/status', {
        status: 'CONFIRMED',
        expectedVersion: r.lockVersion,
      })
    ).body.data;
    expect(
      (
        await post('/clients/' + clientA + '/files', {
          originalName: 'New reference',
          referenceUrl: 'https://example.com',
          requirementId: r.id,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app.getHttpServer())
          .delete('/api/files/' + file.id)
          .set('Authorization', 'Bearer ' + tokenA)
      ).status,
    ).toBe(409);
    expect((await get('/requirements/' + r.id + '/export')).body.data.references[0].id).toBe(
      file.id,
    );
  });
  it('builds a unified hub and a chronological actor-attributed timeline', async () => {
    const note = await post('/clients/' + clientA + '/notes', { body: 'Internal only' });
    expect(note.status).toBe(201);
    const hub = (await get('/clients/' + clientA + '/hub')).body.data;
    expect(hub.client.id).toBe(clientA);
    expect(hub.notes.length).toBeGreaterThan(0);
    expect(hub.relatedRecords.every((r: { available: boolean }) => !r.available)).toBe(true);
    const timeline = (await get('/clients/' + clientA + '/timeline?sort=oldest&limit=100')).body
      .data.items;
    expect(timeline[0].eventType).toBe('CLIENT_CREATED');
    expect(
      timeline.every((event: { actor: { id: string } }) =>
        [userA, userWriter].includes(event.actor.id),
      ),
    ).toBe(true);
    expect(timeline.some((event: { actor: { id: string } }) => event.actor.id === userWriter)).toBe(
      true,
    );
    const dates = timeline.map((event: { createdAt: string }) => event.createdAt);
    expect(dates).toEqual([...dates].sort());
  });

  describe('Day 2 requirement contract', () => {
    it('paginates, searches objectives case-insensitively and filters status within one client', async () => {
      const marker = 'filter-' + randomUUID();
      let reviewed = (
        await post('/clients/' + clientA + '/requirements', {
          ...content,
          title: marker + ' approved',
        })
      ).body.data;
      reviewed = (
        await patch('/requirements/' + reviewed.id + '/status', {
          status: 'UNDER_REVIEW',
          expectedVersion: reviewed.lockVersion,
        })
      ).body.data;
      await patch('/requirements/' + reviewed.id + '/status', {
        status: 'CONFIRMED',
        expectedVersion: reviewed.lockVersion,
      });
      await post('/clients/' + clientA + '/requirements', { ...content, title: marker + ' draft' });
      await post('/clients/' + clientA + '/requirements', {
        ...content,
        title: 'Objective-only match',
        objective: marker,
      });
      await post('/clients/' + clientA2 + '/requirements', {
        ...content,
        title: marker + ' other client',
      });
      await post(
        '/clients/' + clientB + '/requirements',
        { ...content, title: marker + ' foreign' },
        tokenB,
      );
      const path =
        '/clients/' +
        clientA +
        '/requirements?q=' +
        marker.toUpperCase() +
        '&status=DRAFT&limit=1&sort=oldest&page=';
      const first = (await get(path + '1')).body.data;
      const second = (await get(path + '2')).body.data;
      expect(first).toMatchObject({ total: 2, page: 1, limit: 1, totalPages: 2 });
      expect(second).toMatchObject({ total: 2, page: 2, totalPages: 2 });
      expect(first.items).toHaveLength(1);
      expect(second.items).toHaveLength(1);
      expect(first.items[0].id).not.toBe(second.items[0].id);
      for (const item of [...first.items, ...second.items]) {
        expect(item.clientId).toBe(clientA);
        expect(item.agencyId).toBe(ids[0]);
        expect(item.status).toBe('DRAFT');
      }
      expect((await get(path + '3')).body.data.items).toEqual([]);
      const approved = (
        await get('/clients/' + clientA + '/requirements?q=' + marker + '&status=CONFIRMED')
      ).body.data;
      expect(approved.total).toBe(1);
      expect(approved.items[0].id).toBe(reviewed.id);
    });

    it.each([
      'status=APPROVED',
      'page=0',
      'page=-1',
      'limit=0',
      'limit=101',
      'sort=title',
      'unknown=true',
    ])('rejects invalid requirement query %s', async (query) => {
      const result = await get('/clients/' + clientA + '/requirements?' + query);
      expect(result.status).toBe(400);
      expect(result.body.code).toBe('VALIDATION_ERROR');
    });

    it('supports optional expectations and preserves high-precision budgets with separate internal context', async () => {
      const minimal = await post('/clients/' + clientA + '/requirements', {
        title: 'Minimal brief',
        objective: 'Capture scope',
        items: [{ title: 'Intake form' }],
      });
      expect(minimal.status).toBe(201);
      expect(minimal.body.data).toMatchObject({
        budgetMin: null,
        budgetMax: null,
        currency: null,
        targetDate: null,
        timeline: '',
        assumptions: '',
        clientNotes: '',
        confirmedById: null,
        confirmedAt: null,
      });
      const precise = await post('/clients/' + clientA + '/requirements', {
        ...content,
        budgetMin: '9999999999999999.98',
        budgetMax: '9999999999999999.99',
        targetDate: '2028-02-29',
        timeline: 'Client expectation: eight weeks, subject to review.',
        clientNotes: 'Client fact: supplied content is approved.',
        assumptions: 'Internal assumption: identity integration will be available.',
        internalRecommendations: 'Validate identity integration during review.',
      });
      expect(precise.status).toBe(201);
      const read = (await get('/requirements/' + precise.body.data.id)).body.data;
      expect(read.budgetMin).toBe('9999999999999999.98');
      expect(read.budgetMax).toBe('9999999999999999.99');
      expect(read.targetDate).toBe('2028-02-29T00:00:00.000Z');
      expect(read.clientNotes).toBe('Client fact: supplied content is approved.');
      expect(read.assumptions).toBe('Internal assumption: identity integration will be available.');
      expect(read.timeline).toContain('Client expectation');
    });

    it.each([
      { targetDate: '2027-02-29' },
      { targetDate: '2026-13-01' },
      { targetDate: '2026-01-01T12:00:00Z' },
      { budgetMin: '-1.00' },
      { budgetMin: '1.001' },
      { budgetMax: '10000000000000000.00' },
      { currency: 'lkr' },
      { referenceLinks: ['https://user:secret@example.com'] },
      { items: [{ title: 'Invalid priority', priority: 'URGENT' }] },
    ])('rejects invalid requirement data %j without writes', async (changes) => {
      const count = await db.clientRequirement.count({ where: { agencyId: ids[0] } });
      const result = await post('/clients/' + clientA + '/requirements', {
        ...content,
        ...changes,
      });
      expect(result.status).toBe(400);
      expect(await db.clientRequirement.count({ where: { agencyId: ids[0] } })).toBe(count);
      expect(JSON.stringify(result.body)).not.toMatch(/passwordHash|stack|Prisma/);
    });

    it.each(['preparedById', 'confirmedById', 'confirmedAt', 'createdAt', 'clientId', 'status'])(
      'rejects browser-controlled %s on create and edit',
      async (field) => {
        const r = await create();
        const spoof = field.endsWith('At')
          ? '2020-01-01T00:00:00Z'
          : field === 'status'
            ? 'CONFIRMED'
            : clientA2;
        expect(
          (await post('/clients/' + clientA + '/requirements', { ...content, [field]: spoof }))
            .status,
        ).toBe(400);
        expect(
          (
            await patch('/requirements/' + r.id, {
              ...content,
              expectedVersion: r.lockVersion,
              [field]: spoof,
            })
          ).status,
        ).toBe(400);
        const current = (await get('/requirements/' + r.id)).body.data;
        expect(current.lockVersion).toBe(r.lockVersion);
        expect(current.preparedById).toBe(userA);
        expect(current.confirmedById).toBeNull();
      },
    );

    it('rejects malformed, foreign, wrong-client and existing item IDs and browser positions', async () => {
      const r = await create();
      const other = (await post('/clients/' + clientA2 + '/requirements', content)).body.data;
      const foreignItem = await db.requirementItem.findFirstOrThrow({
        where: { requirementId: reqB },
      });
      const before = await db.requirementItem.findMany({
        where: { requirementId: r.id },
        orderBy: { position: 'asc' },
      });
      for (const itemId of [
        'not-a-uuid',
        randomUUID(),
        foreignItem.id,
        other.items[0].id,
        r.items[0].id,
      ]) {
        const items = [{ ...content.items[0], id: itemId }];
        expect(
          (await post('/clients/' + clientA + '/requirements', { ...content, items })).status,
        ).toBe(400);
        expect(
          (
            await patch('/requirements/' + r.id, {
              ...content,
              items,
              expectedVersion: r.lockVersion,
            })
          ).status,
        ).toBe(400);
      }
      expect(
        (
          await patch('/requirements/' + r.id, {
            ...content,
            items: [{ ...content.items[0], position: 99 }],
            expectedVersion: r.lockVersion,
          })
        ).status,
      ).toBe(400);
      expect(
        await db.requirementItem.findMany({
          where: { requirementId: r.id },
          orderBy: { position: 'asc' },
        }),
      ).toEqual(before);
    });

    it.each([
      { status: 'APPROVED', expectedVersion: 1 },
      { status: null, expectedVersion: 1 },
      { status: 'UNDER_REVIEW', expectedVersion: 0 },
      { status: 'UNDER_REVIEW', expectedVersion: 1.5 },
      { status: 'UNDER_REVIEW', expectedVersion: '1' },
      { status: 'UNDER_REVIEW', expectedVersion: 2147483648 },
      { status: 'UNDER_REVIEW' },
    ])('rejects invalid status/version data %j', async (body) => {
      const r = await create();
      const result = await patch('/requirements/' + r.id + '/status', body);
      expect(result.status).toBe(400);
      expect(result.body.code).toBe('VALIDATION_ERROR');
      expect((await get('/requirements/' + r.id)).body.data).toMatchObject({
        status: 'DRAFT',
        lockVersion: 1,
        confirmedAt: null,
        confirmedById: null,
      });
    });

    it('requires reasons for archival and change requests without consuming a version', async () => {
      let r = await create();
      expect(
        (
          await patch('/requirements/' + r.id + '/status', {
            status: 'ARCHIVED',
            expectedVersion: r.lockVersion,
            reason: '   ',
          })
        ).body.code,
      ).toBe('REASON_REQUIRED');
      r = (
        await patch('/requirements/' + r.id + '/status', {
          status: 'UNDER_REVIEW',
          expectedVersion: r.lockVersion,
        })
      ).body.data;
      const denied = await patch('/requirements/' + r.id + '/status', {
        status: 'CHANGES_REQUESTED',
        expectedVersion: r.lockVersion,
        reason: '',
      });
      expect(denied.status).toBe(400);
      expect(denied.body.code).toBe('REASON_REQUIRED');
      expect((await get('/requirements/' + r.id)).body.data.lockVersion).toBe(r.lockVersion);
    });

    it('protects each requirement operation against anonymous and permission-denied calls', async () => {
      const r = await create();
      for (const token of [undefined, tokenViewer]) {
        const expected = token ? 403 : 401;
        const calls = [
          () => request(app.getHttpServer()).get('/api/clients/' + clientA + '/requirements'),
          () =>
            request(app.getHttpServer())
              .post('/api/clients/' + clientA + '/requirements')
              .send(content),
          () => request(app.getHttpServer()).get('/api/requirements/' + r.id),
          () =>
            request(app.getHttpServer())
              .patch('/api/requirements/' + r.id)
              .send({ ...content, expectedVersion: r.lockVersion }),
          () =>
            request(app.getHttpServer())
              .patch('/api/requirements/' + r.id + '/status')
              .send({ status: 'UNDER_REVIEW', expectedVersion: r.lockVersion }),
        ];
        for (const makeCall of calls) {
          const call = makeCall();
          if (token) call.set('Authorization', 'Bearer ' + token);
          expect((await call).status).toBe(expected);
        }
      }
      expect((await get('/requirements/' + r.id)).body.data.lockVersion).toBe(1);
    });

    it('isolates requirement reads and writes in both agency directions', async () => {
      const r = await create();
      for (const [foreignClient, foreignRequirement, token] of [
        [clientB, reqB, tokenA],
        [clientA, r.id, tokenB],
      ]) {
        const before = await db.clientRequirement.findUniqueOrThrow({
          where: { id: foreignRequirement },
        });
        expect((await get('/clients/' + foreignClient + '/requirements', token)).status).toBe(404);
        expect((await get('/requirements/' + foreignRequirement, token)).status).toBe(404);
        expect(
          (await post('/clients/' + foreignClient + '/requirements', content, token)).status,
        ).toBe(404);
        expect(
          (
            await patch(
              '/requirements/' + foreignRequirement,
              { ...content, expectedVersion: 1 },
              token,
            )
          ).status,
        ).toBe(404);
        expect(
          (
            await patch(
              '/requirements/' + foreignRequirement + '/status',
              {
                status: 'UNDER_REVIEW',
                expectedVersion: 1,
              },
              token,
            )
          ).status,
        ).toBe(404);
        expect(
          await db.clientRequirement.findUniqueOrThrow({ where: { id: foreignRequirement } }),
        ).toEqual(before);
      }
    });
  });

  describe('Day 2 transactional review and history', () => {
    it('uses the real preparer and reviewer and keeps client facts separate in the approved package', async () => {
      const created = await post(
        '/clients/' + clientA + '/requirements',
        {
          ...content,
          clientNotes: 'Client confirmed the content owner.',
          assumptions: 'Internal assumption: shared identity will be available.',
          internalRecommendations: 'Review the identity contract.',
        },
        tokenWriter,
      );
      expect(created.status).toBe(201);
      let r = created.body.data;
      expect(r.preparedById).toBe(userWriter);
      r = (
        await patch(
          '/requirements/' + r.id + '/status',
          {
            status: 'UNDER_REVIEW',
            expectedVersion: r.lockVersion,
          },
          tokenWriter,
        )
      ).body.data;
      const forged = await patch('/requirements/' + r.id + '/status', {
        status: 'CONFIRMED',
        expectedVersion: r.lockVersion,
        confirmedById: userWriter,
        confirmedAt: '2000-01-01T00:00:00Z',
      });
      expect(forged.status).toBe(400);
      const before = Date.now();
      const confirmed = await patch('/requirements/' + r.id + '/status', {
        status: 'CONFIRMED',
        expectedVersion: r.lockVersion,
      });
      expect(confirmed.status).toBe(200);
      r = confirmed.body.data;
      expect(r.confirmedById).toBe(userA);
      expect(r.preparedById).toBe(userWriter);
      expect(new Date(r.confirmedAt).getTime()).toBeGreaterThanOrEqual(before);
      expect(new Date(r.confirmedAt).getTime()).toBeLessThanOrEqual(Date.now());
      const snapshot = (await get('/requirements/' + r.id + '/export?version=1')).body.data;
      expect(snapshot.preparedBy.id).toBe(userWriter);
      expect(snapshot.confirmedBy.id).toBe(userA);
      expect(snapshot.confirmedAt).toBe(r.confirmedAt);
      expect(snapshot.clientProvided.notes).toBe('Client confirmed the content owner.');
      expect(snapshot.internal.assumptions).toBe(
        'Internal assumption: shared identity will be available.',
      );
      expect(snapshot.internal.recommendations).toBe('Review the identity contract.');
    });

    it('enforces same-agency wrong-client links and foreign preparer constraints in PostgreSQL', async () => {
      const r = await create();
      const wrongClient = await request(app.getHttpServer())
        .post('/api/clients/' + clientA2 + '/files/upload')
        .set('Authorization', 'Bearer ' + tokenA)
        .field('requirementId', r.id)
        .attach('file', Buffer.from('Wrong client'), {
          filename: 'brief.txt',
          contentType: 'text/plain',
        });
      expect(wrongClient.status).toBe(404);
      const foreignUser = await db.user.findFirstOrThrow({ where: { agencyId: ids[1] } });
      await expect(
        db.clientRequirement.update({
          where: { id: r.id },
          data: { preparedById: foreignUser.id },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
      await expect(
        db.clientNote.create({
          data: {
            agencyId: ids[0],
            clientId: clientA2,
            requirementId: r.id,
            createdById: userA,
            body: 'Invalid client relation',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
      expect((await get('/requirements/' + r.id)).body.data.preparedById).toBe(userA);
      expect(await db.clientFile.count({ where: { requirementId: r.id } })).toBe(0);
    });

    it.each(['create', 'edit', 'confirm'] as const)(
      'rolls back %s content, items, versions, snapshots and metadata when audit persistence fails',
      async (stage) => {
        let r = await create();
        if (stage === 'confirm')
          r = (
            await patch('/requirements/' + r.id + '/status', {
              status: 'UNDER_REVIEW',
              expectedVersion: r.lockVersion,
            })
          ).body.data;
        const read = () =>
          db.clientRequirement.findUniqueOrThrow({
            where: { id: r.id },
            include: { items: { orderBy: { position: 'asc' } } },
          });
        const counts = async () => ({
          requirements: await db.clientRequirement.count({ where: { agencyId: ids[0] } }),
          items: await db.requirementItem.count({ where: { agencyId: ids[0] } }),
          revisions: await db.requirementRevision.count({ where: { agencyId: ids[0] } }),
          activity: await db.auditLog.count({ where: { agencyId: ids[0] } }),
        });
        const before = await read();
        const beforeCounts = await counts();
        const audit = jest
          .spyOn(app.get(AccessService), 'audit')
          .mockRejectedValueOnce(new Error('Private audit persistence failure'));
        try {
          const response =
            stage === 'create'
              ? await post('/clients/' + clientA + '/requirements', {
                  ...content,
                  title: 'Must roll back ' + suffix,
                })
              : stage === 'edit'
                ? await patch('/requirements/' + r.id, {
                    ...content,
                    title: 'Must roll back',
                    items: [{ title: 'Replacement item' }],
                    expectedVersion: r.lockVersion,
                  })
                : await patch('/requirements/' + r.id + '/status', {
                    status: 'CONFIRMED',
                    expectedVersion: r.lockVersion,
                  });
          expect(response.status).toBe(500);
          expect(response.body).toMatchObject({
            success: false,
            code: 'INTERNAL_ERROR',
            details: {},
          });
          expect(JSON.stringify(response.body)).not.toMatch(/Private audit|stack|Prisma/);
        } finally {
          audit.mockRestore();
        }
        expect(await read()).toEqual(before);
        expect(await counts()).toEqual(beforeCounts);
      },
    );

    it('allows exactly one concurrent edit or submission and returns actionable conflict metadata', async () => {
      const r = await create();
      const results = await Promise.all([
        patch('/requirements/' + r.id, {
          ...content,
          title: 'Concurrent editor title',
          expectedVersion: 1,
        }),
        patch('/requirements/' + r.id + '/status', { status: 'UNDER_REVIEW', expectedVersion: 1 }),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
      const conflict = results.find((result) => result.status === 409)!;
      expect(['STALE_VERSION', 'CONFLICT']).toContain(conflict.body.code);
      expect(conflict.body.details).toMatchObject({
        requirementId: r.id,
        expectedVersion: 1,
        currentVersion: 2,
        reloadRequired: true,
      });
      const current = (await get('/requirements/' + r.id)).body.data;
      expect(current.lockVersion).toBe(2);
      expect(conflict.body.details.currentStatus).toBe(current.status);
      expect(current.items.map((item: { position: number }) => item.position)).toEqual([0, 1]);
      expect(
        await db.auditLog.count({ where: { entityType: 'requirement', entityId: r.id } }),
      ).toBe(2);
    });

    it('allows exactly one competing review decision and never duplicates an approved snapshot', async () => {
      let r = await create();
      r = (
        await patch('/requirements/' + r.id + '/status', {
          status: 'UNDER_REVIEW',
          expectedVersion: r.lockVersion,
        })
      ).body.data;
      const results = await Promise.all([
        patch('/requirements/' + r.id + '/status', {
          status: 'CONFIRMED',
          expectedVersion: r.lockVersion,
        }),
        patch('/requirements/' + r.id + '/status', {
          status: 'CHANGES_REQUESTED',
          reason: 'Clarify the client objective',
          expectedVersion: r.lockVersion,
        }),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
      const conflict = results.find((result) => result.status === 409)!;
      expect(conflict.body.details).toMatchObject({
        requirementId: r.id,
        expectedVersion: 2,
        currentVersion: 3,
        reloadRequired: true,
      });
      const current = (await get('/requirements/' + r.id)).body.data;
      expect(current.lockVersion).toBe(3);
      const count = await db.requirementRevision.count({ where: { requirementId: r.id } });
      expect(count).toBe(current.status === 'CONFIRMED' ? 1 : 0);
      expect(current.confirmedById).toBe(current.status === 'CONFIRMED' ? userA : null);
    });

    it('rejects delayed edits after confirmation and has no destructive requirement deletion route', async () => {
      let r = await create();
      r = (
        await patch('/requirements/' + r.id + '/status', {
          status: 'UNDER_REVIEW',
          expectedVersion: r.lockVersion,
        })
      ).body.data;
      r = (
        await patch('/requirements/' + r.id + '/status', {
          status: 'CONFIRMED',
          expectedVersion: r.lockVersion,
        })
      ).body.data;
      const snapshot = (await get('/requirements/' + r.id + '/export?version=1')).body.data;
      const stale = await patch('/requirements/' + r.id, {
        ...content,
        title: 'Delayed writer',
        expectedVersion: 1,
      });
      expect(stale.status).toBe(409);
      expect(stale.body).toMatchObject({
        code: 'STALE_VERSION',
        details: {
          expectedVersion: 1,
          currentVersion: r.lockVersion,
          currentStatus: 'CONFIRMED',
          reloadRequired: true,
        },
      });
      const locked = await patch('/requirements/' + r.id, {
        ...content,
        title: 'Direct overwrite',
        expectedVersion: r.lockVersion,
      });
      expect(locked.status).toBe(409);
      expect(locked.body.code).toBe('CONTENT_LOCKED');
      const deleted = await request(app.getHttpServer())
        .delete('/api/requirements/' + r.id)
        .set('Authorization', 'Bearer ' + tokenA);
      expect(deleted.status).toBe(404);
      expect((await get('/requirements/' + r.id + '/export?version=1')).body.data).toEqual(
        snapshot,
      );
      expect((await get('/requirements/' + r.id)).body.data.status).toBe('CONFIRMED');
    });
  });

  describe('Day 3 communications, notes and bounded hub', () => {
    it.each(['CALL', 'EMAIL', 'MEETING', 'WHATSAPP_MESSAGE', 'VIDEO_MEETING', 'OTHER'])(
      'manually records %s with occurrence, participants, follow-up and trusted creator',
      async (type) => {
        const r = await create();
        const response = await post('/clients/' + clientA + '/communications', {
          type,
          subject: 'Manual ' + type,
          summary: 'Client scope discussion',
          occurredAt: '2024-06-01T10:30:00+05:30',
          participants: ['Client contact', 'Reviewer'],
          followUp: 'Clarify the scope',
          requirementId: r.id,
        });
        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({
          type,
          subject: 'Manual ' + type,
          participants: ['Client contact', 'Reviewer'],
          followUp: 'Clarify the scope',
          createdById: userA,
          requirementId: r.id,
          occurredAt: '2024-06-01T05:00:00.000Z',
        });
        expect(response.body.data.createdAt).not.toBe(response.body.data.occurredAt);
        const filtered = await get(
          '/clients/' + clientA + '/communications?type=' + type + '&requirementId=' + r.id,
        );
        expect(filtered.body.data.total).toBe(1);
      },
    );
    it('uses inclusive UTC date-only bounds, exact timestamp bounds and paginated type filters', async () => {
      const r = await create();
      for (const [type, occurredAt] of [
        ['CALL', '2024-05-01T00:00:00.000Z'],
        ['CALL', '2024-05-01T23:59:59.999Z'],
        ['EMAIL', '2024-05-02T00:00:00.000Z'],
      ])
        await post('/clients/' + clientA + '/communications', {
          type,
          subject: 'Date range ' + r.id,
          summary: 'Manual discussion',
          occurredAt,
          requirementId: r.id,
        });
      const base = '/clients/' + clientA + '/communications?requirementId=' + r.id;
      const first = (
        await get(base + '&type=CALL&from=2024-05-01&to=2024-05-01&limit=1&page=1&sort=oldest')
      ).body.data;
      const second = (
        await get(base + '&type=CALL&from=2024-05-01&to=2024-05-01&limit=1&page=2&sort=oldest')
      ).body.data;
      expect(first).toMatchObject({ total: 2, totalPages: 2, limit: 1 });
      expect(first.items[0].id).not.toBe(second.items[0].id);
      expect(second.items[0].occurredAt).toBe('2024-05-01T23:59:59.999Z');
      expect((await get(base + '&to=2024-05-01T00:00:00.000Z')).body.data.total).toBe(1);
      expect((await get(base + '&from=2024-05-02&to=2024-05-01')).body.code).toBe(
        'INVALID_DATE_RANGE',
      );
    });
    it.each(['2024-06-01', '2024-06-01T10:30:00', '2024-02-30T10:00:00Z', 'yesterday'])(
      'rejects ambiguous or invalid communication occurrence %s',
      async (occurredAt) => {
        expect(
          (
            await post('/clients/' + clientA + '/communications', {
              type: 'CALL',
              subject: 'Invalid occurrence',
              summary: 'Invalid',
              occurredAt,
            })
          ).status,
        ).toBe(400);
      },
    );
    it('keeps internal notes distinct and filters requirement discussion without leaking wrong-client links', async () => {
      const r = await create();
      const before = await db.clientCommunication.count({ where: { clientId: clientA } });
      const note = await post('/clients/' + clientA + '/notes', {
        body: 'Internal assumption to validate during review',
        requirementId: r.id,
      });
      expect(note.status).toBe(201);
      expect(note.body.data).toMatchObject({ createdById: userA, requirementId: r.id });
      const notes = (
        await get('/clients/' + clientA + '/notes?requirementId=' + r.id + '&q=assumption&limit=1')
      ).body.data;
      expect(notes.total).toBe(1);
      expect(notes.items[0].body).toContain('Internal assumption');
      expect(await db.clientCommunication.count({ where: { clientId: clientA } })).toBe(before);
      for (const resource of ['notes', 'communications', 'files']) {
        expect(
          (await get('/clients/' + clientA2 + '/' + resource + '?requirementId=' + r.id)).status,
        ).toBe(404);
        expect(
          (await get('/clients/' + clientA + '/' + resource + '?requirementId=' + reqB)).status,
        ).toBe(404);
      }
      expect(
        (
          await post('/clients/' + clientA + '/notes', {
            body: 'Spoofed',
            createdById: userWriter,
          })
        ).status,
      ).toBe(400);
    });
    it('returns bounded summaries and exact permission-gated counts without fabricated related records', async () => {
      const client = (
        await post('/clients', {
          name: 'Bounded hub ' + suffix,
          company: 'Bounded',
          contactName: 'Contact',
        })
      ).body.data;
      const fileIds: string[] = [];
      for (let i = 0; i < 12; i++) {
        expect(
          (
            await post('/clients/' + client.id + '/requirements', {
              ...content,
              title: 'Brief ' + i,
            })
          ).status,
        ).toBe(201);
        expect(
          (
            await post('/clients/' + client.id + '/communications', {
              type: 'MEETING',
              subject: 'Discussion ' + i,
              summary: 'Scope',
              occurredAt: '2024-07-01T12:00:00Z',
            })
          ).status,
        ).toBe(201);
        expect(
          (await post('/clients/' + client.id + '/notes', { body: 'Internal note ' + i })).status,
        ).toBe(201);
        const reference = await post('/clients/' + client.id + '/files', {
          originalName: 'Reference ' + i,
          referenceUrl: 'https://example.com/' + i,
        });
        expect(reference.status).toBe(201);
        fileIds.push(reference.body.data.id);
      }
      expect(
        (
          await request(app.getHttpServer())
            .delete('/api/files/' + fileIds[0])
            .set('Authorization', 'Bearer ' + tokenA)
        ).status,
      ).toBe(200);
      const response = await get('/clients/' + client.id + '/hub');
      expect(response.status).toBe(200);
      const hub = response.body.data;
      expect(hub.summaryLimit).toBe(10);
      expect(hub.counts).toMatchObject({
        requirements: 12,
        communications: 12,
        notes: 12,
        files: 11,
      });
      expect(hub.counts.timeline).toBe(await db.auditLog.count({ where: { clientId: client.id } }));
      for (const section of ['requirements', 'communications', 'notes', 'files', 'timeline'])
        expect(hub[section]).toHaveLength(10);
      expect(
        hub.relatedRecords.every(
          (provider: { available: boolean }) => provider.available === false,
        ),
      ).toBe(true);
      const restricted = (await get('/clients/' + client.id + '/hub', tokenViewer)).body.data;
      for (const section of ['requirements', 'communications', 'notes', 'files', 'timeline']) {
        expect(restricted[section]).toBeNull();
        expect(restricted.counts[section]).toBeNull();
      }
    });
    it('records each business event and paginates equal timestamps deterministically', async () => {
      const client = (
        await post('/clients', {
          name: 'Activity ' + suffix,
          company: 'Activity',
          contactName: 'Contact',
        })
      ).body.data;
      await patch('/clients/' + client.id, {
        name: client.name,
        company: 'Updated activity',
        contactName: 'Contact',
      });
      let r = (await post('/clients/' + client.id + '/requirements', content)).body.data;
      r = (
        await patch('/requirements/' + r.id, {
          ...content,
          title: 'Clarified brief',
          expectedVersion: r.lockVersion,
        })
      ).body.data;
      await post('/clients/' + client.id + '/notes', {
        body: 'Internal context',
        requirementId: r.id,
      });
      await post('/clients/' + client.id + '/communications', {
        type: 'CALL',
        subject: 'Discussion',
        summary: 'Scope',
        occurredAt: '2020-01-01T00:00:00Z',
        requirementId: r.id,
      });
      await post('/clients/' + client.id + '/files', {
        originalName: 'Reference',
        referenceUrl: 'https://example.com',
        requirementId: r.id,
      });
      await request(app.getHttpServer())
        .post('/api/clients/' + client.id + '/files/upload')
        .set('Authorization', 'Bearer ' + tokenA)
        .field('requirementId', r.id)
        .attach('file', Buffer.from('Private brief'), {
          filename: 'brief.txt',
          contentType: 'text/plain',
        });
      for (const status of ['UNDER_REVIEW', 'CHANGES_REQUESTED', 'UNDER_REVIEW', 'CONFIRMED']) {
        const changed = await patch('/requirements/' + r.id + '/status', {
          status,
          expectedVersion: r.lockVersion,
          ...(status === 'CHANGES_REQUESTED' ? { reason: 'Clarify scope' } : {}),
        });
        expect(changed.status).toBe(200);
        r = changed.body.data;
      }
      const events = await db.auditLog.findMany({ where: { clientId: client.id } });
      const types = events.map((event) => event.eventType);
      for (const type of [
        'CLIENT_CREATED',
        'CLIENT_UPDATED',
        'REQUIREMENT_CREATED',
        'REQUIREMENT_UPDATED',
        'REQUIREMENT_UNDER_REVIEW',
        'REQUIREMENT_CHANGES_REQUESTED',
        'REQUIREMENT_CONFIRMED',
        'NOTE_ADDED',
        'COMMUNICATION_ADDED',
        'REFERENCE_ADDED',
        'FILE_ADDED',
      ])
        expect(types).toContain(type);
      expect(
        events.every((event) => event.actorId === userA && event.createdAt instanceof Date),
      ).toBe(true);
      // Own fixture timestamps are tied deliberately to verify the UUID tie-break.
      await db.auditLog.updateMany({
        where: { clientId: client.id },
        data: { createdAt: new Date('2024-01-01T00:00:00Z') },
      });
      const orderedIds = events.map((event) => event.id).sort();
      const base = '/clients/' + client.id + '/timeline?sort=oldest&limit=3&page=';
      const first = (await get(base + '1')).body.data;
      const second = (await get(base + '2')).body.data;
      expect([...first.items, ...second.items].map((event: { id: string }) => event.id)).toEqual(
        orderedIds.slice(0, 6),
      );
      const newest = (await get('/clients/' + client.id + '/timeline?limit=3')).body.data;
      expect(newest.items.map((event: { id: string }) => event.id)).toEqual(
        orderedIds.reverse().slice(0, 3),
      );
      const hub = (await get('/clients/' + client.id + '/hub')).body.data;
      expect(hub.timeline.slice(0, 3).map((event: { id: string }) => event.id)).toEqual(
        newest.items.map((event: { id: string }) => event.id),
      );
    });
  });

  describe('Day 3 private files, atomic supporting writes and approved export', () => {
    it('stores safe file metadata and headers and denies unauthorized private bytes', async () => {
      const r = await create();
      const upload = await request(app.getHttpServer())
        .post('/api/clients/' + clientA + '/files/upload')
        .set('Authorization', 'Bearer ' + tokenA)
        .field('requirementId', r.id)
        .attach('file', Buffer.from('Client brief'), {
          filename: "O'Reilly (brief).txt",
          contentType: 'text/plain',
        });
      expect(upload.status).toBe(201);
      const file = upload.body.data;
      expect(file).toMatchObject({
        originalName: "O'Reilly (brief).txt",
        mimeType: 'text/plain',
        size: 12,
        clientId: clientA,
        requirementId: r.id,
        uploadedBy: { id: userA },
      });
      expect(file.createdAt).toBeTruthy();
      expect(file.storageKey).toBeUndefined();
      const download = await get('/files/' + file.id + '/download');
      expect(download.status).toBe(200);
      expect(download.text).toBe('Client brief');
      expect(download.headers['content-disposition']).toContain(
        "filename*=UTF-8''O%27Reilly%20%28brief%29.txt",
      );
      expect(download.headers['cache-control']).toContain('no-store');
      expect(download.headers['x-content-type-options']).toBe('nosniff');
      expect(
        (await request(app.getHttpServer()).get('/api/files/' + file.id + '/download')).status,
      ).toBe(401);
      expect((await get('/files/' + file.id + '/download', tokenViewer)).status).toBe(403);
      expect((await get('/files/' + file.id + '/download', tokenB)).status).toBe(404);
    });
    it('stores reference URLs without fetching them and distinguishes references from downloads', async () => {
      const r = await create();
      const fetch = jest
        .spyOn(global, 'fetch')
        .mockRejectedValue(new Error('No outbound fetch allowed'));
      try {
        const reference = await post('/clients/' + clientA + '/files', {
          originalName: 'Client research reference',
          referenceUrl: 'https://example.com/private-reference',
          requirementId: r.id,
        });
        expect(reference.status).toBe(201);
        expect(reference.body.data).toMatchObject({
          referenceUrl: 'https://example.com/private-reference',
          mimeType: null,
          size: null,
          uploadedBy: { id: userA },
          requirementId: r.id,
        });
        expect(fetch).not.toHaveBeenCalled();
        const download = await get('/files/' + reference.body.data.id + '/download');
        expect(download.status).toBe(409);
        expect(download.body.code).toBe('REFERENCE_ONLY');
      } finally {
        fetch.mockRestore();
      }
    });
    it.each([
      ['application/pdf', Buffer.from('Spoofed PDF'), 'INVALID_FILE_CONTENT'],
      ['image/png', Buffer.from('Spoofed PNG'), 'INVALID_FILE_CONTENT'],
      ['image/svg+xml', Buffer.from('<svg/>'), 'INVALID_FILE_TYPE'],
      ['text/plain', Buffer.from([255, 254]), 'INVALID_FILE_CONTENT'],
      ['text/plain', Buffer.alloc(0), 'INVALID_FILE_SIZE'],
    ])('rejects upload %s %s without object or metadata leakage', async (mimeType, bytes, code) => {
      const before = existsSync(storageRoot) ? readdirSync(storageRoot).sort() : [];
      const count = await db.clientFile.count({ where: { agencyId: ids[0] } });
      const response = await request(app.getHttpServer())
        .post('/api/clients/' + clientA + '/files/upload')
        .set('Authorization', 'Bearer ' + tokenA)
        .attach('file', bytes, { filename: 'rejected.bin', contentType: mimeType });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe(code);
      expect(await db.clientFile.count({ where: { agencyId: ids[0] } })).toBe(count);
      expect(existsSync(storageRoot) ? readdirSync(storageRoot).sort() : []).toEqual(before);
    });
    it('rejects unknown upload identity fields and missing file parts', async () => {
      const before = existsSync(storageRoot) ? readdirSync(storageRoot).sort() : [];
      const spoofed = await request(app.getHttpServer())
        .post('/api/clients/' + clientA + '/files/upload')
        .set('Authorization', 'Bearer ' + tokenA)
        .field('agencyId', ids[1])
        .attach('file', Buffer.from('Brief'), { filename: 'brief.txt', contentType: 'text/plain' });
      expect(spoofed.status).toBe(400);
      expect((await post('/clients/' + clientA + '/files/upload', {})).body.code).toBe(
        'FILE_REQUIRED',
      );
      expect(existsSync(storageRoot) ? readdirSync(storageRoot).sort() : []).toEqual(before);
    });
    it.each([
      'clientCreate',
      'clientUpdate',
      'note',
      'communication',
      'reference',
      'upload',
    ] as const)(
      'rolls back %s and its event when audit persistence fails, including uploaded bytes',
      async (operation) => {
        const counts = async () => ({
          clients: await db.client.count({ where: { agencyId: ids[0] } }),
          notes: await db.clientNote.count({ where: { agencyId: ids[0] } }),
          communications: await db.clientCommunication.count({ where: { agencyId: ids[0] } }),
          files: await db.clientFile.count({ where: { agencyId: ids[0] } }),
          events: await db.auditLog.count({ where: { agencyId: ids[0] } }),
        });
        const before = await counts();
        const client = await db.client.findUniqueOrThrow({ where: { id: clientA } });
        const objects = existsSync(storageRoot) ? readdirSync(storageRoot).sort() : [];
        const audit = jest
          .spyOn(app.get(AccessService), 'audit')
          .mockRejectedValueOnce(new Error('Private audit failure'));
        try {
          const calls = {
            clientCreate: () =>
              post('/clients', { name: 'Rollback', company: 'Rollback', contactName: 'Contact' }),
            clientUpdate: () =>
              patch('/clients/' + clientA, {
                name: 'Rollback',
                company: 'Rollback',
                contactName: 'Contact',
              }),
            note: () => post('/clients/' + clientA + '/notes', { body: 'Must roll back' }),
            communication: () =>
              post('/clients/' + clientA + '/communications', {
                type: 'OTHER',
                subject: 'Must roll back',
                summary: 'Must roll back',
                occurredAt: '2024-01-01T12:00:00Z',
              }),
            reference: () =>
              post('/clients/' + clientA + '/files', {
                originalName: 'Rollback',
                referenceUrl: 'https://example.com',
              }),
            upload: () =>
              request(app.getHttpServer())
                .post('/api/clients/' + clientA + '/files/upload')
                .set('Authorization', 'Bearer ' + tokenA)
                .attach('file', Buffer.from('Rollback brief'), {
                  filename: 'brief.txt',
                  contentType: 'text/plain',
                }),
          };
          const response = await calls[operation]();
          expect(response.status).toBe(500);
          expect(response.body).toMatchObject({
            success: false,
            code: 'INTERNAL_ERROR',
            details: {},
          });
          expect(JSON.stringify(response.body)).not.toMatch(/Private audit|storageKey|stack/);
        } finally {
          audit.mockRestore();
        }
        expect(await counts()).toEqual(before);
        expect(await db.client.findUniqueOrThrow({ where: { id: clientA } })).toEqual(client);
        expect(existsSync(storageRoot) ? readdirSync(storageRoot).sort() : []).toEqual(objects);
      },
    );
    it('never exports a requirement that has no confirmed version in any working state', async () => {
      let r = await create();
      for (const status of [null, 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'ARCHIVED']) {
        if (status)
          r = (
            await patch('/requirements/' + r.id + '/status', {
              status,
              expectedVersion: r.lockVersion,
              ...(['CHANGES_REQUESTED', 'ARCHIVED'].includes(status)
                ? { reason: 'Review decision' }
                : {}),
            })
          ).body.data;
        const current = await get('/requirements/' + r.id + '/export');
        expect(current.status).toBe(409);
        expect(current.body.code).toBe('NOT_CONFIRMED');
        expect(current.body.data).toBeUndefined();
        expect((await get('/requirements/' + r.id + '/export?version=1')).status).toBe(404);
      }
      expect(await db.requirementRevision.count({ where: { requirementId: r.id } })).toBe(0);
      expect((await get('/requirements/' + r.id + '/export?version=2147483648')).status).toBe(400);
    });
    it('retains the exact approved package and private bytes through revision and archival', async () => {
      const client = (
        await post('/clients', {
          name: 'Retained history ' + suffix,
          company: 'History',
          contactName: 'Contact',
        })
      ).body.data;
      let r = (
        await post('/clients/' + client.id + '/requirements', {
          ...content,
          clientNotes: 'Client approved this brief',
          assumptions: 'Internal identity assumption',
          timeline: 'Client expectation: six weeks',
        })
      ).body.data;
      const upload = await request(app.getHttpServer())
        .post('/api/clients/' + client.id + '/files/upload')
        .set('Authorization', 'Bearer ' + tokenA)
        .field('requirementId', r.id)
        .attach('file', Buffer.from('Approved attachment'), {
          filename: 'approved.txt',
          contentType: 'text/plain',
        });
      expect(upload.status).toBe(201);
      const fileId = upload.body.data.id;
      await post('/clients/' + client.id + '/files', {
        originalName: 'Approved reference',
        referenceUrl: 'https://example.com/approved',
        requirementId: r.id,
      });
      for (const status of ['UNDER_REVIEW', 'CONFIRMED'])
        r = (
          await patch('/requirements/' + r.id + '/status', {
            status,
            expectedVersion: r.lockVersion,
          })
        ).body.data;
      const approved = (await get('/requirements/' + r.id + '/export')).body.data;
      expect(approved).toMatchObject({
        schemaVersion: 1,
        requirementId: r.id,
        clientId: client.id,
        version: 1,
        title: content.title,
        objective: content.objective,
        services: content.services,
        clientProvided: {
          budgetMin: '100.1',
          budgetMax: '900.25',
          currency: 'LKR',
          notes: 'Client approved this brief',
          timeline: 'Client expectation: six weeks',
        },
        internal: { assumptions: 'Internal identity assumption' },
        confirmedBy: { id: userA },
      });
      expect(approved.references).toHaveLength(2);
      expect(approved.items.map((item: { position: number }) => item.position)).toEqual([0, 1]);
      expect(JSON.stringify(approved)).not.toMatch(/storageKey|passwordHash|\.data/);
      expect(
        (
          await request(app.getHttpServer())
            .delete('/api/files/' + fileId)
            .set('Authorization', 'Bearer ' + tokenA)
        ).status,
      ).toBe(409);
      r = (
        await patch('/requirements/' + r.id + '/status', {
          status: 'DRAFT',
          expectedVersion: r.lockVersion,
          reason: 'New working revision',
        })
      ).body.data;
      expect(
        (
          await request(app.getHttpServer())
            .delete('/api/files/' + fileId)
            .set('Authorization', 'Bearer ' + tokenA)
        ).status,
      ).toBe(200);
      await post('/clients/' + client.id + '/files', {
        originalName: 'Unapproved new reference',
        referenceUrl: 'https://example.com/new',
        requirementId: r.id,
      });
      expect((await get('/requirements/' + r.id + '/export')).body.code).toBe('NOT_CONFIRMED');
      expect((await get('/requirements/' + r.id + '/export?version=1')).body.data).toEqual(
        approved,
      );
      expect((await get('/files/' + fileId + '/download')).text).toBe('Approved attachment');
      const role = await db.user.findUniqueOrThrow({ where: { id: userWriter } });
      await db.rolePermission.delete({
        where: { roleId_permissionKey: { roleId: role.roleId, permissionKey: 'file.read' } },
      });
      try {
        expect((await get('/requirements/' + r.id + '/export?version=1', tokenWriter)).status).toBe(
          403,
        );
        expect((await get('/files/' + fileId + '/download', tokenWriter)).status).toBe(403);
      } finally {
        await db.rolePermission.create({
          data: { roleId: role.roleId, permissionKey: 'file.read' },
        });
      }
      r = (
        await patch('/requirements/' + r.id + '/status', {
          status: 'ARCHIVED',
          expectedVersion: r.lockVersion,
          reason: 'Retain history',
        })
      ).body.data;
      await patch('/clients/' + client.id, {
        name: client.name,
        company: client.company,
        contactName: client.contactName,
        status: 'ARCHIVED',
      });
      expect((await get('/requirements/' + r.id + '/export?version=1')).body.data).toEqual(
        approved,
      );
      expect((await get('/files/' + fileId + '/download')).status).toBe(200);
      expect((await get('/requirements/' + r.id + '/export?version=1', tokenB)).status).toBe(404);
      const reconciliation = await app
        .get(PrivateStorageService)
        .reconcile(
          async (storageKey) => Boolean(await db.clientFile.findUnique({ where: { storageKey } })),
          false,
          new Date(Date.now() + 48 * 60 * 60 * 1000),
        );
      expect(reconciliation.eligible).toBe(0);
      expect(reconciliation.deleted).toBe(0);
      expect(reconciliation.retained).toBeGreaterThan(0);
    });
  });
});
