import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { ZodError } from 'zod';
import { reverseScore, SubmissionPayloadSchema } from '@space/shared';
import { HttpError } from '../../middleware/error.js';
import { prisma } from '../../prisma/client.js';
import { toPublicQuestionnaire } from '../questionnaires/service.js';
import { trySaveArtifact } from '../../lib/storage.js';

function makeToken(): string {
  return randomBytes(16).toString('base64url');
}

export const publicRouter = Router();

function handleZod(err: unknown): never {
  if (err instanceof ZodError) {
    throw new HttpError(400, 'Invalid request body', err.issues);
  }
  throw err;
}

async function loadInviteOrFail(token: string) {
  const invite = await prisma.surveyInvite.findUnique({
    where: { uniqueToken: token },
    include: {
      campaign: {
        include: {
          company: true,
          questionnaire: {
            include: {
              questions: {
                orderBy: { questionNumber: 'asc' },
                include: { dimension: true },
              },
              dimensions: { orderBy: { displayOrder: 'asc' } },
            },
          },
        },
      },
    },
  });
  if (!invite) throw new HttpError(404, 'Invite not found');
  if (invite.status === 'VOIDED' || invite.status === 'EXPIRED') {
    throw new HttpError(410, `Invite is ${invite.status.toLowerCase()}`);
  }
  if (invite.campaign.status !== 'ACTIVE' && invite.campaign.status !== 'DRAFT') {
    throw new HttpError(410, `Campaign is ${invite.campaign.status.toLowerCase()}`);
  }
  return invite;
}

// ─── POST shared/anonymous join — mint a fresh invite for a campaign ───
publicRouter.post('/campaigns/:campaignId/join', async (req, res, next) => {
  try {
    const { campaignId } = req.params;
    const campaign = await prisma.surveyCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new HttpError(404, 'Campaign not found');
    if (campaign.status !== 'ACTIVE' && campaign.status !== 'DRAFT') {
      throw new HttpError(410, `Campaign is ${campaign.status.toLowerCase()}`);
    }
    const invite = await prisma.surveyInvite.create({
      data: {
        campaignId,
        uniqueToken: makeToken(),
        status: 'STARTED',
        sentAt: new Date(),
        startedAt: new Date(),
      },
    });
    if (campaign.status === 'DRAFT') {
      await prisma.surveyCampaign.update({ where: { id: campaignId }, data: { status: 'ACTIVE' } });
    }
    res.status(201).json({ token: invite.uniqueToken });
  } catch (e) { next(e); }
});

