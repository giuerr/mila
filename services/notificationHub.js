/**
 * Notification & Alerts Hub
 * Centralized alerting across all Mila modules.
 * Deadline reminders, threshold breaches, NAV movements, wire confirmations.
 */

class NotificationHubService {

  constructor() {
    this.rules = this._defaultRules();
  }

  /**
   * Scan all modules and generate alerts
   */
  async scanAllModules({ fund, compliance, treasury, insurance, portfolio, wires, covenants }) {
    const alerts = [];

    // Compliance alerts
    if (compliance?.filings) {
      for (const filing of compliance.filings) {
        const days = this._daysUntil(filing.deadline);
        if (days < 0 && filing.status !== 'FILED' && filing.status !== 'CONFIRMED') {
          alerts.push(this._alert('CRITICAL', 'COMPLIANCE', `OVERDUE: ${filing.name} was due ${Math.abs(days)} days ago`, filing));
        } else if (days <= 7 && filing.status === 'NOT_STARTED') {
          alerts.push(this._alert('HIGH', 'COMPLIANCE', `${filing.name} due in ${days} days — not started`, filing));
        } else if (days <= 30 && filing.status === 'NOT_STARTED') {
          alerts.push(this._alert('MEDIUM', 'COMPLIANCE', `${filing.name} due in ${days} days`, filing));
        }
      }
    }

    // Treasury alerts
    if (treasury) {
      if (treasury.cashBalance < treasury.minimumCash) {
        alerts.push(this._alert('CRITICAL', 'TREASURY', `Cash below minimum: ${treasury.cashBalance} vs required ${treasury.minimumCash}`, treasury));
      }
      if (treasury.creditFacility?.utilization > 0.80) {
        alerts.push(this._alert('HIGH', 'TREASURY', `Credit facility ${(treasury.creditFacility.utilization * 100).toFixed(0)}% utilized`, treasury.creditFacility));
      }
      for (const covenant of treasury.creditFacility?.covenants || []) {
        if (!covenant.compliant) {
          alerts.push(this._alert('CRITICAL', 'TREASURY', `Credit facility covenant breach: ${covenant.name}`, covenant));
        }
      }
    }

    // Insurance alerts
    if (insurance?.policies) {
      for (const policy of insurance.policies) {
        const days = this._daysUntil(policy.renewalDate);
        if (days < 0) {
          alerts.push(this._alert('CRITICAL', 'INSURANCE', `${policy.type} policy EXPIRED on ${policy.renewalDate}`, policy));
        } else if (days <= 30) {
          alerts.push(this._alert('HIGH', 'INSURANCE', `${policy.type} renewal in ${days} days`, policy));
        }
      }
    }

    // Portfolio alerts
    if (portfolio?.companies) {
      for (const co of portfolio.companies) {
        if (co.currentValue < co.costBasis * 0.5) {
          alerts.push(this._alert('HIGH', 'PORTFOLIO', `${co.name} below 50% of cost basis`, co));
        }
        const reportAge = co.lastReportDate ? this._daysSince(co.lastReportDate) : 999;
        if (reportAge > 120) {
          alerts.push(this._alert('MEDIUM', 'PORTFOLIO', `${co.name} financial reporting overdue (${reportAge} days)`, co));
        }
      }
    }

    // Wire alerts
    if (wires?.pendingCapitalCalls) {
      for (const call of wires.pendingCapitalCalls) {
        const daysUntilDue = this._daysUntil(call.dueDate);
        const unpaid = call.investors?.filter(i => i.status === 'NOT_RECEIVED') || [];
        if (daysUntilDue < 0 && unpaid.length > 0) {
          alerts.push(this._alert('HIGH', 'WIRES', `${unpaid.length} investors overdue on capital call ${call.callId}`, call));
        }
      }
    }

    // Covenant alerts
    if (covenants) {
      for (const cov of covenants) {
        if (cov.breach) {
          alerts.push(this._alert('CRITICAL', 'COVENANTS', cov.breach, cov));
        } else if (cov.headroomPct < 10) {
          alerts.push(this._alert('HIGH', 'COVENANTS', `${cov.name} within 10% of threshold`, cov));
        }
      }
    }

    // Sort by severity
    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return {
      totalAlerts: alerts.length,
      bySeverity: {
        critical: alerts.filter(a => a.severity === 'CRITICAL').length,
        high: alerts.filter(a => a.severity === 'HIGH').length,
        medium: alerts.filter(a => a.severity === 'MEDIUM').length,
        low: alerts.filter(a => a.severity === 'LOW').length
      },
      byModule: this._groupBy(alerts, 'module'),
      alerts,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Configure custom alert rules
   */
  configureRule(rule) {
    this.rules.push({
      id: `RULE-${Date.now()}`,
      ...rule,
      active: true,
      createdAt: new Date().toISOString()
    });
    return { status: 'configured', rule };
  }

  /**
   * Get alert history
   */
  getAlertHistory(alerts, filters = {}) {
    let filtered = [...alerts];
    if (filters.severity) filtered = filtered.filter(a => a.severity === filters.severity);
    if (filters.module) filtered = filtered.filter(a => a.module === filters.module);
    if (filters.since) filtered = filtered.filter(a => new Date(a.timestamp) >= new Date(filters.since));
    return {
      total: filtered.length,
      alerts: filtered,
      filters
    };
  }

  // --- Private ---

  _alert(severity, module, message, data) {
    return {
      id: `ALERT-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      severity,
      module,
      message,
      timestamp: new Date().toISOString(),
      acknowledged: false,
      data
    };
  }

  _daysUntil(dateStr) {
    return Math.floor((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
  }

  _daysSince(dateStr) {
    return Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  }

  _groupBy(arr, key) {
    const groups = {};
    for (const item of arr) {
      if (!groups[item[key]]) groups[item[key]] = [];
      groups[item[key]].push(item);
    }
    return groups;
  }

  _defaultRules() {
    return [
      { module: 'COMPLIANCE', trigger: 'deadline_approaching', thresholdDays: 30, severity: 'MEDIUM' },
      { module: 'COMPLIANCE', trigger: 'deadline_approaching', thresholdDays: 7, severity: 'HIGH' },
      { module: 'COMPLIANCE', trigger: 'overdue', severity: 'CRITICAL' },
      { module: 'TREASURY', trigger: 'cash_below_minimum', severity: 'CRITICAL' },
      { module: 'TREASURY', trigger: 'facility_utilization_above', threshold: 0.80, severity: 'HIGH' },
      { module: 'INSURANCE', trigger: 'policy_expiring', thresholdDays: 30, severity: 'HIGH' },
      { module: 'PORTFOLIO', trigger: 'below_cost_basis_pct', threshold: 0.50, severity: 'HIGH' },
      { module: 'WIRES', trigger: 'capital_call_overdue', severity: 'HIGH' }
    ];
  }
}

module.exports = new NotificationHubService();
