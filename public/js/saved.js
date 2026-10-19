// My Research: saved looks, collections and glossary (all in this browser).

import { esc, toast, copyText, downloadText, slugify } from './site.js';
import { renderResults } from './render.js';
import { toMarkdown } from './notes.js';
import * as store from './store.js';

const $ = (id) => document.getElementById(id);
const panels = { looks: $('panel-looks'), collections: $('panel-collections'), glossary: $('panel-glossary') };
const tabs = { looks: $('tab-looks'), collections: $('tab-collections'), glossary: $('tab-glossary') };
const viewer = $('saved-view');
let filterCollection = '';

if (!store.storageAvailable()) {
  $('storage-warning').innerHTML = '<div class="notice warn mt-10"><p><strong>This browser is blocking storage.</strong> Anything you save will be lost when you close this tab.</p></div>';
}

// ---------- tabs ----------

function selectTab(name, focus) {
  for (const [k, tab] of Object.entries(tabs)) {
    const on = k === name;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    panels[k].hidden = !on;
  }
  viewer.hidden = true;
  if (focus) tabs[name].focus();
  history.replaceState(null, '', name === 'looks' ? location.pathname : `#${name}`);
  renderPanel(name);
}
Object.entries(tabs).forEach(([k, tab]) => {
  tab.addEventListener('click', () => selectTab(k));
  tab.addEventListener('keydown', (e) => {
    const order = Object.keys(tabs);
    const i = order.indexOf(k);
    if (e.key === 'ArrowRight') selectTab(order[(i + 1) % order.length], true);
    if (e.key === 'ArrowLeft') selectTab(order[(i + order.length - 1) % order.length], true);
  });
});

function renderPanel(name) {
  if (name === 'looks') renderLooks();
  if (name === 'collections') renderCollections();
  if (name === 'glossary') renderGlossary();
}

const report = (r, success) => { if (!r.ok) toast(r.message); else if (success) toast(success); return r.ok; };
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString(); } catch { return ''; } };

function notesFor(look) {
  return toMarkdown({
    analysis: look.analysis, title: look.title, brand: look.brand, season: look.season,
    research: look.research, image: look.image && look.image.credit && look.image.credit !== 'Your upload' ? look.image : null,
    label: look.kind === 'example' ? 'Illustrative sample analysis (not AI output).' : 'AI analysis — saved in ÉTUDIER.'
  });
}

// ---------- looks ----------

