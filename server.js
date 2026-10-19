// ÉTUDIER — fashion research and learning platform.
// Plain Express server: serves the pages in public/ and a small JSON API.

const fs = require('node:fs');
const path = require('node:path');

// Load .env if present (no extra dependency needed on Node 20.12+).
if (fs.existsSync(path.join(__dirname, '.env')) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(path.join(__dirname, '.env'));
}

const express = require('express');
const { singleImage } = require('./server/upload');
const { rateLimit } = require('./server/ratelimit');
const { provider, aiConfigured, describeKeys, model, toPublicError } = require('./server/ai/client');
const { analyzeImage } = require('./server/ai/analyze');
const { researchSources, researchEnabled } = require('./server/research/research');
const archive = require('./server/archive');

const app = express();
const PORT = Number(process.env.PORT) || 3400;

app.disable('x-powered-by');
app.set('trust proxy', 1); // Render and similar hosts sit behind one proxy

app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "img-src 'self' data: blob: https://upload.wikimedia.org https://thumb.wikimedia.org",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "script-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'"
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin'
  });
  next();
});

// ---------- API ----------

const api = express.Router();
api.use(express.json({ limit: '700kb' }));

api.get('/status', (req, res) => {
  res.json({ ai: aiConfigured(), provider: provider(), research: researchEnabled(), model: aiConfigured() ? model() : null });
});

// Demo mode: a clearly labelled sample analysis with its own example photo,
// so it can never be mistaken for an analysis of the visitor's upload.
api.get('/demo', (req, res) => {
  const sample = archive.examples[0];
  res.json({ demo: true, entry_id: sample.id, image: sample.image, brand: sample.brand, season: sample.season, analysis: sample.analysis });
});

api.post('/analyze', rateLimit({ windowMs: 10 * 60_000, max: Number(process.env.ANALYZE_LIMIT || 10), name: 'analysis' }), singleImage('image'), async (req, res) => {
  if (!aiConfigured()) {
    return res.status(503).json({ error: 'ai_not_configured', message: 'AI analysis is not set up on this server yet. Add GEMINI_API_KEY (free) or ANTHROPIC_API_KEY to enable it.' });
  }
  try {
    const analysis = await analyzeImage({ buffer: req.file.buffer, mediaType: req.file.mimetype });
    res.json({ analysis, model: model() });
  } catch (err) {
    const e = toPublicError(err);
    if (e.code === 'server_error' || e.code === 'ai_error') console.error('analyze failed:', err);
    res.status(e.status).json({ error: e.code, message: e.message });
  }
});

api.post('/research', rateLimit({ windowMs: 10 * 60_000, max: Number(process.env.RESEARCH_LIMIT || 8), name: 'research' }), async (req, res) => {
  if (!researchEnabled()) {
    return res.status(503).json({ status: 'unavailable', message: 'Source research is not switched on for this server.' });
  }
  try {
    res.json(await researchSources(req.body && req.body.analysis));
  } catch (err) {
    console.error('research failed:', err && err.message);
    res.status(503).json({ status: 'unavailable', message: 'Source research is temporarily unavailable. The garment analysis above is unaffected.' });
  }
});

api.get('/archive', (req, res) => res.json({ entries: archive.list() }));

api.get('/archive/:id', (req, res) => {
  const entry = archive.get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'not_found', message: 'That look is not in the archive.' });
  res.json({ entry });
});

api.post('/archive', rateLimit({ windowMs: 60 * 60_000, max: 15, name: 'archive' }), (req, res) => {
  try {
    res.status(201).json(archive.add(req.body || {}));
  } catch (err) {
    if (err instanceof archive.ArchiveError) return res.status(err.status).json({ error: 'archive', message: err.message });
    console.error('archive add failed:', err);
    res.status(500).json({ error: 'server_error', message: 'The look could not be added.' });
  }
});

api.delete('/archive/:id', (req, res) => {
  try {
    archive.remove(req.params.id, req.get('X-Delete-Token'));
    res.status(204).end();
  } catch (err) {
    if (err instanceof archive.ArchiveError) return res.status(err.status).json({ error: 'archive', message: err.message });
    res.status(500).json({ error: 'server_error', message: 'The look could not be removed.' });
  }
});

api.use((req, res) => res.status(404).json({ error: 'not_found', message: 'Unknown API route.' }));
api.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: 'That request is too large.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json', message: 'The request could not be read.' });
  console.error(err);
  res.status(500).json({ error: 'server_error', message: 'Something went wrong on the server.' });
});

app.use('/api', api);

// ---------- Pages and files ----------

app.use('/archive-images', express.static(archive.IMAGE_DIR, { maxAge: '7d', fallthrough: false }));
// No long caching: pages, CSS and JS revalidate (ETag) so updates show up right after a deploy.
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: 0 }));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`ÉTUDIER running at http://localhost:${PORT}`);
    console.log(aiConfigured() ? `AI analysis on (${provider()}: ${model()})` : 'AI analysis off — add GEMINI_API_KEY (free) or ANTHROPIC_API_KEY (demo mode available)');
    console.log(`AI key check: ${describeKeys()}`);
  });
}

module.exports = app;
