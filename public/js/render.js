// Renders an analysis (sections A–F) next to its image. Used by the
// Analyze page, archive look pages and saved looks, so every view is consistent.

import { esc, toast } from './site.js';
import { saveTerm, hasTerm } from './store.js';

const ROLE_ORDER = { dominant: 0, secondary: 1, accent: 2 };
const SOURCE_TYPES = {
  official_product_page: 'Official product page',
  official_collection_page: 'Official collection page',
  official_brand_page: 'Official brand page',
  official_instagram: 'Official Instagram post',
  runway_archive: 'Runway archive',
  press: 'Press'
};
export const STATUS_LABEL = { verified: 'Verified match', related: 'Related reference', unverified: 'Unverified candidate' };

function sectionHead(letter, title) {
  return `<div class="rsec-head"><span class="rsec-letter" aria-hidden="true">${letter}</span><h2 class="h2">${esc(title)}</h2></div>`;
}

function imageBlock({ image, analysis }) {
  if (!image || !image.src) return '';
  const credit = image.credit
    ? `<p class="credit">${esc(image.credit)}${image.license ? `, ${image.license_url ? `<a href="${esc(image.license_url)}" target="_blank" rel="noopener noreferrer">${esc(image.license)}</a>` : esc(image.license)}` : ''}${image.source_url ? ` · <a href="${esc(image.source_url)}" target="_blank" rel="noopener noreferrer">Source</a>` : ''}</p>`
    : '';
  const dims = image.width && image.height ? ` width="${image.width}" height="${image.height}"` : '';
  return `
    <div class="sticky">
      <figure class="frame m0"><img src="${esc(image.src)}" alt="${esc(image.alt || analysis.title || 'Analysed look')}"${dims}></figure>
      ${credit}
      ${analysis.image_note ? `<p class="small muted m0">${esc(analysis.image_note)}</p>` : ''}
    </div>`;
}

