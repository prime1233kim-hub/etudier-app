// "My Research" — saved looks, collections, glossary terms and archive
// delete tokens. Everything here lives in this browser's localStorage only:
// it is not sent to the server and is not shared between devices.

const KEY = 'etudier.v1';
const MAX_LOOKS = 60;

function empty() {
  return { looks: [], collections: [], terms: [], archiveTokens: {} };
}

let memory = null; // fallback when storage is blocked (private mode etc.)

export function storageAvailable() {
  try {
    localStorage.setItem(KEY + '.probe', '1');
    localStorage.removeItem(KEY + '.probe');
    return true;
  } catch { return false; }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : empty();
    return { ...empty(), ...data };
  } catch {
    return memory || (memory = empty());
  }
}

function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return { ok: true };
  } catch (err) {
    memory = data;
    const full = err && (err.name === 'QuotaExceededError' || err.code === 22);
    return { ok: false, message: full ? 'Browser storage is full. Remove some saved looks and try again.' : 'This browser is blocking storage, so saved research will be lost when you close the tab.' };
  }
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

// ----- looks -----

export function listLooks() { return load().looks; }
export function getLook(id) { return load().looks.find((l) => l.id === id) || null; }

export function findLookBySource(sourceKey) {
  return sourceKey ? load().looks.find((l) => l.sourceKey === sourceKey) || null : null;
}

export function saveLook(look) {
  const data = load();
  if (look.sourceKey) {
    const existing = data.looks.find((l) => l.sourceKey === look.sourceKey);
    if (existing) {
      Object.assign(existing, look, { id: existing.id, savedAt: existing.savedAt, collections: existing.collections });
      return { ...save(data), look: existing };
    }
  }
  if (data.looks.length >= MAX_LOOKS) return { ok: false, message: `You can save up to ${MAX_LOOKS} looks in this browser. Remove one first.` };
  const entry = { id: uid(), savedAt: new Date().toISOString(), collections: [], ...look };
  data.looks.unshift(entry);
  const result = save(data);
  if (!result.ok && result.message.startsWith('Browser storage is full')) {
    data.looks.shift();
    save(data);
    return result;
  }
  return { ...result, look: entry };
}

export function updateLook(id, patch) {
  const data = load();
  const look = data.looks.find((l) => l.id === id);
  if (!look) return { ok: false, message: 'That saved look no longer exists.' };
  Object.assign(look, patch);
  return save(data);
}

export function removeLook(id) {
  const data = load();
  data.looks = data.looks.filter((l) => l.id !== id);
  return save(data);
}

// ----- collections -----

export function listCollections() { return load().collections; }

export function addCollection(name) {
  const clean = String(name || '').trim().slice(0, 60);
  if (!clean) return { ok: false, message: 'Give the collection a name.' };
  const data = load();
  if (data.collections.some((c) => c.name.toLowerCase() === clean.toLowerCase())) return { ok: false, message: 'A collection with that name already exists.' };
  const c = { id: uid(), name: clean, createdAt: new Date().toISOString() };
  data.collections.push(c);
  return { ...save(data), collection: c };
}

export function renameCollection(id, name) {
  const clean = String(name || '').trim().slice(0, 60);
  if (!clean) return { ok: false, message: 'Give the collection a name.' };
  const data = load();
  const c = data.collections.find((x) => x.id === id);
  if (!c) return { ok: false, message: 'Collection not found.' };
  c.name = clean;
  return save(data);
}

export function removeCollection(id) {
  const data = load();
  data.collections = data.collections.filter((c) => c.id !== id);
  data.looks.forEach((l) => { l.collections = (l.collections || []).filter((x) => x !== id); });
  return save(data);
}

export function toggleLookCollection(lookId, collectionId, on) {
  const data = load();
  const look = data.looks.find((l) => l.id === lookId);
  if (!look) return { ok: false, message: 'Saved look not found.' };
  const set = new Set(look.collections || []);
  if (on) set.add(collectionId); else set.delete(collectionId);
  look.collections = [...set];
  return save(data);
}

// ----- glossary -----

export function listTerms() { return load().terms; }
export function hasTerm(term) { return load().terms.some((t) => t.term.toLowerCase() === String(term).toLowerCase()); }

export function saveTerm(entry) {
  const data = load();
  if (data.terms.some((t) => t.term.toLowerCase() === entry.term.toLowerCase())) return { ok: true, existed: true };
  data.terms.unshift({ id: uid(), savedAt: new Date().toISOString(), ...entry });
  return save(data);
}

export function removeTerm(id) {
  const data = load();
  data.terms = data.terms.filter((t) => t.id !== id);
  return save(data);
}

// ----- archive ownership -----

export function rememberArchiveToken(id, token) {
  const data = load();
  data.archiveTokens[id] = token;
  return save(data);
}
export function archiveToken(id) { return load().archiveTokens[id] || null; }
export function forgetArchiveToken(id) {
  const data = load();
  delete data.archiveTokens[id];
  return save(data);
}
