// Analyze a Look: upload → (optional crop) → AI analysis → source research.

import { api } from './api.js';
import { esc, toast, copyText, downloadText, slugify } from './site.js';
import { checkFile, decode, render, thumbnail, dims, dataURLToBlob } from './image.js';
import { startCrop } from './crop.js';
import { renderResults } from './render.js';
import { toMarkdown } from './notes.js';
import { saveLook, updateLook, rememberArchiveToken } from './store.js';

const $ = (id) => document.getElementById(id);
const el = {
  status: $('ai-status'), dropzone: $('dropzone'), fileInput: $('file-input'), replaceInput: $('replace-input'),
  preview: $('preview'), figure: $('preview-figure'), img: $('preview-img'), meta: $('file-meta'),
  analyzeBtn: $('analyze-btn'), cropBtn: $('crop-btn'), resetCropBtn: $('reset-crop-btn'), removeBtn: $('remove-btn'),
  editControls: $('edit-controls'), cropControls: $('crop-controls'), applyCrop: $('apply-crop-btn'), cancelCrop: $('cancel-crop-btn'),
  error: $('upload-error'), loading: $('loading'), loadingMsg: $('loading-msg'), results: $('results'),
  dialog: $('archive-dialog'), archForm: $('archive-form'), archBrand: $('arch-brand'), archSeason: $('arch-season'),
  archConsent: $('arch-consent'), archError: $('arch-error'), archCancel: $('arch-cancel'), archSubmit: $('arch-submit')
};

const state = {
  status: null,       // /api/status
  file: null,         // original File
  source: null,       // decoded original (ImageBitmap or <img>)
  crop: null,         // crop rect in source pixels, or null
  previewUrl: null,
  cropper: null,
  busy: false,
  result: null        // { analysis, imageThumb, research, savedId, archiveId, demo }
};

// ---------- status / setup message ----------

async function loadStatus() {
  const { ok, data } = await api.status();
  state.status = ok ? data : { ai: false, research: false };
  if (!state.status.ai) {
    el.status.innerHTML = `
      <div class="notice warn">
        <strong>AI analysis isn’t set up on this server yet.</strong>
        <p>The site owner needs to add a free <code>GEMINI_API_KEY</code> or an <code>ANTHROPIC_API_KEY</code> (see the README). Until then you can still upload and crop images, or explore a sample.</p>
        <div class="actions"><button type="button" class="btn small" id="demo-btn">Try the demo</button></div>
      </div>`;
    $('demo-btn').addEventListener('click', runDemo);
  } else {
    const notes = [];
    if (state.status.provider === 'gemini') {
      notes.push('<strong>Privacy:</strong> photos are analysed by Google Gemini’s free service. Google may use content sent on its free plan to improve its products, so only upload photos you’re happy to share. The free service also has a daily limit.');
    }
    if (!state.status.research) notes.push('Source research is switched off on this server. Garment analysis works as normal.');
    el.status.innerHTML = notes.map((n) => `<div class="notice"><p>${n}</p></div>`).join('');
  }
}

// ---------- errors ----------

function showError(message, { retry } = {}) {
  el.error.innerHTML = message
    ? `<div class="notice error"><p>${esc(message)}</p>${retry ? '<div class="actions"><button type="button" class="text-btn" id="retry-btn">Try again</button></div>' : ''}</div>`
    : '';
  if (retry) $('retry-btn').addEventListener('click', analyze);
}

// ---------- choosing a file ----------

async function acceptFile(file) {
  showError('');
  const problem = checkFile(file);
  if (problem) { showError(problem); return; }
  let source;
  try {
    source = await decode(file);
  } catch {
    showError('This image couldn’t be read. It may be damaged, or in a format your browser can’t open.');
    return;
  }
  stopCrop();
  state.file = file;
  state.source = source;
  state.crop = null;
  await showPreview();
  el.dropzone.hidden = true;
  el.preview.hidden = false;
  el.analyzeBtn.focus({ preventScroll: true });
}

async function showPreview() {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  // Preview exactly what will be analysed (cropped, orientation applied).
  const blob = await render(state.source, { crop: state.crop, maxEdge: 1600, quality: 0.9 });
  state.previewUrl = URL.createObjectURL(blob);
  el.img.src = state.previewUrl;
  await el.img.decode().catch(() => {});
  const { w, h } = state.crop || dims(state.source);
  el.meta.textContent = `${state.file.name} · ${Math.round(w)} × ${Math.round(h)} px${state.crop ? ' · cropped' : ''}`;
  el.resetCropBtn.hidden = !state.crop;
}

function clearImage() {
  stopCrop();
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  Object.assign(state, { file: null, source: null, crop: null, previewUrl: null });
  el.img.removeAttribute('src');
  el.preview.hidden = true;
  el.dropzone.hidden = false;
  el.fileInput.value = '';
  el.replaceInput.value = '';
  showError('');
}

