/**
 * Infrastructure Tests
 * Tests circuit breaker, idempotency, request ID, and error handler.
 */

describe('Circuit Breaker', () => {
  const { CircuitBreaker } = require('../middleware/circuitBreaker');

  test('starts in CLOSED state', () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 3 });
    expect(cb.getStatus().state).toBe('CLOSED');
  });

  test('successful calls increment success count', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 3 });
    await cb.execute(async () => 'ok');
    await cb.execute(async () => 'ok');
    expect(cb.getStatus().successCount).toBe(2);
  });

  test('opens after failure threshold', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 3, resetTimeoutMs: 10000 });
    for (let i = 0; i < 3; i++) {
      try { await cb.execute(async () => { throw new Error('fail'); }); } catch (e) {}
    }
    expect(cb.getStatus().state).toBe('OPEN');
    expect(cb.getStatus().failureCount).toBe(3);
  });

  test('rejects calls when OPEN', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 1, resetTimeoutMs: 60000 });
    try { await cb.execute(async () => { throw new Error('fail'); }); } catch (e) {}
    expect(cb.getStatus().state).toBe('OPEN');

    await expect(cb.execute(async () => 'ok'))
      .rejects.toThrow('Circuit breaker OPEN');
  });

  test('transitions to HALF_OPEN after resetTimeout', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 1, resetTimeoutMs: 50 });
    try { await cb.execute(async () => { throw new Error('fail'); }); } catch (e) {}
    expect(cb.getStatus().state).toBe('OPEN');

    // Wait for reset timeout
    await new Promise(r => setTimeout(r, 60));
    const result = await cb.execute(async () => 'recovered');
    expect(result).toBe('recovered');
    expect(cb.getStatus().state).toBe('CLOSED');
  });

  test('reset() returns to CLOSED', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 1, resetTimeoutMs: 60000 });
    try { await cb.execute(async () => { throw new Error('fail'); }); } catch (e) {}
    expect(cb.getStatus().state).toBe('OPEN');
    cb.reset();
    expect(cb.getStatus().state).toBe('CLOSED');
    expect(cb.getStatus().failureCount).toBe(0);
  });

  test('getStatus returns full state', () => {
    const cb = new CircuitBreaker('my-api', { failureThreshold: 5 });
    const status = cb.getStatus();
    expect(status.name).toBe('my-api');
    expect(status.state).toBe('CLOSED');
    expect(status.failureCount).toBe(0);
    expect(status.successCount).toBe(0);
  });
});

describe('Error Handler', () => {
  const { AppError, ValidationError, BusinessLogicError, NotFoundError } = require('../middleware/errorHandler');

  test('ValidationError has statusCode 400', () => {
    const err = new ValidationError('bad input');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('bad input');
    expect(err.isOperational).toBe(true);
  });

  test('BusinessLogicError has statusCode 422', () => {
    const err = new BusinessLogicError('cannot overdraw');
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe('BUSINESS_LOGIC_ERROR');
  });

  test('NotFoundError has statusCode 404', () => {
    const err = new NotFoundError('fund not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });

  test('AppError defaults to 500', () => {
    const err = new AppError('server broke');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
  });
});

describe('Request ID', () => {
  const requestId = require('../middleware/requestId');

  test('assigns a request ID if none exists', () => {
    const req = { headers: {} };
    const res = { setHeader: jest.fn() };
    const next = jest.fn();
    requestId(req, res, next);
    expect(req.requestId).toBeDefined();
    expect(req.requestId).toMatch(/^mila-/);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', req.requestId);
    expect(next).toHaveBeenCalled();
  });

  test('preserves X-Request-Id from client', () => {
    const req = { headers: { 'x-request-id': 'client-123' } };
    const res = { setHeader: jest.fn() };
    const next = jest.fn();
    requestId(req, res, next);
    expect(req.requestId).toBe('client-123');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'client-123');
  });
});

describe('Idempotency Guard', () => {
  const { idempotencyGuard } = require('../middleware/idempotency');

  test('passes through when no X-Idempotency-Key header', () => {
    const req = { headers: {}, method: 'POST', originalUrl: '/api/wires', user: { id: '1' } };
    const res = {};
    const next = jest.fn();
    idempotencyGuard(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('rejects keys longer than 128 chars', () => {
    const req = { headers: { 'x-idempotency-key': 'a'.repeat(200) }, method: 'POST', originalUrl: '/test', user: { id: '1' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();
    idempotencyGuard(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('Connector Health Endpoint', () => {
  const { getAllBreakerStatuses } = require('../middleware/circuitBreaker');

  test('returns status for all connectors', () => {
    const statuses = getAllBreakerStatuses();
    expect(statuses.length).toBe(8);
    const names = statuses.map(s => s.name);
    expect(names).toContain('xero');
    expect(names).toContain('juniper-square');
    expect(names).toContain('quickbooks');
    statuses.forEach(s => {
      expect(s.state).toBe('CLOSED');
      expect(s.failureCount).toBe(0);
    });
  });
});
