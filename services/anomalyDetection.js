/**
 * Anomaly Detection Service
 * AI-powered monitoring across capital activity, NAV trends, fee discrepancies,
 * and compliance deadlines. Flags unusual patterns before they become problems.
 */

const db = require('../db/database');

class AnomalyDetectionService {

  /**
   * Run full anomaly scan across all modules
   */
  scanAll(options = {}) {
    const results = {
      scanTimestamp: new Date().toISOString(),
      totalAnomalies: 0,
      severity: { critical: 0, high: 0, medium: 0, low: 0 },
      categories: {},
      anomalies: []
    };

    const scans = [
      this.scanCapitalActivity(options),
      this.scanNavTrends(options),
      this.scanFeeDiscrepancies(options),
      this.scanComplianceDeadlines(options),
      this.scanInvestorConcentration(options),
      this.scanCashPosition(options),
      this.scanValuationOutliers(options)
    ];

    for (const scan of scans) {
      results.anomalies.push(...scan.anomalies);
      results.categories[scan.category] = {
        scanned: scan.scanned,
        anomaliesFound: scan.anomalies.length
      };
    }

    results.totalAnomalies = results.anomalies.length;
    for (const a of results.anomalies) {
      results.severity[a.severity] = (results.severity[a.severity] || 0) + 1;
    }

    // Sort by severity (critical first)
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    results.anomalies.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return results;
  }

  /**
   * Scan capital activity for unusual patterns
   */
  scanCapitalActivity(options = {}) {
    const result = { category: 'capital_activity', scanned: 0, anomalies: [] };
    if (!db.db) return result;

    const activities = db.query(`
      SELECT ca.*, f.name as fund_name, i.name as investor_name,
             c.commitment, c.called_capital
      FROM capital_activity ca
      LEFT JOIN funds f ON ca.fund_id = f.id
      LEFT JOIN investors i ON ca.investor_id = i.id
      LEFT JOIN commitments c ON ca.fund_id = c.fund_id AND ca.investor_id = c.investor_id
      ORDER BY ca.created_at DESC
      LIMIT 500
    `);
    result.scanned = activities.length;

    // Group by fund for pattern analysis
    const byFund = {};
    for (const a of activities) {
      if (!byFund[a.fund_id]) byFund[a.fund_id] = [];
      byFund[a.fund_id].push(a);
    }

    for (const [fundId, fundActivities] of Object.entries(byFund)) {
      const calls = fundActivities.filter(a => a.type === 'CAPITAL_CALL');
      const distributions = fundActivities.filter(a => a.type === 'DISTRIBUTION');

      // 1. Unusually large capital call (>30% of commitment in single call)
      for (const call of calls) {
        if (call.commitment && call.amount > call.commitment * 0.30) {
          result.anomalies.push({
            id: `CA-LARGE-CALL-${call.id}`,
            severity: 'high',
            category: 'capital_activity',
            type: 'LARGE_CAPITAL_CALL',
            fundId,
            fundName: call.fund_name,
            message: `Capital call of ${this._fmt(call.amount)} is ${((call.amount / call.commitment) * 100).toFixed(1)}% of ${call.investor_name}'s commitment`,
            details: { callAmount: call.amount, commitment: call.commitment, investorName: call.investor_name },
            detectedAt: new Date().toISOString()
          });
        }
      }

      // 2. Overdrawn commitment (called > committed)
      for (const call of calls) {
        if (call.commitment && call.called_capital > call.commitment) {
          result.anomalies.push({
            id: `CA-OVERDRAWN-${call.investor_id}`,
            severity: 'critical',
            category: 'capital_activity',
            type: 'COMMITMENT_OVERDRAWN',
            fundId,
            fundName: call.fund_name,
            message: `${call.investor_name} has been called ${this._fmt(call.called_capital)} against ${this._fmt(call.commitment)} commitment (${((call.called_capital / call.commitment) * 100).toFixed(1)}%)`,
            details: { calledCapital: call.called_capital, commitment: call.commitment },
            detectedAt: new Date().toISOString()
          });
        }
      }

      // 3. Late payments (PENDING status older than 15 days)
      for (const call of calls) {
        if (call.status === 'PENDING' && call.due_date) {
          const daysOverdue = Math.floor((Date.now() - new Date(call.due_date).getTime()) / (1000 * 60 * 60 * 24));
          if (daysOverdue > 15) {
            result.anomalies.push({
              id: `CA-LATE-${call.id}`,
              severity: daysOverdue > 30 ? 'critical' : 'high',
              category: 'capital_activity',
              type: 'LATE_PAYMENT',
              fundId,
              fundName: call.fund_name,
              message: `Capital call ${call.call_number || call.id} is ${daysOverdue} days overdue from ${call.investor_name}`,
              details: { dueDate: call.due_date, daysOverdue, amount: call.amount, investorName: call.investor_name },
              detectedAt: new Date().toISOString()
            });
          }
        }
      }

      // 4. Distribution exceeding fund NAV
      const fund = db.findById('funds', fundId);
      if (fund) {
        const totalDistributions = distributions.reduce((sum, d) => sum + d.amount, 0);
        if (fund.nav > 0 && totalDistributions > fund.nav * 1.5) {
          result.anomalies.push({
            id: `CA-DIST-EXCEED-${fundId}`,
            severity: 'high',
            category: 'capital_activity',
            type: 'DISTRIBUTIONS_EXCEED_NAV',
            fundId,
            fundName: fund.name,
            message: `Total distributions (${this._fmt(totalDistributions)}) exceed 150% of current NAV (${this._fmt(fund.nav)})`,
            details: { totalDistributions, nav: fund.nav },
            detectedAt: new Date().toISOString()
          });
        }
      }
    }

    return result;
  }

