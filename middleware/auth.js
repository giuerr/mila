/**
 * Authentication & Authorization Middleware
 * JWT-based auth, role-based access control, LP-scoped data access.
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Force JWT_SECRET to be set in production — fail loud
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable must be set in production');
  }
  console.warn('[SECURITY WARNING] Using default JWT secret — set JWT_SECRET env var before deploying');
  return 'mila-dev-only-' + crypto.randomBytes(16).toString('hex');
})();
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';

const ROLES = {
  ADMIN: 'ADMIN',
  CFO: 'CFO',
  FUND_ACCOUNTANT: 'FUND_ACCOUNTANT',
  COMPLIANCE: 'COMPLIANCE',
  INVESTOR: 'INVESTOR',
  READONLY: 'READONLY'
};

// Role hierarchy — higher roles inherit lower permissions
const ROLE_HIERARCHY = {
  ADMIN: ['ADMIN', 'CFO', 'FUND_ACCOUNTANT', 'COMPLIANCE', 'INVESTOR', 'READONLY'],
  CFO: ['CFO', 'FUND_ACCOUNTANT', 'COMPLIANCE', 'READONLY'],
  FUND_ACCOUNTANT: ['FUND_ACCOUNTANT', 'READONLY'],
  COMPLIANCE: ['COMPLIANCE', 'READONLY'],
  INVESTOR: ['INVESTOR'],
  READONLY: ['READONLY']
};

// Route permissions
const ROUTE_PERMISSIONS = {
  // Wire processing — CFO+ only
  '/api/wires': ['ADMIN', 'CFO'],
  '/api/waterfall': ['ADMIN', 'CFO', 'FUND_ACCOUNTANT'],
  '/api/fees': ['ADMIN', 'CFO', 'FUND_ACCOUNTANT'],
  '/api/workflow/approve': ['ADMIN', 'CFO'],

  // Sensitive data
  '/api/tax': ['ADMIN', 'CFO', 'FUND_ACCOUNTANT'],
  '/api/gp': ['ADMIN', 'CFO'],
  '/api/placement-agent': ['ADMIN', 'CFO'],

  // Compliance
  '/api/compliance': ['ADMIN', 'CFO', 'COMPLIANCE'],
  '/api/onboarding': ['ADMIN', 'CFO', 'COMPLIANCE'],

  // Investor portal — investors see only their own data
  '/api/portal': ['ADMIN', 'CFO', 'INVESTOR'],

  // Everything else — read access for authenticated users
  DEFAULT: ['ADMIN', 'CFO', 'FUND_ACCOUNTANT', 'COMPLIANCE', 'READONLY']
};

/**
 * Generate JWT token
 */
function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, investorId: user.investor_id },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

/**
 * Hash password
 */
async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

/**
 * Verify password
 */
async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Authenticate request — verify JWT
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];

  // API key auth (for service-to-service) — timing-safe comparison
  if (apiKey && process.env.MILA_API_KEY && apiKey.length === process.env.MILA_API_KEY.length &&
      crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(process.env.MILA_API_KEY))) {
    req.user = { id: 'service', role: 'ADMIN', email: 'service@antoninus.com' };
    return next();
  }

  // JWT auth
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Authorize by role
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (allowedRoles.length === 0 || allowedRoles.includes(req.user.role)) {
      return next();
    }
    // Check role hierarchy
    const userPermissions = ROLE_HIERARCHY[req.user.role] || [];
    if (allowedRoles.some(role => userPermissions.includes(role))) {
      return next();
    }
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

/**
 * LP data scoping — investors can only see their own data
 */
function scopeToInvestor(req, res, next) {
  if (req.user.role === 'INVESTOR' && req.user.investorId) {
    req.investorScope = req.user.investorId;
  }
  next();
}

/**
 * Route-level permission check middleware
 * Uses req.originalUrl to match against ROUTE_PERMISSIONS, since req.baseUrl
 * is '/api' when mounted as app.use('/api', checkRoutePermission).
 */
function checkRoutePermission(req, res, next) {
  const fullPath = req.originalUrl.split('?')[0]; // Strip query params

  // Find the most specific matching route permission (longest match first)
  const matchedEntry = Object.entries(ROUTE_PERMISSIONS)
    .filter(([route]) => route !== 'DEFAULT' && fullPath.startsWith(route))
    .sort((a, b) => b[0].length - a[0].length)[0];

  const roles = matchedEntry ? matchedEntry[1] : ROUTE_PERMISSIONS.DEFAULT;

  if (!roles.includes(req.user.role)) {
    const userPerms = ROLE_HIERARCHY[req.user.role] || [];
    if (!roles.some(r => userPerms.includes(r))) {
      return res.status(403).json({ error: `Role ${req.user.role} cannot access ${fullPath}` });
    }
  }
  next();
}

module.exports = {
  ROLES,
  ROUTE_PERMISSIONS,
  JWT_SECRET,
  generateToken,
  hashPassword,
  verifyPassword,
  authenticate,
  authorize,
  scopeToInvestor,
  checkRoutePermission
};
