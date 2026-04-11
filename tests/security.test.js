/**
 * Security Middleware Tests
 * Tests sanitization, validation helpers, rate limiting, and security functions.
 */

const {
  sanitizeString,
  sanitizeObject,
  requireFields,
  isValidEmail,
  safeInt,
  safeOrderBy,
  timingSafeEqual
} = require('../middleware/security');

describe('sanitizeString', () => {
  test('strips HTML angle brackets', () => {
    expect(sanitizeString('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
  });

  test('strips javascript: protocol', () => {
    expect(sanitizeString('javascript:alert(1)')).toBe('alert(1)');
  });

  test('strips event handlers', () => {
    expect(sanitizeString('onerror=alert(1)')).toBe('alert(1)');
    expect(sanitizeString('onclick=doEvil()')).toBe('doEvil()');
  });

  test('strips data: URIs', () => {
    expect(sanitizeString('data:text/html,<h1>hi</h1>')).toBe('text/html,h1hi/h1');
  });

  test('preserves normal text', () => {
    expect(sanitizeString('Hello World 123')).toBe('Hello World 123');
  });

  test('trims whitespace', () => {
    expect(sanitizeString('  hello  ')).toBe('hello');
  });

  test('passes through non-strings', () => {
    expect(sanitizeString(42)).toBe(42);
    expect(sanitizeString(null)).toBe(null);
    expect(sanitizeString(undefined)).toBe(undefined);
  });
});

describe('sanitizeObject', () => {
  test('recursively sanitizes nested objects', () => {
    const dirty = {
      name: '<script>xss</script>',
      nested: { value: 'javascript:evil()' },
      items: ['onclick=hack()', 'normal']
    };
    const clean = sanitizeObject(dirty);
    expect(clean.name).not.toContain('<script>');
    expect(clean.nested.value).not.toContain('javascript:');
    expect(clean.items[0]).not.toContain('onclick=');
    expect(clean.items[1]).toBe('normal');
  });

  test('preserves base64 content fields', () => {
    const input = {
      content: 'data:image/png;base64,iVBOR...',
      signatureImage: 'data:image/svg,<svg>...</svg>',
      name: 'data:evil'
    };
    const clean = sanitizeObject(input);
    // content and signatureImage should be preserved
    expect(clean.content).toBe(input.content);
    expect(clean.signatureImage).toBe(input.signatureImage);
    // name should be sanitized
    expect(clean.name).not.toContain('data:');
  });

  test('handles null and undefined', () => {
    expect(sanitizeObject(null)).toBeNull();
    expect(sanitizeObject(undefined)).toBeUndefined();
  });
});

describe('requireFields middleware', () => {
  const mockRes = () => {
    const res = { statusCode: null, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => { res.body = data; return res; };
    return res;
  };

  test('passes when all required fields present', () => {
    const middleware = requireFields('name', 'email');
    const req = { body: { name: 'Test', email: 'a@b.com' } };
    const res = mockRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  test('returns 400 when fields missing', () => {
    const middleware = requireFields('name', 'email', 'phone');
    const req = { body: { name: 'Test' } };
    const res = mockRes();
    middleware(req, res, () => {});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('email');
    expect(res.body.error).toContain('phone');
  });

  test('treats empty string as missing', () => {
    const middleware = requireFields('name');
    const req = { body: { name: '' } };
    const res = mockRes();
    middleware(req, res, () => {});
    expect(res.statusCode).toBe(400);
  });

  test('treats null as missing', () => {
    const middleware = requireFields('name');
    const req = { body: { name: null } };
    const res = mockRes();
    middleware(req, res, () => {});
    expect(res.statusCode).toBe(400);
  });
});

describe('isValidEmail', () => {
  test('accepts valid emails', () => {
    expect(isValidEmail('admin@antoninus.com')).toBe(true);
    expect(isValidEmail('user+tag@domain.co.uk')).toBe(true);
  });

  test('rejects invalid emails', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('@domain.com')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('safeInt', () => {
  test('parses valid integers', () => {
    expect(safeInt('42')).toBe(42);
    expect(safeInt(100)).toBe(100);
  });

  test('returns default for NaN', () => {
    expect(safeInt('abc', 10)).toBe(10);
    expect(safeInt(undefined, 5)).toBe(5);
  });

  test('enforces min/max bounds', () => {
    expect(safeInt(-5, 0, 0, 100)).toBe(0);  // below min
    expect(safeInt(999, 0, 0, 100)).toBe(0);  // above max
    expect(safeInt(50, 0, 0, 100)).toBe(50);  // within range
  });
});

describe('safeOrderBy', () => {
  const allowed = ['name', 'created_at', 'status'];

  test('accepts valid column + direction', () => {
    expect(safeOrderBy('name ASC', allowed)).toBe('name ASC');
    expect(safeOrderBy('created_at DESC', allowed)).toBe('created_at DESC');
  });

  test('defaults direction to ASC', () => {
    expect(safeOrderBy('name', allowed)).toBe('name ASC');
  });

  test('rejects columns not in whitelist', () => {
    expect(safeOrderBy('email ASC', allowed)).toBe('created_at DESC');
  });

  test('rejects invalid direction', () => {
    expect(safeOrderBy('name UNION', allowed)).toBe('created_at DESC');
  });

  test('returns default for empty/null input', () => {
    expect(safeOrderBy(null, allowed)).toBe('created_at DESC');
    expect(safeOrderBy('', allowed)).toBe('created_at DESC');
    expect(safeOrderBy(undefined, allowed)).toBe('created_at DESC');
  });
});

describe('timingSafeEqual', () => {
  test('returns true for identical strings', () => {
    expect(timingSafeEqual('secret123', 'secret123')).toBe(true);
  });

  test('returns false for different strings', () => {
    expect(timingSafeEqual('secret123', 'secret456')).toBe(false);
  });

  test('returns false for different length strings', () => {
    expect(timingSafeEqual('short', 'longer-string')).toBe(false);
  });

  test('returns false for non-string inputs', () => {
    expect(timingSafeEqual(123, 'abc')).toBe(false);
    expect(timingSafeEqual(null, null)).toBe(false);
    expect(timingSafeEqual(undefined, 'test')).toBe(false);
  });
});