  /**
   * Scan NAV trends for outliers
   */
  scanNavTrends(options = {}) {
    const result = { category: 'nav_trends', scanned: 0, anomalies: [] };
    if (!db.db) return result;

    const funds = db.findAll('funds', { status: 'ACTIVE' });
    result.scanned = funds.length;

    for (const fund of funds) {
      // Check NAV vs total commitments ratio
      if (fund.total_commitments > 0) {
        const navToCommitment = fund.nav / fund.total_commitments;

        // NAV dropped below 50% of commitments (potential write-down needed)
        if (navToCommitment < 0.5 && fund.nav > 0) {
          result.anomalies.push({
            id: `NAV-LOW-${fund.id}`,
            severity: 'high',
            category: 'nav_trends',
            type: 'NAV_BELOW_THRESHOLD',
            fundId: fund.id,
            fundName: fund.name,
            message: `${fund.name} NAV (${this._fmt(fund.nav)}) is ${(navToCommitment * 100).toFixed(1)}% of commitments — potential write-down`,
            details: { nav: fund.nav, totalCommitments: fund.total_commitments, ratio: navToCommitment },
            detectedAt: new Date().toISOString()
          });
        }

        // NAV suspiciously high (>3x commitments without realized exits)
        if (navToCommitment > 3.0) {
          result.anomalies.push({
            id: `NAV-HIGH-${fund.id}`,
            severity: 'medium',
            category: 'nav_trends',
            type: 'NAV_UNUSUALLY_HIGH',
            fundId: fund.id,
            fundName: fund.name,
            message: `${fund.name} NAV (${this._fmt(fund.nav)}) is ${navToCommitment.toFixed(1)}x commitments — verify valuations`,
            details: { nav: fund.nav, totalCommitments: fund.total_commitments, moic: navToCommitment },
            detectedAt: new Date().toISOString()
          });
        }
      }

      // Check for stale NAV (fund active but NAV is 0)
      if (fund.nav === 0 && fund.called_capital > 0) {
        result.anomalies.push({
          id: `NAV-STALE-${fund.id}`,
          severity: 'medium',
          category: 'nav_trends',
          type: 'NAV_STALE',
          fundId: fund.id,
          fundName: fund.name,
          message: `${fund.name} has ${this._fmt(fund.called_capital)} called capital but NAV is $0 — update needed`,
          details: { nav: fund.nav, calledCapital: fund.called_capital },
          detectedAt: new Date().toISOString()
        });
      }
    }

    return result;
  }

