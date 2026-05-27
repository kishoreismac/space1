# SPACE Platform — Implementation Plan

Each "step" below maps 1:1 to the user spec §10 sequence. After every step I will:
1. List files added/changed
2. Run build + tests
3. Report a completion checklist
4. **Pause** for direction unless you've told me to chain straight into the next step.

## Status legend
- 🟢 done · 🟡 in progress · ⚪ pending

| # | Step | Status |
|---|---|---|
| 1 | Inspect files + summarise (this set of docs) | 🟢 |
| 2 | Architecture plan + folder structure | 🟢 |
| 3 | Database schema (Prisma) + migrations | 🟡 — schema written, migration run in Phase 0 |
| 4 | Backend APIs: auth, companies, teams, questionnaires, campaigns, submissions, scoring | ⚪ |
| 5 | Frontend layouts: Admin, Participant, Public | ⚪ |
| 6 | Admin → Company Management | ⚪ |
| 7 | Questionnaire builder + CSV/XLSX import | ⚪ |
| 8 | Campaign management + survey link generator | ⚪ |
| 9 | Participant survey flow (`/survey/:token`) | ⚪ |
| 10 | Scoring engine integration + score-summary dashboard | ⚪ (engine itself ships in Phase 0) |
| 11 | Phase 1 — Score Triage UI | ⚪ |
| 12 | Phase 2 — Open Text Analysis UI | ⚪ |
| 13 | Phase 3 — Quantitative Cross-Validation UI | ⚪ |
| 14 | Phase 4 — Journey Mapping UI | ⚪ |
| 15 | Phase 5 — Blocker Registry + AI Feasibility UI | ⚪ |
| 16 | Reporting + CSV/Excel/PDF export | ⚪ |
| 17 | Test pass (scoring already covered) | ⚪ |
| 18 | Responsive polish | ⚪ |
| 19 | README + deployment guide | ⚪ (initial README in Phase 0) |

## Phase 0 deliverable (this batch)

- npm-workspaces monorepo (`packages/shared`, `packages/backend`, `packages/frontend`)
- Prisma schema covering every entity in `docs/03-data-model.md`
- SQLite dev DB + first migration
- **Scoring engine** in `packages/shared` with full unit-test coverage (acceptance-criteria-grade)
- Express skeleton with `/api/health` and one real endpoint (`/api/scoring/calculate` consuming the engine — useful smoke test)
- Vite + React + Tailwind skeleton with admin shell shape (top nav from the Enterprise Template) and a placeholder participant survey route
- Production seed (admin user + global SPACE-50 questionnaire template — the canonical questionnaire extracted from the XLSX). **No worked-example data.**
- Dev-only seed (Land O'Lakes demo) gated behind `npm run seed:demo`
- `samples/` folder with importable CSV files
- Root README with one-command setup

## Vertical-slice principle

After Phase 0 the next step is steps 4+5+6 collapsed: smallest possible end-to-end slice — **log in as admin → create company → see it in a list** — to prove the architecture works before we expand horizontally. Each subsequent step adds one feature thinly through all layers.

## Definition of done (per step)

- Types compile (`tsc --noEmit`) across all packages.
- Lint passes.
- New/changed scoring logic has a unit test.
- New API endpoint has at least one supertest integration test.
- README updated if a new command is needed.
