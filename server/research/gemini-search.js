// Source research with Google Gemini in two steps. Needs Google Search,
// which Google's free plan doesn't include for current models, so it only
// runs when GEMINI_RESEARCH=on (a paid Google plan). Steps:
//   1. Gemini searches with Google Search and reports what it found. Google
//      returns the pages it used ("grounding chunks") as redirect links,
//      which this server resolves to the real page addresses.
//   2. Gemini picks candidates *by number* from that list of real pages,
//      so it cannot invent a URL. The usual verification then runs on each.

const { geminiGenerate, PublicError } = require('../ai/client');

const SOURCE_TYPES = ['official_product_page', 'official_collection_page', 'official_brand_page', 'official_instagram', 'runway_archive', 'press'];
const MATCH_CLAIMS = ['exact_product', 'same_collection', 'brand_reference'];
const MAX_SOURCES = 12;

const SEARCH_SYSTEM = `You are a fashion research assistant. Use Google Search to find the original source of the runway look described: the designer's official product page, official collection or runway page, official Instagram account, or a runway archive (e.g. vogue.com runway). Prefer official brand websites. Report briefly what you found and what you could not confirm. Resemblance alone does not prove a garment's origin.`;

const PICK_SYSTEM = `You are checking fashion research results. You are given research notes and a numbered list of web pages that were actually found. Choose up to 6 pages that are genuinely relevant sources for the look, referring to each ONLY by its number.

- match_claim: "exact_product" only when the page clearly shows this exact garment; "same_collection" when it is the collection this look appears to come from; otherwise "brand_reference". Resemblance alone is never an exact match.
- official_domain: the brand's own website domain (e.g. "maisonmargiela.com"), or "" if unknown.
- product_name / collection: only if the page names them; otherwise "".
- If no page is a reliable source, return an empty candidates list. That is a good, honest answer.
- summary: one or two plain sentences on what was found or why nothing was.
- suggestions: 2–4 searches a student could try themselves.`;

const PICK_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source: { type: 'integer' },
          brand: { type: 'string' },
          official_domain: { type: 'string' },
          product_name: { type: 'string' },
          collection: { type: 'string' },
          source_type: { type: 'string', enum: SOURCE_TYPES },
          match_claim: { type: 'string', enum: MATCH_CLAIMS },
          why: { type: 'string' }
        },
        required: ['source', 'brand', 'official_domain', 'product_name', 'collection', 'source_type', 'match_claim', 'why']
      }
    },
    suggestions: { type: 'array', items: { type: 'string' } }
  },
  required: ['summary', 'candidates', 'suggestions']
};

// Google's grounding links redirect to the real page. Read the redirect
// target without loading the page itself.
async function resolveRedirect(uri) {
  try {
    const response = await fetch(uri, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
    response.body && response.body.cancel().catch(() => {});
    const location = response.headers.get('location');
    const url = new URL(response.status >= 300 && response.status < 400 && location ? location : uri, uri);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function blocked(response) {
  const c = (response.candidates || [])[0];
  return Boolean((response.promptFeedback && response.promptFeedback.blockReason) || (c && ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'].includes(c.finishReason)));
}

const textOf = (response) => {
  const c = (response.candidates || [])[0];
  return ((c && c.content && c.content.parts) || []).filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('');
};

/**
 * Returns { parsed, searchResults } in the same shape as the Claude search,
 * so research.js can run the same filtering and verification.
 */
async function geminiSearch(input, { generate = geminiGenerate, resolve = resolveRedirect, normalizeUrl } = {}) {
  // Step 1: search.
  const found = await generate({
    contents: `Find the original source for this look.\n\n${JSON.stringify(input, null, 2)}`,
    config: { systemInstruction: SEARCH_SYSTEM, tools: [{ googleSearch: {} }] }
  });
  if (blocked(found)) throw new PublicError('ai_refused', 'Source research was declined for this look.', 422);

  const chunks = (((found.candidates || [])[0] || {}).groundingMetadata || {}).groundingChunks || [];
  const raw = chunks.map((c) => c.web).filter((w) => w && w.uri).slice(0, MAX_SOURCES);
  const resolved = await Promise.all(raw.map(async (w) => ({ title: String(w.title || '').slice(0, 200), url: await resolve(w.uri) })));
  const pages = [];
  const seen = new Set();
  for (const p of resolved) {
    const key = p.url && normalizeUrl(p.url);
    if (key && !seen.has(key)) { seen.add(key); pages.push(p); }
  }

  // Step 2: choose from the numbered list only.
  const list = pages.length ? pages.map((p, i) => `[${i + 1}] ${p.title} — ${p.url}`).join('\n') : '(no pages were found)';
  const picked = await generate({
    contents: `Research notes:\n${textOf(found).slice(0, 6000)}\n\nPages found:\n${list}\n\nLook:\n${JSON.stringify(input)}`,
    config: { systemInstruction: PICK_SYSTEM, responseMimeType: 'application/json', responseJsonSchema: PICK_SCHEMA, maxOutputTokens: 8000 }
  });
  if (blocked(picked)) throw new PublicError('ai_refused', 'Source research was declined for this look.', 422);

  let parsed;
  try { parsed = JSON.parse(textOf(picked)); } catch { parsed = null; }
  if (parsed && Array.isArray(parsed.candidates)) {
    parsed.candidates = parsed.candidates
      .filter((c) => c && Number.isInteger(c.source) && c.source >= 1 && c.source <= pages.length)
      .map(({ source, ...c }) => ({ ...c, url: pages[source - 1].url }));
  }
  return { parsed, searchResults: new Map(pages.map((p) => [normalizeUrl(p.url), p.url])) };
}

module.exports = { geminiSearch, resolveRedirect, PICK_SCHEMA };
