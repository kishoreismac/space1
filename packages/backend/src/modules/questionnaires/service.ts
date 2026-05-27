import type { PublicQuestionnaire } from '@space/shared';

// Loose shape (we accept Prisma's findUnique result with `questions` include).
interface QuestionnaireWithQuestions {
  id: string;
  title: string;
  description: string | null;
  estimatedMinutes: number;
  isAnonymous: boolean;
  questions: Array<{
    id: string;
    questionNumber: number;
    questionText: string;
    questionType: string;
    isReverseScored: boolean;
    isRequired: boolean;
    minScale: number | null;
    maxScale: number | null;
    lowLabel: string | null;
    highLabel: string | null;
    blockerSignal: string | null;
    dimension: { code: string };
  }>;
}

export function toPublicQuestionnaire(q: QuestionnaireWithQuestions): PublicQuestionnaire {
  return {
    id: q.id,
    title: q.title,
    description: q.description,
    estimatedMinutes: q.estimatedMinutes,
    isAnonymous: q.isAnonymous,
    questions: q.questions.map((qu) => ({
      id: qu.id,
      questionNumber: qu.questionNumber,
      dimensionCode: qu.dimension.code,
      text: qu.questionText,
      type: qu.questionType as PublicQuestionnaire['questions'][number]['type'],
      isReverseScored: qu.isReverseScored,
      isRequired: qu.isRequired,
      minScale: qu.minScale,
      maxScale: qu.maxScale,
      lowLabel: qu.lowLabel,
      highLabel: qu.highLabel,
      blockerSignal: qu.blockerSignal,
    })),
  };
}