function renderLooks() {
  const collections = store.listCollections();
  let looks = store.listLooks();
  if (filterCollection && !collections.some((c) => c.id === filterCollection)) filterCollection = '';
  if (filterCollection) looks = looks.filter((l) => (l.collections || []).includes(filterCollection));
  const all = store.listLooks();

  if (!all.length) {
    panels.looks.innerHTML = `
      <div class="empty">
        <p class="h2">No saved looks yet.</p>
        <p class="m0">Analyze a look or open one from the archive, then choose “Save to My Research”.</p>
        <div class="hero-actions"><a class="btn" href="/analyze">Analyze a Look</a><a class="btn ghost" href="/archive">Browse the archive</a></div>
      </div>`;
    return;
  }

  panels.looks.innerHTML = `
    <div class="inline-form">
      ${collections.length ? `<div class="field"><label for="collection-filter">Show collection</label>
        <select class="select" id="collection-filter"><option value="">All saved looks</option>${collections.map((c) => `<option value="${esc(c.id)}"${c.id === filterCollection ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>` : ''}
      <button type="button" class="btn small ghost" id="export-all">Download all notes (.md)</button>
    </div>
    <p class="small muted">${looks.length} of ${all.length} saved ${all.length === 1 ? 'look' : 'looks'}</p>
    <div class="saved-list">
      ${looks.map((l) => `
        <article class="saved-item" data-id="${esc(l.id)}">
          <img src="${esc(l.image && l.image.src)}" alt="" loading="lazy">
          <div class="info">
            <span class="label">${esc(l.kind === 'example' ? 'Example' : l.kind === 'upload' ? 'Your upload' : 'Archive')} · saved ${esc(fmtDate(l.savedAt))}</span>
            <h2 class="h3">${esc(l.title)}</h2>
            ${l.brand ? `<span class="small muted">${esc(l.brand)}${l.season ? ` · ${esc(l.season)}` : ''}</span>` : ''}
            ${collections.length ? `<div class="collection-checks" role="group" aria-label="Collections for ${esc(l.title)}">${collections.map((c) => `
              <label><input type="checkbox" data-col="${esc(c.id)}"${(l.collections || []).includes(c.id) ? ' checked' : ''}> ${esc(c.name)}</label>`).join('')}</div>`
              : '<span class="small muted">Create a collection to group your research.</span>'}
          </div>
          <div class="actions">
            <button type="button" class="text-btn" data-act="open">Open</button>
            <button type="button" class="text-btn" data-act="copy">Copy notes</button>
            <button type="button" class="text-btn" data-act="download">Download</button>
            <button type="button" class="text-btn danger" data-act="remove">Remove</button>
          </div>
        </article>`).join('') || '<p class="muted">No looks in this collection yet.</p>'}
    </div>`;

  const sel = $('collection-filter');
  if (sel) sel.addEventListener('change', () => { filterCollection = sel.value; renderLooks(); });
  $('export-all').addEventListener('click', () => {
    downloadText('etudier-research-notes.md', all.map(notesFor).join('\n\n---\n\n'));
  });

  panels.looks.querySelectorAll('.saved-item').forEach((item) => {
    const look = store.getLook(item.dataset.id);
    item.querySelectorAll('[data-col]').forEach((cb) => cb.addEventListener('change', () => {
      report(store.toggleLookCollection(look.id, cb.dataset.col, cb.checked));
    }));
    item.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', async () => {
      switch (btn.dataset.act) {
        case 'open': openLook(look); break;
        case 'copy': toast((await copyText(notesFor(look))) ? 'Notes copied to your clipboard' : 'Copy failed — try Download instead'); break;
        case 'download': downloadText(`etudier-${slugify(look.title)}.md`, notesFor(look)); break;
        case 'remove':
          if (confirm(`Remove “${look.title}” from your saved looks?`)) { report(store.removeLook(look.id), 'Removed'); renderLooks(); }
          break;
      }
    }));
  });
}

function openLook(look) {
  viewer.hidden = false;
  const view = renderResults(viewer, {
    analysis: look.analysis,
    image: look.image,
    title: look.title,
    brand: look.brand,
    season: look.season,
    badges: [{ text: 'Saved on this device' }, ...(look.kind === 'example' ? [{ text: 'Illustrative sample' }] : [{ text: 'AI analysis', cls: 'solid' }])],
    actionsHTML: `<button type="button" class="btn small ghost" data-close>Close</button>${look.archiveId ? `<a class="btn small ghost" href="/look?id=${encodeURIComponent(look.archiveId)}">Open in archive</a>` : ''}`,
    research: look.research ? { state: 'ok', data: look.research } : { state: 'off', message: 'No source research was saved with this look.' }
  });
  void view;
  viewer.querySelector('[data-close]').addEventListener('click', () => { viewer.hidden = true; viewer.innerHTML = ''; panels.looks.scrollIntoView({ block: 'start' }); });
  viewer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- collections ----------

function renderCollections() {
  const collections = store.listCollections();
  const looks = store.listLooks();
  panels.collections.innerHTML = `
    <form class="inline-form" id="new-collection">
      <div class="field"><label for="collection-name">New collection</label><input class="input" id="collection-name" maxlength="60" placeholder="e.g. Tailoring references, SS11 couture" required></div>
      <button type="submit" class="btn">Create</button>
    </form>
    ${collections.length ? collections.map((c) => {
      const n = looks.filter((l) => (l.collections || []).includes(c.id)).length;
      return `
        <div class="collection-row" data-id="${esc(c.id)}">
          <div><h2 class="h3">${esc(c.name)}</h2><span class="small muted">${n} ${n === 1 ? 'look' : 'looks'}</span></div>
          <div class="row-between">
            <button type="button" class="text-btn" data-act="view">View looks</button>
            <button type="button" class="text-btn" data-act="rename">Rename</button>
            <button type="button" class="text-btn danger" data-act="delete">Delete</button>
          </div>
        </div>`;
    }).join('') : '<p class="muted">No collections yet. Collections group saved looks into research themes. Looks can belong to several collections.</p>'}`;

  $('new-collection').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('collection-name');
    if (report(store.addCollection(input.value), 'Collection created')) renderCollections();
  });
  panels.collections.querySelectorAll('.collection-row').forEach((row) => {
    const c = collections.find((x) => x.id === row.dataset.id);
    row.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', () => {
      if (btn.dataset.act === 'view') { filterCollection = c.id; selectTab('looks'); }
      if (btn.dataset.act === 'rename') {
        const name = prompt('Rename collection', c.name);
        if (name != null && report(store.renameCollection(c.id, name), 'Renamed')) renderCollections();
      }
      if (btn.dataset.act === 'delete' && confirm(`Delete the collection “${c.name}”? The looks themselves stay saved.`)) {
        report(store.removeCollection(c.id), 'Collection deleted');
        renderCollections();
      }
    }));
  });
}

// ---------- glossary ----------

function glossaryMarkdown(terms) {
  return ['# My fashion glossary', '', ...terms.map((t) =>
    `- **${t.term}** — ${t.definition}${t.application ? ` *Seen in “${t.from}”:* ${t.application}` : ''}${t.contrast ? ` *Compare:* ${t.contrast}` : ''}`)].join('\n');
}

function renderGlossary() {
  const terms = store.listTerms();
  if (!terms.length) {
    panels.glossary.innerHTML = '<div class="empty"><p class="h2">Your glossary is empty.</p><p class="m0">Use “Save to glossary” next to any term in an analysis to collect it here.</p><a class="btn ghost" href="/archive">Find terms in the archive</a></div>';
    return;
  }
  panels.glossary.innerHTML = `
    <div class="inline-form">
      <div class="field"><label for="term-search">Search your glossary</label><input class="input" id="term-search" type="search" autocomplete="off"></div>
      <button type="button" class="btn small ghost" id="copy-glossary">Copy glossary</button>
      <button type="button" class="btn small ghost" id="download-glossary">Download (.md)</button>
    </div>
    <div class="vocab" id="term-list">
      ${terms.sort((a, b) => a.term.localeCompare(b.term)).map((t) => `
        <div class="term" data-id="${esc(t.id)}" data-text="${esc(`${t.term} ${t.definition}`.toLowerCase())}">
          <h4>${esc(t.term)}</h4>
          <div class="body">
            <p>${esc(t.definition)}</p>
            ${t.application ? `<p class="applied"><span class="label">Seen in ${esc(t.from || 'a look')}</span><br>${esc(t.application)}</p>` : ''}
            ${t.contrast ? `<p class="contrast">${esc(t.contrast)}</p>` : ''}
            <button type="button" class="text-btn danger save-term" data-remove>Remove</button>
          </div>
        </div>`).join('')}
    </div>`;

  $('term-search').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    panels.glossary.querySelectorAll('.term').forEach((el) => { el.hidden = Boolean(q) && !el.dataset.text.includes(q); });
  });
  $('copy-glossary').addEventListener('click', async () => toast((await copyText(glossaryMarkdown(terms))) ? 'Glossary copied' : 'Copy failed — try Download instead'));
  $('download-glossary').addEventListener('click', () => downloadText('etudier-glossary.md', glossaryMarkdown(terms)));
  panels.glossary.querySelectorAll('[data-remove]').forEach((btn) => btn.addEventListener('click', () => {
    const id = btn.closest('.term').dataset.id;
    report(store.removeTerm(id), 'Removed from glossary');
    renderGlossary();
  }));
}

// ---------- start ----------

const initial = location.hash.replace('#', '');
selectTab(tabs[initial] ? initial : 'looks');