function overall(a) {
  const o = a.overall;
  return `
    <section class="rsec" aria-labelledby="sec-a">
      ${sectionHead('A', 'Overall Look').replace('<h2 class="h2">', '<h2 class="h2" id="sec-a">')}
      <div class="rsec-body">
        <p class="lede m0">${esc(o.summary)}</p>
        <dl class="dl">
          <dt>Silhouette</dt><dd>${esc(o.silhouette)}${o.silhouette_tags.length ? `<div class="tags mt-10">${o.silhouette_tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}</dd>
          <dt>Proportions</dt><dd>${esc(o.proportions)}</dd>
          <dt>Styling</dt><dd>${esc(o.styling)}</dd>
          ${o.aesthetic ? `<dt>Direction</dt><dd>${esc(o.aesthetic)}</dd>` : ''}
        </dl>
      </div>
    </section>`;
}

function colors(a) {
  const c = a.colors;
  const palette = [...c.palette].sort((x, y) => ROLE_ORDER[x.role] - ROLE_ORDER[y.role]);
  return `
    <section class="rsec" aria-labelledby="sec-b">
      ${sectionHead('B', 'Colour Analysis').replace('<h2 class="h2">', '<h2 class="h2" id="sec-b">')}
      <div class="rsec-body">
        ${palette.length ? `<div class="swatches">${palette.map((s) => `
          <div class="swatch">
            <div class="chip" data-hex="${esc(s.hex)}" role="img" aria-label="${esc(s.name)} swatch, ${esc(s.hex)}"></div>
            <span class="role">${esc(s.role)}</span>
            <span class="name">${esc(s.name)}</span>
            <span class="hex">${esc(s.hex.toUpperCase())}</span>
            ${s.where ? `<span class="small muted">${esc(s.where)}</span>` : ''}
          </div>`).join('')}</div>` : '<p class="muted">No colours could be estimated.</p>'}
        ${c.combinations.length ? `<div><span class="label">Combinations</span><ul class="list">${c.combinations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        ${c.interaction ? `<p class="m0 ink2">${esc(c.interaction)}</p>` : ''}
        <p class="small muted m0">Colours are estimated from the photograph. Lighting, camera settings and image compression can shift them, so treat hex values as approximate.</p>
      </div>
    </section>`;
}

function garmentDetail(g) {
  if (!g) return '';
  return `
    <div class="garment-detail" id="garment-detail" aria-live="polite">
      <div class="row-between">
        <h3 class="h3">${esc(g.name)}</h3>
        <span class="confidence">Confidence: ${esc(g.confidence)}</span>
      </div>
      <dl class="dl">
        <dt>Category</dt><dd>${esc(g.category)}</dd>
        <dt>Silhouette &amp; fit</dt><dd>${esc(g.silhouette_fit)}</dd>
        ${g.details.length ? `<dt>Visible details</dt><dd><ul>${g.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></dd>` : ''}
        ${g.fabric.description ? `<dt>Fabric</dt><dd>${esc(g.fabric.description)} <span class="kind ${g.fabric.basis === 'observed' ? 'observation' : 'inference'}">${esc(g.fabric.basis)}</span></dd>` : ''}
        ${g.terms.length ? `<dt>Terms</dt><dd><div class="tags">${g.terms.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div></dd>` : ''}
        ${g.uncertainty ? `<dt>Uncertain</dt><dd>${esc(g.uncertainty)}</dd>` : ''}
      </dl>
    </div>`;
}

function garments(a) {
  if (!a.garments.length) return '';
  return `
    <section class="rsec" aria-labelledby="sec-c">
      ${sectionHead('C', 'Garment Breakdown').replace('<h2 class="h2">', '<h2 class="h2" id="sec-c">')}
      <div class="rsec-body">
        <p class="small muted m0">Select a garment to inspect it. Its design details are highlighted below.</p>
        <div class="garment-list" role="group" aria-label="Garments">
          ${a.garments.map((g, i) => `<button type="button" class="garment-chip" data-garment="${esc(g.id)}" aria-pressed="${i === 0}" aria-controls="garment-detail"><small>${esc(g.category)}</small>${esc(g.name)}</button>`).join('')}
        </div>
        <div data-garment-detail>${garmentDetail(a.garments[0])}</div>
      </div>
    </section>`;
}

function details(a) {
  if (!a.design_details.length) return '';
  return `
    <section class="rsec" aria-labelledby="sec-d">
      ${sectionHead('D', 'Design Details').replace('<h2 class="h2">', '<h2 class="h2" id="sec-d">')}
      <div class="rsec-body">
        <p class="small muted m0"><span class="kind observation">Observation</span> clearly visible in the photo &nbsp; <span class="kind inference">Inference</span> reasoned from partial evidence</p>
        <ul class="details-list">
          ${a.design_details.map((d) => `<li data-for="${esc(d.garment_id)}"><span class="area">${esc(d.area)}</span><span>${esc(d.detail)}</span><span class="kind ${d.kind}">${esc(d.kind)}</span></li>`).join('')}
        </ul>
      </div>
    </section>`;
}

function vocabulary(a) {
  if (!a.vocabulary.length) return '';
  return `
    <section class="rsec" aria-labelledby="sec-e">
      ${sectionHead('E', 'Fashion Vocabulary').replace('<h2 class="h2">', '<h2 class="h2" id="sec-e">')}
      <div class="rsec-body">
        <div class="vocab">
          ${a.vocabulary.map((v, i) => `
            <div class="term">
              <h4>${esc(v.term)}</h4>
              <div class="body">
                <p>${esc(v.definition)}</p>
                <p class="applied"><span class="label">In this look</span><br>${esc(v.application)}</p>
                ${v.contrast ? `<p class="contrast">${esc(v.contrast)}</p>` : ''}
                <button type="button" class="text-btn save-term" data-term="${i}">${hasTerm(v.term) ? 'In your glossary' : 'Save to glossary'}</button>
              </div>
            </div>`).join('')}
        </div>
      </div>
    </section>`;
}

function sourceCard(s) {
  const type = SOURCE_TYPES[s.source_type] || 'Source';
  return `
    <article class="source">
      <div class="top">
        <div>
          <h3 class="brand">${esc(s.brand || 'Unknown brand')}</h3>
          ${s.product_name ? `<div>${esc(s.product_name)}</div>` : ''}
        </div>
        <span class="badge ${s.status}">${STATUS_LABEL[s.status]}</span>
      </div>
      <div class="meta">
        <span>${esc(type)}</span>
        ${s.collection ? `<span>${esc(s.collection)}</span>` : ''}
        <span>${esc(s.host)}</span>
      </div>
      ${s.why ? `<p class="why">${esc(s.why)}</p>` : ''}
      ${s.note ? `<p class="note">${esc(s.note)}</p>` : ''}
      <a class="link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Open source <span aria-hidden="true">↗</span><span class="visually-hidden"> (opens in a new tab)</span></a>
    </article>`;
}

export function researchHTML(state) {
  const head = sectionHead('F', 'Brand & Source Research').replace('<h2 class="h2">', '<h2 class="h2" id="sec-f">');
  let body = '';
  const s = state || { state: 'idle' };
  if (s.state === 'loading') {
    body = `<div class="loading" role="status"><div class="bar"></div><span class="msg">Searching official brand sources…</span><span class="small muted">Each link is opened and checked before it is shown. This can take a minute.</span></div>`;
  } else if (s.state === 'unavailable') {
    body = `<div class="notice warn"><strong>Source research is temporarily unavailable.</strong><p>${esc(s.message || 'The garment analysis above is unaffected.')}</p>${s.retry ? '<div class="actions"><button type="button" class="text-btn" data-run-research>Try again</button></div>' : ''}</div>`;
  } else if (s.state === 'off') {
    body = `<div class="notice"><strong>Source research is not switched on.</strong><p>${esc(s.message || 'It runs with a live AI key. No links are shown rather than guessed ones.')}</p></div>`;
  } else if (s.state === 'demo') {
    body = `<div class="notice"><strong>Demo mode: no source research.</strong><p>Source research only runs on real analyses with a live AI key. No sample links are shown, so nothing here could be mistaken for a verified source.</p></div>`;
  } else if (s.state === 'idle') {
    body = `<div class="notice"><p>Search official brand websites, collection pages and runway archives for this look. Every link is checked before it is shown.</p><div class="actions"><button type="button" class="btn small ghost" data-run-research>Run source research</button></div></div>`;
  } else if (s.state === 'ok') {
    const d = s.data;
    const dropped = (d.dropped && (d.dropped.not_in_search_results + d.dropped.failed_checks)) || 0;
    body = `
      ${d.summary ? `<p class="m0 ink2">${esc(d.summary)}</p>` : ''}
      ${d.sources.length ? `<div class="sources">${d.sources.map(sourceCard).join('')}</div>` : `
        <div class="notice"><strong>Original source not identified.</strong><p>No source could be confirmed for this look. That is a normal result: many runway pieces are never sold online, and resemblance alone is not proof.</p></div>`}
      ${!d.identified && d.sources.length ? '<p class="small muted m0">The exact original garment was not confirmed. The links above are references, not proof of origin.</p>' : ''}
      ${dropped ? `<p class="small muted m0">${dropped} suggested link${dropped === 1 ? ' was' : 's were'} removed because ${dropped === 1 ? 'it' : 'they'} could not be verified.</p>` : ''}
      ${d.suggestions && d.suggestions.length ? `<div><span class="label">Research it yourself</span><ul class="list">${d.suggestions.map((q) => `<li><a href="https://www.google.com/search?q=${encodeURIComponent(q)}" target="_blank" rel="noopener noreferrer">${esc(q)}</a></li>`).join('')}</ul></div>` : ''}
      <div class="status-key">
        <div><span class="badge verified">Verified match</span> official page that names this exact product</div>
        <div><span class="badge related">Related reference</span> official or runway source for the brand or collection</div>
        <div><span class="badge unverified">Unverified candidate</span> link works, but the claim could not be confirmed</div>
      </div>`;
  }
  return `<section class="rsec" aria-labelledby="sec-f" data-research>${head}<div class="rsec-body">${body}</div></section>`;
}

/**
 * Renders the whole result view into `root`.
 * opts: { analysis, image, title, brand, season, badges[], notes[] (html-safe strings), actionsHTML, research, onRunResearch }
 */
export function renderResults(root, opts) {
  const a = opts.analysis;
  const badges = (opts.badges || []).map((b) => `<span class="badge ${b.cls || ''}">${esc(b.text)}</span>`).join('');
  const notes = (opts.notes || []).map((n) => `<div class="notice${n.warn ? ' warn' : ''}"><p>${n.html}</p></div>`).join('');
  const meta = [opts.brand, opts.season].filter(Boolean).map(esc).join(' · ');

  root.innerHTML = `
    <div class="results-media">${imageBlock({ image: opts.image, analysis: a })}</div>
    <div class="results-body">
      <header class="results-title">
        ${badges ? `<div class="badges">${badges}</div>` : ''}
        <h1 class="h1">${esc(opts.title || a.title || 'Untitled look')}</h1>
        ${meta ? `<p class="muted m0">${meta}</p>` : ''}
        ${notes}
        ${opts.actionsHTML ? `<div class="result-actions">${opts.actionsHTML}</div>` : ''}
      </header>
      ${a.is_fashion_image ? `${overall(a)}${colors(a)}${garments(a)}${details(a)}${vocabulary(a)}${researchHTML(opts.research)}`
        : `<section class="rsec"><div class="notice warn"><strong>This doesn’t look like a fashion image.</strong><p>${esc(a.image_note || 'No clothing could be analysed. Try a runway or fashion photograph where the outfit is clearly visible.')}</p></div></section>`}
    </div>`;

  // Colour chips: set via CSSOM (allowed by the page's Content Security Policy).
  root.querySelectorAll('.chip[data-hex]').forEach((el) => { el.style.background = el.dataset.hex; });

  const detailHost = root.querySelector('[data-garment-detail]');
  const highlight = (id) => {
    root.querySelectorAll('.details-list li').forEach((li) => li.classList.toggle('dim', Boolean(id) && li.dataset.for !== id && li.dataset.for !== ''));
  };
  root.querySelectorAll('.garment-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.garment;
      const already = btn.getAttribute('aria-pressed') === 'true';
      root.querySelectorAll('.garment-chip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      if (already) { highlight(null); return; }
      btn.setAttribute('aria-pressed', 'true');
      detailHost.innerHTML = garmentDetail(a.garments.find((g) => g.id === id));
      highlight(id);
    });
  });

  root.querySelectorAll('.save-term').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = a.vocabulary[Number(btn.dataset.term)];
      const r = saveTerm({ term: v.term, definition: v.definition, application: v.application, contrast: v.contrast, from: opts.title || a.title || '' });
      if (!r.ok) { toast(r.message); return; }
      btn.textContent = 'In your glossary';
      toast(r.existed ? `“${v.term}” is already in your glossary` : `Saved “${v.term}” to your glossary`);
    });
  });

  const bindResearch = () => {
    root.querySelectorAll('[data-run-research]').forEach((b) => b.addEventListener('click', () => opts.onRunResearch && opts.onRunResearch()));
  };
  bindResearch();

  return {
    setResearch(state) {
      const host = root.querySelector('[data-research]');
      if (!host) return;
      host.outerHTML = researchHTML(state);
      bindResearch();
    }
  };
}
