# ClipScope — Video Edit Analysis & Rating

A local-first prototype implementing the workflow and scope restrictions shown in the supplied project guidance.

## What it does

- Requires exactly one video category field.
- Accepts one or more raw source video clips.
- Accepts a natural-language editing brief and flags likely prohibited requests.
- Loads one generated/edited video for review.
- Enforces an explicit **automatic fail** gate for prohibited operations.
- Provides a weighted rubric with clip/timestamp evidence fields.
- Computes a weighted score only when rubric weights total 100%.
- Requires written evaluation notes.
- Tracks all five workflow deliverables.
- Saves project fields to browser localStorage.
- Exports a complete JSON evaluation report (schema v1.0.0, see below).
- Shows a polished Report Preview and prints / saves it as a clean PDF.
- Keeps a local history of saved reports: load, re-export, or delete each one.
- Supports browser Print / Save as PDF.

## Scope rules encoded

### Allowed
- Trim, cut, stitch, and reorder clips.
- Zoom, crop, and pan.
- Slow-motion or time-lapse.
- Transitions.
- Text or caption overlays.
- Keep, trim, or mute the original clip audio.

### Automatic fail / prohibited
- AI generation of new imagery or footage.
- Retouching or relighting.
- Greenscreen or background replacement.
- Color grading, filters, or LUTs.
- Generated title animations.
- Added music or any added audio not from source clips.
- Other manually identified out-of-scope behavior.

## Report export (v1.0.0)

### JSON report schema

“Export JSON report” downloads `clipscope-report-YYYY-MM-DD.json` with this
schema. Fields carried over from the 0.1.0 export keep the same shape, so older
readers keep working; the new fields add completeness.

| Field | Type | Notes |
|---|---|---|
| `reportFormat` | string | Always `"clipscope-report"`. |
| `reportVersion` | string | `"1.0.0"`. |
| `app` / `version` | string | `"ClipScope"` / `"1.0.0"`. |
| `reportId` | string | Unique id for this report (UUID when available). |
| `exportedAt` | string | ISO-8601 timestamp of the export. |
| `project` | object | `{ title, category }`. Title is derived from the category, or `"Untitled ClipScope project"`. |
| `deliverables` | array | All five workflow steps: `{ id, label, complete }`. Ids: `category`, `rawClips`, `editingPrompt`, `rubric`, `evaluation`. |
| `category` | string | The single taxonomy category (kept from 0.1.0). |
| `editingPrompt` | string | The natural-language brief (kept from 0.1.0). |
| `promptAnalysis` | object | `{ prompt, lintHits, passed }` — prohibited-language hits from the scope lint. |
| `rawClips` | array | `{ clipNumber, name, sizeBytes, type }` per clip (kept from 0.1.0). |
| `editedVideo` | string \| null | File name of the generated edit (kept from 0.1.0). |
| `capturedRange` | object | `{ startSeconds, endSeconds, startFormatted, endFormatted }` (`m:ss.s` strings are new). |
| `scope` | object | `{ outcome: "pass" \| "fail", autoFail, violations, violationsDetail, notes }`. `violations` stays a plain label list (0.1.0 shape); `violationsDetail` adds `{ id, label }` objects. |
| `rubric` | array | The criterion list exactly as edited: `{ name, weight, score, evidence, notes }` (kept from 0.1.0). |
| `rubricSummary` | object | `{ weightTotal, weightsValid, criteria, score, scored }`. `criteria` repeats the rubric with a per-criterion `weightedContribution` (weight × score / 100). `score` is `null` when weights do not total 100%, and `0` on an automatic fail. |
| `evaluation` | object | `{ score, notes }` (kept from 0.1.0). |
| `checklist` | array | `{ label, complete }` per deliverable (kept from 0.1.0). |

### Report preview & print

“Preview report” renders a clean, print-optimized report document on screen:
header with project title, category, report id and date; one section per
workflow deliverable; a rubric table with weights, scores, weighted
contributions and evidence; the scope-gate result; and the written evaluation
notes. “Print / Save PDF” prints that document (not a screenshot of the app),
so the saved PDF is a professional one-to-few-pages report. Printing without
opening the preview first still prints the app itself, as before.

### Report history

“Save report to history” stores the completed report in the browser's
localStorage (key `clipscope-reports`, newest first, capped at 50 entries).
The Saved reports list shows each entry's title, date, and score/status, with
three actions:

- **Load** — restores the report's fields into the editor (category, prompt,
  notes, rubric, scope flags, captured range). Video files are never stored,
  so re-select the raw clips and the generated edit if you need them.
- **Export JSON** — re-downloads that saved report's JSON file.
- **Delete** — removes the entry (with confirmation).

Everything stays local-first: no backend, no accounts, no uploads. “Save
locally” (the single in-progress project draft, key `clipscope-project`) is
unchanged and separate from report history.

## Run it

No build step is required.

1. Extract the ZIP.
2. Open `index.html` in a modern browser.

For more reliable local file behavior, serve the directory from a tiny local web server, e.g.:

```bash
python -m http.server 8080
```

Then visit `http://localhost:8080`.

## Important limitation

This version does **not** perform frame-by-frame computer vision or audio provenance analysis. The automatic-fail gate is based on:

1. prompt-language linting, and
2. reviewer-marked observed violations.

A production version can add local or API-based video analysis, clip provenance matching, transcript comparison, and model-assisted rubric drafting without changing the workflow or policy gate.
