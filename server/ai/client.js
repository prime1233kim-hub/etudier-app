// Chooses the AI provider and creates its client only when a key is
// configured. Two providers are supported:
//   - "anthropic" (Claude, paid per use)  — ANTHROPIC_API_KEY
//   - "gemini"    (Google, has a free plan) — GEMINI_API_KEY
// Also turns provider errors into short, safe messages for visitors (never
// the raw provider message, which can contain request details).

const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenAI, ApiError: GeminiApiError } = require('@google/genai');

// Key lookup is forgiving, because hosting dashboards make it easy to type
// the name slightly differently or paste stray spaces/quotes:
//   - name variants (any case, spaces/dashes treated as "_") are accepted
//   - as a last resort, a value that looks like the provider's key is used
//     (Google keys start with "AIza", Anthropic keys with "sk-ant-")
const KEY_NAMES = {
  anthropic: ['ANTHROPIC_API_KEY', 'ANTHROPIC_KEY', 'CLAUDE_API_KEY', 'CLAUDE_KEY'],
  gemini: ['GEMINI_API_KEY', 'GEMINI_KEY', 'GEMINI_APIKEY', 'GOOGLE_API_KEY', 'GOOGLE_GENAI_API_KEY', 'GOOGLE_AI_API_KEY', 'GOOGLE_KEY']
};
const KEY_SHAPES = { anthropic: /^sk-ant-[A-Za-z0-9_-]{20,}$/, gemini: /^AIza[0-9A-Za-z_-]{20,}$/ };

const cleanName = (n) => String(n).trim().toUpperCase().replace(/[\s-]+/g, '_');
const cleanValue = (v) => String(v || '').trim().replace(/^["']+|["']+$/g, '').trim();

// Returns { value, name } for the provider's key, or null.
function findKey(which) {
  const env = Object.entries(process.env);
  for (const wanted of KEY_NAMES[which]) {
    const hit = env.find(([n, v]) => cleanName(n) === wanted && cleanValue(v));
    if (hit) return { value: cleanValue(hit[1]), name: hit[0] };
  }
  const shaped = env.find(([n, v]) => !n.startsWith('npm_') && KEY_SHAPES[which].test(cleanValue(v)));
  return shaped ? { value: cleanValue(shaped[1]), name: shaped[0] } : null;
}

// AI_PROVIDER picks one explicitly; otherwise whichever key is present
// (Claude first if both are set).
function provider() {
  const wanted = String(process.env.AI_PROVIDER || '').trim().toLowerCase();
  if (KEY_NAMES[wanted]) return findKey(wanted) ? wanted : null;
  if (findKey('anthropic')) return 'anthropic';
  if (findKey('gemini')) return 'gemini';
  return null;
}

function aiConfigured() {
  return provider() !== null;
}

// Startup note for the hosting logs: names only, never key values.
function describeKeys() {
  const found = ['gemini', 'anthropic'].map((p) => [p, findKey(p)]).filter(([, k]) => k);
  if (found.length) return found.map(([p, k]) => `${p} key found in "${k.name}"`).join('; ');
  const related = Object.keys(process.env).filter((n) => /gemini|google|anthropic|claude|api.?key/i.test(n));
  return related.length
    ? `no usable AI key found; related variable names present: ${related.join(', ')} (check their values aren't empty)`
    : 'no AI key found in the environment (set GEMINI_API_KEY)';
}

let anthropicClient = null;
function getClient() {
  const key = findKey('anthropic');
  if (!key) return null;
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: key.value, timeout: 180_000, maxRetries: 2 });
  return anthropicClient;
}

let geminiClient = null;
function getGemini() {
  const key = findKey('gemini');
  if (!key) return null;
  if (!geminiClient) {
    const httpOptions = { timeout: 180_000 };
    if (process.env.GEMINI_BASE_URL) httpOptions.baseUrl = process.env.GEMINI_BASE_URL; // used by the tests
    geminiClient = new GoogleGenAI({ apiKey: key.value, httpOptions });
  }
  return geminiClient;
}

