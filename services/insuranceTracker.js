/**
 * Insurance Tracking Service
 * D&O, E&O, cyber, crime/fidelity, key person, EPLI,
 * portfolio company insurance oversight, premium allocation, gap analysis.
 */

class InsuranceTrackerService {

  /**
   * Get full insurance program overview
   */
  getInsuranceProgram(policies) {
    const totalPremium = policies.reduce((sum, p) => sum + p.annualPremium, 0);
    const totalCoverage = policies.reduce((sum, p) => sum + p.coverageLimit, 0);

    const byType = {};
    for (const policy of policies) {
      if (!byType[policy.type]) byType[policy.type] = [];
      byType[policy.type].push(policy);
    }

    const upcoming = policies
      .filter(p => {
        const daysToRenewal = this._daysBetween(new Date(), p.renewalDate);
        return daysToRenewal >= 0 && daysToRenewal <= 90;
      })
      .sort((a, b) => new Date(a.renewalDate) - new Date(b.renewalDate));

    const expired = policies.filter(p => new Date(p.renewalDate) < new Date());

    return {
      totalPolicies: policies.length,
      totalAnnualPremium: parseFloat(totalPremium.toFixed(2)),
      totalCoverageLimit: totalCoverage,
      policies: policies.map(p => this._enrichPolicy(p)),
      byType,
      upcomingRenewals: upcoming.map(p => ({
        type: p.type,
        carrier: p.carrier,
        renewalDate: p.renewalDate,
        daysUntilRenewal: this._daysBetween(new Date(), p.renewalDate),
        premium: p.annualPremium,
        limit: p.coverageLimit
      })),
      expiredPolicies: expired,
      alerts: this._generateAlerts(policies)
    };
  }

  /**
   * Required policies for a fund structure
   */
  getRequiredPolicies(fundStructure) {
    const required = [
      {
        type: 'D&O',
        description: 'Directors & Officers Liability',
        minimumCoverage: fundStructure.aum > 500000000 ? 25000000 : 10000000,
        reason: 'Covers GP directors/officers against claims of wrongful acts',
        priority: 'CRITICAL',
        sublimits: ['Regulatory defense costs', 'Employment practices', 'Fiduciary liability']
      },
      {
        type: 'E&O',
        description: 'Errors & Omissions / Professional Liability',
        minimumCoverage: fundStructure.aum > 500000000 ? 25000000 : 10000000,
        reason: 'Covers claims from professional negligence in investment management',
        priority: 'CRITICAL',
        sublimits: ['Valuation errors', 'Style drift', 'Breach of fiduciary duty']
      },
      {
        type: 'CYBER',
        description: 'Cyber Liability Insurance',
        minimumCoverage: fundStructure.investorCount > 100 ? 15000000 : 5000000,
        reason: 'Covers data breaches, ransomware, wire fraud, business interruption',
        priority: 'CRITICAL',
        sublimits: ['Social engineering / wire fraud', 'Ransomware', 'Regulatory fines', 'Notification costs']
      },
      {
        type: 'CRIME',
        description: 'Crime / Fidelity Bond',
        minimumCoverage: 10000000,
        reason: 'Covers theft, fraud, or dishonest acts by employees',
        priority: 'HIGH',
        sublimits: ['Employee theft', 'Wire transfer fraud', 'Computer fraud']
      },
      {
        type: 'FUND_LIABILITY',
        description: 'Fund / Partnership Liability',
        minimumCoverage: 10000000,
        reason: 'Covers the fund entity itself against third-party claims',
        priority: 'HIGH',
        sublimits: ['Third-party claims', 'Investor lawsuits']
      },
      {
        type: 'KEY_PERSON',
        description: 'Key Person Life & Disability',
        minimumCoverage: 5000000,
        reason: 'Covers departure of key principals triggering LPA key person provisions',
        priority: 'HIGH',
        keyPersons: fundStructure.keyPersons || [],
        sublimits: ['Life', 'Total disability', 'Partial disability']
      },
      {
        type: 'EPLI',
        description: 'Employment Practices Liability',
        minimumCoverage: 5000000,
        reason: 'Covers employee discrimination, harassment, wrongful termination claims',
        priority: 'MEDIUM',
        sublimits: ['Discrimination', 'Harassment', 'Wrongful termination', 'Retaliation']
      }
    ];

    return {
      fundName: fundStructure.name,
      aum: fundStructure.aum,
      investorCount: fundStructure.investorCount,
      requiredPolicies: required,
      totalMinimumCoverage: required.reduce((sum, p) => sum + p.minimumCoverage, 0),
      estimatedAnnualPremium: this._estimatePremium(required, fundStructure)
    };
  }

