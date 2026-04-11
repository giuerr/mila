/**
 * Inter-Agent Coordination Service
 * NANDA-compliant event dispatch to Gaio (General Counsel), Lucio (Investment Principal), Clara (Operations Lead), and Livia (Executive Assistant).
 * Uses circuit breakers for resilient inter-agent communication.
 */

const db = require('../db/database');
const { CircuitBreaker } = require('../middleware/circuitBreaker');

const VALID_EVENT_TYPES = [
  'FUND_FORMED',
  'NAV_CALCULATED',
  'CAPITAL_CALL_ISSUED',
  'DISTRIBUTION_MADE',
  'REPORT_GENERATED',
  'VALUATION_UPDATED',
  'LPA_AMENDED',
  'SIDE_LETTER_EXECUTED'
];

const MAX_EVENT_LOG_SIZE = 1000;

class InterAgentCoordinationService {

  constructor() {
    // Agent endpoints from environment variables
    this.agents = {
      gaio: { name: 'Gaio — General Counsel', url: process.env.GAIO_URL || null },
      lucio: { name: 'Lucio — Investment Principal', url: process.env.LUCIO_URL || null },
      clara: { name: 'Clara — Operations Lead', url: process.env.CLARA_URL || null },
      livia: { name: 'Livia — Executive Assistant', url: process.env.LIVIA_URL || null }
    };

    // Circuit breakers per agent
    this.breakers = {
      gaio: new CircuitBreaker('agent-gaio', { failureThreshold: 3, resetTimeoutMs: 60000 }),
      lucio: new CircuitBreaker('agent-lucio', { failureThreshold: 3, resetTimeoutMs: 60000 }),
      livia: new CircuitBreaker('agent-livia', { failureThreshold: 3, resetTimeoutMs: 60000 })
    };

    // In-memory event dispatch history (ring buffer, last 1000)
    this.eventLog = [];
  }

  // ==================== EVENT DISPATCH ====================

  /**
   * Dispatch an event to one or more target agents.
   * @param {string} eventType - One of VALID_EVENT_TYPES
   * @param {Object} payload - Event payload data
   * @param {Array<string>} targetAgents - Agent keys: ['gaio', 'lucio', 'livia']
   * @returns {Object} dispatch results per agent
   */
  async dispatchEvent({ eventType, payload, targetAgents }) {
    if (!eventType || !VALID_EVENT_TYPES.includes(eventType)) {
      throw new Error(`Invalid eventType: ${eventType}. Valid types: ${VALID_EVENT_TYPES.join(', ')}`);
    }
    if (!targetAgents || !Array.isArray(targetAgents) || targetAgents.length === 0) {
      throw new Error('targetAgents array is required and must contain at least one agent key');
    }

    const eventId = `EVT-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
    const timestamp = new Date().toISOString();

    const event = {
      eventId,
      eventType,
      payload: payload || {},
      source: 'mila',
      timestamp,
      version: '1.0'
    };

    const results = {};
    let axios;

    try {
      axios = require('axios');
    } catch {
      // axios not available — log events but cannot dispatch
      axios = null;
    }

    for (const agentKey of targetAgents) {
      const agent = this.agents[agentKey];
      if (!agent) {
        results[agentKey] = { status: 'ERROR', error: `Unknown agent: ${agentKey}` };
        continue;
      }

      if (!agent.url) {
        results[agentKey] = {
          status: 'SKIPPED',
          reason: `No URL configured for ${agent.name}. Set ${agentKey.toUpperCase()}_URL env var.`
        };
        continue;
      }

      const breaker = this.breakers[agentKey];

      try {
        if (!axios) {
          throw new Error('axios not available — install axios to enable inter-agent dispatch');
        }

        const response = await breaker.execute(async () => {
          return axios.post(`${agent.url}/events`, event, {
            headers: {
              'Content-Type': 'application/json',
              'X-Event-Id': eventId,
              'X-Event-Type': eventType,
              'X-Source-Agent': 'mila'
            },
            timeout: 10000
          });
        });

        results[agentKey] = {
          status: 'DELIVERED',
          httpStatus: response.status,
          responseData: response.data
        };
      } catch (err) {
        results[agentKey] = {
          status: 'FAILED',
          error: err.message,
          circuitBreakerState: breaker.getStatus().state
        };
      }
    }

    // Store in event log (ring buffer)
    const logEntry = {
      eventId,
      eventType,
      payload,
      targetAgents,
      results,
      timestamp
    };

    this.eventLog.push(logEntry);
    if (this.eventLog.length > MAX_EVENT_LOG_SIZE) {
      this.eventLog = this.eventLog.slice(-MAX_EVENT_LOG_SIZE);
    }

    // Persist to DB audit trail
    if (db.db) {
      db.logAction('INTER_AGENT', eventId, `DISPATCH_${eventType}`, 'mila', {
        targetAgents,
        results: Object.fromEntries(
          Object.entries(results).map(([k, v]) => [k, v.status])
        )
      });
    }

    return {
      eventId,
      eventType,
      timestamp,
      dispatched: Object.keys(results).filter(k => results[k].status === 'DELIVERED').length,
      failed: Object.keys(results).filter(k => results[k].status === 'FAILED').length,
      skipped: Object.keys(results).filter(k => results[k].status === 'SKIPPED').length,
      results
    };
  }

  // ==================== EVENT LOG ====================

  /**
   * Return recent dispatched events from in-memory log.
   * @param {number} limit - Max events to return (default 50)
   * @returns {Array} Recent events, newest first
   */
  getEventLog({ limit = 50 } = {}) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), MAX_EVENT_LOG_SIZE);
    return this.eventLog.slice(-safeLimit).reverse();
  }

  // ==================== AGENT STATUS ====================

  /**
   * Check health of all connected agents.
   * @returns {Object} Agent statuses with circuit breaker info
   */
  async getAgentStatus() {
    let axios;
    try { axios = require('axios'); } catch { axios = null; }

    const statuses = {};

    for (const [key, agent] of Object.entries(this.agents)) {
      const breaker = this.breakers[key];
      const breakerStatus = breaker.getStatus();

      if (!agent.url) {
        statuses[key] = {
          name: agent.name,
          url: null,
          configured: false,
          status: 'NOT_CONFIGURED',
          circuitBreaker: breakerStatus
        };
        continue;
      }

      let healthStatus = 'UNKNOWN';
      let responseTimeMs = null;

      if (axios && breakerStatus.state !== 'OPEN') {
        const start = Date.now();
        try {
          const response = await axios.get(`${agent.url}/health`, { timeout: 5000 });
          responseTimeMs = Date.now() - start;
          healthStatus = response.status === 200 ? 'HEALTHY' : 'DEGRADED';
        } catch {
          responseTimeMs = Date.now() - start;
          healthStatus = 'UNREACHABLE';
        }
      } else if (breakerStatus.state === 'OPEN') {
        healthStatus = 'CIRCUIT_OPEN';
      }

      statuses[key] = {
        name: agent.name,
        url: agent.url,
        configured: true,
        status: healthStatus,
        responseTimeMs,
        circuitBreaker: breakerStatus
      };
    }

    return {
      checkedAt: new Date().toISOString(),
      agents: statuses,
      totalConfigured: Object.values(statuses).filter(s => s.configured).length,
      totalHealthy: Object.values(statuses).filter(s => s.status === 'HEALTHY').length
    };
  }
}

module.exports = new InterAgentCoordinationService();
