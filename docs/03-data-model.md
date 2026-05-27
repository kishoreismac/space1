# SPACE Platform — Data Model

This is the canonical schema. It implements the entities in the user spec §1 (Phase 1), with two adjustments:

1. `User.passwordHash` is required for local auth in v1; external auth id added as a nullable column for future SSO.
2. `AuditLog` table added (the spec §7 lists audit events but no table).

## Entity-relationship overview

```
Company 1───* Team
Company 1───* User (role)
Company 1───* Questionnaire     (questionnaireId is nullable on Questionnaire for SUPER_ADMIN global templates)
Questionnaire 1───* QuestionDimension 1───* Question 1───* QuestionOption
Company 1───* SurveyCampaign *───1 Questionnaire
SurveyCampaign 1───* SurveyInvite
SurveyCampaign 1───* Submission 1───* Answer *───1 Question
SurveyCampaign 1───* ScoreSummary
SurveyCampaign 1───* OpenTextTheme
SurveyCampaign 1───* ValidationSignal
SurveyCampaign 1───* JourneyMapSession 1───* JourneyMapStep
SurveyCampaign 1───* Blocker 1───0..1 AIFeasibilityScore
SurveyCampaign 1───* Report
* ───* AuditLog (by actor, by entity)
```

## Tables (matches the user spec)

(See `packages/backend/prisma/schema.prisma` for the authoritative Prisma definition. The schema there mirrors the spec column-for-column with these enums.)

### Enums

- `UserRole` = `SUPER_ADMIN | COMPANY_ADMIN | ANALYST | PARTICIPANT`
- `EntityStatus` = `ACTIVE | ARCHIVED`
- `QuestionnaireStatus` = `DRAFT | PUBLISHED | ARCHIVED`
- `QuestionType` = `LIKERT | OPEN_TEXT | SINGLE_CHOICE | MULTI_CHOICE`
- `CampaignStatus` = `DRAFT | ACTIVE | CLOSED | ARCHIVED`
- `InviteStatus` = `SENT | STARTED | COMPLETED | EXPIRED | VOIDED`
- `SubmissionStatus` = `IN_PROGRESS | COMPLETED | VOIDED`
- `ScoreBand` = `CRITICAL | SIGNIFICANT | MODERATE | HEALTHY | EXCELLENT`
- `Priority` = `P1 | P2 | P3 | MONITOR`
- `ThemeStatus` = `PROMOTE | INVESTIGATE | MONITOR`
- `SignalType` = `DORA | PR | CICD | IDE | INCIDENT | CALENDAR | SLACK | JOURNEY_MAP | OTHER`
- `FrictionLevel` = `RED | AMBER | GREEN`
- `AIFit` = `YES | INVESTIGATE | NO`
- `BlockerStatus` = `OPEN | IN_PROGRESS | RESOLVED | DEFERRED`
- `AIClassification` = `QUICK_WIN | STRATEGIC_BET | MONITOR | DEFER`
- `ReportType` = `CAMPAIGN_OVERVIEW | SCORE_SUMMARY | QUESTION_BREAKDOWN | OPEN_TEXT | VALIDATION | JOURNEY | REGISTRY | AI_FEASIBILITY`

## Important constraints

- `Question(questionnaireId, questionNumber)` unique.
- `QuestionDimension(questionnaireId, code)` unique.
- `SurveyInvite.uniqueToken` unique + indexed.
- `Answer(submissionId, questionId)` unique (one answer per question per submission).
- `ScoreSummary(campaignId, dimensionCode)` unique.
- `AIFeasibilityScore.blockerId` unique (1:1).
- `User.email` unique within `companyId` (for `COMPANY_ADMIN`); globally unique for `SUPER_ADMIN`.

## Indexes (perf)

- `Answer(questionId)` — for question-level breakdown reports.
- `Submission(campaignId, status)` — campaign dashboards.
- `SurveyInvite(campaignId, status)` — invitation tracking.

## Anonymisation

- `Submission.anonymousParticipantKey` = `sha256(invite.uniqueToken + campaign.id)` — deterministic per invite so duplicate submissions can be detected, but reverse-mapping requires the invite row (admin-controlled).
- Reports never join `Submission → SurveyInvite → email/name` unless the campaign config explicitly opts in (column `Company.allowNamedReporting` default `false`).

## Audit log

```
AuditLog {
  id, actorUserId, actorRole, action (enum), entityType, entityId,
  metadata (Json), createdAt, ipAddress, userAgent
}
```
Written by `auditMiddleware` after successful mutations.