  /**
   * Scan for fee calculation discrepancies
   */
  scanFeeDiscrepancies(options = {}) {
    const result = { category: 'fee_discrepancies', scanned: 0, anomalies: [] };
    if (!db.db) return result;

    const funds = db.findAll('funds', { status: 'ACTIVE' });
    result.scanned = funds.length;

    for (const fund of funds) {
      // Check management fee rate reasonableness
      if (fund.mgmt_fee_rate) {
        if (fund.mgmt_fee_rate > 0.03) {
          result.anomalies.push({
            id: `FEE-HIGH-MGMT-${fund.id}`,
            severity: 'medium',
            category: 'fee_discrepancies',
            type: 'HIGH_MANAGEMENT_FEE',
            fundId: fund.id,
            fundName: fund.name,
            message: `${fund.name} management fee rate (${(fund.mgmt_fee_rate * 100).toFixed(2)}%) exceeds market standard (1.5-2.0%)`,
            details: { feeRate: fund.mgmt_fee_rate, marketRange: '1.5-2.0%' },
            detectedAt: new Date().toISOString()
          });
        }
      }

      // Check carry rate reasonableness
      if (fund.carry_rate && fund.carry_rate > 0.25) {
        result.anomalies.push({
          id: `FEE-HIGH-CARRY-${fund.id}`,
          severity: 'low',
          category: 'fee_discrepancies',
          type: 'HIGH_CARRY_RATE',
          fundId: fund.id,
          fundName: fund.name,
          message: `${fund.name} carry rate (${(fund.carry_rate * 100).toFixed(0)}%) above typical 20% — verify LPA terms`,
          details: { carryRate: fund.carry_rate },
          detectedAt: new Date().toISOString()
        });
      }

      // Check side letter fee overrides vs fund terms
      const sideLetters = db.query(
        'SELECT sl.*, i.name as investor_name FROM side_letters sl JOIN investors i ON sl.investor_id = i.id WHERE sl.fund_id = ?',
        [fund.id]
      );
      for (const sl of sideLetters) {
        try {
          const provisions = JSON.parse(sl.provisions || '[]');
          for (const p of provisions) {
            if (p.type === 'FEE_DISCOUNT' && p.discountPct > 50) {
              result.anomalies.push({
                id: `FEE-DEEP-DISCOUNT-${sl.id}`,
                severity: 'medium',
                category: 'fee_discrepancies',
                type: 'EXCESSIVE_FEE_DISCOUNT',
                fundId: fund.id,
                fundName: fund.name,
                message: `${sl.investor_name} has ${p.discountPct}% fee discount via side letter — exceeds 50% threshold`,
                details: { investorName: sl.investor_name, discountPct: p.discountPct, sideLetterDate: sl.execution_date },
                detectedAt: new Date().toISOString()
              });
            }
          }
        } catch (e) { /* invalid JSON — skip */ }
      }
    }

    return result;
  }

