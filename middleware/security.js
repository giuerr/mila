/**
 * Security Middleware
 * Rate limiting, input sanitization, CORS, security headers,
 * request validation, XSS protection, Puppeteer concurrency control.
 */

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const crypto = require('crypto');

// ==================== RATE LIMITERS ====================

// General API rate limit
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 requests per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again in 15 minutes.' }
});

// Strict limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15, // 15 login attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Account temporarily locked.' },
  skipSuccessfulRequests: true
});

// Strict limiter for signature endpoints
const signLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // 30 signing attempts per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many signing attempts. Try again later.' }
});

// Heavy operation limiter (PDF generation)
const heavyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20, // 20 PDF generations per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'PDF generation rate limit reached.' }
});

// Registration limiter
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5, // 5 registrations per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts.' }
});

// ==================== CORS ====================

const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:3400', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Timezone'],
  credentials: true,
  maxAge: 600 // 10 minutes preflight cache
};

// ==================== HELMET (Security Headers) ====================

const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Needed for signing page
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false, // Allow fonts
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
});

// ==================== INPUT SANITIZATION ====================

/**
 * Sanitize string input — strip HTML tags and dangerous characters
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/[<>]/g, '') // Strip angle brackets
    .replace(/javascript:/gi, '') // Strip JS protocol
    .replace(/on\w+\s*=/gi, '') // Strip event handlers
    .replace(/data:/gi, '') // Strip data: URIs
    .trim();
}

/**
 * Deep sanitize an object recursively
 */
function sanitizeObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitizeString(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (typeof obj === 'object') {
    const clean = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip base64 content fields (documents, signatures)
      if (key === 'content' || key === 'contentBase64' || key === 'signatureImage' ||
          key === 'documentBase64' || key === 'base64Content') {
        clean[key] = value;
      } else {
        clean[key] = sanitizeObject(value);
      }
    }
    return clean;
  }
  return obj;
}

/**
 * Request body sanitization middleware
 */
function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
}

// ==================== SAFE COMPARISON ====================

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) {
    // Still do a comparison to avoid length-based timing leak
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ==================== VALIDATION HELPERS ====================

/**
 * Validate that required fields exist in request body
 */
function requireFields(...fields) {
  return (req, res, next) => {
    const missing = fields.filter(f => req.body[f] === undefined || req.body[f] === null || req.body[f] === '');
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }
    next();
  };
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  const validator = require('validator');
  return validator.isEmail(email);
}

/**
 * Validate that a value is a safe integer (prevents SQL injection in numeric params)
 */
function safeInt(value, defaultValue = 0, min = 0, max = 100000) {
  const num = parseInt(value, 10);
  if (isNaN(num) || num < min || num > max) return defaultValue;
  return num;
}

/**
 * Validate orderBy against a whitelist (prevents SQL injection)
 */
function safeOrderBy(value, allowedColumns, defaultValue = 'created_at DESC') {
  if (!value || typeof value !== 'string') return defaultValue;
  const parts = value.trim().split(/\s+/);
  const column = parts[0];
  const direction = (parts[1] || 'ASC').toUpperCase();
  if (!allowedColumns.includes(column)) return defaultValue;
  if (!['ASC', 'DESC'].includes(direction)) return defaultValue;
  return `${column} ${direction}`;
}

// ==================== PUPPETEER CONCURRENCY ====================

let activePdfJobs = 0;
const MAX_PDF_CONCURRENT = 3;

function pdfConcurrencyGuard(req, res, next) {
  if (activePdfJobs >= MAX_PDF_CONCURRENT) {
    return res.status(503).json({ error: 'PDF generation queue full. Try again shortly.' });
  }
  activePdfJobs++;
  res.on('finish', () => { activePdfJobs = Math.max(0, activePdfJobs - 1); });
  next();
}

// ==================== REQUEST LOGGING ====================

function securityLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    // Log suspicious activity
    if (res.statusCode === 401 || res.statusCode === 403) {
      console.warn(`[SECURITY] ${res.statusCode} ${req.method} ${req.originalUrl} from ${req.ip} — ${duration}ms`);
    }
    if (res.statusCode === 429) {
      console.warn(`[RATE_LIMIT] ${req.method} ${req.originalUrl} from ${req.ip} — rate limited`);
    }
  });
  next();
}

module.exports = {
  generalLimiter,
  authLimiter,
  signLimiter,
  heavyLimiter,
  registerLimiter,
  corsOptions,
  cors: cors(corsOptions),
  helmet: helmetConfig,
  sanitizeBody,
  sanitizeString,
  sanitizeObject,
  timingSafeEqual,
  requireFields,
  isValidEmail,
  safeInt,
  safeOrderBy,
  pdfConcurrencyGuard,
  securityLogger
};
