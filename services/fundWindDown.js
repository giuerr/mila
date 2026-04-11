/**
 * Fund Wind-Down / Liquidation Service
 * Final distributions, dissolution timeline, final audit,
 * entity termination, final K-1s, tail insurance.
 */

class FundWindDownService {

  /**
   * Generate wind-down plan
   */
  generateWindDownPlan({ fund, remainingPortfolio, estimatedTimeline }) {
    const phases = [
      {
        phase: 1,
        name: 'Portfolio Realization',
        duration: estimatedTimeline?.realizationMonths || 24,
        tasks: [
          'Complete exit of remaining portfolio investments',
          'Engage investment banks / advisors for sales processes',
          'Manage any distressed or illiquid positions',
          'Document final fair values for unrealized investments',
          ...remainingPortfolio.map(co => `Exit ${co.name} (current value: ${co.currentValue}, method: ${co.preferredExitRoute || 'TBD'})`)
        ],
        status: 'ACTIVE'
      },
      {
        phase: 2,
        name: 'Final Accounting & Audit',
        duration: 6,
        tasks: [
          'Prepare final financial statements',
          'Engage auditor for final audit',
          'Complete final waterfall calculation',
          'Calculate and settle GP clawback (if any)',
          'Reconcile all bank accounts',
          'Close credit facilities and repay outstanding balances',
          'Complete final expense accounting'
        ],
        status: 'NOT_STARTED'
      },
      {
        phase: 3,
        name: 'Final Tax & Distributions',
        duration: 6,
        tasks: [
          'Prepare and distribute final K-1s',
          'Calculate final withholding tax for foreign LPs',
          'File final partnership tax return (Form 1065)',
          'Process final LP distributions (including carry escrow release)',
          'Settle GP clawback obligations',
          'File FATCA/CRS final reporting',
          'File final CIMA returns'
        ],
        status: 'NOT_STARTED'
      },
      {
        phase: 4,
        name: 'Entity Dissolution',
        duration: 3,
        tasks: [
          'Obtain LP consent for dissolution (per LPA)',
          'File dissolution documents with registered agent',
          'Cancel CIMA registration (Cayman)',
          'Terminate fund administrator agreement',
          'Close all bank accounts',
          'Terminate service provider agreements',
          'File Form 15 (SEC deregistration) if applicable',
          'Dissolve blocker entities and SPVs',
          'Dissolve GP entity (after all obligations settled)',
          'Archive fund records (retain for 7+ years per regulatory requirements)'
        ],
        status: 'NOT_STARTED'
      },
      {
        phase: 5,
        name: 'Post-Dissolution',
        duration: 12,
        tasks: [
          'Maintain tail D&O/E&O insurance (6-year tail)',
          'Respond to any post-dissolution LP queries',
          'Handle any post-dissolution tax audits',
          'Maintain records per retention policy',
          'Monitor clawback escrow release schedule'
        ],
        status: 'NOT_STARTED'
      }
    ];

    return {
      fundName: fund.name,
      windDownCommencementDate: fund.windDownDate || new Date().toISOString().split('T')[0],
      estimatedCompletionDate: this._addMonths(new Date(), phases.reduce((s, p) => s + p.duration, 0)),
      totalEstimatedDuration: phases.reduce((s, p) => s + p.duration, 0) + ' months',
      phases,
      remainingPortfolio: remainingPortfolio.map(co => ({
        name: co.name,
        costBasis: co.costBasis,
        currentValue: co.currentValue,
        moic: parseFloat((co.currentValue / co.costBasis).toFixed(2)),
        preferredExitRoute: co.preferredExitRoute,
        estimatedExitTimeline: co.estimatedExitMonths + ' months'
      })),
      totalRemainingValue: remainingPortfolio.reduce((s, c) => s + c.currentValue, 0),
      keyDecisions: [
        'Determination of in-kind vs. cash distributions for illiquid assets',
        'GP clawback calculation and escrow release timing',
        'Tail insurance coverage period and limits',
        'Record retention policy and archive location',
        'Post-dissolution contact person for LP queries'
      ]
    };
  }

