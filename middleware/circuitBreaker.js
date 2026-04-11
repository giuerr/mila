/**
 * Circuit Breaker for External APIs
 * Prevents cascading failures when connectors (Xero, Juniper Square, etc.) are down.
 *
 * States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing recovery)
 */

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeoutMs = options.resetTimeoutMs || 30000; // 30 seconds
    this.halfOpenMaxCalls = options.halfOpenMaxCalls || 1;

    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.halfOpenCalls = 0;
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.halfOpenCalls = 0;
      } else {
        throw new Error(`Circuit breaker OPEN for ${this.name} — service unavailable, retry after ${Math.ceil((this.resetTimeoutMs - (Date.now() - this.lastFailureTime)) / 1000)}s`);
      }
    }

    if (this.state === 'HALF_OPEN' && this.halfOpenCalls >= this.halfOpenMaxCalls) {
      throw new Error(`Circuit breaker HALF_OPEN for ${this.name} — waiting for test call to complete`);
    }

    try {
      if (this.state === 'HALF_OPEN') this.halfOpenCalls++;
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure();
      throw err;
    }
  }

  _onSuccess() {
    this.failureCount = 0;
    this.successCount++;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      console.log(`[CIRCUIT_BREAKER] ${this.name}: HALF_OPEN → CLOSED (recovered)`);
    }
  }

  _onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold && this.state === 'CLOSED') {
      this.state = 'OPEN';
      console.warn(`[CIRCUIT_BREAKER] ${this.name}: CLOSED → OPEN after ${this.failureCount} failures`);
    }
    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      console.warn(`[CIRCUIT_BREAKER] ${this.name}: HALF_OPEN → OPEN (test call failed)`);
    }
  }

  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null
    };
  }

  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.halfOpenCalls = 0;
  }
}

// Pre-built breakers for each connector
const breakers = {
  xero: new CircuitBreaker('xero', { failureThreshold: 5, resetTimeoutMs: 60000 }),
  quickbooks: new CircuitBreaker('quickbooks', { failureThreshold: 5, resetTimeoutMs: 60000 }),
  netsuite: new CircuitBreaker('netsuite', { failureThreshold: 5, resetTimeoutMs: 60000 }),
  juniperSquare: new CircuitBreaker('juniper-square', { failureThreshold: 5, resetTimeoutMs: 30000 }),
  allvue: new CircuitBreaker('allvue', { failureThreshold: 5, resetTimeoutMs: 30000 }),
  efront: new CircuitBreaker('efront', { failureThreshold: 5, resetTimeoutMs: 30000 }),
  geneva: new CircuitBreaker('geneva', { failureThreshold: 5, resetTimeoutMs: 30000 }),
  investran: new CircuitBreaker('investran', { failureThreshold: 5, resetTimeoutMs: 30000 })
};

function getAllBreakerStatuses() {
  return Object.values(breakers).map(b => b.getStatus());
}

module.exports = { CircuitBreaker, breakers, getAllBreakerStatuses };