el.fileInput.addEventListener('change', () => el.fileInput.files[0] && acceptFile(el.fileInput.files[0]));
el.replaceInput.addEventListener('change', () => el.replaceInput.files[0] && acceptFile(el.replaceInput.files[0]));
el.removeBtn.addEventListener('click', () => { clearImage(); el.fileInput.focus(); });

['dragenter', 'dragover'].forEach((t) => el.dropzone.addEventListener(t, (e) => { e.preventDefault(); el.dropzone.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => el.dropzone.addEventListener(t, () => el.dropzone.classList.remove('over')));
el.dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) acceptFile(file);
});
// Dropping an image anywhere else on the page shouldn't navigate away.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file && !state.busy) acceptFile(file);
});

// ---------- cropping ----------

function stopCrop() {
  if (state.cropper) { state.cropper.stop(); state.cropper = null; }
  el.cropControls.hidden = true;
  el.editControls.hidden = false;
}

el.cropBtn.addEventListener('click', () => {
  el.editControls.hidden = true;
  el.cropControls.hidden = false;
  state.cropper = startCrop(el.figure, el.img);
});
el.cancelCrop.addEventListener('click', () => { stopCrop(); el.cropBtn.focus(); });
el.applyCrop.addEventListener('click', async () => {
  const r = state.cropper.value();
  const base = state.crop || { x: 0, y: 0, ...dims(state.source) };
  state.crop = { x: base.x + r.x * base.w, y: base.y + r.y * base.h, w: r.w * base.w, h: r.h * base.h };
  stopCrop();
  await showPreview();
  el.analyzeBtn.focus();
});
el.resetCropBtn.addEventListener('click', async () => { state.crop = null; await showPreview(); });

// ---------- analysis ----------

const MESSAGES = ['Reading the silhouette…', 'Sampling the palette…', 'Naming each garment…', 'Looking at construction…', 'Gathering the vocabulary…'];
let msgTimer;

function setBusy(on) {
  state.busy = on;
  el.loading.hidden = !on;
  el.analyzeBtn.disabled = on;
  el.cropBtn.disabled = on;
  el.removeBtn.disabled = on;
  el.replaceInput.disabled = on;
  clearInterval(msgTimer);
  if (on) {
    let i = 0;
    el.loadingMsg.textContent = MESSAGES[0];
    msgTimer = setInterval(() => { i = (i + 1) % MESSAGES.length; el.loadingMsg.textContent = MESSAGES[i]; }, 4500);
  }
}

async function analyze() {
  if (!state.source || state.busy) return;
  showError('');
  if (state.status && !state.status.ai) {
    showError('AI analysis isn’t set up on this server yet, so this image can’t be analysed. Try the demo to see how results look.');
    return;
  }
  setBusy(true);
  try {
    const upload = await render(state.source, { crop: state.crop, maxEdge: 1600, quality: 0.9 });
    const { ok, data } = await api.analyze(upload, slugify(state.file.name) + '.jpg');
    if (!ok) { showError(data.message || 'The analysis failed.', { retry: true }); return; }
    const imageThumb = await thumbnail(await decode(upload), 720, 0.82);
    state.result = { analysis: data.analysis, imageThumb, research: null, savedId: null, archiveId: null, demo: false };
    showResults();
    if (data.analysis.is_fashion_image) runResearch();
  } catch {
    showError('Something went wrong while preparing the image. Please try again.', { retry: true });
  } finally {
    setBusy(false);
  }
}
el.analyzeBtn.addEventListener('click', analyze);

let view = null;

function resultActions(demo) {
  return demo
    ? `<button type="button" class="btn small ghost" data-act="copy">Copy notes</button>
       <button type="button" class="btn small ghost" data-act="download">Download notes</button>
       <button type="button" class="btn small ghost" data-act="again">Analyze your own look</button>`
    : `<button type="button" class="btn small" data-act="save">Save to My Research</button>
       <button type="button" class="btn small ghost" data-act="archive">Add to public archive</button>
       <button type="button" class="btn small ghost" data-act="copy">Copy notes</button>
       <button type="button" class="btn small ghost" data-act="download">Download notes</button>
       <button type="button" class="btn small ghost" data-act="again">Analyze another look</button>`;
}

