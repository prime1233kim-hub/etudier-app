// A single archive look: /look?id=…

import { api } from './api.js';
import { esc, toast, copyText, downloadText, slugify } from './site.js';
import { renderResults } from './render.js';
import { toMarkdown } from './notes.js';
import { saveLook, findLookBySource, updateLook, archiveToken, forgetArchiveToken } from './store.js';

const root = document.getElementById('look');
const id = new URLSearchParams(location.search).get('id');

function fail(message) {
  root.innerHTML = `<div class="results-body"><div class="empty"><p class="h2">${esc(message)}</p><a class="btn ghost" href="/archive">Back to the archive</a></div></div>`;
}

(async () => {
  if (!id) return fail('No look was selected.');
  const [{ ok, data }, status] = await Promise.all([api.archiveGet(id), api.status()]);
  if (!ok) return fail(data.message || 'This look could not be loaded.');
  const entry = data.entry;
  const a = entry.analysis;
  const researchOn = status.ok && status.data.research;
  const example = entry.kind === 'example';
  const token = archiveToken(entry.id);
  let research = researchOn ? { state: 'idle' } : { state: 'off' };
  document.title = `${entry.title} — ÉTUDIER`;

  const notes = example
    ? [{ html: `<strong>Illustrative sample.</strong> This analysis was written for demonstration and is not AI output. ${esc(entry.attribution_basis || '')}` }]
    : [{ html: 'AI analysis of a photograph added by a visitor. It can be wrong.' + (entry.brand ? ' The designer and season were entered by the visitor and have not been verified.' : '') }];

  const actions = `
    <button type="button" class="btn small" data-act="save">${findLookBySource(`archive:${entry.id}`) ? 'Saved' : 'Save to My Research'}</button>
    <button type="button" class="btn small ghost" data-act="copy">Copy notes</button>
    <button type="button" class="btn small ghost" data-act="download">Download notes</button>
    ${token ? '<button type="button" class="btn small ghost" data-act="delete">Remove from archive</button>' : ''}
    <a class="btn small ghost" href="/archive">Back to archive</a>`;

  const notesText = () => toMarkdown({
    analysis: a, title: entry.title, brand: entry.brand, season: entry.season, image: entry.image,
    research: research.state === 'ok' ? research.data : null,
    label: example ? 'Illustrative sample analysis (not AI output).' : 'AI analysis from the ÉTUDIER archive.'
  });

  const view = renderResults(root, {
    analysis: a,
    image: { ...entry.image, alt: entry.title },
    title: entry.title,
    brand: entry.brand,
    season: entry.season,
    badges: example ? [{ text: 'Example' }, { text: 'Illustrative sample' }] : [{ text: 'AI analysis', cls: 'solid' }, { text: 'Added by a visitor' }],
    notes,
    actionsHTML: actions,
    research,
    onRunResearch: async () => {
      research = { state: 'loading' };
      view.setResearch(research);
      const r = await api.research(a);
      research = r.ok && r.data.status === 'ok' ? { state: 'ok', data: r.data } : { state: 'unavailable', message: r.data.message, retry: true };
      view.setResearch(research);
      const saved = findLookBySource(`archive:${entry.id}`);
      if (saved && research.state === 'ok') updateLook(saved.id, { research: research.data });
    }
  });

  root.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', async () => {
    switch (btn.dataset.act) {
      case 'save': {
        const res = saveLook({
          sourceKey: `archive:${entry.id}`, kind: entry.kind, archiveId: entry.id,
          title: entry.title, brand: entry.brand, season: entry.season,
          image: { ...entry.image, src: new URL(entry.image.src, location.origin).href },
          analysis: a, research: research.state === 'ok' ? research.data : null,
          label: example ? 'Illustrative sample' : 'AI analysis'
        });
        if (!res.ok) { toast(res.message); break; }
        btn.textContent = 'Saved';
        toast('Saved to My Research on this device');
        break;
      }
      case 'copy':
        toast((await copyText(notesText())) ? 'Notes copied to your clipboard' : 'Copy failed — try Download notes instead');
        break;
      case 'download':
        downloadText(`etudier-${slugify(entry.title)}.md`, notesText());
        break;
      case 'delete': {
        if (!confirm('Remove this look from the public archive? This cannot be undone.')) break;
        const r = await api.archiveDelete(entry.id, token);
        if (!r.ok) { toast(r.data.message); break; }
        forgetArchiveToken(entry.id);
        toast('Removed from the archive');
        setTimeout(() => { location.href = '/archive'; }, 700);
        break;
      }
    }
  }));
})();