  /**
   * Gap analysis — compare existing coverage to requirements
   */
  gapAnalysis(existingPolicies, requiredPolicies) {
    const gaps = [];

    for (const req of requiredPolicies) {
      const existing = existingPolicies.find(p => p.type === req.type);

      if (!existing) {
        gaps.push({
          type: req.type,
          description: req.description,
          status: 'NO_COVERAGE',
          severity: req.priority,
          requiredMinimum: req.minimumCoverage,
          currentCoverage: 0,
          gap: req.minimumCoverage,
          recommendation: `Obtain ${req.description} policy with minimum ${this._formatCurrency(req.minimumCoverage)} coverage`
        });
      } else if (existing.coverageLimit < req.minimumCoverage) {
        gaps.push({
          type: req.type,
          description: req.description,
          status: 'UNDERINSURED',
          severity: 'HIGH',
          requiredMinimum: req.minimumCoverage,
          currentCoverage: existing.coverageLimit,
          gap: req.minimumCoverage - existing.coverageLimit,
          recommendation: `Increase ${req.description} coverage by ${this._formatCurrency(req.minimumCoverage - existing.coverageLimit)}`
        });
      } else if (new Date(existing.renewalDate) < new Date()) {
        gaps.push({
          type: req.type,
          description: req.description,
          status: 'EXPIRED',
          severity: 'CRITICAL',
          requiredMinimum: req.minimumCoverage,
          currentCoverage: existing.coverageLimit,
          gap: 0,
          recommendation: `URGENT: Renew expired ${req.description} policy immediately`
        });
      }
    }

    return {
      totalRequired: requiredPolicies.length,
      fullyCovered: requiredPolicies.length - gaps.length,
      gaps,
      criticalGaps: gaps.filter(g => g.severity === 'CRITICAL'),
      riskScore: gaps.length === 0 ? 'LOW' : gaps.some(g => g.severity === 'CRITICAL') ? 'CRITICAL' : 'ELEVATED',
      totalGapExposure: gaps.reduce((sum, g) => sum + g.gap, 0)
    };
  }

  /**
   * Allocate insurance premiums across funds
   */
  allocatePremiums(policies, funds) {
    const totalNav = funds.reduce((sum, f) => sum + f.nav, 0);

    return policies.map(policy => ({
      policyType: policy.type,
      carrier: policy.carrier,
      totalPremium: policy.annualPremium,
      allocation: funds.map(f => ({
        fundId: f.id,
        fundName: f.name,
        navWeight: parseFloat(((f.nav / totalNav) * 100).toFixed(2)) + '%',
        allocatedPremium: parseFloat((policy.annualPremium * (f.nav / totalNav)).toFixed(2))
      }))
    }));
  }

  /**
   * Claims history tracking
   */
  trackClaims(claims) {
    const totalIncurred = claims.reduce((sum, c) => sum + c.incurredAmount, 0);
    const totalPaid = claims.reduce((sum, c) => sum + c.paidAmount, 0);
    const totalReserved = claims.reduce((sum, c) => sum + c.reserveAmount, 0);

    return {
      totalClaims: claims.length,
      openClaims: claims.filter(c => c.status === 'OPEN').length,
      closedClaims: claims.filter(c => c.status === 'CLOSED').length,
      totalIncurred,
      totalPaid,
      totalReserved,
      lossRatio: 'Calculated at renewal',
      claims: claims.map(c => ({
        ...c,
        aging: c.openDate ? this._daysBetween(c.openDate, c.closeDate || new Date()) + ' days' : null
      })),
      byType: this._groupBy(claims, 'policyType')
    };
  }

  // --- Private ---

  _enrichPolicy(p) {
    const daysToRenewal = this._daysBetween(new Date(), p.renewalDate);
    return {
      ...p,
      daysToRenewal,
      status: daysToRenewal < 0 ? 'EXPIRED' : daysToRenewal <= 30 ? 'RENEWAL_IMMINENT' : 'ACTIVE',
      costPerMillionCoverage: parseFloat((p.annualPremium / (p.coverageLimit / 1000000)).toFixed(2))
    };
  }

  _generateAlerts(policies) {
    const alerts = [];
    for (const p of policies) {
      const days = this._daysBetween(new Date(), p.renewalDate);
      if (days < 0) alerts.push({ severity: 'CRITICAL', message: `${p.type} policy EXPIRED on ${p.renewalDate}` });
      else if (days <= 30) alerts.push({ severity: 'HIGH', message: `${p.type} renewal in ${days} days` });
      else if (days <= 60) alerts.push({ severity: 'MEDIUM', message: `${p.type} renewal in ${days} days — begin broker discussions` });
    }
    return alerts;
  }

  _estimatePremium(required, fundStructure) {
    // Rough premium estimate based on AUM
    const aumInMillions = fundStructure.aum / 1000000;
    return parseFloat((aumInMillions * 0.015 * required.length).toFixed(2)); // ~1.5bps per policy line
  }

  _formatCurrency(amount) {
    return '$' + amount.toLocaleString();
  }

  _daysBetween(start, end) {
    return Math.floor((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24));
  }

  _groupBy(arr, key) {
    const groups = {};
    for (const item of arr) {
      if (!groups[item[key]]) groups[item[key]] = [];
      groups[item[key]].push(item);
    }
    return groups;
  }
}

module.exports = new InsuranceTrackerService();