// ─── GET context ───────────────────────────────────────────────────────
publicRouter.get('/survey/:token', async (req, res, next) => {
  try {
    const invite = await loadInviteOrFail(req.params.token);
    if (invite.status === 'COMPLETED') {
      throw new HttpError(409, 'This survey has already been submitted');
    }
    if (invite.status === 'SENT') {
      await prisma.surveyInvite.update({
        where: { id: invite.id },
        data: { status: 'STARTED', startedAt: new Date() },
      });
    }

    const teams = await prisma.team.findMany({
      where: { companyId: invite.campaign.companyId, status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    res.json({
      campaign: {
        id: invite.campaign.id,
        title: invite.campaign.title,
        cycle: invite.campaign.cycle,
        closeDate: invite.campaign.closeDate ? invite.campaign.closeDate.toISOString() : null,
      },
      company: {
        id: invite.campaign.company.id,
        name: invite.campaign.company.name,
      },
      invite: {
        id: invite.id,
        status: invite.status === 'SENT' ? 'STARTED' : invite.status,
        teamId: invite.teamId,
        roleLabel: invite.roleLabel,
      },
      teams,
      questionnaire: toPublicQuestionnaire(invite.campaign.questionnaire),
    });
  } catch (e) { next(e); }
});

// ─── POST submit ───────────────────────────────────────────────────────
publicRouter.post('/survey/:token/submit', async (req, res, next) => {
  try {
    const invite = await loadInviteOrFail(req.params.token);
    if (invite.status === 'COMPLETED') {
      throw new HttpError(409, 'This survey has already been submitted');
    }
    const payload = SubmissionPayloadSchema.parse(req.body);

    // Optional team validation
    if (payload.teamId) {
      const team = await prisma.team.findUnique({ where: { id: payload.teamId } });
      if (!team || team.companyId !== invite.campaign.companyId) {
        throw new HttpError(400, 'Unknown teamId');
      }
    }

    // Index questions by number for fast lookup + validation
    const questions = invite.campaign.questionnaire.questions;
    const byNumber = new Map(questions.map((q) => [q.questionNumber, q]));

    // Validate required questions
    const givenByNumber = new Map(payload.answers.map((a) => [a.questionNumber, a]));
    for (const q of questions) {
      if (!q.isRequired) continue;
      const a = givenByNumber.get(q.questionNumber);
      if (!a) throw new HttpError(400, `Missing answer for required Q${q.questionNumber}`);
      if (q.questionType === 'OPEN_TEXT') {
        if (!a.textValue || a.textValue.trim().length === 0) {
          throw new HttpError(400, `Missing text for required Q${q.questionNumber}`);
        }
      } else if (a.rawValue === undefined || a.rawValue === null) {
        throw new HttpError(400, `Missing rating for required Q${q.questionNumber}`);
      }
    }

    const anonymousKey = createHash('sha256')
      .update(`${invite.uniqueToken}:${invite.campaignId}`)
      .digest('hex');

    const answerRows = payload.answers
      .filter((a) => byNumber.has(a.questionNumber))
      .map((a) => {
        const q = byNumber.get(a.questionNumber)!;
        const raw = a.rawValue ?? null;
        const scored = raw === null
          ? null
          : q.isReverseScored
            ? reverseScore(raw)
            : raw;
        return {
          questionId: q.id,
          rawValue: raw !== null ? String(raw) : null,
          numericValue: raw !== null ? raw : null,
          scoredValue: scored !== null ? scored : null,
          textValue: a.textValue ?? null,
        };
      });

    const result = await prisma.$transaction(async (tx) => {
      const submission = await tx.submission.create({
        data: {
          campaignId: invite.campaignId,
          questionnaireId: invite.campaign.questionnaireId,
          inviteId: invite.id,
          anonymousParticipantKey: anonymousKey,
          participantName: payload.participantName,
          teamId: payload.teamId ?? invite.teamId ?? null,
          roleLabel: payload.roleLabel ?? invite.roleLabel ?? null,
          yearsAtCompany: payload.yearsAtCompany ?? null,
          primaryTechnology: payload.primaryTechnology ?? null,
          submittedAt: new Date(),
          status: 'COMPLETED',
          answers: { create: answerRows },
        },
        select: { id: true, submittedAt: true },
      });

      await tx.surveyInvite.update({
        where: { id: invite.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      return submission;
    });

    // Mirror full participant submission to Azure Blob Storage (best-effort).
    // Organized as: survey-responses/{companyId}/{campaignId}/{teamId|none}/{submissionId}.json
    const teamSegment = (payload.teamId ?? invite.teamId ?? 'no-team').replace(/[^a-zA-Z0-9_-]/g, '_');
    const teamRecord = (payload.teamId ?? invite.teamId)
      ? await prisma.team.findUnique({
          where: { id: (payload.teamId ?? invite.teamId)! },
          select: { name: true },
        })
      : null;
    const blobPayload = {
      submissionId: result.id,
      submittedAt: result.submittedAt?.toISOString() ?? null,
      campaign: {
        id: invite.campaign.id,
        title: invite.campaign.title,
        cycle: invite.campaign.cycle,
      },
      company: {
        id: invite.campaign.company.id,
        name: invite.campaign.company.name,
      },
      participant: {
        name: payload.participantName,
        roleLabel: payload.roleLabel ?? invite.roleLabel ?? null,
        teamId: payload.teamId ?? invite.teamId ?? null,
        teamName: teamRecord?.name ?? null,
        yearsAtCompany: payload.yearsAtCompany ?? null,
        primaryTechnology: payload.primaryTechnology ?? null,
        anonymousKey,
      },
      questionnaire: {
        id: invite.campaign.questionnaire.id,
        title: invite.campaign.questionnaire.title,
        version: invite.campaign.questionnaire.version,
      },
      answers: payload.answers.map((a) => {
        const q = byNumber.get(a.questionNumber);
        return {
          questionNumber: a.questionNumber,
          questionText: q?.questionText ?? null,
          dimensionCode: q?.dimension?.code ?? null,
          type: q?.questionType ?? null,
          rawValue: a.rawValue ?? null,
          textValue: a.textValue ?? null,
          isReverseScored: q?.isReverseScored ?? false,
        };
      }),
    };
    await trySaveArtifact(
      'survey-responses',
      invite.campaign.company.id,
      invite.campaignId,
      blobPayload,
      { id: `${teamSegment}/${result.id}` },
    );

    res.status(201).json({ submissionId: result.id, submittedAt: result.submittedAt });
  } catch (e) {
    try { handleZod(e); } catch (h) { return next(h); }
  }
});
