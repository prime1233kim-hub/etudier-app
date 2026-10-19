// Step 2 of 2: source research. Runs after the visual analysis, using
// Claude's server-side web search, or Google Search through Gemini
// (see gemini-search.js). Every link it proposes must
//   1) have actually appeared in the search results (no invented URLs), and
//   2) pass verifyCandidate() — loaded by this server, domain and content checked.

const { provider, aiConfigured, model, createWithFallback, geminiResearchOn, PublicError } = require('../ai/client');
const { verifyCandidate } = require('./verify');

const SOURCE_TYPES = ['official_product_page', 'official_collection_page', 'official_brand_page', 'official_instagram', 'runway_archive', 'press'];
const MATCH_CLAIMS = ['exact_product', 'same_collection', 'brand_reference'];

function researchEnabled() {
  if (!aiConfigured() || String(process.env.RESEARCH_PROVIDER || 'on').toLowerCase() === 'off') return false;
  return provider() === 'gemini' ? geminiResearchOn() : true;
}

const clip = (s, n = 200) => String(s == null ? '' : s).slice(0, n);
const clipList = (a, n = 8, len = 200) => (Array.isArray(a) ? a.slice(0, n).map((x) => clip(x, len)) : []);

// Only the fields research needs, trimmed — this comes from the browser.
function researchInput(body) {
  const a = body && typeof body === 'object' ? body : {};
  const id = a.identification || {};
  return {
    title: clip(a.title),
    summary: clip(a.overall && a.overall.summary, 600),
    garments: (Array.isArray(a.garments) ? a.garments.slice(0, 10) : []).map((g) => ({
      category: clip(g && g.category, 40),
      name: clip(g && g.name),
      details: clipList(g && g.details, 6, 120)
    })),
    visible_branding: clipList(id.visible_branding, 6),
    possible_brands: (Array.isArray(id.possible_brands) ? id.possible_brands.slice(0, 5) : []).map((b) => ({
      name: clip(b && b.name, 80), confidence: clip(b && b.confidence, 10), reasoning: clip(b && b.reasoning, 300)
    })),
    search_queries: clipList(id.search_queries, 4)
  };
}

const SYSTEM = `You are a fashion research assistant. Given a description of a runway look, use web search to find the original source: the designer's official product page, official collection or runway page, or official Instagram post.

Strict rules:
- Only report URLs that appeared in your web search results. Never construct or guess a URL.
- Prefer official brand domains and official brand social accounts. Runway archives (e.g. vogue.com runway) are acceptable as "runway_archive".
- match_claim:
  "exact_product" only when a source clearly shows this exact garment (visible logo plus matching design, or the same look in the official collection imagery);
  "same_collection" when the source is the collection this look appears to come from;
  "brand_reference" for anything else relevant.
  Resemblance alone is never an exact product match.
- official_domain is the brand's own website domain (e.g. "maisonmargiela.com"), or "" if unknown.
- If nothing reliable is found, return an empty candidates list. That is a good, honest answer.
- At most 6 candidates.

After searching, reply with only a JSON object in a \`\`\`json code block:
{"summary": "one or two sentences on what you found or why nothing was found",
 "candidates": [{"brand": "", "official_domain": "", "product_name": "", "collection": "", "url": "", "source_type": "${SOURCE_TYPES.join('|')}", "match_claim": "${MATCH_CLAIMS.join('|')}", "why": ""}],
 "suggestions": ["2-4 search ideas a student could try themselves"]}`;

function normalizeUrl(u) {
  try {
    const x = new URL(u);
    x.hash = '';
    return (x.host.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '') + x.search).toLowerCase();
  } catch { return null; }
}

function collectSearchResults(contents) {
  const found = new Map();
  for (const block of contents) {
    if (block.type !== 'web_search_tool_result' || !Array.isArray(block.content)) continue;
    for (const r of block.content) {
      if (r.type === 'web_search_result' && r.url) found.set(normalizeUrl(r.url), r.url);
    }
  }
  return found;
}

function extractJson(text) {
  const fenced = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)].pop();
  const raw = fenced ? fenced[1] : (text.match(/\{[\s\S]*\}/) || [])[0];
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function runSearch(input) {
  const messages = [{
    role: 'user',
    content: `Find the original source for this look.\n\n${JSON.stringify(input, null, 2)}`
  }];
  const allContent = [];
  let response;
  for (let turn = 0; turn < 4; turn++) {
    response = await createWithFallback({
      model: model(),
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: process.env.ETUDIER_RESEARCH_EFFORT || 'medium' },
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: Number(process.env.RESEARCH_MAX_SEARCHES || 6) }],
      messages
    });
    allContent.push(...response.content);
    if (response.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: response.content });
  }
  if (response.stop_reason === 'refusal') throw new PublicError('ai_refused', 'Source research was declined for this look.', 422);
  const finalText = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  return { parsed: extractJson(finalText), searchResults: collectSearchResults(allContent) };
}

function defaultSearch() {
  if (provider() === 'gemini') {
    const { geminiSearch } = require('./gemini-search');
    return (input) => geminiSearch(input, { normalizeUrl });
  }
  return runSearch;
}

// search is injectable so tests can run without the network.
async function researchSources(body, { search = defaultSearch(), verify = verifyCandidate } = {}) {
  const input = researchInput(body);
  const { parsed, searchResults } = await search(input);
  if (!parsed || typeof parsed !== 'object') {
    throw new PublicError('research_invalid', 'Source research returned an unreadable result.', 502);
  }

  const raw = Array.isArray(parsed.candidates) ? parsed.candidates.slice(0, 6) : [];
  const dropped = { not_in_search_results: 0, failed_checks: 0 };
  const checked = await Promise.all(raw.map(async (c) => {
    if (!c || typeof c.url !== 'string') return null;
    const key = normalizeUrl(c.url);
    if (!key || !searchResults.has(key)) { dropped.not_in_search_results++; return null; }
    const candidate = {
      brand: clip(c.brand, 80),
      official_domain: clip(c.official_domain, 80),
      product_name: clip(c.product_name, 160),
      collection: clip(c.collection, 120),
      url: searchResults.get(key),
      source_type: SOURCE_TYPES.includes(c.source_type) ? c.source_type : 'press',
      match_claim: MATCH_CLAIMS.includes(c.match_claim) ? c.match_claim : 'brand_reference',
      why: clip(c.why, 400)
    };
    const v = await verify(candidate);
    if (!v) { dropped.failed_checks++; return null; }
    // Only keep claimed product / collection names when the evidence backs them.
    if (!v.checks.product_on_page) candidate.product_name = '';
    if (!v.checks.collection_on_page) candidate.collection = '';
    return { ...candidate, ...v };
  }));

  const order = { verified: 0, related: 1, unverified: 2 };
  const sources = checked.filter(Boolean).sort((a, b) => order[a.status] - order[b.status]);
  return {
    status: 'ok',
    summary: clip(parsed.summary, 500),
    sources,
    suggestions: clipList(parsed.suggestions, 4),
    dropped,
    identified: sources.some((s) => s.status === 'verified')
  };
}

module.exports = { researchSources, researchEnabled, researchInput, normalizeUrl, extractJson, collectSearchResults };
