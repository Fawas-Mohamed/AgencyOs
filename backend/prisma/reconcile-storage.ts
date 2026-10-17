import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrivateStorageService } from '../src/client-hub/private-storage.service';

async function reconcile() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('This maintenance command is only for the private local demo provider');
  const apply = process.argv.includes('--apply');
  if (apply && !process.argv.includes('--uploads-stopped'))
    throw new Error('Stop upload workers and supply --uploads-stopped before applying cleanup');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const prisma = app.get(PrismaService);
    const result = await app
      .get(PrivateStorageService)
      .reconcile(
        async (storageKey) =>
          Boolean(
            await prisma.clientFile.findUnique({ where: { storageKey }, select: { id: true } }),
          ),
        apply,
      );
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...result }));
    if (result.failures || result.truncated) process.exitCode = 1;
  } finally {
    await app.close();
  }
}
reconcile().catch(() => {
  console.error(
    'Local storage reconciliation failed. Verify configuration and stop upload workers before --apply --uploads-stopped. No private keys, paths or credentials were printed.',
  );
  process.exitCode = 1;
});
