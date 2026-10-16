import 'dotenv/config';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import { Client } from '@prisma/client';
import { Actor } from '../src/common/auth';

async function verify() {
  if (process.env.NODE_ENV === 'production' || process.env.DEMO_AUTH_ENABLED !== 'true')
    throw new Error('Explicit local demo configuration is required');
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    const base = (await app.getUrl()) + '/api';
    const db = app.get(PrismaService);
    await db.$queryRaw`SELECT 1`;
    console.log('PASS: Nest HTTP startup and live PostgreSQL query through Prisma');
    const identities = [
      { email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! },
      { email: process.env.DEMO_SECONDARY_EMAIL!, password: process.env.DEMO_SECONDARY_PASSWORD! },
    ];
    const sign = (claims: object) =>
      app.get(JwtService).sign(claims, {
        secret: process.env.JWT_SECRET!,
        issuer: process.env.JWT_ISSUER!,
        audience: process.env.JWT_AUDIENCE!,
        algorithm: 'HS256',
        expiresIn: '1m',
      });
    const sessions: { actor: Actor; list: Client[]; get: (route: string) => Promise<Response> }[] =
      [];
    for (const identity of identities) {
      const login = await fetch(base + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(identity),
      });
      assert.equal(login.status, 201);
      const body = await login.json();
      assert.equal(body.success, true);
      assert.equal(body.message, 'Operation completed successfully');
      assert.equal(typeof body.data.accessToken, 'string');
      const token: string = body.data.accessToken;
      const get = async (route: string) =>
        fetch(base + route, { headers: { Authorization: 'Bearer ' + token } });
      const me = await get('/auth/me');
      assert.equal(me.status, 200);
      const actor: Actor = (await me.json()).data;
      const clients = await get('/clients');
      assert.equal(clients.status, 200);
      const list: Client[] = (await clients.json()).data.items;
      assert.ok(list.length > 0);
      assert.ok(list.every((client: { agencyId: string }) => client.agencyId === actor.agencyId));
      sessions.push({ actor, list, get });
    }
    assert.notEqual(sessions[0].actor.agencyId, sessions[1].actor.agencyId);
    console.log(
      'PASS: both seeded users authenticate; client lists use different server-derived agencies',
    );
    for (const [index, own] of sessions.entries()) {
      const foreign = sessions[1 - index];
      for (const suffix of [
        'hub',
        'requirements',
        'communications',
        'notes',
        'files',
        'timeline',
      ]) {
        assert.equal((await own.get('/clients/' + own.list[0].id + '/' + suffix)).status, 200);
        const denied = await own.get('/clients/' + foreign.list[0].id + '/' + suffix);
        assert.equal(denied.status, 404);
        const error = await denied.json();
        assert.equal(error.success, false);
        assert.equal(error.code, 'NOT_FOUND');
        assert.deepEqual(error.details, {});
      }
      const foreignRequirement = await db.clientRequirement.findFirstOrThrow({
        where: { agencyId: foreign.actor.agencyId },
      });
      assert.equal((await own.get('/requirements/' + foreignRequirement.id)).status, 404);
      const foreignFile = await db.clientFile.findFirstOrThrow({
        where: { agencyId: foreign.actor.agencyId },
      });
      assert.equal((await own.get('/files/' + foreignFile.id + '/download')).status, 404);
    }
    console.log(
      'PASS: bidirectional tenant isolation for hub, requirements, communications, notes, files, timeline and downloads',
    );
    const forgedIdentity = await fetch(base + '/clients', {
      headers: {
        'x-user-id': sessions[0].actor.userId,
        'x-agency-id': sessions[0].actor.agencyId,
      },
    });
    assert.equal(forgedIdentity.status, 401);
    const injected = await fetch(base + '/clients', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + sign({ sub: sessions[0].actor.userId }),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Rejected',
        company: 'Rejected',
        contactName: 'Rejected',
        agencyId: sessions[1].actor.agencyId,
      }),
    });
    assert.equal(injected.status, 400);
    const claimsToken = sign({
      sub: sessions[0].actor.userId,
      agencyId: sessions[1].actor.agencyId,
      permissions: [],
    });
    const claimed = await fetch(base + '/auth/me', {
      headers: { Authorization: 'Bearer ' + claimsToken },
    });
    assert.equal(claimed.status, 200);
    assert.equal((await claimed.json()).data.agencyId, sessions[0].actor.agencyId);
    console.log(
      'PASS: arbitrary identity headers rejected, browser tenant input rejected, token tenant claims ignored',
    );
  } finally {
    await app.close();
  }
}
verify().catch(() => {
  console.error(
    'FAIL: foundation HTTP/database verification; no credentials or response bodies printed',
  );
  process.exitCode = 1;
});
