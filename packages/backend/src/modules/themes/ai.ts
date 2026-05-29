import { z } from 'zod';

const FoundryThemeMatchSchema = z.object({
  answerId: z.string().min(1),
  matchedThemeName: z.string().min(1).max(200),
  confidence: z.number().min(0).max(1).optional(),
});

const FoundryThemeMatchResponseSchema = z.object({
  matches: z.array(FoundryThemeMatchSchema).default([]),
});

export type FoundryThemeMatch = z.infer<typeof FoundryThemeMatchSchema>;

interface FoundryConfig {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
}

interface OpenTextAnswerInput {
  answerId: string;
  questionNumber: number;
  text: string;
}

export class FoundryError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function extractJsonObject(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(content.slice(start, end + 1));
    }
    throw new Error('Model response is not valid JSON');
  }
}

function normalizeThemeKey(value: string): string {
  return value.trim().toLowerCase();
}

export async function classifyOpenTextAnswersWithFoundry(
  cfg: FoundryConfig,
  answers: OpenTextAnswerInput[],
  predefinedThemes: string[],
  minimumConfidence: number,
): Promise<FoundryThemeMatch[]> {
  if (answers.length === 0) return [];
  if (predefinedThemes.length === 0) return [];

  const endpoint = cfg.endpoint.replace(/\/$/, '');
  const useV1 = cfg.apiVersion.trim().toLowerCase() === 'v1';
  const url = useV1
    ? `${endpoint}/openai/v1/chat/completions`
    : `${endpoint}/openai/deployments/${encodeURIComponent(cfg.deployment)}/chat/completions?api-version=${encodeURIComponent(cfg.apiVersion)}`;

  const systemPrompt = [
    'You are an expert organizational analyst running SPACE Phase 2 open-text analysis.',
    'Classify each response to the closest predefined theme only.',
    'Output STRICT JSON only with this shape:',
    '{"matches":[{"answerId":"...","matchedThemeName":"...","confidence":0.0}]}',
    'Rules:',
    '1) matchedThemeName MUST be exactly one of the predefined themes provided in input.',
    '2) Return at most one match per answerId.',
    `3) Only return matches with confidence >= ${minimumConfidence}.`,
    '4) Do not invent new themes.',
  ].join(' ');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'api-key': cfg.apiKey,
    },
    body: JSON.stringify({
      ...(useV1 ? { model: cfg.deployment } : {}),
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: JSON.stringify({
            instructions: 'Classify each open-text response to a predefined questionnaire theme.',
            predefinedThemes,
            responses: answers,
          }),
        },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new FoundryError(response.status, `Foundry request failed (${response.status}): ${body.slice(0, 400)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new FoundryError(502, 'Foundry response did not include message content');
  }

  const allowed = new Set(predefinedThemes.map(normalizeThemeKey));
  const parsed = FoundryThemeMatchResponseSchema.parse(extractJsonObject(content));
  const dedup = new Map<string, FoundryThemeMatch>();

  for (const m of parsed.matches) {
    const conf = m.confidence ?? 0;
    if (conf < minimumConfidence) continue;
    if (!allowed.has(normalizeThemeKey(m.matchedThemeName))) continue;
    if (!answers.find((a) => a.answerId === m.answerId)) continue;

    const existing = dedup.get(m.answerId);
    if (!existing || (existing.confidence ?? 0) < conf) {
      dedup.set(m.answerId, {
        answerId: m.answerId,
        matchedThemeName: m.matchedThemeName,
        confidence: conf,
      });
    }
  }

  return [...dedup.values()];
}
