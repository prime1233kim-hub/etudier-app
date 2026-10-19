// Thin wrapper around the server API. Always resolves to { ok, status, data }
// so pages can show a real error message instead of failing silently.

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, options);
  } catch {
    return { ok: false, status: 0, data: { message: 'Could not reach the server. Check your connection and try again.' } };
  }
  let data = null;
  if (response.status !== 204) {
    try { data = await response.json(); } catch { data = null; }
  }
  if (!response.ok && !(data && data.message)) {
    data = { ...(data || {}), message: `The server returned an error (${response.status}).` };
  }
  return { ok: response.ok, status: response.status, data: data || {} };
}

export const api = {
  status: () => request('/api/status'),
  demo: () => request('/api/demo'),
  analyze(blob, filename) {
    const form = new FormData();
    form.append('image', blob, filename || 'look.jpg');
    return request('/api/analyze', { method: 'POST', body: form });
  },
  research: (analysis) => request('/api/research', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ analysis })
  }),
  archiveList: () => request('/api/archive'),
  archiveGet: (id) => request(`/api/archive/${encodeURIComponent(id)}`),
  archiveAdd: (payload) => request('/api/archive', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  }),
  archiveDelete: (id, token) => request(`/api/archive/${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: { 'X-Delete-Token': token }
  })
};
