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
- Exports a JSON evaluation report.
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
