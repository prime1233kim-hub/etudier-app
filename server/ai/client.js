// One shared Anthropic client, created only when a key is configured.
// Also turns SDK errors into short, safe messages for visitors (never the
// raw provider message, which can contain request details).

const Anthropic = require('@anthropic-ai/sdk');

let client = null;

function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getClient() {
  if (!aiConfigured()) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 180_000, maxRetries: 2 });
  return client;
}

function model() {
  return process.env.ETUDIER_MODEL || 'claude-opus-5-5';
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
  return new PublicError('server_error', 'Something went wrong on the server.', 500);
}

// Sends a request with Anthropic's server-side refusal fallback switched on.
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

module.exports = { aiConfigured, getClient, model, PublicError, toPublicError, createWithFallback };
