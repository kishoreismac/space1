-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "website" TEXT,
    "contactEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "allowNamedReporting" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "managerName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Team_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "passwordHash" TEXT,
    "externalAuthId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Questionnaire" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 10,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Questionnaire_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionDimension" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionnaireId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    CONSTRAINT "QuestionDimension_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionnaireId" TEXT NOT NULL,
    "dimensionId" TEXT NOT NULL,
    "questionNumber" INTEGER NOT NULL,
    "questionText" TEXT NOT NULL,
    "questionType" TEXT NOT NULL DEFAULT 'LIKERT',
    "blockerSignal" TEXT,
    "isReverseScored" BOOLEAN NOT NULL DEFAULT false,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "minScale" INTEGER,
    "maxScale" INTEGER,
    "lowLabel" TEXT,
    "highLabel" TEXT,
    "tooltipText" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Question_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Question_dimensionId_fkey" FOREIGN KEY ("dimensionId") REFERENCES "QuestionDimension" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SurveyCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "cycle" TEXT,
    "startDate" DATETIME,
    "closeDate" DATETIME,
    "targetRespondents" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "notes" TEXT,
    "previousS" REAL,
    "previousP" REAL,
    "previousA" REAL,
    "previousC" REAL,
    "previousE" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SurveyCampaign_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SurveyCampaign_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SurveyInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "participantEmail" TEXT,
    "participantName" TEXT,
    "teamId" TEXT,
    "roleLabel" TEXT,
    "uniqueToken" TEXT NOT NULL,
    "sentAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SurveyInvite_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SurveyCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SurveyInvite_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,
    "inviteId" TEXT,
    "anonymousParticipantKey" TEXT NOT NULL,
    "teamId" TEXT,
    "roleLabel" TEXT,
    "yearsAtCompany" TEXT,
    "primaryTechnology" TEXT,
    "submittedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Submission_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SurveyCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Submission_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "SurveyInvite" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Submission_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "rawValue" TEXT,
    "numericValue" REAL,
    "scoredValue" REAL,
    "textValue" TEXT,
    CONSTRAINT "Answer_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScoreSummary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "dimensionCode" TEXT NOT NULL,
    "dimensionName" TEXT NOT NULL,
    "averageScore" REAL,
    "responseCount" INTEGER NOT NULL DEFAULT 0,
    "scoreBand" TEXT,
    "priorityLevel" TEXT NOT NULL DEFAULT 'MONITOR',
    "trendDelta" REAL,
    "trendOverridden" BOOLEAN NOT NULL DEFAULT false,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScoreSummary_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SurveyCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OpenTextTheme" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "sourceQuestionId" TEXT,
    "themeName" TEXT NOT NULL,
    "description" TEXT,
    "respondentCount" INTEGER NOT NULL DEFAULT 0,
    "percentage" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'MONITOR',
    "representativeQuote" TEXT,
    "jtbdStatement" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OpenTextTheme_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SurveyCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OpenTextThemeTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "themeId" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OpenTextThemeTag_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "OpenTextTheme" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OpenTextThemeTag_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ValidationSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "blockerId" TEXT,
    "signalType" TEXT NOT NULL,
    "signalName" TEXT NOT NULL,
    "evidenceValue" TEXT,
    "evidenceDescription" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ValidationSignal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SurveyCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ValidationSignal_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "Blocker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JourneyMapSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "teamId" TEXT,
    "facilitator" TEXT,
    "sessionDate" DATETIME,
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JourneyMapSession_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SurveyCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JourneyMapSession_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JourneyMapStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "stepName" TEXT NOT NULL,
    "description" TEXT,
    "timeSpent" TEXT,
    "frictionLevel" TEXT NOT NULL DEFAULT 'GREEN',
    "dotVotes" INTEGER NOT NULL DEFAULT 0,
    "quote" TEXT,
    "rootCause" TEXT,
    "jtbdStatement" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "JourneyMapStep_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "JourneyMapSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Blocker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourcePhase" TEXT,
    "dimensionCode" TEXT,
    "sdlcPhase" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'P3',
    "affectedTeams" TEXT,
    "reachPercentage" REAL,
    "estimatedHoursLost" REAL,
    "evidenceSummary" TEXT,
    "aiFit" TEXT NOT NULL DEFAULT 'INVESTIGATE',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Blocker_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SurveyCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AIFeasibilityScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "blockerId" TEXT NOT NULL,
    "toolMaturityScore" REAL NOT NULL,
    "integrationEaseScore" REAL NOT NULL,
    "costEfficiencyScore" REAL NOT NULL,
    "dataAvailabilityScore" REAL NOT NULL,
    "developerAdoptionScore" REAL NOT NULL,
    "weightedCompositeScore" REAL NOT NULL,
    "classification" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AIFeasibilityScore_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "Blocker" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedById" TEXT,
    "fileUrl" TEXT,
    "contentJson" TEXT,
    CONSTRAINT "Report_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SurveyCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Team_companyId_idx" ON "Team"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_companyId_role_idx" ON "User"("companyId", "role");

-- CreateIndex
CREATE INDEX "Questionnaire_companyId_idx" ON "Questionnaire"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionDimension_questionnaireId_code_key" ON "QuestionDimension"("questionnaireId", "code");

-- CreateIndex
CREATE INDEX "Question_dimensionId_idx" ON "Question"("dimensionId");

-- CreateIndex
CREATE UNIQUE INDEX "Question_questionnaireId_questionNumber_key" ON "Question"("questionnaireId", "questionNumber");

-- CreateIndex
CREATE INDEX "SurveyCampaign_companyId_status_idx" ON "SurveyCampaign"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyInvite_uniqueToken_key" ON "SurveyInvite"("uniqueToken");

-- CreateIndex
CREATE INDEX "SurveyInvite_campaignId_status_idx" ON "SurveyInvite"("campaignId", "status");

-- CreateIndex
CREATE INDEX "Submission_campaignId_status_idx" ON "Submission"("campaignId", "status");

-- CreateIndex
CREATE INDEX "Answer_questionId_idx" ON "Answer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Answer_submissionId_questionId_key" ON "Answer"("submissionId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreSummary_campaignId_dimensionCode_key" ON "ScoreSummary"("campaignId", "dimensionCode");

-- CreateIndex
CREATE INDEX "OpenTextThemeTag_answerId_idx" ON "OpenTextThemeTag"("answerId");

-- CreateIndex
CREATE UNIQUE INDEX "OpenTextThemeTag_themeId_answerId_key" ON "OpenTextThemeTag"("themeId", "answerId");

-- CreateIndex
CREATE UNIQUE INDEX "AIFeasibilityScore_blockerId_key" ON "AIFeasibilityScore"("blockerId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");
