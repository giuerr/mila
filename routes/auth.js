/**
 * Auth Routes — Login, register, token refresh
 * Hardened: rate-limited login, admin-only registration, role validation, input validation.
 */

const express = require('express');
const router = express.Router();
const { generateToken, hashPassword, verifyPassword, authenticate, authorize, ROLES, JWT_SECRET } = require('../middleware/auth');
const { authLimiter, registerLimiter, isValidEmail, sanitizeString } = require('../middleware/security');
const db = require('../db/database');
const crypto = require('crypto');

const VALID_ROLES = Object.values(ROLES);
const PASSWORD_MIN_LENGTH = 12;

// Login — rate limited
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format' });

    // Constant-time: always hash even if user not found (prevents user enumeration)
    const user = db.query('SELECT * FROM users WHERE email = ? AND active = 1', [email])[0];
    const dummyHash = '$2a$12$000000000000000000000uGSvKEqJTGqb.gOGEWfTfM0x7b3q.VW'; // bcrypt dummy
    const valid = await verifyPassword(password, user?.password_hash || dummyHash);

    if (!user || !valid) {
      db.logAction('auth', email, 'LOGIN_FAILED', email, { ip: req.ip });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    db.run('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?', [user.id]);
    db.logAction('auth', user.id, 'LOGIN_SUCCESS', user.email, { ip: req.ip });

    const token = generateToken(user);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ error: 'Authentication failed' }); // Don't leak error details
  }
});

// Register — requires admin auth OR first-user bootstrap
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { email, password, name, role, investorId } = req.body;

    // Input validation
    if (!email || !password || !name) return res.status(400).json({ error: 'Email, password, and name required' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format' });
    if (password.length < PASSWORD_MIN_LENGTH) return res.status(400).json({ error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` });
    if (name.length > 200) return res.status(400).json({ error: 'Name too long' });

    // Role validation — only allow valid roles
    const requestedRole = role || 'READONLY';
    if (!VALID_ROLES.includes(requestedRole)) {
      return res.status(400).json({ error: `Invalid role. Allowed: ${VALID_ROLES.join(', ')}` });
    }

    // Check if this is the first user (bootstrap) or requires admin auth
    const userCount = db.query('SELECT COUNT(*) as count FROM users', [])[0]?.count || 0;
    const isBootstrap = userCount === 0;

    if (!isBootstrap) {
      // Require admin authentication for all registrations after first user
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Admin authentication required to register new users' });
      }
      // Verify admin token using the same JWT_SECRET as middleware/auth.js
      try {
        const jwt = require('jsonwebtoken');
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'ADMIN' && decoded.role !== 'CFO') {
          return res.status(403).json({ error: 'Only ADMIN or CFO can register new users' });
        }
      } catch (e) {
        return res.status(401).json({ error: 'Invalid admin token' });
      }

      // Non-admin users can only create roles below their level
      if (requestedRole === 'ADMIN') {
        return res.status(403).json({ error: 'Cannot create ADMIN users via API' });
      }
    }

    const existing = db.query('SELECT id FROM users WHERE email = ?', [sanitizeString(email)])[0];
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const id = `USR-${crypto.randomUUID().split('-')[0]}`;
    const passwordHash = await hashPassword(password);

    db.insert('users', {
      id,
      email: sanitizeString(email),
      password_hash: passwordHash,
      name: sanitizeString(name),
      role: isBootstrap ? 'ADMIN' : requestedRole, // First user is always ADMIN
      investor_id: investorId || null
    });

    const finalRole = isBootstrap ? 'ADMIN' : requestedRole;
    db.logAction('auth', id, 'REGISTER', sanitizeString(email), { role: finalRole, ip: req.ip, bootstrap: isBootstrap });

    const token = generateToken({ id, email: sanitizeString(email), role: finalRole, investor_id: investorId });
    res.status(201).json({
      token,
      user: { id, email: sanitizeString(email), name: sanitizeString(name), role: finalRole },
      note: isBootstrap ? 'First user created as ADMIN. Set JWT_SECRET env var before deploying.' : undefined
    });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Get current user
router.get('/me', authenticate, (req, res) => {
  const user = db.findById('users', req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  // Never return password_hash
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role, lastLogin: user.last_login });
});

module.exports = router;
