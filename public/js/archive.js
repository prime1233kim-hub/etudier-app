// Fashion Archive: grid with search + filters, synced to the URL so a
// filtered view can be bookmarked or shared.

import { api } from './api.js';
import { esc } from './site.js';
import { family, FAMILIES } from './color.js';

const $ = (id) => document.getElementById(id);
const form = $('filters');
const grid = $('grid');
const count = $('count');
const clearBtn = $('clear-filters');
const fields = { q: $('q'), garment: $('f-garment'), silhouette: $('f-silhouette'), color: $('f-color'), brand: $('f-brand') };

let entries = [];

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function enrich(e) {
  const dominant = e.colors.filter((c) => c.role === 'dominant');
  return {
    ...e,
    _families: [...new Set((dominant.length ? dominant : e.colors).map((c) => family(c.hex)).filter(Boolean))],
    _categories: [...new Set(e.garments.map((g) => g.category))],
    _text: norm([e.title, e.brand, e.season, e.summary, ...e.silhouette_tags, ...e.terms, ...e.garments.map((g) => `${g.category} ${g.name}`)].join(' '))
  };
}

function fillSelect(select, values, label = (v) => v) {
  const current = select.value;
  select.length = 1;
  for (const v of values) select.add(new Option(label(v), v));
  select.value = values.includes(current) ? current : '';
}

function options() {
  const uniq = (arr) => [...new Set(arr)].sort((a, b) => a.localeCompare(b));
  fillSelect(fields.garment, uniq(entries.flatMap((e) => e._categories)), titleCase);
  fillSelect(fields.silhouette, uniq(entries.flatMap((e) => e.silhouette_tags.map((t) => t.toLowerCase()))), titleCase);
  const fams = new Set(entries.flatMap((e) => e._families));
  fillSelect(fields.color, FAMILIES.filter((f) => fams.has(f)), titleCase);
  fillSelect(fields.brand, uniq(entries.map((e) => e.brand).filter(Boolean)));
}

function readURL() {
  const p = new URLSearchParams(location.search);
  for (const [k, input] of Object.entries(fields)) input.value = p.get(k) || '';
}

function writeURL() {
  const p = new URLSearchParams();
  for (const [k, input] of Object.entries(fields)) if (input.value.trim()) p.set(k, input.value.trim());
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

function card(e) {
  const by = e.brand ? `${esc(e.brand)}${e.season ? ` · ${esc(e.season)}` : ''}` : 'Designer not identified';
  return `
    <a class="card" href="/look?id=${encodeURIComponent(e.id)}">
      <div class="frame">
        <img src="${esc(e.image.src)}" alt="${esc(e.title)}" loading="lazy" width="${e.image.width || 600}" height="${e.image.height || 800}">
        ${e.kind === 'example' ? '<span class="badge">Example</span>' : ''}
      </div>
      <span class="by">${by}</span>
      <h2 class="h3">${esc(e.title)}</h2>
      <div class="row">
        <div class="mini-swatches" aria-label="Colours: ${esc(e.colors.map((c) => c.name).join(', '))}">${e.colors.slice(0, 5).map((c) => `<span data-hex="${esc(c.hex)}"></span>`).join('')}</div>
      </div>
      <div class="tags">${[...e.silhouette_tags, ...e._categories].slice(0, 5).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
    </a>`;
}

function apply() {
  const q = norm(fields.q.value.trim());
  const words = q.split(/\s+/).filter(Boolean);
  const list = entries.filter((e) =>
    (!words.length || words.every((w) => e._text.includes(w))) &&
    (!fields.garment.value || e._categories.includes(fields.garment.value)) &&
    (!fields.silhouette.value || e.silhouette_tags.some((t) => t.toLowerCase() === fields.silhouette.value)) &&
    (!fields.color.value || e._families.includes(fields.color.value)) &&
    (!fields.brand.value || e.brand === fields.brand.value));

  const filtered = Object.values(fields).some((f) => f.value.trim());
  clearBtn.hidden = !filtered;
  count.textContent = `${list.length} ${list.length === 1 ? 'look' : 'looks'}${filtered ? ` of ${entries.length}` : ''}`;
  grid.innerHTML = list.length ? list.map(card).join('') : `
    <div class="empty span-all">
      <p class="h3">No looks match these filters.</p>
      <button type="button" class="btn small ghost" data-clear>Clear filters</button>
    </div>`;
  grid.querySelectorAll('[data-hex]').forEach((s) => { s.style.background = s.dataset.hex; });
  const c = grid.querySelector('[data-clear]');
  if (c) c.addEventListener('click', clear);
  writeURL();
}

function clear() {
  Object.values(fields).forEach((f) => { f.value = ''; });
  apply();
  fields.q.focus();
}

form.addEventListener('submit', (e) => e.preventDefault());
form.addEventListener('input', apply);
form.addEventListener('change', apply);
clearBtn.addEventListener('click', clear);

(async () => {
  grid.innerHTML = '<div class="loading span-all" role="status"><div class="bar"></div><span class="small muted">Loading the archive…</span></div>';
  const { ok, data } = await api.archiveList();
  if (!ok) {
    grid.innerHTML = `<div class="notice error"><p>${esc(data.message || 'The archive could not be loaded.')}</p></div>`;
    return;
  }
  entries = data.entries.map(enrich);
  readURL();
  options();
  readURL(); // re-apply after options exist
  apply();
})();
