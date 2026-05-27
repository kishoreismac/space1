import { Router } from 'express';
import { prisma } from '../../prisma/client.js';
import { assertCompanyAccess, requireAuth } from '../auth/middleware.js';

export const dashboardRouter = Router({ mergeParams: true });
dashboardRouter.use(requireAuth);

// ─── GET /api/companies/:companyId/dashboard ──────────────────────────
dashboardRouter.get('/', async (req, res, next) => {
  try {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req.auth, companyId);

    const [
      teamCount,
      activeCampaigns,
      draftCampaigns,
      archivedCampaigns,
      totalInvites,
      completedInvites,
      submissionCount,
      blockerOpen,
      blockerByAiFit,
      themesByStatus,
      recentCampaignsRaw,
      recentBlockersRaw,
    ] = await Promise.all([
      prisma.team.count({ where: { companyId, status: 'ACTIVE' } }),
      prisma.surveyCampaign.count({ where: { companyId, status: 'ACTIVE' } }),
      prisma.surveyCampaign.count({ where: { companyId, status: 'DRAFT' } }),
      prisma.surveyCampaign.count({ where: { companyId, status: 'ARCHIVED' } }),
      prisma.surveyInvite.count({ where: { campaign: { companyId } } }),
      prisma.surveyInvite.count({
        where: { campaign: { companyId }, status: 'COMPLETED' },
      }),
      prisma.submission.count({
        where: { campaign: { companyId }, status: 'COMPLETED' },
      }),
      prisma.blocker.count({
        where: { campaign: { companyId }, status: { not: 'DROPPED' } },
      }),
      prisma.blocker.groupBy({
        by: ['aiFit'],
        where: { campaign: { companyId } },
        _count: { _all: true },
      }),
      prisma.openTextTheme.groupBy({
        by: ['status'],
        where: { campaign: { companyId } },
        _count: { _all: true },
      }),
      prisma.surveyCampaign.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          status: true,
          startDate: true,
          closeDate: true,
          createdAt: true,
        },
      }),
      prisma.blocker.findMany({
        where: { campaign: { companyId } },
        orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
        take: 5,
        select: {
          id: true,
          title: true,
          severity: true,
          aiFit: true,
          status: true,
          campaignId: true,
          campaign: { select: { title: true } },
        },
      }),
    ]);

    const responseRate = totalInvites
      ? Math.round((completedInvites / totalInvites) * 1000) / 10
      : null;

    const aiFitCounts: Record<string, number> = {
      STRONG_FIT: 0,
      CANDIDATE: 0,
      INVESTIGATE: 0,
      NOT_FIT: 0,
    };
    for (const row of blockerByAiFit) aiFitCounts[row.aiFit] = row._count._all;

    const themeCounts: Record<string, number> = { MONITOR: 0, INVESTIGATE: 0, PROMOTE: 0 };
    for (const row of themesByStatus) themeCounts[row.status] = row._count._all;

    res.json({
      counts: {
        teams: teamCount,
        campaigns: {
          active: activeCampaigns,
          draft: draftCampaigns,
          archived: archivedCampaigns,
        },
        invites: { total: totalInvites, completed: completedInvites },
        responseRate,
        submissions: submissionCount,
        openBlockers: blockerOpen,
      },
      blockerAiFit: aiFitCounts,
      themes: themeCounts,
      recentCampaigns: recentCampaignsRaw,
      recentBlockers: recentBlockersRaw.map((b) => ({
        id: b.id,
        title: b.title,
        severity: b.severity,
        aiFit: b.aiFit,
        status: b.status,
        campaignId: b.campaignId,
        campaignTitle: b.campaign.title,
      })),
    });
  } catch (e) { next(e); }
});
