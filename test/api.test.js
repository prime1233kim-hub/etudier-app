// End-to-end API tests. A fake Anthropic API runs locally (via
// ANTHROPIC_BASE_URL) so the real SDK call path is exercised without a key
// or network access. Archive data goes to a temporary folder.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const examples = require('../data/examples.json');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const JPEG_THUMB = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]).toString('base64');

let fakeAI, app, server, base, lastAIRequest, aiMode = 'ok';

const listen = (srv) => new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve(srv.address().port)));

test.before(async () => {
  fakeAI = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      lastAIRequest = { url: req.url, headers: req.headers, body: JSON.parse(body) };
      res.setHeader('content-type', 'application/json');
      if (aiMode === 'refusal') {
        return res.end(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'x', content: [], stop_reason: 'refusal', usage: { input_tokens: 1, output_tokens: 0 } }));
      }
      if (aiMode === 'error') { res.statusCode = 500; return res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'secret internal detail' } })); }
      res.end(JSON.stringify({
        id: 'msg_1', type: 'message', role: 'assistant', model: 'x', stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(examples[0].analysis) }],
        usage: { input_tokens: 1, output_tokens: 1 }
      }));
    });
  });
  const aiPort = await listen(fakeAI);
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${aiPort}`;
  process.env.RESEARCH_PROVIDER = 'off';
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'etudier-test-'));
  app = require('../server');
  server = http.createServer(app);
  base = `http://127.0.0.1:${await listen(server)}`;
});

test.after(() => { server.close(); fakeAI.close(); });

const upload = (buf, type, name = 'look.png') => {
  const form = new FormData();
  form.append('image', new Blob([buf], { type }), name);
  return fetch(`${base}/api/analyze`, { method: 'POST', body: form });
};

test('status reports AI on and research off', async () => {
  const r = await (await fetch(`${base}/api/status`)).json();
  assert.equal(r.ai, true);
  assert.equal(r.research, false);
});

test('security headers are set', async () => {
  const r = await fetch(`${base}/`);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-powered-by'), null);
});

test('analyze sends the image to the model and returns a validated analysis', async () => {
  aiMode = 'ok';
  const res = await upload(PNG, 'image/png');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.analysis.title, examples[0].analysis.title);
  const sent = lastAIRequest.body;
  assert.equal(sent.model, 'claude-opus-5-5');
  assert.equal(sent.messages[0].content[0].type, 'image');
  assert.equal(sent.messages[0].content[0].source.media_type, 'image/png');
  assert.equal(sent.output_config.format.type, 'json_schema');
  assert.equal(sent.fallbacks, 'default');
});

test('a model refusal is reported honestly', async () => {
  aiMode = 'refusal';
  const res = await upload(PNG, 'image/png');
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, 'ai_refused');
});

test('provider errors do not leak details', async () => {
  aiMode = 'error';
  const res = await upload(PNG, 'image/png');
  const body = await res.text();
  assert.ok(res.status >= 500);
  assert.ok(!body.includes('secret internal detail'));
  aiMode = 'ok';
});

test('upload validation: wrong type, disguised file, too large, missing', async () => {
  let r = await upload(Buffer.from('hello'), 'text/plain', 'a.txt');
  assert.equal(r.status, 400);
  r = await upload(Buffer.from('this is not really a jpeg file'), 'image/jpeg', 'fake.jpg');
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, 'bad_type');
  r = await upload(Buffer.alloc(11 * 1024 * 1024, 1), 'image/jpeg', 'big.jpg');
  assert.equal(r.status, 413);
  r = await fetch(`${base}/api/analyze`, { method: 'POST', body: new FormData() });
  assert.equal(r.status, 400);
});

test('research reports unavailable instead of inventing results when switched off', async () => {
  const r = await fetch(`${base}/api/research`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ analysis: examples[0].analysis }) });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).status, 'unavailable');
});

test('demo endpoint is clearly marked', async () => {
  const d = await (await fetch(`${base}/api/demo`)).json();
  assert.equal(d.demo, true);
  assert.ok(d.image.src);
});

test('archive: consent required, add, list, fetch, delete with token only', async () => {
  const post = (body) => fetch(`${base}/api/archive`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  let r = await post({ analysis: examples[0].analysis, thumbnail: JPEG_THUMB, consent: false });
  assert.equal(r.status, 400);
  r = await post({ analysis: { title: 'bad' }, thumbnail: JPEG_THUMB, consent: true });
  assert.equal(r.status, 400);
  r = await post({ analysis: examples[0].analysis, thumbnail: 'data:image/png;base64,AAAA', consent: true });
  assert.equal(r.status, 400);

  r = await post({ analysis: examples[0].analysis, thumbnail: JPEG_THUMB, consent: true, brand: 'Test' });
  assert.equal(r.status, 201);
  const { id, deleteToken } = await r.json();
  assert.ok(id && deleteToken);

  const list = await (await fetch(`${base}/api/archive`)).json();
  assert.ok(list.entries.some((e) => e.id === id && e.kind === 'user'));
  assert.ok(list.entries.some((e) => e.kind === 'example'));

  const one = await (await fetch(`${base}/api/archive/${id}`)).json();
  assert.equal(one.entry.delete_hash, undefined, 'delete hash must not be exposed');
  const img = await fetch(`${base}${one.entry.image.src}`);
  assert.equal(img.status, 200);

  r = await fetch(`${base}/api/archive/${id}`, { method: 'DELETE', headers: { 'X-Delete-Token': 'wrong' } });
  assert.equal(r.status, 403);
  r = await fetch(`${base}/api/archive/${id}`, { method: 'DELETE', headers: { 'X-Delete-Token': deleteToken } });
  assert.equal(r.status, 204);
  r = await fetch(`${base}/api/archive/${id}`);
  assert.equal(r.status, 404);
});

test('unknown pages get the 404 page', async () => {
  const r = await fetch(`${base}/no-such-page`);
  assert.equal(r.status, 404);
  assert.match(await r.text(), /out of season/);
});
