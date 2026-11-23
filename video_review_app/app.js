const APP_NAME = 'ClipScope';
const APP_VERSION = '1.0.0';
const REPORT_FORMAT = 'clipscope-report';
const REPORT_VERSION = '1.0.0';
const HISTORY_KEY = 'clipscope-reports';
const HISTORY_LIMIT = 50;

function newReportId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `rep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const scopeRules = [
  { id: 'newImagery', label: 'AI-generated new imagery or footage' },
  { id: 'retouch', label: 'Retouching or relighting' },
  { id: 'greenscreen', label: 'Greenscreen or background replacement' },
  { id: 'color', label: 'Color grading, filters, or LUTs' },
  { id: 'titleAnim', label: 'Generated title animations' },
  { id: 'addedAudio', label: 'Added music or audio not present in source clips' }
];

const forbiddenPatterns = [
  ['AI-generated new imagery or footage', /\b(generate|create|synthesize|ai[- ]?generate).{0,30}\b(image|imagery|footage|scene|shot|b[- ]?roll)\b/i],
  ['Retouching or relighting', /\b(retouch|relight|beauty pass|skin smooth|remove blemish|lighting correction)\b/i],
  ['Greenscreen or background replacement', /\b(green ?screen|chroma key|replace (the )?background|background replacement|remove background)\b/i],
  ['Color grading, filters, or LUTs', /\b(color grade|colour grade|grading|filter|lut|look-up table)\b/i],
  ['Generated title animations', /\b(animated title|title animation|generate(d)? title)\b/i],
  ['Added music/audio not from source clips', /\b(add|insert|generate|compose).{0,20}\b(music|song|soundtrack|sfx|sound effect|voiceover|voice-over|audio)\b/i]
];

const defaultCriteria = [
  { name: 'Cutting and ordering', weight: 25, score: 0, evidence: 'Clip refs / timestamps', notes: '' },
  { name: 'Framing and motion (zoom/crop/pan only)', weight: 15, score: 0, evidence: 'Timestamps', notes: '' },
  { name: 'Time changes (slow-motion/time-lapse only)', weight: 15, score: 0, evidence: 'Timestamps', notes: '' },
  { name: 'Transitions', weight: 15, score: 0, evidence: 'Timestamps', notes: '' },
  { name: 'Text / caption overlays', weight: 15, score: 0, evidence: 'Timestamps', notes: '' },
  { name: 'Original clip audio handling', weight: 15, score: 0, evidence: 'Clip refs / timestamps', notes: '' }
];

const state = {
  clips: [], editedVideoName: '', rubric: structuredClone(defaultCriteria), capturedStart: null, capturedEnd: null,
  // One stable id per evaluation: export, preview, and history-save of the
  // same project all share it, so a report keeps its identity.
  reportId: newReportId()
};

const $ = id => document.getElementById(id);
const els = {
  category: $('category'), prompt: $('prompt'), promptLint: $('promptLint'), rawClips: $('rawClips'),
  clipList: $('clipList'), editedVideo: $('editedVideo'), videoPlayer: $('videoPlayer'),
  setStart: $('setStart'), setEnd: $('setEnd'), timeCapture: $('timeCapture'), scopeRules: $('scopeRules'),
  manualUnknownViolation: $('manualUnknownViolation'), violationNotes: $('violationNotes'), scopeResult: $('scopeResult'),
  rubric: $('rubric'), weightTotal: $('weightTotal'), overallNotes: $('overallNotes'), finalScore: $('finalScore'),
  finalStatus: $('finalStatus'), checklist: $('checklist'), projectStatus: $('projectStatus'),
  reportView: $('reportView'), reportDoc: $('reportDoc'), reportHistory: $('reportHistory')
};

function fmtTime(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rem = (s % 60).toFixed(1).padStart(4, '0');
  return `${m}:${rem}`;
}

function renderScopeRules() {
  els.scopeRules.innerHTML = scopeRules.map(r => `
    <label class="scope-rule">
      <input type="checkbox" data-scope-id="${r.id}">
      <span><strong>${r.label}</strong><br><small>Check only if observed in the generated edit.</small></span>
    </label>
  `).join('');
  document.querySelectorAll('[data-scope-id]').forEach(x => x.addEventListener('change', updateAll));
}

function lintPrompt() {
  const text = els.prompt.value.trim();
  if (!text) {
    els.promptLint.className = 'notice neutral';
    els.promptLint.textContent = 'No prompt entered yet.';
    return [];
  }
  const hits = forbiddenPatterns.filter(([, rx]) => rx.test(text)).map(([name]) => name);
  if (hits.length) {
    els.promptLint.className = 'notice bad';
    els.promptLint.textContent = `Potentially out of scope: ${hits.join('; ')}. Revise the prompt before using it.`;
  } else {
    els.promptLint.className = 'notice good';
    els.promptLint.textContent = 'Prompt passes the prototype scope-language check.';
  }
  return hits;
}

function renderClips() {
  if (!state.clips.length) {
    els.clipList.className = 'clip-list empty';
    els.clipList.textContent = 'No raw clips selected.';
    return;
  }
  els.clipList.className = 'clip-list';
  els.clipList.innerHTML = state.clips.map((c, i) => `
    <div class="clip-item"><div><strong>Clip ${i+1}</strong> — ${c.name}</div><div class="clip-meta">${(c.size/1024/1024).toFixed(1)} MB</div></div>
  `).join('');
}

function renderRubric() {
  els.rubric.innerHTML = state.rubric.map((r, i) => `
    <div class="criterion" data-index="${i}">
      <div class="criterion-grid">
        <label>Criterion
          <input data-field="name" value="${escapeHtml(r.name)}" />
        </label>
        <label>Weight %
          <input data-field="weight" type="number" min="0" max="100" step="1" value="${r.weight}" />
        </label>
        <label>Score / 100
          <input data-field="score" type="number" min="0" max="100" step="1" value="${r.score}" />
        </label>
      </div>
      <label>Evidence (clip numbers / real timestamps)
        <input data-field="evidence" value="${escapeHtml(r.evidence || '')}" />
      </label>
      <label>Notes
        <textarea data-field="notes" rows="2">${escapeHtml(r.notes || '')}</textarea>
      </label>
      <button type="button" class="remove" data-remove="${i}">Remove criterion</button>
    </div>
  `).join('');

  els.rubric.querySelectorAll('[data-field]').forEach(input => {
    input.addEventListener('input', e => {
      const idx = Number(e.target.closest('.criterion').dataset.index);
      const field = e.target.dataset.field;
      let value = e.target.value;
      if (field === 'weight' || field === 'score') value = Math.max(0, Math.min(100, Number(value) || 0));
      state.rubric[idx][field] = value;
      updateAll(false);
    });
  });
  els.rubric.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', () => {
    state.rubric.splice(Number(btn.dataset.remove), 1);
    renderRubric(); updateAll(false);
  }));
}

function scopeViolationsDetail() {
  const checked = [...document.querySelectorAll('[data-scope-id]:checked')].map(x => {
    const rule = scopeRules.find(r => r.id === x.dataset.scopeId);
    return rule ? { id: rule.id, label: rule.label } : null;
  }).filter(Boolean);
  if (els.manualUnknownViolation.checked) checked.push({ id: 'other', label: 'Other out-of-scope behavior observed' });
  return checked;
}

function scopeViolations() {
  return scopeViolationsDetail().map(v => v.label);
}

function computeScore() {
  const violations = scopeViolations();
  if (violations.length) return { score: 0, autoFail: true, violations };
  const totalWeight = state.rubric.reduce((a, r) => a + Number(r.weight || 0), 0);
  if (Math.round(totalWeight * 100) / 100 !== 100) return { score: null, autoFail: false, violations: [] };
  const weighted = state.rubric.reduce((a, r) => a + (Number(r.weight || 0) * Number(r.score || 0) / 100), 0);
  return { score: Math.round(weighted * 10) / 10, autoFail: false, violations: [] };
}

function completion() {
  const weightTotal = state.rubric.reduce((a,r)=>a+Number(r.weight||0),0);
  const rubricComplete = state.rubric.length > 0 && Math.round(weightTotal*100)/100 === 100 && state.rubric.every(r => r.name.trim() && r.evidence.trim());
  return [
    ['A chosen video category', !!els.category.value.trim()],
    ['Raw source footage: multiple clips or one long clip', state.clips.length > 0],
    ['A natural-language editing prompt', !!els.prompt.value.trim()],
    ['A finalized grading rubric: corrected by you', rubricComplete],
    ['A scored evaluation of the AI edit, with written notes', !!state.editedVideoName && !!els.overallNotes.value.trim()]
  ];
}

function updateAll(runLint = true) {
  if (runLint) lintPrompt();
  const violations = scopeViolations();
  if (violations.length) {
    els.scopeResult.className = 'notice bad';
    els.scopeResult.textContent = `Automatic fail: ${violations.join('; ')}`;
  } else {
    els.scopeResult.className = 'notice good';
    els.scopeResult.textContent = 'No prohibited edit operation has been marked.';
  }

  const weightTotal = state.rubric.reduce((a, r) => a + Number(r.weight || 0), 0);
  els.weightTotal.textContent = `${Math.round(weightTotal*100)/100}%`;
  els.weightTotal.style.color = Math.round(weightTotal*100)/100 === 100 ? '#214d1e' : '#8a1d1d';

  const result = computeScore();
  if (result.autoFail) {
    els.finalScore.textContent = '0';
    els.finalStatus.textContent = 'AUTO-FAIL';
    els.finalStatus.className = 'pill fail';
  } else if (result.score == null) {
    els.finalScore.textContent = '—';
    els.finalStatus.textContent = 'Fix weights';
    els.finalStatus.className = 'pill';
  } else {
    els.finalScore.textContent = result.score.toFixed(1);
    els.finalStatus.textContent = 'Scored';
    els.finalStatus.className = 'pill pass';
  }

  const items = completion();
  els.checklist.innerHTML = items.map(([label, done]) => `<div class="check-item"><span class="checkmark ${done?'done':''}">${done?'✓':''}</span><span>${label}</span></div>`).join('');
  const doneCount = items.filter(([,d])=>d).length;
  els.projectStatus.textContent = `${doneCount}/5 complete`;
  els.projectStatus.className = `pill ${doneCount===5 ? 'pass' : ''}`;
}

/**
 * ClipScope report schema (reportVersion 1.0.0).
 *
 * Top-level fields kept from the 0.1.0 export, unchanged in shape, so older
 * readers keep working: app, version, exportedAt, category, editingPrompt,
 * rawClips, editedVideo, capturedRange, scope.violations (string labels),
 * rubric (plain criterion array), evaluation, checklist.
 *
 * New in 1.0.0: reportFormat, reportVersion, reportId, project metadata,
 * deliverables (all five workflow steps with completion state), promptAnalysis,
 * scope.outcome + scope.violationsDetail, rubricSummary (weights, weighted
 * contributions, computed score), and formatted capture times.
 */
function buildReport() {
  const result = computeScore();
  const weightTotal = state.rubric.reduce((a, r) => a + Number(r.weight || 0), 0);
  const lintHits = lintPrompt();
  const category = els.category.value.trim();
  const deliverables = completion().map(([label, complete], i) => ({
    id: ['category', 'rawClips', 'editingPrompt', 'rubric', 'evaluation'][i],
    label, complete
  }));
  const criteria = state.rubric.map(r => ({
    name: r.name, weight: Number(r.weight || 0), score: Number(r.score || 0),
    weightedContribution: Math.round(Number(r.weight || 0) * Number(r.score || 0) / 100 * 10) / 10,
    evidence: r.evidence || '', notes: r.notes || ''
  }));
  return {
    reportFormat: REPORT_FORMAT,
    reportVersion: REPORT_VERSION,
    app: APP_NAME,
    version: APP_VERSION,
    reportId: state.reportId,
    exportedAt: new Date().toISOString(),
    project: {
      title: category ? `ClipScope — ${category}` : 'Untitled ClipScope project',
      category: category || null
    },
    deliverables,
    category,
    editingPrompt: els.prompt.value.trim(),
    promptAnalysis: { prompt: els.prompt.value.trim(), lintHits, passed: lintHits.length === 0 },
    rawClips: state.clips.map((c, i) => ({ clipNumber: i + 1, name: c.name, sizeBytes: c.size, type: c.type })),
    editedVideo: state.editedVideoName || null,
    capturedRange: {
      startSeconds: state.capturedStart, endSeconds: state.capturedEnd,
      startFormatted: fmtTime(state.capturedStart), endFormatted: fmtTime(state.capturedEnd)
    },
    scope: {
      outcome: result.autoFail ? 'fail' : 'pass',
      autoFail: result.autoFail,
      violations: result.violations,
      violationsDetail: scopeViolationsDetail(),
      notes: els.violationNotes.value.trim()
    },
    rubric: state.rubric,
    rubricSummary: {
      weightTotal: Math.round(weightTotal * 100) / 100,
      weightsValid: Math.round(weightTotal * 100) / 100 === 100,
      criteria,
      score: result.score,
      scored: result.score != null && !result.autoFail
    },
    evaluation: { score: result.score, notes: els.overallNotes.value.trim() },
    checklist: completion().map(([label, complete]) => ({ label, complete }))
  };
}

function projectData() {
  return buildReport();
}

function saveLocal() {
  localStorage.setItem('clipscope-project', JSON.stringify({
    category: els.category.value, prompt: els.prompt.value, editedVideoName: state.editedVideoName,
    violationNotes: els.violationNotes.value, overallNotes: els.overallNotes.value,
    rubric: state.rubric, scopeIds: [...document.querySelectorAll('[data-scope-id]:checked')].map(x=>x.dataset.scopeId),
    manualUnknownViolation: els.manualUnknownViolation.checked,
    capturedStart: state.capturedStart, capturedEnd: state.capturedEnd
  }));
  alert('Project fields saved locally. Video files themselves are not stored by the browser.');
}

function applyProjectFields(p) {
  if (p.reportId) state.reportId = p.reportId;
  els.category.value = p.category || ''; els.prompt.value = p.prompt || ''; els.violationNotes.value = p.violationNotes || '';
  els.overallNotes.value = p.overallNotes || ''; state.rubric = p.rubric?.length ? p.rubric : structuredClone(defaultCriteria);
  state.editedVideoName = p.editedVideoName || ''; state.capturedStart = p.capturedStart ?? null; state.capturedEnd = p.capturedEnd ?? null;
  renderRubric();
  document.querySelectorAll('[data-scope-id]').forEach(x => { x.checked = false; });
  (p.scopeIds || []).forEach(id => { const x = document.querySelector(`[data-scope-id="${id}"]`); if (x) x.checked = true; });
  els.manualUnknownViolation.checked = !!p.manualUnknownViolation;
  els.timeCapture.textContent = `Start ${fmtTime(state.capturedStart)} / End ${fmtTime(state.capturedEnd)}`;
  updateAll();
}

function loadLocal() {
  const raw = localStorage.getItem('clipscope-project');
  if (!raw) return;
  try { applyProjectFields(JSON.parse(raw)); } catch {}
}

function exportJson() {
  const blob = new Blob([JSON.stringify(projectData(), null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `clipscope-report-${new Date().toISOString().slice(0,10)}.json`; a.click();
  URL.revokeObjectURL(a.href);
}

function downloadReportJson(report, filename) {
  const blob = new Blob([JSON.stringify(report, null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = filename; a.click();
  URL.revokeObjectURL(a.href);
}

/* ---- Printable report view + preview ---- */

function renderReportView() {
  const r = buildReport();
  const date = new Date(r.exportedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const statusText = r.scope.outcome === 'fail' ? 'AUTOMATIC FAIL' : (r.rubricSummary.scored ? `Scored — ${r.evaluation.score.toFixed(1)} / 100` : 'Not yet scored');
  const statusClass = r.scope.outcome === 'fail' ? 'fail' : (r.rubricSummary.scored ? 'pass' : '');
  const rows = r.rubricSummary.criteria.map(c => `
    <tr>
      <td>${escapeHtml(c.name) || '—'}</td>
      <td class="num">${c.weight}%</td>
      <td class="num">${c.score}</td>
      <td class="num">${c.weightedContribution.toFixed(1)}</td>
      <td>${escapeHtml(c.evidence) || '—'}</td>
      <td>${escapeHtml(c.notes) || '—'}</td>
    </tr>`).join('');
  const clips = r.rawClips.length
    ? r.rawClips.map(c => `<li>Clip ${c.clipNumber} — ${escapeHtml(c.name)} (${(c.sizeBytes / 1024 / 1024).toFixed(1)} MB)</li>`).join('')
    : '<li>No raw clips recorded.</li>';
  const violations = r.scope.violations.length
    ? `<ul>${r.scope.violations.map(v => `<li>${escapeHtml(v)}</li>`).join('')}</ul>`
    : '<p>No prohibited operation was marked.</p>';
  const checks = r.deliverables.map(d => `<li class="${d.complete ? 'done' : ''}">${d.complete ? '✓' : '○'} ${escapeHtml(d.label)}</li>`).join('');
  els.reportDoc.innerHTML = `
    <div class="report-doc">
      <header class="report-header">
        <div>
          <p class="report-kicker">ClipScope — Video Edit Analysis &amp; Rating</p>
          <h1>${escapeHtml(r.project.title)}</h1>
          <p class="muted">Category: ${escapeHtml(r.project.category || '—')} &nbsp;·&nbsp; Report ID: ${escapeHtml(r.reportId)} &nbsp;·&nbsp; ${escapeHtml(date)}</p>
        </div>
        <div class="pill ${statusClass}">${statusText}</div>
      </header>

      <section class="report-section">
        <h2>Workflow deliverables</h2>
        <ul class="report-checks">${checks}</ul>
      </section>

      <section class="report-section">
        <h2>1 · Project setup</h2>
        <p><strong>Category:</strong> ${escapeHtml(r.category) || '—'}</p>
        <p><strong>Editing prompt:</strong></p>
        <blockquote>${escapeHtml(r.editingPrompt) || '—'}</blockquote>
        <p><strong>Prompt scope check:</strong> ${r.promptAnalysis.passed ? 'Passed — no prohibited language detected.' : `Flagged: ${escapeHtml(r.promptAnalysis.lintHits.join('; '))}`}</p>
      </section>

      <section class="report-section">
        <h2>2 · Raw source footage</h2>
        <ul>${clips}</ul>
      </section>

      <section class="report-section">
        <h2>3 · Generated edit</h2>
        <p><strong>Edited video:</strong> ${escapeHtml(r.editedVideo) || '—'}</p>
        <p><strong>Captured range:</strong> ${escapeHtml(r.capturedRange.startFormatted)} – ${escapeHtml(r.capturedRange.endFormatted)}</p>
      </section>

      <section class="report-section">
        <h2>4 · Scope gate — ${r.scope.outcome === 'fail' ? 'AUTOMATIC FAIL' : 'PASS'}</h2>
        ${violations}
        ${r.scope.notes ? `<p><strong>Violation notes:</strong> ${escapeHtml(r.scope.notes)}</p>` : ''}
      </section>

      <section class="report-section">
        <h2>5 · Weighted rubric</h2>
        <table class="report-table">
          <thead><tr><th>Criterion</th><th>Weight</th><th>Score / 100</th><th>Weighted</th><th>Evidence</th><th>Notes</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td><strong>Total</strong></td><td class="num"><strong>${r.rubricSummary.weightTotal}%</strong></td><td></td><td class="num"><strong>${r.rubricSummary.scored ? r.evaluation.score.toFixed(1) : '—'}</strong></td><td colspan="2">${r.rubricSummary.weightsValid ? '' : 'Weights must total 100% to score.'}</td></tr></tfoot>
        </table>
      </section>

      <section class="report-section">
        <h2>Evaluation notes</h2>
        <blockquote>${escapeHtml(r.evaluation.notes) || '—'}</blockquote>
      </section>

      <footer class="report-footer">
        Generated by ClipScope ${APP_VERSION} · Report format ${REPORT_FORMAT} ${REPORT_VERSION} · Local-first: no data leaves this browser.
      </footer>
    </div>`;
  return r;
}

function showReportPreview() {
  renderReportView();
  els.reportView.hidden = false;
  els.reportView.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

function hideReportPreview() {
  els.reportView.hidden = true;
}

function printReport() {
  renderReportView();
  els.reportView.hidden = false;
  document.body.classList.add('printing-report');
  window.print();
}
window.addEventListener('afterprint', () => {
  document.body.classList.remove('printing-report');
});

/* ---- Report history (localStorage, local-first) ---- */

function readHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function writeHistory(list) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_LIMIT)));
}

function saveReportToHistory() {
  const report = buildReport();
  const entry = {
    id: report.reportId,
    savedAt: report.exportedAt,
    title: report.project.title,
    category: report.project.category,
    score: report.evaluation.score,
    autoFail: report.scope.autoFail,
    report
  };
  const list = readHistory().filter(e => e.id !== entry.id);
  list.unshift(entry);
  writeHistory(list);
  renderHistory();
  alert(`Report saved to history (${list.length} saved).`);
}

function renderHistory() {
  const list = readHistory();
  if (!list.length) {
    els.reportHistory.innerHTML = '<p class="muted">No saved reports yet. Complete an evaluation and use “Save report to history”.</p>';
    return;
  }
  els.reportHistory.innerHTML = list.map(e => {
    const date = new Date(e.savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    const status = e.autoFail ? 'AUTO-FAIL' : (e.score != null ? `${Number(e.score).toFixed(1)} / 100` : 'Not scored');
    return `
    <div class="history-item" data-history-id="${escapeHtml(e.id)}">
      <div class="history-meta">
        <strong>${escapeHtml(e.title)}</strong>
        <span class="muted">${escapeHtml(date)} · ${status}</span>
      </div>
      <div class="history-actions">
        <button type="button" data-history-load="${escapeHtml(e.id)}">Load</button>
        <button type="button" data-history-export="${escapeHtml(e.id)}">Export JSON</button>
        <button type="button" class="danger" data-history-delete="${escapeHtml(e.id)}">Delete</button>
      </div>
    </div>`;
  }).join('');
  els.reportHistory.querySelectorAll('[data-history-load]').forEach(btn => btn.addEventListener('click', () => loadReportFromHistory(btn.dataset.historyLoad)));
  els.reportHistory.querySelectorAll('[data-history-export]').forEach(btn => btn.addEventListener('click', () => exportHistoryReport(btn.dataset.historyExport)));
  els.reportHistory.querySelectorAll('[data-history-delete]').forEach(btn => btn.addEventListener('click', () => deleteHistoryReport(btn.dataset.historyDelete)));
}

function loadReportFromHistory(id) {
  const entry = readHistory().find(e => e.id === id);
  if (!entry) return;
  const r = entry.report;
  applyProjectFields({
    reportId: entry.id,
    category: r.category || '',
    prompt: r.editingPrompt || '',
    violationNotes: r.scope?.notes || '',
    overallNotes: r.evaluation?.notes || '',
    rubric: r.rubric,
    scopeIds: (r.scope?.violationsDetail || []).map(v => v.id).filter(x => x !== 'other'),
    manualUnknownViolation: (r.scope?.violationsDetail || []).some(v => v.id === 'other'),
    editedVideoName: r.editedVideo || '',
    capturedStart: r.capturedRange?.startSeconds ?? null,
    capturedEnd: r.capturedRange?.endSeconds ?? null
  });
  hideReportPreview();
  alert('Report loaded into the editor. Note: video files are not stored, so re-select the raw clips and the generated edit if you need them.');
  document.querySelector('.layout')?.scrollIntoView?.({ behavior: 'smooth' });
}

function exportHistoryReport(id) {
  const entry = readHistory().find(e => e.id === id);
  if (!entry) return;
  downloadReportJson(entry.report, `clipscope-report-${entry.savedAt.slice(0, 10)}-${entry.id.slice(0, 8)}.json`);
}

function deleteHistoryReport(id) {
  if (!confirm('Delete this saved report?')) return;
  writeHistory(readHistory().filter(e => e.id !== id));
  renderHistory();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

renderScopeRules(); renderRubric(); loadLocal(); renderClips(); renderHistory(); updateAll();

els.category.addEventListener('input', updateAll);
els.prompt.addEventListener('input', updateAll);
els.overallNotes.addEventListener('input', updateAll);
els.violationNotes.addEventListener('input', updateAll);
els.manualUnknownViolation.addEventListener('change', updateAll);

els.rawClips.addEventListener('change', e => {
  state.clips = [...e.target.files].map(f => ({name:f.name,size:f.size,type:f.type}));
  renderClips(); updateAll();
});

els.editedVideo.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  state.editedVideoName = file.name;
  els.videoPlayer.src = URL.createObjectURL(file);
  els.videoPlayer.style.display = 'block';
  updateAll();
});

els.setStart.addEventListener('click', () => {
  state.capturedStart = els.videoPlayer.currentTime || 0;
  els.timeCapture.textContent = `Start ${fmtTime(state.capturedStart)} / End ${fmtTime(state.capturedEnd)}`;
});
els.setEnd.addEventListener('click', () => {
  state.capturedEnd = els.videoPlayer.currentTime || 0;
  els.timeCapture.textContent = `Start ${fmtTime(state.capturedStart)} / End ${fmtTime(state.capturedEnd)}`;
});

$('addCriterion').addEventListener('click', () => { state.rubric.push({name:'',weight:0,score:0,evidence:'',notes:''}); renderRubric(); updateAll(false); });
$('saveProject').addEventListener('click', saveLocal);
$('exportJson').addEventListener('click', exportJson);
$('previewReport').addEventListener('click', showReportPreview);
$('saveReport').addEventListener('click', saveReportToHistory);
$('printReport').addEventListener('click', printReport);
$('printPreview').addEventListener('click', printReport);
$('closePreview').addEventListener('click', hideReportPreview);
$('resetProject').addEventListener('click', () => {
  if (!confirm('Reset all project fields?')) return;
  localStorage.removeItem('clipscope-project'); location.reload();
});
