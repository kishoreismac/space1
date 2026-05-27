# SPACE Platform — Discovery & Feature Inventory

Source files inspected:
- `space_survey.html` — participant survey (50 Q, 5 dims, reverse scoring, export)
- `space_analysis_system.html` — five-phase analyst workflow (with worked example)
- `space_complete_system.html` — combined system
- `SPACE_Enterprise_Template.html` — admin shell (Setup → Survey → P1…P5 nav)
- `SPACE_Survey_Instrument.xlsx` — canonical question bank + response data format
- `SPACE_Five_Phase_Analysis.xlsx` — phase-by-phase analysis template
- `SPACE_Enterprise_Template_BLANK.xlsx` — empty enterprise template
- `SPACE_Worked_Example_LandOLakes.xlsx` — worked example dataset

---

## 1. Canonical questionnaire (extracted)

**50 questions across 5 dimensions, 9 Likert + 1 open-text per dimension.**

| Dim | Range | Open-text Q | Reverse-scored Qs |
|-----|-------|-------------|-------------------|
| S — Satisfaction & Wellbeing | Q1–Q10 | Q10 | Q3, Q8 |
| P — Performance & Outcomes | Q11–Q20 | Q20 | Q12, Q17, Q19 |
| A — Activity & Output Patterns | Q21–Q30 | (none — Q30 is Likert) | Q22, Q23, Q25, Q26, Q27, Q30 |
| C — Communication & Collaboration | Q31–Q40 | Q40 | Q32, Q37 |
| E — Efficiency & Flow | Q41–Q50 | Q50 | Q41, Q42, Q45, Q48, Q49 |

> **Reverse list (full):** Q3, 8, 12, 17, 19, 22, 23, 25, 26, 27, 30, 32, 37, 41, 42, 45, 48, 49 (18 questions).
> **Open-text:** Q10, Q20, Q40, Q50 (4 questions).
> **Psych-safety gate:** Q7 — if average < 2.5, suppress journey workshops and replace with 1:1 interviews.

Every question carries: number, dimension, text, blocker-signal label, type, reverse flag, scale labels (low/high), tooltip.

## 2. Scoring & analysis rules

- **Reverse score:** `scored = 6 − raw` for flagged questions.
- **Dimension average:** mean of Likert scored values for that dimension across a submission (or campaign).
- **Score bands:** 1.0–2.0 Critical · 2.1–2.9 Significant · 3.0–3.4 Moderate · 3.5–4.2 Healthy · 4.3–5.0 Excellent.
- **Priority:** Critical=P1, Significant=P2, Moderate=P3, Healthy/Excellent=Monitor. **Override:** trend drop > 0.4 pts vs previous cycle → upgrade to P1 regardless of absolute score.
- **Cross-pattern alerts** (computed at campaign level):
  - `S ≤ 2.9 && E ≤ 2.9` → Tooling harm / highest AI ROI
  - `A ≥ 3.5 && S ≤ 2.9` → Hidden toil
  - `S ≤ 2.9 && P ≥ 3.0` → Heroics / attrition risk
  - `C ≤ 2.9 && 3.0 ≤ P ≤ 3.4` → Coordination overhead
  - `Q7 avg < 2.5` → Psych-safety gate: data may be understated
- **Open-text theme thresholds:** ≥30% Promote · 15–29% Investigate · <15% Monitor.
- **Triangulation gate (Phase 3):** ≥2 independent confirming signals (survey + quant + open-text) → promote to registry.
- **AI feasibility weights:** Tool Maturity 25%, Integration Ease 20%, Cost Efficiency 25%, Data Availability 15%, Dev Adoption 15%. *(Spec doc says 20/20/15/25/20 — both will be supported, configurable per campaign; defaults match the XLSX worked example: 25/20/25/15/15.)*
- **Classification:** Quick Win, Strategic Bet, Monitor, Defer (rules per spec §6 / Phase 5).

## 3. Discovered admin UX (from Enterprise Template)

Top nav: `Setup · Survey · P1 Triage · P2 Themes · P3 Validate · P4 Journey · P5 Registry` with a 7-dot progress trail.

**Setup page** captures: company name, team, survey cycle, assessment lead, VP email, target respondents, previous cycle id, close date, context notes — then a **survey link generator** (individual or shared), **bulk CSV import**, **previous-cycle score entry** for trend deltas.

**Survey page** (admin preview) mirrors the public survey, scoped to the saved org context.

**P1–P5 panels** each follow the same shape: hero header + 4 collapsible "Activity" blocks + a decision-gate callout + results tables/cards + export buttons.

## 4. Discovered participant UX (from `space_survey.html`)

- Sticky progress bar (`x / 50`) anchored to dark header.
- "About you" context card (team / role / years / language) — all optional fields per spec § Phase 3.
- Per-dimension section header with color chip + live dimension-average preview that updates on each answer.
- Per-question card: number, text, reverse tag, "↳ blocker signal" caption, then either 1–5 button row with low/high labels OR a textarea for open-text Qs with prompt "exact words are valuable, do not edit".
- Results panel: per-dimension bar + score + band chip + cross-pattern alerts + Excel/JSON/CSV export.

## 5. Export format (canonical, from XLSX + survey JS)

Per-respondent row: `team, role, name, Q1..Q50` (raw values; reverse applied on import). JSON adds metadata header listing reverse-scored Q numbers and open-text Q numbers.

## 6. Worked-example data

`SPACE_Worked_Example_LandOLakes.xlsx` and the analysis HTML embed Land O'Lakes Engineering Q2 2025 (38 respondents, scores S2.4 P3.1 A3.8 C2.6 E2.2). **This must NOT be hardcoded into the production default.** It will live in a `prisma/seed.demo.ts` script and an importable `/samples/landolakes.xlsx` for demos only.
