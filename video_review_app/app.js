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
  clips: [], editedVideoName: '', rubric: structuredClone(defaultCriteria), capturedStart: null, capturedEnd: null
};

const $ = id => document.getElementById(id);
const els = {
  category: $('category'), prompt: $('prompt'), promptLint: $('promptLint'), rawClips: $('rawClips'),
  clipList: $('clipList'), editedVideo: $('editedVideo'), videoPlayer: $('videoPlayer'),
  setStart: $('setStart'), setEnd: $('setEnd'), timeCapture: $('timeCapture'), scopeRules: $('scopeRules'),
  manualUnknownViolation: $('manualUnknownViolation'), violationNotes: $('violationNotes'), scopeResult: $('scopeResult'),
  rubric: $('rubric'), weightTotal: $('weightTotal'), overallNotes: $('overallNotes'), finalScore: $('finalScore'),
  finalStatus: $('finalStatus'), checklist: $('checklist'), projectStatus: $('projectStatus')
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

function scopeViolations() {
  const checked = [...document.querySelectorAll('[data-scope-id]:checked')].map(x => {
    return scopeRules.find(r => r.id === x.dataset.scopeId)?.label;
  }).filter(Boolean);
  if (els.manualUnknownViolation.checked) checked.push('Other out-of-scope behavior observed');
  return checked;
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

function projectData() {
  const result = computeScore();
  return {
    app: 'ClipScope', version: '0.1.0', exportedAt: new Date().toISOString(),
    category: els.category.value.trim(), editingPrompt: els.prompt.value.trim(),
    rawClips: state.clips.map((c,i)=>({clipNumber:i+1,name:c.name,sizeBytes:c.size,type:c.type})),
    editedVideo: state.editedVideoName || null,
    capturedRange: { startSeconds: state.capturedStart, endSeconds: state.capturedEnd },
    scope: { autoFail: result.autoFail, violations: result.violations, notes: els.violationNotes.value.trim() },
    rubric: state.rubric,
    evaluation: { score: result.score, notes: els.overallNotes.value.trim() },
    checklist: completion().map(([label, complete])=>({label, complete}))
  };
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

function loadLocal() {
  const raw = localStorage.getItem('clipscope-project');
  if (!raw) return;
  try {
    const p = JSON.parse(raw);
    els.category.value = p.category || ''; els.prompt.value = p.prompt || ''; els.violationNotes.value = p.violationNotes || '';
    els.overallNotes.value = p.overallNotes || ''; state.rubric = p.rubric?.length ? p.rubric : structuredClone(defaultCriteria);
    state.editedVideoName = p.editedVideoName || ''; state.capturedStart = p.capturedStart ?? null; state.capturedEnd = p.capturedEnd ?? null;
    renderRubric();
    (p.scopeIds || []).forEach(id => { const x = document.querySelector(`[data-scope-id="${id}"]`); if (x) x.checked = true; });
    els.manualUnknownViolation.checked = !!p.manualUnknownViolation;
    els.timeCapture.textContent = `Start ${fmtTime(state.capturedStart)} / End ${fmtTime(state.capturedEnd)}`;
  } catch {}
}

function exportJson() {
  const blob = new Blob([JSON.stringify(projectData(), null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `clipscope-report-${new Date().toISOString().slice(0,10)}.json`; a.click();
  URL.revokeObjectURL(a.href);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

renderScopeRules(); renderRubric(); loadLocal(); renderClips(); updateAll();

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
$('printReport').addEventListener('click', () => window.print());
$('resetProject').addEventListener('click', () => {
  if (!confirm('Reset all project fields?')) return;
  localStorage.removeItem('clipscope-project'); location.reload();
});
