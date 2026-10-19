// Shared header, footer and small UI helpers used on every page.

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/analyze', label: 'Analyze a Look' },
  { href: '/archive', label: 'Fashion Archive' },
  { href: '/about', label: 'About' }
];

export function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function currentPath() {
  const p = location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/');
  return p === '' ? '/' : p;
}

function renderHeader() {
  const el = document.getElementById('site-header');
  if (!el) return;
  const here = currentPath();
  const link = (n) => `<a href="${n.href}"${(here === n.href || (n.href === '/archive' && here === '/look')) ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`;
  el.className = 'site-header';
  el.innerHTML = `
    <div class="wrap">
      <a class="wordmark" href="/" aria-label="ÉTUDIER home">ÉTUDIER</a>
      <nav class="nav" id="primary-nav" aria-label="Primary">
        ${NAV.map(link).join('')}
        <a class="nav-extra" href="/saved"${here === '/saved' ? ' aria-current="page"' : ''}>My Research</a>
      </nav>
      <div class="header-actions">
        <a class="saved-link" href="/saved"${here === '/saved' ? ' aria-current="page"' : ''}>My Research</a>
        <a class="btn small" href="/analyze">Analyze a Look</a>
        <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="primary-nav">Menu <span aria-hidden="true"></span></button>
      </div>
    </div>`;
  const toggle = el.querySelector('.menu-toggle');
  toggle.addEventListener('click', () => {
    const open = el.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && el.classList.contains('open')) { el.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); }
  });
}

function renderFooter() {
  const el = document.getElementById('site-footer');
  if (!el) return;
  el.className = 'site-footer';
  el.innerHTML = `
    <div class="wrap">
      <div class="footer-grid">
        <a class="wordmark" href="/">ÉTUDIER</a>
        <p class="about">A fashion research platform for students and emerging designers: study silhouettes, colour, garments and construction, learn the vocabulary, and trace looks back to their sources.</p>
        <nav aria-label="Footer">
          ${NAV.map((n) => `<a href="${n.href}">${esc(n.label)}</a>`).join('')}
          <a href="/saved">My Research</a>
        </nav>
      </div>
      <div class="footer-base">
        <span>ÉTUDIER — a study tool. AI analysis can be wrong; check sources before citing.</span>
        <span>Example photographs: Wikimedia Commons, credited on each look.</span>
      </div>
    </div>`;
}

let toastTimer;
export function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

export function observeReveal(root = document) {
  const items = root.querySelectorAll('.reveal:not(.in)');
  if (!('IntersectionObserver' in window)) { items.forEach((i) => i.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px' });
  items.forEach((i) => io.observe(i));
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export function downloadText(filename, text, type = 'text/markdown') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slugify(s) {
  return String(s || 'look').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'look';
}

renderHeader();
renderFooter();
observeReveal();
