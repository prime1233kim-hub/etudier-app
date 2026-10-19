import { api } from './api.js';
import { esc, observeReveal } from './site.js';

const host = document.getElementById('featured');

function firstSentence(text) {
  const m = String(text || '').match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim();
}

(async () => {
  const { ok, data } = await api.archiveList();
  if (!ok) {
    host.innerHTML = `<p class="muted">The featured looks could not be loaded. <a href="/archive">Open the archive</a>.</p>`;
    return;
  }
  const items = data.entries.filter((e) => e.kind === 'example').slice(1, 5); // the first example is the hero
  host.innerHTML = items.map((e) => `
    <figure class="feature reveal">
      <a href="/look?id=${encodeURIComponent(e.id)}">
        <div class="frame"><img src="${esc(e.image.src)}" alt="${esc(e.title)}" loading="lazy" width="${e.image.width || 1280}" height="${e.image.height || 2048}"></div>
        <figcaption class="meta">
          <span class="label">${esc(e.brand)} — ${esc(e.season)}</span>
          <span class="h3">${esc(e.title)}</span>
          <span class="observation">${esc(firstSentence(e.summary))}</span>
          <span class="cta"><span class="badge">Illustrative sample</span><span class="text-btn">View the analysis</span></span>
        </figcaption>
      </a>
    </figure>`).join('');
  observeReveal(host);
})();
