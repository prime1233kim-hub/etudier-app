// Chooses the AI provider and creates its client only when a key is
// configured. Two providers are supported:
//   - "anthropic" (Claude, paid per use)  — ANTHROPIC_API_KEY
//   - "gemini"    (Google, has a free plan) — GEMINI_API_KEY
// Also turns provider errors into short, safe messages for visitors (never
// the raw provider message, which can contain request details).

const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenAI, ApiError: GeminiApiError } = require('@google/genai');

const KEYS = { anthropic: 'ANTHROPIC_API_KEY', gemini: 'GEMINI_API_KEY' };

// AI_PROVIDER picks one explicitly; otherwise whichever key is present
// (Claude first if both are set).
function provider() {
  const wanted = String(process.env.AI_PROVIDER || '').toLowerCase();
  if (KEYS[wanted]) return process.env[KEYS[wanted]] ? wanted : null;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return null;
}

function aiConfigured() {
  return provider() !== null;
}

let anthropicClient = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 180_000, maxRetries: 2 });
  return anthropicClient;
}

let geminiClient = null;
function getGemini() {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!geminiClient) {
    const httpOptions = { timeout: 180_000 };
    if (process.env.GEMINI_BASE_URL) httpOptions.baseUrl = process.env.GEMINI_BASE_URL; // used by the tests
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions });
  }
  return geminiClient;
}

// The model used for image analysis.
function model() {
  if (provider() === 'gemini') return process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  return process.env.ETUDIER_MODEL || 'claude-opus-5-5';
}

// Gemini's free plan only includes Google Search with the 2.5 models.
function geminiResearchModel() {
  return process.env.GEMINI_RESEARCH_MODEL || 'gemini-2.5-flash';
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

module.exports = { provider, aiConfigured, getClient, getGemini, model, geminiResearchModel, PublicError, toPublicError, createWithFallback };
