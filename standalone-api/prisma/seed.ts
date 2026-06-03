/**
 * Production seed.
 * Creates:
 *   1. One SUPER_ADMIN user (credentials from env)
 *   2. The canonical SPACE 50-question questionnaire as a PUBLISHED global template
 *
 * NO company / team / campaign / response data is created.
 * For demo data run `npm run seed:demo`.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { SPACE_DIMENSIONS, SPACE_QUESTIONS } from '@space/shared/questionnaire';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!123';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        name: 'Platform Super Admin',
        role: 'SUPER_ADMIN',
        passwordHash: await bcrypt.hash(password, 10),
      },
    });
    console.log(`✓ Created SUPER_ADMIN ${email}`);
  } else {
    console.log(`• SUPER_ADMIN ${email} already exists, skipping`);
  }

  const templateTitle = 'SPACE 50 — Developer Productivity (Global Template)';
  const existingTemplate = await prisma.questionnaire.findFirst({
    where: { companyId: null, title: templateTitle },
  });
  if (existingTemplate) {
    console.log('• Global SPACE-50 template already exists, skipping');
  } else {
    const q = await prisma.questionnaire.create({
      data: {
        companyId: null,
        title: templateTitle,
        description:
          'Canonical 50-question SPACE Developer Productivity questionnaire. Reusable across companies.',
        version: 1,
        status: 'PUBLISHED',
        estimatedMinutes: 10,
        isAnonymous: true,
      },
    });
    const dims = await Promise.all(
      SPACE_DIMENSIONS.map((d, i) =>
        prisma.questionDimension.create({
          data: {
            questionnaireId: q.id,
            code: d.code,
            name: d.name,
            description: d.description,
            color: d.color,
            displayOrder: i,
          },
        }),
      ),
    );
    const dimByCode = new Map(dims.map((d) => [d.code, d.id]));
    for (const def of SPACE_QUESTIONS) {
      await prisma.question.create({
        data: {
          questionnaireId: q.id,
          dimensionId: dimByCode.get(def.dimensionCode)!,
          questionNumber: def.number,
          questionText: def.text,
          questionType: def.type,
          blockerSignal: def.blockerSignal,
          isReverseScored: def.isReverseScored,
          isRequired: def.isRequired,
          minScale: def.minScale,
          maxScale: def.maxScale,
          lowLabel: def.lowLabel,
          highLabel: def.highLabel,
          displayOrder: def.number,
        },
      });
    }
    console.log(`✓ Created global SPACE-50 questionnaire (50 questions)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
