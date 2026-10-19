const test = require('node:test');
const assert = require('node:assert/strict');
const { analysisSchema, validate, normalizeAnalysis } = require('../server/ai/schema');
const { parseAnalysisResponse } = require('../server/ai/analyze');
const examples = require('../data/examples.json');

const sample = () => JSON.parse(JSON.stringify(examples[0].analysis));

test('every example analysis matches the schema', () => {
  for (const e of examples) {
    const r = validate(analysisSchema, e.analysis);
    assert.ok(r.ok, `${e.id}: ${r.errors.join(', ')}`);
  }
});

test('validator catches missing fields, wrong types and bad enums', () => {
  const a = sample();
  delete a.overall.summary;
  a.garments[0].confidence = 'certain';
  a.colors.palette = 'red';
  const r = validate(analysisSchema, a);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('overall.summary')));
  assert.ok(r.errors.some((e) => e.includes('confidence')));
  assert.ok(r.errors.some((e) => e.includes('palette')));
});

test('normalize drops invalid hex values and de-duplicates garment ids', () => {
  const a = sample();
  a.colors.palette[0].hex = 'B8972A';
  a.colors.palette[1].hex = 'ivory';
  a.garments[1].id = a.garments[0].id;
  normalizeAnalysis(a);
  assert.equal(a.colors.palette[0].hex, '#b8972a');
  assert.ok(a.colors.palette.every((c) => /^#[0-9a-f]{6}$/.test(c.hex)));
  assert.notEqual(a.garments[0].id, a.garments[1].id);
});

test('parseAnalysisResponse accepts valid JSON and rejects refusals / junk honestly', () => {
  const ok = parseAnalysisResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(sample()) }] });
  assert.equal(ok.title, examples[0].analysis.title);

  assert.throws(() => parseAnalysisResponse({ stop_reason: 'refusal', content: [] }), { code: 'ai_refused' });
  assert.throws(() => parseAnalysisResponse({ stop_reason: 'max_tokens', content: [] }), { code: 'ai_incomplete' });
  assert.throws(() => parseAnalysisResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] }), { code: 'ai_invalid' });
  assert.throws(() => parseAnalysisResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"title":"x"}' }] }), { code: 'ai_invalid' });
});
