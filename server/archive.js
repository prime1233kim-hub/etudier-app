// The public Fashion Archive.
//  - Example entries live in data/examples.json (read-only, clearly labelled).
//  - Looks that visitors choose to add (with consent) are stored in
//    DATA_DIR/archive.json, with a small JPEG thumbnail in DATA_DIR/archive-images/.
// Each added look gets a private delete token; only its SHA-256 hash is stored.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { analysisSchema, validate, normalizeAnalysis } = require('./ai/schema');
const { sniffImageType } = require('./upload');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const ARCHIVE_FILE = path.join(DATA_DIR, 'archive.json');
const IMAGE_DIR = path.join(DATA_DIR, 'archive-images');
const EXAMPLES_FILE = path.join(ROOT, 'data', 'examples.json');
const MAX_ENTRIES = 500;
const MAX_THUMB_BYTES = 400 * 1024;

fs.mkdirSync(IMAGE_DIR, { recursive: true });

const examples = JSON.parse(fs.readFileSync(EXAMPLES_FILE, 'utf8'));

function readEntries() {
  try { return JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf8')); } catch { return []; }
}

function writeEntries(entries) {
  const tmp = ARCHIVE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2));
  fs.renameSync(tmp, ARCHIVE_FILE);
}

const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');

// What the archive grid and filters need, without the full analysis.
function card(entry) {
  const a = entry.analysis;
  return {
    id: entry.id,
    kind: entry.kind,
    illustrative: Boolean(entry.illustrative),
    title: entry.title,
    brand: entry.brand || '',
    season: entry.season || '',
    image: entry.image,
    silhouette_tags: a ? a.overall.silhouette_tags : (entry.silhouette_tags || []),
    colors: (a ? a.colors.palette : (entry.colors || [])).map(({ name, hex, role }) => ({ name, hex, role })),
    garments: a ? a.garments.map((g) => ({ category: g.category, name: g.name })) : (entry.garments || []),
    terms: a ? a.vocabulary.map((v) => v.term) : [],
    summary: a ? a.overall.summary : (entry.note || ''),
    created_at: entry.created_at || null
  };
}

function publicEntry(entry) {
  const { delete_hash, ...rest } = entry;
  return rest;
}

function list() {
  const user = readEntries().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return [...user, ...examples].map(card);
}

function get(id) {
  const entry = examples.find((e) => e.id === id) || readEntries().find((e) => e.id === id);
  return entry ? publicEntry(entry) : null;
}

class ArchiveError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function add({ analysis, thumbnail, consent, brand, season }) {
  if (consent !== true) throw new ArchiveError(400, 'Please confirm you have the right to share this image publicly.');
  const v = validate(analysisSchema, analysis);
  if (!v.ok) throw new ArchiveError(400, 'This analysis could not be added because it is incomplete.');
  if (!analysis.is_fashion_image) throw new ArchiveError(400, 'Only fashion images can be added to the archive.');

  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(thumbnail || ''));
  if (!m) throw new ArchiveError(400, 'The thumbnail is missing or not a JPEG.');
  const bytes = Buffer.from(m[1], 'base64');
  if (bytes.length > MAX_THUMB_BYTES || sniffImageType(bytes) !== 'image/jpeg') {
    throw new ArchiveError(400, 'The thumbnail is too large or not a valid JPEG.');
  }

  const entries = readEntries();
  if (entries.length >= MAX_ENTRIES) throw new ArchiveError(507, 'The archive is full. Please try again later.');

  const id = crypto.randomBytes(8).toString('hex');
  const token = crypto.randomBytes(24).toString('base64url');
  fs.writeFileSync(path.join(IMAGE_DIR, `${id}.jpg`), bytes);

  const clean = normalizeAnalysis(JSON.parse(JSON.stringify(analysis)));
  const entry = {
    id,
    kind: 'user',
    title: String(clean.title || 'Untitled look').slice(0, 120),
    brand: String(brand || '').slice(0, 80),
    season: String(season || '').slice(0, 80),
    image: { src: `/archive-images/${id}.jpg`, credit: 'Added by a visitor', license: '' },
    analysis: clean,
    created_at: new Date().toISOString(),
    delete_hash: hash(token)
  };
  entries.push(entry);
  writeEntries(entries);
  return { id, deleteToken: token };
}

function remove(id, token) {
  const entries = readEntries();
  const i = entries.findIndex((e) => e.id === id);
  if (i === -1) throw new ArchiveError(404, 'That archive entry no longer exists.');
  const expected = Buffer.from(entries[i].delete_hash, 'hex');
  const given = Buffer.from(hash(String(token || '')), 'hex');
  if (!crypto.timingSafeEqual(expected, given)) throw new ArchiveError(403, 'You can only remove looks you added from this browser.');
  entries.splice(i, 1);
  writeEntries(entries);
  fs.rm(path.join(IMAGE_DIR, `${id}.jpg`), { force: true }, () => {});
}

module.exports = { list, get, add, remove, ArchiveError, IMAGE_DIR, examples };
