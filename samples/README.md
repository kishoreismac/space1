# SPACE Sample Data

This folder contains importable templates for the SPACE platform.

## Files

- `responses-template.csv` — canonical wide-format response export
  (header: `team,role,name,Q1,…,Q50`). Use as the upload format
  when bulk-importing survey responses.

## Notes

- All ratings are integers 1–5.
- Reverse-scored items are **NOT** pre-reversed; the scoring engine
  applies `6 − raw` for the canonical reverse list
  (Q3,8,12,17,19,22,23,25,26,27,30,32,37,41,42,45,48,49).
- Open-text questions (Q10, Q20, Q40, Q50) are free text.
- The `name` column is optional; leave blank for anonymous submissions.
