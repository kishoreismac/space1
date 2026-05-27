# SPACE Assessment Platform

Enterprise, multi-tenant Developer Productivity assessment platform built on
the **SPACE** framework (Satisfaction · Performance · Activity · Collaboration · Efficiency).

This repo replaces the original static HTML mock-ups (`space_*.html`,
`SPACE_Enterprise_Template*.html`) with a real, database-backed application.

## Status

**Phase 0 — Project Scaffolding** ✅

See [`docs/04-implementation-plan.md`](docs/04-implementation-plan.md) for the
full 19-step plan and current progress.

## Stack

| Layer       | Choice                                             |
|-------------|----------------------------------------------------|
| Backend     | Node 20 · Express 4 · TypeScript                   |
| ORM / DB    | Prisma 5 · SQLite (dev) → Postgres (prod)          |
| Frontend    | React 18 · Vite · TypeScript · Tailwind            |
| Validation  | Zod (shared FE + BE)                               |
| Auth        | JWT + bcrypt                                       |
| Imports     | xlsx + papaparse                                   |
| PDF export  | pdfkit                                             |
| Tests       | Vitest + Supertest                                 |
| Monorepo    | npm workspaces                                     |

## Repository layout

```
packages/
  shared/          Zod schemas + SPACE-50 questionnaire + scoring engine
  backend/         Express API + Prisma schema + seeds
  frontend/        Vite + React admin & participant UI
docs/              Discovery, architecture, data model, plan
samples/           Importable CSV templates
```

## One-command setup

> Requires: Node 20+, npm 10+. Windows PowerShell, macOS, or Linux.

```bash
# 1. install all workspace dependencies
npm install

# 2. configure backend env
cp packages/backend/.env.example packages/backend/.env
#  → optionally edit JWT secrets and admin credentials

# 3. create the SQLite database and apply the schema
npm --workspace @space/backend run db:migrate

# 4. seed the production-safe data (admin user + global SPACE-50 template)
npm run seed

# 5. start both backend (:4000) and frontend (:5173)
npm run dev
```

## Useful scripts

| Command                   | What it does                                      |
|---------------------------|---------------------------------------------------|
| `npm run dev`             | Start backend + frontend in watch mode            |
| `npm test`                | Run all workspace test suites                     |
| `npm run build`           | Build every workspace                             |
| `npm run seed`            | Production seed (admin + canonical SPACE-50)      |
| `npm run seed:demo`       | **Dev only** — adds a demo company + team         |
| `npm --workspace @space/backend run db:reset` | Drop & recreate the dev DB    |

## Documentation

- [`docs/01-discovery.md`](docs/01-discovery.md) — what we learned from the
  original HTML/XLSX assets.
- [`docs/02-architecture.md`](docs/02-architecture.md) — stack rationale and
  module boundaries.
- [`docs/03-data-model.md`](docs/03-data-model.md) — Prisma entities, enums,
  constraints, indexes.
- [`docs/04-implementation-plan.md`](docs/04-implementation-plan.md) — phased
  roadmap and definition-of-done.

## Conventions

- The canonical SPACE-50 questionnaire lives in
  [`packages/shared/src/questionnaire/space50.ts`](packages/shared/src/questionnaire/space50.ts).
  It is the single source of truth.
- All scoring rules (reverse, bands, priorities, trend override, cross-pattern
  alerts, AI feasibility) live in
  [`packages/shared/src/scoring`](packages/shared/src/scoring) with full unit
  tests in [`packages/shared/tests/scoring.test.ts`](packages/shared/tests/scoring.test.ts).
- No worked-example data is shipped in production seeds. Demo data is
  quarantined to `seed.demo.ts` which refuses to run when
  `NODE_ENV=production`.

## License

Internal — not for public distribution.
