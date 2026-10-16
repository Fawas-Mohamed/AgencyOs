import { PrismaService } from '../src/prisma/prisma.service';
import { Actor, PERMISSIONS } from '../src/common/auth';
import { hashPassword, verifyPassword } from '../src/common/password';

export interface DemoIdentity {
  email: string;
  password: string;
  agencyName: string;
  displayName: string;
}

/** Local seed adapter only. Never updates existing identities or their permissions. */
export async function seedDemoActor(prisma: PrismaService, identity: DemoIdentity): Promise<Actor> {
  if (!identity.email || identity.password.length < 12)
    throw new Error(
      'Each local demo identity requires an email and random password of at least 12 characters',
    );
  const include = { agency: true, role: { include: { permissions: true } } } as const;
  let user = await prisma.user.findUnique({ where: { email: identity.email }, include });
  if (user && (user.agency.name !== identity.agencyName || user.role.agencyId !== user.agencyId))
    throw new Error('Existing account is outside this demo adapter; it has been preserved');
  if (!user) {
    user = await prisma.$transaction(async (db) => {
      for (const key of PERMISSIONS)
        await db.permission.upsert({
          where: { key },
          update: {},
          create: { key, description: key },
        });
      const agency = await db.agency.create({ data: { name: identity.agencyName } });
      const role = await db.role.create({
        data: {
          agencyId: agency.id,
          name: 'Agency administrator',
          permissions: { create: PERMISSIONS.map((permissionKey) => ({ permissionKey })) },
        },
      });
      return db.user.create({
        data: {
          agencyId: agency.id,
          roleId: role.id,
          email: identity.email,
          displayName: identity.displayName,
          passwordHash: hashPassword(identity.password),
        },
        include,
      });
    });
  }
  const permissions = user.role.permissions.map((entry) => entry.permissionKey);
  if (
    !user.active ||
    !user.passwordHash ||
    !verifyPassword(identity.password, user.passwordHash) ||
    PERMISSIONS.some((permission) => !permissions.includes(permission))
  )
    throw new Error(
      'Existing demo identity does not match local configuration; it has been preserved',
    );
  return {
    userId: user.id,
    agencyId: user.agencyId,
    email: user.email,
    displayName: user.displayName,
    role: user.role.name,
    permissions,
  };
}
