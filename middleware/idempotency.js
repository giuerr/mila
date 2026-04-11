/**
 * Idempotency Middleware
 * Prevents duplicate financial operations (wire processing, capital calls, distributions).
 * Clients send X-Idempotency-Key header; server caches response for 24 hours.
 */

const crypto = require('crypto');

// In-memory cache (use Redis in production for multi-instance)
const idempotencyCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Periodic cleanup of expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of idempotencyCache) {
    if (now - entry.createdAt > CACHE_TTL_MS) {
      idempotencyCache.delete(key);
    }
  }
}, 60 * 60 * 1000); // Cleanup every hour

function idempotencyGuard(req, res, next) {
  const key = req.headers['x-idempotency-key'];
  if (!key) return next(); // No key = no idempotency enforcement

  // Validate key format (prevent abuse with huge keys)
  if (typeof key !== 'string' || key.length > 128) {
    return res.status(400).json({ error: 'Invalid X-Idempotency-Key (max 128 chars)' });
  }

  // Scope key to the route + method + user
  const scopedKey = crypto.createHash('sha256')
    .update(`${req.method}:${req.originalUrl}:${req.user?.id || 'anon'}:${key}`)
    .digest('hex');

  const cached = idempotencyCache.get(scopedKey);
  if (cached) {
    // Return cached response
    res.setHeader('X-Idempotent-Replayed', 'true');
    return res.status(cached.statusCode).json(cached.body);
  }

  // Intercept the response to cache it
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    if (res.statusCode < 500) { // Don't cache server errors
      idempotencyCache.set(scopedKey, {
        statusCode: res.statusCode,
        body,
        createdAt: Date.now()
      });
    }
    return originalJson(body);
  };

  next();
}

module.exports = { idempotencyGuard };
