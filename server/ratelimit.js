// Simple in-memory rate limit per visitor IP. Good enough for one small
// server; resets when the server restarts.

function rateLimit({ windowMs, max, name }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, list] of hits) {
      const fresh = list.filter((t) => now - t < windowMs);
      if (fresh.length) hits.set(ip, fresh); else hits.delete(ip);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      const wait = Math.ceil((windowMs - (now - list[0])) / 60000);
      res.set('Retry-After', String(Math.ceil((windowMs - (now - list[0])) / 1000)));
      return res.status(429).json({
        error: 'rate_limited',
        message: `Too many ${name} requests. Please wait about ${wait} minute${wait === 1 ? '' : 's'}.`
      });
    }
    list.push(now);
    hits.set(ip, list);
    next();
  };
}

module.exports = { rateLimit };
