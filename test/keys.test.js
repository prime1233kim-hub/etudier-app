// The key lookup should survive the small mistakes that are easy to make in
// a hosting dashboard: different spelling, stray spaces or quotes, or a key
// saved under an unexpected name.

const test = require('node:test');
const assert = require('node:assert/strict');
const { findKey, provider, describeKeys } = require('../server/ai/client');

const GOOGLE_LIKE = 'AIzaSyD-example_example_example12345';

function withEnv(vars, fn) {
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) {
    if (/gemini|google|anthropic|claude|api.?key|ai_provider|^key$/i.test(k)) delete process.env[k];
  }
  Object.assign(process.env, vars);
  try { return fn(); } finally {
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}

test('the standard name works', () => withEnv({ GEMINI_API_KEY: GOOGLE_LIKE }, () => {
  assert.equal(findKey('gemini').value, GOOGLE_LIKE);
  assert.equal(provider(), 'gemini');
}));

test('name variants, case and spaces are accepted', () => {
  for (const name of ['gemini_api_key', ' GEMINI_API_KEY ', 'GEMINI-API-KEY', 'GOOGLE_API_KEY', 'Gemini Key']) {
    withEnv({ [name]: 'some-key-value' }, () => assert.equal(provider(), 'gemini', name));
  }
});

test('stray spaces and quotes around the value are removed', () => withEnv({ GEMINI_API_KEY: `  "${GOOGLE_LIKE}"  ` }, () => {
  assert.equal(findKey('gemini').value, GOOGLE_LIKE);
}));

test('a Google-shaped key under any name is found', () => withEnv({ KEY: GOOGLE_LIKE }, () => {
  assert.equal(provider(), 'gemini');
  assert.match(describeKeys(), /gemini key found in "KEY"/);
  assert.ok(!describeKeys().includes(GOOGLE_LIKE), 'logs never show the key itself');
}));

test('empty values do not count, and the log hint names the variable', () => withEnv({ GEMINI_API_KEY: '   ' }, () => {
  assert.equal(provider(), null);
  assert.match(describeKeys(), /GEMINI_API_KEY/);
}));

test('no key at all', () => withEnv({}, () => {
  assert.equal(provider(), null);
  assert.match(describeKeys(), /no AI key found/);
}));
