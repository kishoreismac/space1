import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export async function ensureRuntimeDatabaseSchema(): Promise<void> {
  if (!process.env.DATABASE_URL?.startsWith('file:')) return;

  const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    'PRAGMA table_info("OpenTextTheme")',
  );
  if (!columns.some((column) => column.name === 'sourceType')) {
    await prisma.$executeRawUnsafe('ALTER TABLE "OpenTextTheme" ADD COLUMN "sourceType" TEXT');
  }
}
