import { randomBytes, randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { PERMISSIONS } from '../src/common/auth';
import { configureApp } from '../src/bootstrap';

import { hashPassword } from '../src/common/password';
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
});