// Gemini models to try, in order. Free models are often briefly overloaded
// or retired, so if one is busy or unavailable the next is tried.
// GEMINI_MODEL can be one model or a comma-separated list.
const DEFAULT_GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'];
function geminiModels() {
  const list = String(process.env.GEMINI_MODEL || '').split(',').map((m) => m.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_GEMINI_MODELS;
}

// The model used for image analysis (the first choice, for display).
function model() {
  if (provider() === 'gemini') return geminiModels()[0];
  return process.env.ETUDIER_MODEL || 'claude-opus-5-5';
}

// Statuses that mean "try another model": overloaded (503/500), over the
// limit for this model (429) or not available to this account (404).
const TRY_NEXT = [404, 429, 500, 503];

// Runs a Gemini request, falling back through the model list.
async function geminiGenerate(request, models = geminiModels()) {
  let lastError;
  for (const m of models) {
    try {
      return await getGemini().models.generateContent({ ...request, model: m });
    } catch (err) {
      lastError = err;
      if (!(err instanceof GeminiApiError) || !TRY_NEXT.includes(err.status)) throw err;
      console.warn(`Gemini model ${m} unavailable (${err.status}); trying the next one.`);
    }
  }
  throw lastError;
}

// Automatic source research with Gemini needs Google Search, which Google's
// free plan doesn't include for current models. Switch it on only if your
// Google account has a paid plan: GEMINI_RESEARCH=on.
function geminiResearchOn() {
  return String(process.env.GEMINI_RESEARCH || '').trim().toLowerCase() === 'on';
}

class PublicError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function toPublicError(err) {
  if (err instanceof PublicError) return err;

  if (err instanceof GeminiApiError) {
    if (err.status === 429) return new PublicError('ai_busy', 'The free AI service has reached its limit for now. Please try again later — free allowances reset daily.', 503);
    if (err.status === 401 || err.status === 403) return new PublicError('ai_auth', 'The AI provider rejected the server’s API key. Check GEMINI_API_KEY.', 503);
    if (err.status === 400) return new PublicError('ai_rejected', 'The AI provider could not process this request. Try a different image.', 502);
    if (err.status === 503 || err.status === 500) return new PublicError('ai_busy', 'Google’s free AI models are very busy right now. Please try again in a few minutes.', 503);
    if (err.status === 404) return new PublicError('ai_model', 'The configured Gemini model isn’t available. Check GEMINI_MODEL.', 503);
    return new PublicError('ai_error', 'The AI provider returned an error. Please try again.', 502);
  }

  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new PublicError('ai_auth', 'The AI provider rejected the server’s API key. Check ANTHROPIC_API_KEY.', 503);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new PublicError('ai_busy', 'The AI provider is busy right now. Please try again in a minute.', 503);
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new PublicError('ai_rejected', 'The AI provider could not process this request. Try a different image.', 502);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new PublicError('ai_unreachable', 'Could not reach the AI provider. Please try again.', 503);
  }
  if (err instanceof Anthropic.APIError) {
    return new PublicError('ai_error', 'The AI provider returned an error. Please try again.', 502);
  }
  if (err && (err.name === 'AbortError' || err.name === 'TimeoutError' || /fetch failed|ECONNREFUSED|ENOTFOUND/i.test(String(err.message)))) {
    return new PublicError('ai_unreachable', 'Could not reach the AI provider. Please try again.', 503);
  }
  return new PublicError('server_error', 'Something went wrong on the server.', 500);
}

// Sends a Claude request with Anthropic's server-side refusal fallback on.
// If this account or model doesn't accept that option, retries once without it.
async function createWithFallback(params) {
  const c = getClient();
  try {
    return await c.beta.messages.create({
      ...params,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default'
    });
  } catch (err) {
    const text = String(err && err.message || '');
    if (err instanceof Anthropic.BadRequestError && /fallback/i.test(text)) {
      return c.beta.messages.create(params);
    }
    throw err;
  }
}

module.exports = { provider, aiConfigured, describeKeys, findKey, getClient, getGemini, model, geminiModels, geminiGenerate, geminiResearchOn, PublicError, toPublicError, createWithFallback };
