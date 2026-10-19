// Checks a source candidate before it is shown to anyone:
//  - only https, never a private/local network address (blocks SSRF tricks)
//  - the page must actually load (dead links are dropped)
//  - the host must belong to the brand's official domain, the brand name
//    must appear on the page, and for an exact product claim the product
//    name must appear too.
// The status label is decided here from those checks, never from the AI's
// own confidence.

const dns = require('node:dns').promises;
const net = require('node:net');

const MAX_BODY = 1_500_000;
const TIMEOUT_MS = 9000;
const MAX_REDIRECTS = 3;

// Well-known runway archives / fashion press. A page here can be a useful
// "related reference" but is never an official brand source.
const PRESS_DOMAINS = ['vogue.com', 'vogue.co.uk', 'vogue.fr', 'wwd.com', 'businessoffashion.com', 'nowfashion.com', 'showstudio.com', 'hypebeast.com', 'highsnobiety.com', 'dazeddigital.com', 'anothermag.com'];

function fold(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
const slug = (s) => fold(s).replace(/[^a-z0-9]/g, '');

function hostMatches(host, domain) {
  host = host.toLowerCase().replace(/\.$/, '');
  domain = String(domain || '').toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  return Boolean(domain) && (host === domain || host.endsWith('.' + domain));
}

// The registrable part of a domain without its TLD(s): "fr.louisvuitton.com" → "louisvuitton".
function domainLabel(domain) {
  const parts = String(domain).toLowerCase().split('.').filter(Boolean);
  if (parts.length < 2) return parts[0] || '';
  const sld = parts[parts.length - 2];
  if (['co', 'com', 'net', 'org'].includes(sld) && parts.length >= 3) return parts[parts.length - 3];
  return sld;
}

// Does this domain plausibly belong to this brand? (louisvuitton.com ↔ Louis Vuitton)
function domainFitsBrand(domain, brand) {
  const label = slug(domainLabel(domain));
  const b = slug(brand);
  if (label.length < 3 || b.length < 3) return false;
  return label.includes(b) || (b.includes(label) && label.length >= 4);
}

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;
    if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true;
}

async function assertPublicHost(hostname, lookup) {
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error('private address');
    return;
  }
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) throw new Error('local host');
  const addrs = await lookup(hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new Error('private address');
}

async function readCapped(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < MAX_BODY) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}

function pageInfo(html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const ogTitle = (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) || [])[1] || '';
  const ogSite = (html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["']/i) || [])[1] || '';
  const text = decodeEntities(html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ');
  return { title: decodeEntities(title).trim().slice(0, 200), haystack: fold([title, ogTitle, ogSite, text].join(' ')) };
}

function phraseOnPage(haystack, phrase) {
  const p = fold(phrase).trim();
  if (!p) return false;
  if (haystack.includes(p)) return true;
  // Allow word-order and punctuation differences: most significant words present.
  const words = p.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  if (!words.length) return false;
  const found = words.filter((w) => haystack.includes(w)).length;
  return found / words.length >= 0.8;
}

// Fetches a URL safely, following a few redirects and re-checking each hop.
async function safeFetch(url, { fetchImpl = fetch, lookup = dns.lookup } = {}) {
  let current = new URL(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== 'https:') throw new Error('not https');
    await assertPublicHost(current.hostname, lookup);
    const response = await fetchImpl(current.href, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'EtudierLinkCheck/1.0 (fashion study tool; verifies source links)', Accept: 'text/html,application/xhtml+xml' }
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      current = new URL(response.headers.get('location'), current);
      continue;
    }
    return { response, finalUrl: current };
  }
  throw new Error('too many redirects');
}

/**
 * candidate: { brand, official_domain, product_name, match_claim, url, ... }
 * Returns null when the link should not be shown at all.
 */
async function verifyCandidate(candidate, deps = {}) {
  let url;
  try { url = new URL(candidate.url); } catch { return null; }
  if (url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase();
  const brand = candidate.brand || '';
  const claimedDomain = String(candidate.official_domain || '').replace(/^https?:\/\//, '').split('/')[0];
  const domainIsBrands = claimedDomain && domainFitsBrand(claimedDomain, brand);
  const onOfficialDomain = Boolean(domainIsBrands && hostMatches(host, claimedDomain));
  const isPress = PRESS_DOMAINS.some((d) => hostMatches(host, d));
  const checks = { reachable: false, official_domain: onOfficialDomain, brand_on_page: false, product_on_page: false, collection_on_page: false };

  // Instagram pages can't be read without logging in, so they are never verified.
  if (hostMatches(host, 'instagram.com')) {
    return { url: url.href, host, status: 'unverified', checks, page_title: '', note: 'Instagram content can’t be checked without signing in, so this link is unverified.' };
  }

  let response, finalUrl;
  try {
    ({ response, finalUrl } = await safeFetch(url.href, deps));
  } catch {
    return null; // unreachable, unsafe, or timed out — don't show it
  }

  if ([401, 403, 429].includes(response.status)) {
    // The site exists but refuses automated checks (common on luxury brand sites).
    response.body && response.body.cancel().catch(() => {});
    return { url: url.href, host, status: 'unverified', checks, page_title: '', note: 'This site blocks automated checks, so the page content could not be confirmed.' };
  }
  if (response.status < 200 || response.status >= 300) {
    response.body && response.body.cancel().catch(() => {});
    return null;
  }

  checks.reachable = true;
  const finalHost = finalUrl.hostname.toLowerCase();
  if (onOfficialDomain && !hostMatches(finalHost, claimedDomain)) checks.official_domain = false;

  const html = await readCapped(response).catch(() => '');
  const { title, haystack } = pageInfo(html);
  checks.brand_on_page = phraseOnPage(haystack, brand);
  checks.product_on_page = Boolean(candidate.product_name) && phraseOnPage(haystack, candidate.product_name);
  checks.collection_on_page = Boolean(candidate.collection) && phraseOnPage(haystack, candidate.collection);

  let status = 'unverified';
  if (candidate.match_claim === 'exact_product' && checks.official_domain && checks.brand_on_page && checks.product_on_page) {
    status = 'verified';
  } else if ((checks.official_domain || isPress) && checks.brand_on_page) {
    status = 'related';
  }

  let note = '';
  if (status === 'unverified') {
    if (!checks.brand_on_page) note = 'The brand name could not be found on this page.';
    else if (!checks.official_domain) note = 'This page is not on the brand’s official website.';
  } else if (status === 'related' && candidate.match_claim === 'exact_product') {
    note = 'The page is official, but the exact product could not be confirmed on it.';
  }

  return { url: finalUrl.href, host: finalHost, status, checks, page_title: title, note, is_press: isPress };
}

module.exports = { verifyCandidate, domainFitsBrand, hostMatches, isPrivateAddress, phraseOnPage, pageInfo, safeFetch };