  /**
   * Calculate final waterfall and distributions
   */
  calculateFinalDistribution({ fund, totalProceeds, lpInvestors, carryPartners }) {
    const totalContributed = lpInvestors.reduce((s, lp) => s + lp.totalContributions, 0);
    const totalPriorDistributions = lpInvestors.reduce((s, lp) => s + lp.priorDistributions, 0);
    const cumulativeValue = totalPriorDistributions + totalProceeds;

    // Final waterfall
    const moic = cumulativeValue / totalContributed;
    const totalProfit = cumulativeValue - totalContributed;
    const preferredReturn = totalContributed * (Math.pow(1 + (fund.preferredReturn || 0.08), fund.ageYears) - 1);

    let gpCarry = 0;
    if (totalProfit > preferredReturn) {
      gpCarry = (totalProfit - preferredReturn) * (fund.carryRate || 0.20);
      // Add catch-up
      const catchUp = Math.min(totalProfit - preferredReturn, preferredReturn * (fund.carryRate || 0.20) / (1 - (fund.carryRate || 0.20)));
      gpCarry = catchUp + Math.max(0, totalProfit - preferredReturn - catchUp) * (fund.carryRate || 0.20);
    }

    // Check against cumulative carry already distributed
    const priorCarryDistributed = fund.cumulativeCarryDistributed || 0;
    const remainingCarry = Math.max(0, gpCarry - priorCarryDistributed);

    // Clawback check
    const clawback = Math.max(0, priorCarryDistributed - gpCarry);

    // LP final distribution
    const lpFinalDistribution = totalProceeds - remainingCarry + clawback;

    return {
      fundName: fund.name,
      finalProceeds: totalProceeds,
      cumulativeContributions: totalContributed,
      cumulativeDistributions: totalPriorDistributions + totalProceeds,
      finalMoic: parseFloat(moic.toFixed(4)),
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      preferredReturn: parseFloat(preferredReturn.toFixed(2)),
      waterfall: {
        totalGpCarryEntitlement: parseFloat(gpCarry.toFixed(2)),
        priorCarryDistributed: priorCarryDistributed,
        additionalCarryDue: parseFloat(remainingCarry.toFixed(2)),
        clawbackAmount: parseFloat(clawback.toFixed(2)),
        clawbackRequired: clawback > 0
      },
      escrowRelease: {
        currentEscrowBalance: fund.carryEscrowBalance || 0,
        releaseAmount: clawback > 0
          ? Math.max(0, (fund.carryEscrowBalance || 0) - clawback)
          : fund.carryEscrowBalance || 0,
        retainedForClawback: Math.min(clawback, fund.carryEscrowBalance || 0)
      },
      lpDistributions: lpInvestors.map(lp => {
        const pct = lp.totalContributions / totalContributed;
        return {
          investorName: lp.name,
          totalContributions: lp.totalContributions,
          priorDistributions: lp.priorDistributions,
          finalDistribution: parseFloat((lpFinalDistribution * pct).toFixed(2)),
          cumulativeDistributions: parseFloat((lp.priorDistributions + lpFinalDistribution * pct).toFixed(2)),
          finalMoic: parseFloat(((lp.priorDistributions + lpFinalDistribution * pct) / lp.totalContributions).toFixed(4)),
          finalDpi: parseFloat(((lp.priorDistributions + lpFinalDistribution * pct) / lp.totalContributions).toFixed(4))
        };
      }),
      carryAllocation: carryPartners ? carryPartners.map(p => ({
        name: p.name,
        carryPoints: p.carryPoints,
        pctOfCarry: parseFloat((p.carryPoints / carryPartners.reduce((s, cp) => s + cp.carryPoints, 0) * 100).toFixed(2)) + '%',
        additionalCarry: parseFloat((remainingCarry * (p.carryPoints / carryPartners.reduce((s, cp) => s + cp.carryPoints, 0))).toFixed(2)),
        escrowRelease: parseFloat(((fund.carryEscrowBalance || 0) * (p.carryPoints / carryPartners.reduce((s, cp) => s + cp.carryPoints, 0))).toFixed(2)),
        clawbackObligation: parseFloat((clawback * (p.carryPoints / carryPartners.reduce((s, cp) => s + cp.carryPoints, 0))).toFixed(2))
      })) : []
    };
  }

  /**
   * Tail insurance requirements
   */
  calculateTailInsurance({ currentPolicies, windDownDate }) {
    return currentPolicies.map(policy => ({
      policyType: policy.type,
      currentCarrier: policy.carrier,
      currentLimit: policy.coverageLimit,
      tailRequired: ['D&O', 'E&O', 'FUND_LIABILITY'].includes(policy.type),
      recommendedTailPeriod: policy.type === 'D&O' ? '6 years' : policy.type === 'E&O' ? '6 years' : '3 years',
      estimatedTailPremium: parseFloat((policy.annualPremium * (policy.type === 'D&O' ? 2.5 : 2.0)).toFixed(2)),
      reasoning: policy.type === 'D&O'
        ? 'Statute of limitations for securities claims is typically 5-6 years'
        : policy.type === 'E&O'
        ? 'Professional liability claims may surface years after fund wind-down'
        : 'General liability tail for residual fund obligations',
      coverageShouldInclude: [
        'Prior acts coverage from fund inception',
        'Discovery period for claims arising from pre-wind-down activities',
        'Defense costs outside the limit (if possible)'
      ]
    }));
  }

  /**
   * Record retention schedule
   */
  generateRetentionSchedule() {
    return {
      categories: [
        { category: 'Fund Formation Documents (LPA, PPM, subscription docs)', retentionPeriod: 'Permanent', location: 'Secure archive' },
        { category: 'Financial Statements (audited)', retentionPeriod: '10 years', location: 'Secure archive' },
        { category: 'Tax Returns & K-1s', retentionPeriod: '7 years', location: 'Tax advisor archive' },
        { category: 'Capital Call & Distribution Records', retentionPeriod: '7 years', location: 'Fund admin archive' },
        { category: 'Investor KYC/AML Records', retentionPeriod: '5 years after relationship end', location: 'Compliance archive' },
        { category: 'Valuation Records & Committee Minutes', retentionPeriod: '7 years', location: 'Secure archive' },
        { category: 'Board & LPAC Minutes', retentionPeriod: '10 years', location: 'Secure archive' },
        { category: 'Investment Committee Materials', retentionPeriod: '7 years', location: 'Secure archive' },
        { category: 'Side Letters', retentionPeriod: 'Permanent', location: 'Legal archive' },
        { category: 'Compliance Records & Testing', retentionPeriod: '7 years', location: 'Compliance archive' },
        { category: 'Insurance Policies & Claims', retentionPeriod: 'Duration of tail coverage + 2 years', location: 'Secure archive' },
        { category: 'Bank Statements & Reconciliations', retentionPeriod: '7 years', location: 'Fund admin archive' },
        { category: 'Marketing Materials', retentionPeriod: '5 years', location: 'Archive' },
        { category: 'Employee Records', retentionPeriod: '7 years after termination', location: 'HR archive' }
      ],
      note: 'Retention periods are minimums — extend if ongoing litigation, audit, or regulatory investigation'
    };
  }

  // --- Private ---

  _addMonths(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split('T')[0];
  }
}

module.exports = new FundWindDownService();
