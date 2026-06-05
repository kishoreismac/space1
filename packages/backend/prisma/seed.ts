/**
 * Production seed.
 * Creates:
 *   1. One SUPER_ADMIN user (credentials from env)
 *   2. The canonical SPACE 50-question questionnaire plus one SDLC prompt
 *      as a PUBLISHED global template
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
  const expandedTemplateTitle = 'SPACE 50+1 — Developer Productivity (Global Template)';
  const existingTemplate = await prisma.questionnaire.findFirst({
    where: { companyId: null, title: templateTitle },
  });

  const createQuestions = async (questionnaireId: string) => {
    const dims = await Promise.all(
      SPACE_DIMENSIONS.map((d, i) =>
        prisma.questionDimension.upsert({
          where: {
            questionnaireId_code: {
              questionnaireId,
              code: d.code,
            },
          },
          create: {
            questionnaireId,
            code: d.code,
            name: d.name,
            description: d.description,
            color: d.color,
            displayOrder: i,
          },
          update: {
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
      await prisma.question.upsert({
        where: {
          questionnaireId_questionNumber: {
            questionnaireId,
            questionNumber: def.number,
          },
        },
        create: {
          questionnaireId,
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
        update: {
          dimensionId: dimByCode.get(def.dimensionCode)!,
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
          status: 'ACTIVE',
        },
      });
    }
  };

  if (existingTemplate) {
    await prisma.questionnaire.update({
      where: { id: existingTemplate.id },
      data: {
        description:
          'Canonical SPACE Developer Productivity questionnaire: 50 main questions plus one overall SDLC blocker prompt.',
        estimatedMinutes: 12,
      },
    });

    const answerCount = await prisma.answer.count({
      where: { question: { questionnaireId: existingTemplate.id } },
    });
    if (answerCount > 0) {
      const expandedTemplate = await prisma.questionnaire.findFirst({
        where: { companyId: null, title: expandedTemplateTitle },
      });
      if (!expandedTemplate) {
        const q = await prisma.questionnaire.create({
          data: {
            companyId: null,
            title: expandedTemplateTitle,
            description:
              'Canonical SPACE Developer Productivity questionnaire: 50 main questions plus one overall SDLC blocker prompt.',
            version: (existingTemplate.version ?? 1) + 1,
            status: 'PUBLISHED',
            estimatedMinutes: 12,
            isAnonymous: true,
          },
        });
        await createQuestions(q.id);
        console.log(`✓ Created expanded SPACE 50+1 questionnaire (${SPACE_QUESTIONS.length} questions)`);
      } else {
        await prisma.question.deleteMany({
          where: {
            questionnaireId: expandedTemplate.id,
            questionNumber: { notIn: SPACE_QUESTIONS.map((q) => q.number) },
          },
        });
        await createQuestions(expandedTemplate.id);
        console.log(`✓ Synced expanded SPACE 50+1 questionnaire (${SPACE_QUESTIONS.length} questions)`);
      }
      console.log(
        `• Existing SPACE-50 template has answers, so it was preserved (${answerCount} answers found)`,
      );
    } else {
      await prisma.question.deleteMany({
        where: {
          questionnaireId: existingTemplate.id,
          questionNumber: { notIn: SPACE_QUESTIONS.map((q) => q.number) },
        },
      });
      await createQuestions(existingTemplate.id);
      console.log(`✓ Synced global SPACE-50 questionnaire (${SPACE_QUESTIONS.length} questions)`);
    }
  } else {
    const q = await prisma.questionnaire.create({
      data: {
        companyId: null,
        title: templateTitle,
        description:
          'Canonical SPACE Developer Productivity questionnaire: 50 main questions plus one overall SDLC blocker prompt.',
        version: 1,
        status: 'PUBLISHED',
        estimatedMinutes: 12,
        isAnonymous: true,
      },
    });
    await createQuestions(q.id);
    console.log(`✓ Created global SPACE-50 questionnaire (${SPACE_QUESTIONS.length} questions)`);
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