function showResults() {
  const r = state.result;
  el.results.hidden = false;
  const opts = r.demo
    ? {
        analysis: r.analysis, image: r.image, title: r.analysis.title, brand: r.brand, season: r.season,
        badges: [{ text: 'Demo — sample data', cls: 'demo' }, { text: 'Illustrative sample' }],
        notes: [{ warn: true, html: 'This is <strong>demo data</strong>: a pre-written sample analysis of the example photograph shown here. It is <strong>not</strong> an analysis of any image you uploaded.' }],
        actionsHTML: resultActions(true),
        research: { state: 'demo' }
      }
    : {
        analysis: r.analysis,
        image: { src: r.imageThumb, alt: 'Your uploaded look', credit: '' },
        title: r.analysis.title,
        badges: [{ text: 'AI analysis', cls: 'solid' }],
        notes: [{ html: 'Generated by AI from your photo. It can be wrong: use it as a starting point and check details against the image.' }],
        actionsHTML: resultActions(false),
        research: r.research || (state.status && state.status.research ? { state: 'loading' } : { state: 'off' }),
        onRunResearch: runResearch
      };
  view = renderResults(el.results, opts);
  bindActions();
  el.results.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

async function runResearch() {
  const r = state.result;
  if (!r || r.demo) return;
  if (!state.status.research) { r.research = { state: 'off' }; view.setResearch(r.research); return; }
  r.research = { state: 'loading' };
  view.setResearch(r.research);
  const { ok, data } = await api.research(r.analysis);
  if (state.result !== r) return; // a new analysis replaced this one
  r.research = ok && data.status === 'ok'
    ? { state: 'ok', data }
    : { state: 'unavailable', message: data.message, retry: true };
  view.setResearch(r.research);
  if (r.savedId) updateLook(r.savedId, { research: r.research.state === 'ok' ? r.research.data : null });
}

function notesFor() {
  const r = state.result;
  return toMarkdown({
    analysis: r.analysis,
    title: r.analysis.title,
    brand: r.brand,
    season: r.season,
    research: r.research && r.research.state === 'ok' ? r.research.data : null,
    label: r.demo ? 'DEMO — sample analysis, not of an uploaded image.' : 'AI analysis of an uploaded photograph.',
    image: r.demo ? r.image : null
  });
}

function bindActions() {
  el.results.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', async () => {
    const r = state.result;
    switch (btn.dataset.act) {
      case 'copy':
        toast((await copyText(notesFor())) ? 'Notes copied to your clipboard' : 'Copy failed — try Download notes instead');
        break;
      case 'download':
        downloadText(`etudier-${slugify(r.analysis.title)}.md`, notesFor());
        break;
      case 'again':
        el.results.hidden = true;
        el.results.innerHTML = '';
        state.result = null;
        clearImage();
        window.scrollTo({ top: 0 });
        el.fileInput.focus({ preventScroll: true });
        break;
      case 'save': {
        const res = saveLook({
          kind: 'upload',
          title: r.analysis.title,
          brand: '',
          season: '',
          image: { src: r.imageThumb, credit: 'Your upload' },
          analysis: r.analysis,
          research: r.research && r.research.state === 'ok' ? r.research.data : null,
          archiveId: r.archiveId
        });
        if (!res.ok) { toast(res.message); break; }
        r.savedId = res.look.id;
        btn.textContent = 'Saved';
        btn.disabled = true;
        toast('Saved to My Research on this device');
        break;
      }
      case 'archive':
        openArchiveDialog(btn);
        break;
    }
  }));
}

// ---------- add to archive ----------

let archiveTrigger = null;
function openArchiveDialog(trigger) {
  archiveTrigger = trigger;
  const r = state.result;
  const verified = r.research && r.research.state === 'ok' && r.research.data.sources.find((s) => s.status === 'verified');
  el.archBrand.value = verified ? verified.brand : '';
  el.archSeason.value = verified && verified.collection ? verified.collection : '';
  el.archConsent.checked = false;
  el.archError.textContent = '';
  el.dialog.showModal();
}
el.archCancel.addEventListener('click', () => el.dialog.close());
el.dialog.addEventListener('close', () => archiveTrigger && archiveTrigger.focus());
el.archForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = state.result;
  if (!el.archConsent.checked) { el.archError.textContent = 'Please confirm you have the right to share this image.'; return; }
  el.archSubmit.disabled = true;
  el.archError.textContent = 'Adding…';
  try {
    const small = await thumbnail(await decode(dataURLToBlob(r.imageThumb)), 600, 0.8);
    const { ok, data } = await api.archiveAdd({
      analysis: r.analysis, thumbnail: small, consent: true,
      brand: el.archBrand.value.trim(), season: el.archSeason.value.trim()
    });
    if (!ok) { el.archError.textContent = data.message; return; }
    rememberArchiveToken(data.id, data.deleteToken);
    r.archiveId = data.id;
    if (r.savedId) updateLook(r.savedId, { archiveId: data.id });
    el.dialog.close();
    if (archiveTrigger) { archiveTrigger.textContent = 'In the archive'; archiveTrigger.disabled = true; }
    toast('Added to the public archive');
    const link = document.createElement('a');
    link.href = `/look?id=${encodeURIComponent(data.id)}`;
    link.className = 'btn small ghost';
    link.textContent = 'View in archive';
    archiveTrigger && archiveTrigger.after(link);
  } catch {
    el.archError.textContent = 'The look could not be added. Please try again.';
  } finally {
    el.archSubmit.disabled = false;
  }
});

// ---------- demo ----------

async function runDemo() {
  const { ok, data } = await api.demo();
  if (!ok) { showError('The demo could not be loaded.'); return; }
  state.result = { demo: true, analysis: data.analysis, image: data.image, brand: data.brand, season: data.season, research: { state: 'demo' } };
  showResults();
}
if (new URLSearchParams(location.search).get('demo') === '1') runDemo();

loadStatus();
