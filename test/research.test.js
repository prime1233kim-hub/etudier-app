const test = require('node:test');
const assert = require('node:assert/strict');
const { researchSources, extractJson, collectSearchResults, researchInput } = require('../server/research/research');

const searchResults = (urls) => new Map(urls.map((u) => [require('../server/research/research').normalizeUrl(u), u]));

test('extractJson reads a fenced block or a bare object', () => {
  assert.deepEqual(extractJson('Here:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('text {"b":2} more'), { b: 2 });
  assert.equal(extractJson('nothing'), null);
});

test('collectSearchResults only reads real search result blocks', () => {
  const found = collectSearchResults([
    { type: 'text', text: 'https://not-a-result.com' },
    { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://www.brand.com/a/', title: 'A' }] },
    { type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } }
  ]);
  assert.equal(found.size, 1);
  assert.ok(found.has('brand.com/a'));
});

test('researchInput trims and limits browser-supplied data', () => {
  const input = researchInput({ title: 'x'.repeat(1000), garments: new Array(50).fill({ name: 'g', category: 'top', details: [] }) });
  assert.equal(input.title.length, 200);
  assert.equal(input.garments.length, 10);
  assert.deepEqual(researchInput(null).garments, []);
});

test('invented URLs (not in search results) are dropped before verification', async () => {
  const verified = [];
  const result = await researchSources({ title: 'Look' }, {
    search: async () => ({
      parsed: {
        summary: 'Found one.',
        candidates: [
          { brand: 'Brand', official_domain: 'brand.com', url: 'https://www.brand.com/real', source_type: 'official_collection_page', match_claim: 'same_collection', why: 'Same look' },
          { brand: 'Brand', official_domain: 'brand.com', url: 'https://www.brand.com/made-up', source_type: 'official_product_page', match_claim: 'exact_product', why: 'Guess' }
        ],
        suggestions: ['brand ss24']
      },
      searchResults: searchResults(['https://www.brand.com/real'])
    }),
    verify: async (c) => { verified.push(c.url); return { url: c.url, host: 'www.brand.com', status: 'related', checks: { product_on_page: false, collection_on_page: false }, note: '' }; }
  });
  assert.deepEqual(verified, ['https://www.brand.com/real']);
  assert.equal(result.sources.length, 1);
  assert.equal(result.dropped.not_in_search_results, 1);
  assert.equal(result.identified, false);
});

test('unconfirmed product and collection names are removed', async () => {
  const result = await researchSources({}, {
    search: async () => ({
      parsed: { candidates: [{ brand: 'Brand', product_name: 'Claimed Jacket', collection: 'FW99', url: 'https://brand.com/x', match_claim: 'exact_product', source_type: 'official_product_page' }] },
      searchResults: searchResults(['https://brand.com/x'])
    }),
    verify: async (c) => ({ url: c.url, host: 'brand.com', status: 'related', checks: { product_on_page: false, collection_on_page: false }, note: '' })
  });
  assert.equal(result.sources[0].product_name, '');
  assert.equal(result.sources[0].collection, '');
});

test('failed verification removes the source and is counted', async () => {
  const result = await researchSources({}, {
    search: async () => ({
      parsed: { candidates: [{ brand: 'Brand', url: 'https://brand.com/dead' }] },
      searchResults: searchResults(['https://brand.com/dead'])
    }),
    verify: async () => null
  });
  assert.equal(result.sources.length, 0);
  assert.equal(result.dropped.failed_checks, 1);
});

test('unreadable research output is an error, not an empty success', async () => {
  await assert.rejects(researchSources({}, { search: async () => ({ parsed: null, searchResults: new Map() }) }), { code: 'research_invalid' });
});