  /**
   * Scan compliance deadlines for approaching or missed filings
   */
  scanComplianceDeadlines(options = {}) {
    const result = { category: 'compliance', scanned: 0, anomalies: [] };
    if (!db.db) return result;

    const filings = db.query(`
      SELECT f.*, fu.name as fund_name
      FROM filings f
      LEFT JOIN funds fu ON f.fund_id = fu.id
      WHERE f.status NOT IN ('FILED', 'CONFIRMED')
      ORDER BY f.deadline ASC
    `);
    result.scanned = filings.length;

    const now = new Date();
    for (const filing of filings) {
      if (!filing.deadline) continue;
      const deadline = new Date(filing.deadline);
      const daysUntil = Math.floor((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntil < 0) {
        // MISSED deadline
        result.anomalies.push({
          id: `COMP-MISSED-${filing.id}`,
          severity: 'critical',
          category: 'compliance',
          type: 'MISSED_DEADLINE',
          fundId: filing.fund_id,
          fundName: filing.fund_name,
          message: `${filing.name} (${filing.jurisdiction}) deadline was ${Math.abs(daysUntil)} days ago — OVERDUE`,
          details: { filingName: filing.name, deadline: filing.deadline, daysOverdue: Math.abs(daysUntil), jurisdiction: filing.jurisdiction, owner: filing.owner },
          detectedAt: new Date().toISOString()
        });
      } else if (daysUntil <= 7) {
        // Due this week
        result.anomalies.push({
          id: `COMP-URGENT-${filing.id}`,
          severity: 'high',
          category: 'compliance',
          type: 'DEADLINE_IMMINENT',
          fundId: filing.fund_id,
          fundName: filing.fund_name,
          message: `${filing.name} (${filing.jurisdiction}) due in ${daysUntil} day(s) — status: ${filing.status}`,
          details: { filingName: filing.name, deadline: filing.deadline, daysUntil, status: filing.status, owner: filing.owner },
          detectedAt: new Date().toISOString()
        });
      } else if (daysUntil <= 30 && filing.status === 'NOT_STARTED') {
        // Due within 30 days but not started
        result.anomalies.push({
          id: `COMP-NOTSTARTED-${filing.id}`,
          severity: 'medium',
          category: 'compliance',
          type: 'FILING_NOT_STARTED',
          fundId: filing.fund_id,
          fundName: filing.fund_name,
          message: `${filing.name} (${filing.jurisdiction}) due in ${daysUntil} days but NOT_STARTED`,
          details: { filingName: filing.name, deadline: filing.deadline, daysUntil, owner: filing.owner },
          detectedAt: new Date().toISOString()
        });
      }
    }

    return result;
  }

  /**
   * Scan for investor concentration risk
   */
  scanInvestorConcentration(options = {}) {
    const result = { category: 'concentration', scanned: 0, anomalies: [] };
    if (!db.db) return result;

    const funds = db.findAll('funds', { status: 'ACTIVE' });
    result.scanned = funds.length;

    for (const fund of funds) {
      const commitments = db.query(
        'SELECT c.*, i.name as investor_name FROM commitments c JOIN investors i ON c.investor_id = i.id WHERE c.fund_id = ? ORDER BY c.commitment DESC',
        [fund.id]
      );
      if (commitments.length === 0) continue;

      const totalCommitment = commitments.reduce((sum, c) => sum + c.commitment, 0);
      if (totalCommitment === 0) continue;

      // Single LP > 40% of fund
      for (const c of commitments) {
        const pct = (c.commitment / totalCommitment) * 100;
        if (pct > 40) {
          result.anomalies.push({
            id: `CONC-SINGLE-${c.id}`,
            severity: 'high',
            category: 'concentration',
            type: 'SINGLE_LP_CONCENTRATION',
            fundId: fund.id,
            fundName: fund.name,
            message: `${c.investor_name} holds ${pct.toFixed(1)}% of ${fund.name} — single LP concentration risk`,
            details: { investorName: c.investor_name, commitment: c.commitment, pctOfFund: pct, totalFundCommitment: totalCommitment },
            detectedAt: new Date().toISOString()
          });
        }
      }

      // Top 3 LPs > 75% of fund
      if (commitments.length >= 3) {
        const top3 = commitments.slice(0, 3);
        const top3Total = top3.reduce((sum, c) => sum + c.commitment, 0);
        const top3Pct = (top3Total / totalCommitment) * 100;
        if (top3Pct > 75) {
          result.anomalies.push({
            id: `CONC-TOP3-${fund.id}`,
            severity: 'medium',
            category: 'concentration',
            type: 'TOP3_CONCENTRATION',
            fundId: fund.id,
            fundName: fund.name,
            message: `Top 3 LPs hold ${top3Pct.toFixed(1)}% of ${fund.name} — diversification risk`,
            details: { top3: top3.map(c => ({ name: c.investor_name, commitment: c.commitment })), top3Pct },
            detectedAt: new Date().toISOString()
          });
        }
      }
    }

    return result;
  }

  /**
   * Scan cash position anomalies
   */
  scanCashPosition(options = {}) {
    const result = { category: 'cash_position', scanned: 0, anomalies: [] };
    if (!db.db) return result;

    const funds = db.findAll('funds', { status: 'ACTIVE' });
    result.scanned = funds.length;

    for (const fund of funds) {
      // Check unfunded commitments vs called capital
      const commitments = db.query(
        'SELECT SUM(commitment) as total_commitment, SUM(called_capital) as total_called, SUM(unfunded) as total_unfunded FROM commitments WHERE fund_id = ?',
        [fund.id]
      );
      if (commitments.length > 0 && commitments[0].total_commitment) {
        const data = commitments[0];
        const drawdownPct = (data.total_called / data.total_commitment) * 100;

        // Fund is >90% drawn down
        if (drawdownPct > 90) {
          result.anomalies.push({
            id: `CASH-DRAWN-${fund.id}`,
            severity: 'medium',
            category: 'cash_position',
            type: 'HIGH_DRAWDOWN',
            fundId: fund.id,
            fundName: fund.name,
            message: `${fund.name} is ${drawdownPct.toFixed(1)}% drawn — only ${this._fmt(data.total_unfunded)} unfunded remaining`,
            details: { totalCommitment: data.total_commitment, totalCalled: data.total_called, unfunded: data.total_unfunded, drawdownPct },
            detectedAt: new Date().toISOString()
          });
        }
      }
    }

    return result;
  }

  /**
   * Scan for valuation outliers in portfolio
   */
  scanValuationOutliers(options = {}) {
    const result = { category: 'valuation', scanned: 0, anomalies: [] };
    if (!db.db) return result;

    const investments = db.query(`
      SELECT inv.*, f.name as fund_name
      FROM investments inv
      JOIN funds f ON inv.fund_id = f.id
      WHERE inv.status = 'ACTIVE'
    `);
    result.scanned = investments.length;

    for (const inv of investments) {
      if (!inv.cost_basis || inv.cost_basis === 0) continue;

      const moic = inv.fair_value / inv.cost_basis;

      // Write-down > 80% of cost
      if (moic < 0.2) {
        result.anomalies.push({
          id: `VAL-WRITEDOWN-${inv.id}`,
          severity: 'high',
          category: 'valuation',
          type: 'SIGNIFICANT_WRITEDOWN',
          fundId: inv.fund_id,
          fundName: inv.fund_name,
          message: `${inv.company_name} valued at ${(moic * 100).toFixed(0)}% of cost (${this._fmt(inv.fair_value)} vs ${this._fmt(inv.cost_basis)}) — potential write-off`,
          details: { companyName: inv.company_name, costBasis: inv.cost_basis, fairValue: inv.fair_value, moic },
          detectedAt: new Date().toISOString()
        });
      }

      // Markup > 5x without exit (Level 3 valuation risk)
      if (moic > 5 && inv.fair_value_level === 3) {
        result.anomalies.push({
          id: `VAL-HIGH-MARKUP-${inv.id}`,
          severity: 'medium',
          category: 'valuation',
          type: 'HIGH_MARKUP_LEVEL3',
          fundId: inv.fund_id,
          fundName: inv.fund_name,
          message: `${inv.company_name} marked up ${moic.toFixed(1)}x with Level 3 fair value — verify valuation methodology`,
          details: { companyName: inv.company_name, costBasis: inv.cost_basis, fairValue: inv.fair_value, moic, fairValueLevel: inv.fair_value_level, valuationMethod: inv.valuation_method },
          detectedAt: new Date().toISOString()
        });
      }

      // Stale valuation (no update in >180 days)
      if (inv.updated_at) {
        const daysSinceUpdate = Math.floor((Date.now() - new Date(inv.updated_at).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceUpdate > 180) {
          result.anomalies.push({
            id: `VAL-STALE-${inv.id}`,
            severity: 'medium',
            category: 'valuation',
            type: 'STALE_VALUATION',
            fundId: inv.fund_id,
            fundName: inv.fund_name,
            message: `${inv.company_name} valuation not updated in ${daysSinceUpdate} days`,
            details: { companyName: inv.company_name, lastUpdated: inv.updated_at, daysSinceUpdate },
            detectedAt: new Date().toISOString()
          });
        }
      }
    }

    return result;
  }

  /**
   * Get anomalies filtered by severity, category, or fund
   */
  getFiltered(filters = {}) {
    const all = this.scanAll();
    let anomalies = all.anomalies;

    if (filters.severity) anomalies = anomalies.filter(a => a.severity === filters.severity);
    if (filters.category) anomalies = anomalies.filter(a => a.category === filters.category);
    if (filters.fundId) anomalies = anomalies.filter(a => a.fundId === filters.fundId);

    return {
      ...all,
      anomalies,
      totalAnomalies: anomalies.length,
      filtered: true,
      filters
    };
  }

  // --- Helpers ---

  _fmt(num) {
    if (!num && num !== 0) return '$0';
    return '$' + Number(num).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
}

module.exports = new AnomalyDetectionService();
