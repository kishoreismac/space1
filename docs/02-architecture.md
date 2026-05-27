# SPACE Platform — Architecture

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | Spec-recommended, fast dev loop |
| Styling | Tailwind CSS | Matches the dense, design-token-heavy UI from the HTMLs |
| Charts | Recharts | Spec-recommended, tree-shakable |
| State/data | TanStack Query + Zustand | Server cache vs UI state separation |
| Routing | React Router v6 | Standard |
| Backend | Node 20 + Express 4 + TypeScript | Spec-allowed "easier" branch; no Windows prereqs |
| ORM | Prisma 5 | Migrations, typed client, multi-DB |
| Database | SQLite (dev) → PostgreSQL (prod) | Same Prisma schema, switch via `DATABASE_URL` |
| Auth | JWT (access + refresh) + bcrypt | Simple, role-based |
| Validation | Zod (shared) | Used by API + frontend forms |
| File import | `xlsx` + `papaparse` | XLSX + CSV |
| PDF export | `pdfkit` (server) | Lightweight, no headless browser |
| Testing | Vitest (FE+BE shared), Supertest (API) | One runner, fast |
| Lint/format | ESLint + Prettier | Standard |
| Monorepo | npm workspaces | No extra tooling |

## Monorepo layout

```
/space1
├── package.json                    # npm workspaces root
├── tsconfig.base.json
├── README.md
├── docs/
│   ├── 01-discovery.md
│   ├── 02-architecture.md          (this file)
│   ├── 03-data-model.md
│   ├── 04-implementation-plan.md
│   └── scoring-logic.md            (added in Phase 5)
├── packages/
│   ├── shared/                     # types, scoring engine, zod schemas — used by FE & BE
│   │   ├── src/
│   │   │   ├── types/              # Company, Question, Submission, Score, Blocker…
│   │   │   ├── scoring/            # reverseScore, dimensionAverage, bands, alerts, ai-feasibility
│   │   │   ├── schemas/            # zod request/response schemas
│   │   │   └── index.ts
│   │   └── tests/                  # unit tests for the scoring engine
│   ├── backend/
│   │   ├── src/
│   │   │   ├── app.ts              # express factory
│   │   │   ├── server.ts           # bootstrap
│   │   │   ├── config/             # env, logger
│   │   │   ├── auth/               # jwt, password, role guards
│   │   │   ├── middleware/         # error, audit, rate-limit
│   │   │   ├── modules/
│   │   │   │   ├── companies/
│   │   │   │   ├── teams/
│   │   │   │   ├── questionnaires/
│   │   │   │   ├── campaigns/
│   │   │   │   ├── survey/         # public participant endpoints
│   │   │   │   ├── submissions/
│   │   │   │   ├── scoring/
│   │   │   │   ├── analysis/       # P1..P5
│   │   │   │   ├── imports/        # csv/xlsx
│   │   │   │   └── reports/        # csv/excel/pdf
│   │   │   └── prisma/             # PrismaClient wrapper
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── seed.ts             # production seed: admin user + global questionnaire template only
│   │   │   └── seed.demo.ts        # dev-only Land O'Lakes worked example
│   │   └── tests/                  # api integration tests
│   └── frontend/
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── router.tsx
│       │   ├── lib/                # api client, auth store, query client
│       │   ├── layouts/
│       │   │   ├── AdminLayout.tsx
│       │   │   └── PublicLayout.tsx
│       │   ├── components/         # shared UI (Button, Card, Table, ScoreBadge, DimensionChip…)
│       │   └── features/
│       │       ├── auth/
│       │       ├── companies/
│       │       ├── teams/
│       │       ├── questionnaires/
│       │       ├── campaigns/
│       │       ├── survey/         # public participant flow /survey/:token
│       │       ├── submissions/
│       │       ├── analysis/
│       │       │   ├── Phase1Triage/
│       │       │   ├── Phase2OpenText/
│       │       │   ├── Phase3CrossValidate/
│       │       │   ├── Phase4Journey/
│       │       │   └── Phase5Registry/
│       │       └── reports/
│       ├── public/
│       └── tailwind.config.ts
└── samples/                        # importable demo files
    ├── questionnaire-50q.csv
    ├── landolakes-responses.csv
    └── README.md
```

## Module boundaries

- **`shared`** owns *all* business logic that has to behave identically on client and server: reverse scoring, dimension averages, band/priority mapping, cross-pattern alerts, AI-feasibility weighted score, classification. No I/O, no React, no Express.
- **`backend/modules/*`** own persistence + HTTP. Each module exports: `router.ts`, `service.ts`, `repository.ts` (Prisma), optionally `dto.ts`.
- **`frontend/features/*`** own pages + feature-scoped components + API hooks. Cross-feature components live in `components/`.

## Request lifecycle

```
Browser → /api/* → Express
                  → routing → auth middleware → role guard
                            → zod validation (shared schema)
                            → service (orchestration)
                            → repository (Prisma)
                  → response (DTO) ─┐
Browser ← JSON ───────────────────────┘
```

## Auth model

- `Authorization: Bearer <JWT>` for admin routes.
- Public survey routes are unauthenticated but token-scoped: `/api/survey/:token` validates the `SurveyInvite.uniqueToken` and the campaign window.
- Roles: `SUPER_ADMIN`, `COMPANY_ADMIN`, `ANALYST`, `PARTICIPANT` (transient — used only when a survey token is exchanged for a per-session participant context).
- Server-side authorisation enforced by `requireRole(...roles)` middleware. Company-scoped resources additionally pass `requireCompanyAccess(companyId)`.

## Score calculation flow

```
Submission saved
  → background or sync trigger: scoring.recalculate(campaignId)
      → load all completed submissions
      → for each answer: apply reverse if needed
      → compute per-dimension averages per submission AND per campaign
      → upsert ScoreSummary rows (one per dim per campaign)
      → derive cross-pattern alerts + psych-safety gate
  → exposed via GET /api/campaigns/:id/scores
```

Scoring is *pure* and lives in `shared/scoring/` so it can run client-side too (e.g. participant's optional individual summary).

## Five-phase workflow data flow

```
Phase 1: ScoreSummary  (auto from Submissions)
Phase 2: OpenTextTheme (analyst-curated from open-text Answers)
Phase 3: ValidationSignal (mix of import + manual; rolls up confirmation count per candidate blocker)
Phase 4: JourneyMapSession + JourneyMapStep (workshop capture)
Phase 5: Blocker + AIFeasibilityScore (registry promoted from P3/P4)
```

Each phase page reads its source data + writes its own artefacts via dedicated endpoints (`/api/campaigns/:id/phase{1..5}` GET, and resource-specific POST/PUT).

## Deployment shape (target)

- Backend: container on Azure App Service / any Node host.
- DB: Azure Database for PostgreSQL Flexible Server.
- Frontend: served as static build from CDN or by Express in single-host mode.
- Secrets via env vars: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGINS`.

## Non-goals (explicitly out of v1)

- SSO / SAML / Azure AD federation (login is local JWT first; hook can be added later).
- Background job system (scoring is synchronous; can move to BullMQ later if needed).
- Real-time updates (no WebSockets; polling is enough for analyst UX).
- Mobile native apps.
