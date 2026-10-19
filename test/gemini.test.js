// Tests for the free Google Gemini option. A pretend Gemini API runs
// locally (GEMINI_BASE_URL), so the real SDK request path is exercised
// without a key or network access. Runs in its own process, separate from
// the Claude tests.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const examples = require('../data/examples.json');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let fake, server, base, last, mode = 'ok';

const listen = (srv) => new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve(srv.address().port)));
const geminiReply = (text, finishReason = 'STOP') => ({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason }], usageMetadata: {} });

test.before(async () => {
  fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      last = { url: req.url, headers: req.headers, body: JSON.parse(body || '{}') };
      res.setHeader('content-type', 'application/json');
      if (mode === 'limit') { res.statusCode = 429; return res.end(JSON.stringify({ error: { code: 429, message: 'quota secret detail', status: 'RESOURCE_EXHAUSTED' } })); }
      if (mode === 'blocked') return res.end(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' }, candidates: [] }));
      if (mode === 'cut') return res.end(JSON.stringify(geminiReply('{"title": "unfinished', 'MAX_TOKENS')));
      res.end(JSON.stringify(geminiReply(JSON.stringify(examples[2].analysis))));
    });
  });
  const port = await listen(fake);
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.AI_PROVIDER;
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.GEMINI_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'etudier-gemini-'));
  server = http.createServer(require('../server'));
  base = `http://127.0.0.1:${await listen(server)}`;
});

test.after(() => { server.close(); fake.close(); });

const upload = () => {
  const form = new FormData();
  form.append('image', new Blob([PNG], { type: 'image/png' }), 'look.png');
  return fetch(`${base}/api/analyze`, { method: 'POST', body: form });
};

test('status reports Gemini as the provider', async () => {
  const s = await (await fetch(`${base}/api/status`)).json();
  assert.equal(s.ai, true);
  assert.equal(s.provider, 'gemini');
  assert.equal(s.model, 'gemini-3.8-flash');
  assert.equal(s.research, true);
});

test('analysis is sent to Gemini with the image and the JSON schema', async () => {
  mode = 'ok';
  const res = await upload();
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.analysis.title, examples[2].analysis.title);
  assert.match(last.url, /gemini-3\.8-flash:generateContent/);
  assert.equal(last.headers['x-goog-api-key'], 'test-gemini-key');
  const parts = last.body.contents[0].parts;
  assert.equal(parts[0].inlineData.mimeType, 'image/png');
  assert.ok(parts[0].inlineData.data.length > 0);
  assert.equal(last.body.generationConfig.responseMimeType, 'application/json');
  assert.ok(last.body.generationConfig.responseJsonSchema.properties.garments);
  assert.ok(last.body.systemInstruction);
});

test('Gemini blocks, cut-off answers and free-limit errors are reported honestly', async () => {
  mode = 'blocked';
  let r = await upload();
  assert.equal(r.status, 422);
  assert.equal((await r.json()).error, 'ai_refused');

  mode = 'cut';
  r = await upload();
  assert.equal((await r.json()).error, 'ai_incomplete');

  mode = 'limit';
  r = await upload();
  const body = await r.json();
  assert.equal(r.status, 503);
  assert.equal(body.error, 'ai_busy');
  assert.match(body.message, /free/);
  assert.ok(!JSON.stringify(body).includes('secret detail'));
  mode = 'ok';
});

test('Gemini research can only pick from real search results, by number', async () => {
  const { geminiSearch } = require('../server/research/gemini-search');
  const { normalizeUrl } = require('../server/research/research');
  const calls = [];
  const replies = [
    {
      candidates: [{
        content: { parts: [{ text: 'Found the official site.' }] },
        finishReason: 'STOP',
        groundingMetadata: { groundingChunks: [
          { web: { uri: 'https://redirect.example/a', title: 'brand.com' } },
          { web: { uri: 'https://redirect.example/b', title: 'vogue.com' } },
          { web: { uri: 'https://redirect.example/a', title: 'brand.com (duplicate)' } }
        ] }
      }]
    },
    geminiReply(JSON.stringify({
      summary: 'One official page.',
      candidates: [
        { source: 1, brand: 'Brand', official_domain: 'brand.com', product_name: '', collection: '', source_type: 'official_brand_page', match_claim: 'brand_reference', why: 'Official site' },
        { source: 9, brand: 'Brand', official_domain: 'brand.com', product_name: 'Invented', collection: '', source_type: 'official_product_page', match_claim: 'exact_product', why: 'Not in the list' }
      ],
      suggestions: ['brand ss11']
    }))
  ];
  const client = { models: { generateContent: async (req) => { calls.push(req); return replies.shift(); } } };
  const resolve = async (uri) => ({ 'https://redirect.example/a': 'https://www.brand.com/', 'https://redirect.example/b': 'https://www.vogue.com/fashion-shows/x' })[uri];

  const { parsed, searchResults } = await geminiSearch({ title: 'Look' }, { client, resolve, normalizeUrl });
  assert.deepEqual(calls[0].config.tools, [{ googleSearch: {} }]);
  assert.equal(calls[0].model, 'gemini-2.5-flash');
  assert.match(calls[1].contents, /\[1\] brand\.com — https:\/\/www\.brand\.com\//);
  assert.match(calls[1].contents, /\[2\] vogue\.com/);
  assert.ok(!/\[3\]/.test(calls[1].contents), 'duplicate page listed once');
  assert.equal(parsed.candidates.length, 1, 'out-of-range pick dropped');
  assert.equal(parsed.candidates[0].url, 'https://www.brand.com/');
  assert.equal(searchResults.size, 2);
});

test('Gemini research with no search results returns nothing rather than guesses', async () => {
  const { geminiSearch } = require('../server/research/gemini-search');
  const { normalizeUrl } = require('../server/research/research');
  const replies = [
    { candidates: [{ content: { parts: [{ text: 'Nothing found.' }] }, finishReason: 'STOP' }] },
    geminiReply(JSON.stringify({ summary: 'No reliable source.', candidates: [{ source: 1, brand: 'X', official_domain: '', product_name: '', collection: '', source_type: 'press', match_claim: 'brand_reference', why: '' }], suggestions: [] }))
  ];
  const client = { models: { generateContent: async () => replies.shift() } };
  const { parsed, searchResults } = await geminiSearch({}, { client, resolve: async () => null, normalizeUrl });
  assert.equal(parsed.candidates.length, 0);
  assert.equal(searchResults.size, 0);
});
